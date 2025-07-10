"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { firestore, auth, storage } from "@/lib/firebase";
import {
  doc,
  Timestamp,
  onSnapshot,
  collection,
  setDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ImageZoomModal } from "@/app/components/ImageZoomModal";
import { useShareModal } from "@/contexts/ShareModalContext";
import {
  Reply,
  ThumbsUp,
  ThumbsDown,
  RefreshCcw,
  UnfoldHorizontal,
  Sparkles,
  LetterText,
  Download,
  Share2,
  Package,
  Palette,
  Droplets,
  Clapperboard,
  Undo2,
  AudioWaveform,
  Proportions,
  RectangleVertical
} from "lucide-react";
import Lottie from "lottie-react";
import catLoadingAnimation from "@/public/lottie/catloading.json";
import { VideoZoomModal } from "../VideoZoomModal";
import { ClickableText } from "../ClickableText";

interface ProactiveRecommendation {
  id: string;
  label: string;
  intent: string;
  endpoint: string;
  parameters: Record<string, any>;
  icon?: string;
}

interface ChatMessage {
  id?: string;
  sender: "user" | "agent";
  type: "prompt" | "images" | "videos";
  text?: string;
  images?: string[];
  videos?: string[];
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  chatId: string;
  isStreaming?: boolean;
  isLoading?: boolean;
  isReferenced?: boolean; // 🔧 NEW: Boolean to track if this message is a reply to another message
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number };
  recommendations?: ProactiveRecommendation[]; // NEW: Proactive recommendations
}

// 🔧 NEW: Interface for referenced message
interface ReferencedMessage {
  id: string;
  sender: "user" | "agent";
  text?: string;
  images?: string[];
  videos?: string[];
  timestamp: string;
  referencemode?: "product" | "color" | "design"; // 🔧 NEW: Reference mode for contextual replies
}

interface ChatWindowProps {
  chatId: string;
  onReplyToMessage?: (message: ReferencedMessage) => void;
  onTitleRenamed?: (chatId: string, newTitle: string, category: string) => void; // For backward compatibility
}

export default function ChatWindow({
  chatId,
  onReplyToMessage,
  onTitleRenamed,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [initialLoad, setInitialLoad] = useState<boolean>(true);
  const [likedImages, setLikedImages] = useState<Set<string>>(new Set());
  const [dislikedImages, setDislikedImages] = useState<Set<string>>(new Set());

  // 🔧 NEW: State for reference mode selection
  const [referenceMode, setReferenceMode] = useState<
    "product" | "color" | "design"
  >("product");

  // 🔧 NEW: Use global share modal context
  const { showShareModal } = useShareModal();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastActionTimeRef = useRef<number>(0);

  // Memoized cache functions
  const cacheKey = useMemo(
    () => (userId && chatId ? `chat_messages_${userId}_${chatId}` : null),
    [userId, chatId],
  );

  const saveToCache = useCallback(
    (messages: ChatMessage[]) => {
      if (!cacheKey) return;
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(messages));
      } catch (error) {
        console.warn("Failed to save to cache:", error);
      }
    },
    [cacheKey],
  );

  const loadFromCache = useCallback((): ChatMessage[] | null => {
    if (!cacheKey) return null;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn("Failed to load from cache:", error);
      return null;
    }
  }, [cacheKey]);

  // Optimized scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: initialLoad ? "auto" : "smooth",
      });
    }
  }, [initialLoad]);

  // Handle reply to message
  const handleReply = useCallback(
    (
      msg: ChatMessage,
      index: number,
      customReferenceMode?: "product" | "color" | "design",
    ) => {
      if (!onReplyToMessage) return;

      const referencedMessage: ReferencedMessage = {
        id: msg.id || `${msg.chatId}-${index}`,
        sender: msg.sender,
        text: msg.text,
        images: msg.images || [],
        videos: msg.videos || [],
        timestamp:
          msg.createdAt && typeof msg.createdAt === "object"
            ? new Date(
                (msg.createdAt as Timestamp).seconds * 1000,
              ).toISOString()
            : new Date().toISOString(),
        referencemode: customReferenceMode || referenceMode, // 🔧 NEW: Use custom reference mode if provided
      };

      onReplyToMessage(referencedMessage);
    },
    [onReplyToMessage, referenceMode],
  );

  // Load user preferences (likes and dislikes)
  const loadUserPreferences = useCallback(async () => {
    if (!userId) return;

    try {
      const preferencesRef = collection(
        firestore,
        `users/${userId}/preferences`,
      );
      const snapshot = await getDocs(preferencesRef);

      const liked = new Set<string>();
      const disliked = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.likedimageurl) {
          liked.add(data.likedimageurl);
        }
        if (data.dislikedimageurl) {
          disliked.add(data.dislikedimageurl);
        }
      });

      setLikedImages(liked);
      setDislikedImages(disliked);
    } catch (error) {
      console.error("❌ Error loading user preferences:", error);
    }
  }, [userId]);

  // Handle like action
  const handleLike = useCallback(
    async (imageUrl: string) => {
      if (!userId) {
        console.error("User not authenticated");
        return;
      }

      try {
        const isCurrentlyLiked = likedImages.has(imageUrl);
        const isCurrentlyDisliked = dislikedImages.has(imageUrl);

        if (isCurrentlyLiked) {
          // Unlike the image - remove from Firestore
          const preferencesRef = collection(
            firestore,
            `users/${userId}/preferences`,
          );
          const q = query(
            preferencesRef,
            where("likedimageurl", "==", imageUrl),
          );
          const querySnapshot = await getDocs(q);

          querySnapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
          });

          // Update local state
          const newLikedImages = new Set(likedImages);
          newLikedImages.delete(imageUrl);
          setLikedImages(newLikedImages);

          console.log("✅ Image unliked successfully");
        } else {
          // Like the image
          if (isCurrentlyDisliked) {
            // Remove from disliked first
            const preferencesRef = collection(
              firestore,
              `users/${userId}/preferences`,
            );
            const q = query(
              preferencesRef,
              where("dislikedimageurl", "==", imageUrl),
            );
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach(async (doc) => {
              await deleteDoc(doc.ref);
            });

            // Update local state
            const newDislikedImages = new Set(dislikedImages);
            newDislikedImages.delete(imageUrl);
            setDislikedImages(newDislikedImages);
          }

          // Generate a unique ID for the like
          const likeId = `like_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Create the like document
          const likeData = {
            id: likeId,
            userId: userId,
            imageId:
              imageUrl.split("/").pop() ||
              imageUrl.substring(imageUrl.lastIndexOf("/") + 1),
            likedimageurl: imageUrl,
            likedAt: Timestamp.now(),
          };

          // Store in Firestore at users/{userId}/preferences/{likeId}
          const preferencesRef = doc(
            firestore,
            `users/${userId}/preferences/${likeId}`,
          );
          await setDoc(preferencesRef, likeData);

          // Update local state
          const newLikedImages = new Set(likedImages);
          newLikedImages.add(imageUrl);
          setLikedImages(newLikedImages);

          console.log("✅ Image liked successfully:", likeId);
        }
      } catch (error) {
        console.error("❌ Error handling like:", error);
      }
    },
    [userId, likedImages, dislikedImages],
  );

  // Handle dislike action
  const handleDislike = useCallback(
    async (imageUrl: string) => {
      if (!userId) {
        console.error("User not authenticated");
        return;
      }

      try {
        const isCurrentlyDisliked = dislikedImages.has(imageUrl);
        const isCurrentlyLiked = likedImages.has(imageUrl);

        if (isCurrentlyDisliked) {
          // Remove dislike - remove from Firestore
          const preferencesRef = collection(
            firestore,
            `users/${userId}/preferences`,
          );
          const q = query(
            preferencesRef,
            where("dislikedimageurl", "==", imageUrl),
          );
          const querySnapshot = await getDocs(q);

          querySnapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
          });

          // Update local state
          const newDislikedImages = new Set(dislikedImages);
          newDislikedImages.delete(imageUrl);
          setDislikedImages(newDislikedImages);

          console.log("✅ Image undisliked successfully");
        } else {
          // Dislike the image
          if (isCurrentlyLiked) {
            // Remove from liked first
            const preferencesRef = collection(
              firestore,
              `users/${userId}/preferences`,
            );
            const q = query(
              preferencesRef,
              where("likedimageurl", "==", imageUrl),
            );
            const querySnapshot = await getDocs(q);

            querySnapshot.forEach(async (doc) => {
              await deleteDoc(doc.ref);
            });

            // Update local state
            const newLikedImages = new Set(likedImages);
            newLikedImages.delete(imageUrl);
            setLikedImages(newLikedImages);
          }

          // Generate a unique ID for the dislike
          const dislikeId = `dislike_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Create the dislike document
          const dislikeData = {
            id: dislikeId,
            userId: userId,
            imageId:
              imageUrl.split("/").pop() ||
              imageUrl.substring(imageUrl.lastIndexOf("/") + 1),
            dislikedimageurl: imageUrl,
            dislikedAt: Timestamp.now(),
          };

          // Store in Firestore at users/{userId}/preferences/{dislikeId}
          const preferencesRef = doc(
            firestore,
            `users/${userId}/preferences/${dislikeId}`,
          );
          await setDoc(preferencesRef, dislikeData);

          // Update local state
          const newDislikedImages = new Set(dislikedImages);
          newDislikedImages.add(imageUrl);
          setDislikedImages(newDislikedImages);

          console.log("✅ Image disliked successfully:", dislikeId);
        }
      } catch (error) {
        console.error("❌ Error handling dislike:", error);
      }
    },
    [userId, likedImages, dislikedImages],
  );

  // Handle download action
  const handleDownload = useCallback(async (imageUrl: string) => {
    console.log("🔄 Starting download for:", imageUrl);

    try {
      // Extract filename from URL
      let fileName = imageUrl.split("/").pop() || `download-${Date.now()}.jpg`;

      // Clean up filename - remove query parameters
      if (fileName.includes("?")) {
        fileName = fileName.split("?")[0];
      }

      // Ensure filename has an extension
      if (!fileName.includes(".")) {
        fileName += ".jpg";
      }

      console.log("📁 Using filename:", fileName);

      // Use server-side proxy for ALL URLs (most reliable approach)
      const proxyUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}`;

      console.log("🔗 Proxy URL:", proxyUrl);

      // Create download link and trigger immediately
      const link = document.createElement("a");
      link.href = proxyUrl;
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);

      // Force click
      link.click();

      // Clean up after a short delay
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          console.log("🗑️ Cleaned up download link");
        } catch (e) {
          console.warn("⚠️ Could not clean up link:", e);
        }
      }, 1000);
    } catch (error) {
      console.error("❌ Download failed:", error);

      // Simple fallback: direct window.open
      console.log("🔄 Fallback: Opening in new tab");
      window.open(imageUrl, "_blank");
    }
  }, []);

  // Format analysis object into readable text
  const formatAnalysisObject = (analysisObj: any): string => {
    let formattedText = "";

    Object.entries(analysisObj).forEach(([category, details]) => {
      // Capitalize category name
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      formattedText += `🎨 **${categoryName}:**\n`;

      if (typeof details === "object" && details !== null) {
        // Handle nested objects
        Object.entries(details).forEach(([key, value]) => {
          const keyName = key.charAt(0).toUpperCase() + key.slice(1);

          if (Array.isArray(value)) {
            formattedText += `• ${keyName}: ${value.join(", ")}\n`;
          } else {
            formattedText += `• ${keyName}: ${value}\n`;
          }
        });
      } else {
        // Handle simple values
        formattedText += `• ${details}\n`;
      }

      formattedText += "\n";
    });

    return formattedText;
  };

  // Handle analyze image action
  const handleAnalyzeImage = useCallback(
    async (imageUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("🔍 Starting image analysis for:", imageUrl);

      try {
        // Create loading message
        const loadingMessage: ChatMessage = {
          id: `analysis-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Analyzing image...",
          chatId: chatId,
          createdAt: Timestamp.now(),
          isLoading: true,
        };

        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call analyze image API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("image_url", imageUrl);

        const response = await fetch("/api/analyzeimage", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        // Format the analysis result
        let analysisText = "Image Analysis:\n\n";

        if (result.status === "success" && result.result) {
          if (result.result.raw_analysis) {
            // Try to parse JSON from raw_analysis
            try {
              const parsedAnalysis = JSON.parse(result.result.raw_analysis);
              analysisText += formatAnalysisObject(parsedAnalysis);
            } catch {
              // If not JSON, use as is
              analysisText += result.result.raw_analysis;
            }
          } else {
            // Format structured analysis
            analysisText += formatAnalysisObject(result.result);
          }
        } else {
          analysisText += "Unable to analyze the image at this time.";
        }

        // Create analysis result message
        const analysisMessage: ChatMessage = {
          id: `analysis-result-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: analysisText,
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with the analysis result
        // First, get current messages to replace loading message
        const chatDoc = await getDocs(
          query(
            collection(firestore, `chats/${userId}/prompts`),
            where("__name__", "==", chatId),
          ),
        );

        if (!chatDoc.empty) {
          const chatData = chatDoc.docs[0].data();
          const currentMessages = chatData.messages || [];

          // Replace loading message with analysis result
          const updatedMessages = currentMessages.map((msg: ChatMessage) =>
            msg.id === loadingMessage.id ? analysisMessage : msg,
          );

          await updateDoc(chatRef, {
            messages: updatedMessages,
          });
        }

        console.log("✅ Analysis message saved to chat");
      } catch (error) {
        console.error("❌ Image analysis failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `analysis-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't analyze the image. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
          await updateDoc(chatRef, {
            messages: arrayUnion(errorMessage),
          });
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

  // Handle reframe image to landscape
  const handleReframe = useCallback(
    async (imageUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("🖼️ Starting image reframe for:", imageUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `reframe-${Date.now()}`,
        sender: "agent",
        type: "images",
        text: "Reframing image to landscape...",
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call reframe API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("image_url", imageUrl);
        formData.append("imageSize", "landscape");

        const response = await fetch("/api/reframe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (
          result.status === "success" &&
          result.result &&
          result.result.imageUrl
        ) {
          // Create reframed image message
          const reframeMessage: ChatMessage = {
            id: `reframe-result-${Date.now()}`,
            sender: "agent",
            type: "images",
            text: "Here's your landscape reframed image:",
            images: [result.result.imageUrl],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the reframed image
          // First, get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with reframe result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? reframeMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Reframed image saved to chat");
        } else {
          throw new Error("Invalid response from reframe API");
        }
      } catch (error) {
        console.error("❌ Image reframe failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `reframe-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't reframe the image. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

          // Get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

  // Handle video generation from image
  const handleVideo = useCallback(
    async (imageUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("🎬 Starting video generation for:", imageUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Generating video from image...",
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call seedancevideo API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("image_url", imageUrl);

        const response = await fetch("/api/seedancevideo", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === "success" && result.videoUrl) {
          // Create video message
          const videoMessage: ChatMessage = {
            id: `video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your generated video:",
            videos: [result.videoUrl],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the video
          // First, get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? videoMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Generated video saved to chat");
        } else {
          throw new Error("Invalid response from seedancevideo API");
        }
      } catch (error) {
        console.error("❌ Video generation failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `video-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't generate the video. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

          // Get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

  // Handle share action
  const handleShare = useCallback(
    (platform: string, content: any) => {
      console.log(`📤 Content shared to ${platform}:`, content);
      // You can add analytics tracking here
      // Example: track('media_shared', { platform, mediaType: content.mediaType, userId });
    },
    [userId],
  );

  // Handle proactive recommendation clicks
  const handleRecommendationClick = useCallback(
    async (recommendation: ProactiveRecommendation, targetImageUrl?: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log(`🎯 Proactive recommendation clicked:`, recommendation);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `recommendation-${Date.now()}`,
        sender: "agent",
        type: "prompt",
        text: `Processing ${recommendation.label.toLowerCase()}...`,
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Prepare form data based on recommendation type
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("message", recommendation.label);

        // Add specific parameters based on recommendation
        Object.entries(recommendation.parameters).forEach(([key, value]) => {
          formData.append(key, value);
        });

        // If we have a target image URL, add it to the form data
        if (targetImageUrl) {
          formData.append("image_url", targetImageUrl);
        }

        // Call the intentroute API to process the recommendation
        const response = await fetch("/api/intentroute", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === "success") {
          // Create success message
          const successMessage: ChatMessage = {
            id: `recommendation-result-${Date.now()}`,
            sender: "agent",
            type: result.result?.imageUrl ? "images" : "prompt",
            text: result.message,
            images: result.result?.imageUrl ? [result.result.imageUrl] : undefined,
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Replace loading message with success message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with success message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? successMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Proactive recommendation processed successfully");
        } else {
          throw new Error(result.error || "Failed to process recommendation");
        }
      } catch (error) {
        console.error("❌ Proactive recommendation failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `recommendation-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: `Sorry, I couldn't ${recommendation.label.toLowerCase()}. Please try again later.`,
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Replace loading message with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

  // Handle upscale image
  const handleUpscale = useCallback(
    async (imageUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("✨ Starting image upscale for:", imageUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `upscale-${Date.now()}`,
        sender: "agent",
        type: "images",
        text: "Upscaling image to higher resolution...",
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call upscale API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("image_url", imageUrl);
        formData.append("upscaling_factor", "4");
        formData.append("overlapping_tiles", "false");
        formData.append("checkpoint", "v1");

        const response = await fetch("/api/upscale", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === "success" && result.imageUrl) {
          // Create upscaled image message
          const upscaleMessage: ChatMessage = {
            id: `upscale-result-${Date.now()}`,
            sender: "agent",
            type: "images",
            text: "Here's your upscaled image:",
            images: [result.imageUrl],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the upscaled image
          // First, get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with upscale result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? upscaleMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Upscaled image saved to chat");
        } else {
          throw new Error("Invalid response from upscale API");
        }
      } catch (error) {
        console.error("❌ Image upscale failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `upscale-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't upscale the image. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

          // Get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

<<<<<<< Updated upstream
  // Handle video landscape (outpainting)
  const handlelandscapevideo = useCallback(
    async (videoUrl: string) => {
=======
  // Handle inpainting
  const handleInpainting = useCallback(
    async (imageUrl: string, maskDataUrl: string, prompt: string) => {
>>>>>>> Stashed changes
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

<<<<<<< Updated upstream
      console.log("🎬 Starting video landscape outpainting for:", videoUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `landscape-video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Converting video to landscape format...",
=======
      console.log("🎨 Starting inpainting for:", imageUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `inpaint-${Date.now()}`,
        sender: "agent",
        type: "images",
        text: `Inpainting: "${prompt}"...`,
>>>>>>> Stashed changes
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

<<<<<<< Updated upstream
        // Call video outpainting API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("video_url", videoUrl);
        formData.append("aspect_ratio", "16:9");
        formData.append("resolution", "720p");
        formData.append("expand_left", "true");
        formData.append("expand_right", "true");
        formData.append("expand_ratio", "0.25");
        formData.append("num_frames", "81");
        formData.append("frames_per_second", "16");
        formData.append("num_inference_steps", "30");
        formData.append("guidance_scale", "5.0");

        const response = await fetch("/api/videooutpainting", {
=======
        // Call inpainting API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("image_url", imageUrl);
        formData.append("mask", maskDataUrl);
        formData.append("prompt", prompt);
        // Let the API determine the best size based on image dimensions

        const response = await fetch("/api/inpainting", {
>>>>>>> Stashed changes
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

<<<<<<< Updated upstream
        if (result.status === "success" && result.videoUrl) {
          // Create landscape video message
          const landscapeMessage: ChatMessage = {
            id: `landscape-video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your landscape video:",
            videos: [result.videoUrl],
=======
        if (result.status === "success" && result.imageUrl) {
          let finalImageUrl = result.imageUrl;

          // Convert base64 to Firebase Storage URL if needed
          if (result.imageUrl.startsWith("data:image/")) {
            console.log("🔄 Converting base64 inpainting result to Firebase Storage...");
            try {
              // Extract base64 data
              const base64Data = result.imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              
              // Create a File object
              const fileName = `inpaint_${Date.now()}.png`;
              const file = new File([buffer], fileName, { type: 'image/png' });
              
              // Upload to Firebase Storage
              const storageRef = ref(storage, `${userId}/output/${fileName}`);
              const snapshot = await uploadBytes(storageRef, file);
              finalImageUrl = await getDownloadURL(snapshot.ref);
              
              console.log("✅ Converted base64 to Firebase Storage URL:", finalImageUrl);
            } catch (conversionError) {
              console.error("❌ Failed to convert base64 to Firebase Storage:", conversionError);
              // Keep original base64 URL as fallback
            }
          }

          // Create inpainted image message
          const inpaintMessage: ChatMessage = {
            id: `inpaint-result-${Date.now()}`,
            sender: "agent",
            type: "images",
            text: `Inpainted: "${prompt}"`,
            images: [finalImageUrl],
>>>>>>> Stashed changes
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

<<<<<<< Updated upstream
          // Update Firestore with the landscape video
          // First, get current messages to replace loading message
=======
          // Update Firestore with the inpainted image
>>>>>>> Stashed changes
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

<<<<<<< Updated upstream
            // Replace loading message with landscape video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? landscapeMessage : msg,
=======
            // Replace loading message with inpaint result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? inpaintMessage : msg,
>>>>>>> Stashed changes
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

<<<<<<< Updated upstream
          console.log("✅ Landscape video saved to chat");
        } else {
          throw new Error("Invalid response from video outpainting API");
        }
      } catch (error) {
        console.error("❌ Video landscape outpainting failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `landscape-video-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't convert the video to landscape format. Please try again later.",
=======
          console.log("✅ Inpainted image saved to chat");
          return result.imageUrl;
        } else {
          throw new Error("Invalid response from inpainting API");
        }
      } catch (error) {
        console.error("❌ Inpainting failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `inpaint-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't complete the inpainting. Please try again later.",
>>>>>>> Stashed changes
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
<<<<<<< Updated upstream

          // Get current messages to replace loading message
=======
>>>>>>> Stashed changes
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
<<<<<<< Updated upstream
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
=======
>>>>>>> Stashed changes
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
<<<<<<< Updated upstream
=======

        throw error;
>>>>>>> Stashed changes
      }
    },
    [userId, chatId],
  );

<<<<<<< Updated upstream
  // Handle video reframe to portrait
  const handleVideoreframe = useCallback(
    async (videoUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("🎬 Starting video reframe to portrait for:", videoUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `reframe-video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Reframing video to portrait format...",
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call video reframe API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("video_url", videoUrl);
        formData.append("aspect_ratio", "9:16");
        formData.append("resolution", "720p");
        formData.append("zoom_factor", "0");
        formData.append("num_inference_steps", "30");
        formData.append("guidance_scale", "5");

        const response = await fetch("/api/videoreframe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === "success" && result.videoUrl) {
          // Create reframed video message
          const reframeMessage: ChatMessage = {
            id: `reframe-video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your portrait reframed video:",
            videos: [result.videoUrl],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the reframed video
          // First, get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with reframe video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? reframeMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Reframed video saved to chat");
        } else {
          throw new Error("Invalid response from video reframe API");
        }
      } catch (error) {
        console.error("❌ Video reframe failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `reframe-video-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't reframe the video to portrait format. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

          // Get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
  );

  // Handle video upscale
  const handleVideoUpscale = useCallback(
    async (videoUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("✨ Starting video upscale for:", videoUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `upscale-video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Upscaling video to higher resolution...",
        chatId: chatId,
        createdAt: Timestamp.now(),
        isLoading: true,
      };

      try {
=======
  // Handle clickable action links
  const handleActionClick = useCallback(
    async (action: string, type: string, param?: string) => {
      if (!userId || !chatId) return;

      console.log("🔗 Action clicked:", { action, type, param });

      // Prevent double-clicking
      const now = Date.now();
      if (now - lastActionTimeRef.current < 2000) {
        console.log("⏳ Preventing rapid click, please wait...");
        return;
      }
      lastActionTimeRef.current = now;

      // Declare loading message outside try block for error handling scope
      let loadingMessage: ChatMessage | undefined;

      try {
        // Find the most recent image from messages
        const recentImage = messages
          .slice()
          .reverse()
          .find(m => m.images && m.images.length > 0)
          ?.images?.[0];

        console.log("🖼️ Recent image found:", recentImage ? "YES" : "NO");
        console.log("🖼️ Total messages in conversation:", messages.length);
        console.log("🖼️ All messages:", messages.map((m, idx) => ({
          index: idx,
          sender: m.sender,
          hasImages: !!(m.images && m.images.length > 0),
          imageCount: m.images?.length || 0,
          firstImagePreview: m.images?.[0]?.substring(0, 80) + "..." || "none",
          textPreview: m.text?.substring(0, 50) + "..." || "none"
        })));
        
        if (recentImage) {
          console.log("🖼️ Recent image URL:", recentImage.substring(0, 100) + "...");
        } else {
          console.log("🖼️ NO RECENT IMAGE FOUND!");
          console.log("🖼️ Messages with images:", messages.filter(m => m.images && m.images.length > 0).length);
        }

        // Create form data for the action
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("chatId", chatId);
        
        // Handle image URL
        let imageUrlToUse = recentImage;
        
        if (!recentImage) {
          console.error("❌ No recent image found for action:", type);
          
          // 🔧 FALLBACK: Try to extract image from any message text that contains Firebase URLs
          const messageWithFirebaseUrl = messages
            .slice()
            .reverse()
            .find(m => m.text && m.text.includes('firebasestorage.app'));
          
          if (messageWithFirebaseUrl) {
            const urlMatch = messageWithFirebaseUrl.text?.match(/https:\/\/storage\.googleapis\.com\/[^\s]+/);
            if (urlMatch) {
              imageUrlToUse = urlMatch[0];
              console.log("🔧 FALLBACK: Found Firebase URL in message text:", imageUrlToUse);
            } else {
              alert("No recent image found to process. Please ensure there's an image in the conversation.");
              return;
            }
          } else {
            alert("No recent image found to process. Please ensure there's an image in the conversation.");
            return;
          }
        }
        
        if (imageUrlToUse) {
          formData.append("image_url", imageUrlToUse);
          console.log("📤 Added image_url for action:", imageUrlToUse.substring(0, 80) + "...");
        }

        // 🎯 ENHANCED: Map action types to messages and endpoints
        let finalMessage = "";
        
        if (type === "upscale") {
          finalMessage = "upscale this image to higher resolution";
        } else if (type === "reframe") {
          if (param === "landscape") {
            finalMessage = "change to landscape format";
          } else if (param === "portrait") {
            finalMessage = "change to portrait format";
          } else if (param === "square") {
            finalMessage = "change to square format";
          } else {
            finalMessage = "reframe this image";
          }
          if (param) {
            formData.append("aspect_ratio", param);
          }
        } else if (type === "design") {
          if (param === "similar") {
            finalMessage = "create similar design";
          } else if (param === "different-colors") {
            finalMessage = "create similar design with different colors";
          } else {
            finalMessage = "create new design based on this";
          }
        } else if (type === "removebg") {
          finalMessage = "remove background from this image";
        } else if (type === "scene") {
          // 🎨 RANDOM BACKGROUND GENERATION - pick from diverse, interesting backgrounds
          const randomBackgrounds = [
            "place this in a modern minimalist studio with soft lighting",
            "set this against a vibrant sunset cityscape background",
            "put this in a luxurious marble room with elegant lighting",
            "place this in a cozy coffee shop with warm ambient lighting",
            "set this in a futuristic neon-lit environment",
            "put this in a natural forest setting with dappled sunlight",
            "place this on a pristine white beach with crystal blue water",
            "set this in an industrial loft with exposed brick walls",
            "put this in a serene Japanese zen garden",
            "place this in a bustling modern city street at golden hour",
            "set this in a cosmic space environment with stars and nebula",
            "put this in a vintage library with warm wooden shelves",
            "place this in a sleek tech laboratory with blue lighting",
            "set this in a magical fairy tale forest with glowing elements",
            "put this in a sophisticated art gallery with spotlights",
            "place this in a tropical paradise with palm trees",
            "set this in a snowy mountain landscape with pine trees",
            "put this in a retro 80s neon synthwave environment",
            "place this in an underwater scene with coral and fish",
            "set this in a desert oasis with sand dunes and palm trees"
          ];
          
          const randomBackground = randomBackgrounds[Math.floor(Math.random() * randomBackgrounds.length)];
          finalMessage = randomBackground;
          console.log("🎨 Generated random background prompt:", randomBackground);
        } else if (type === "timeofday") {
          finalMessage = "change the time of day in this image";
        } else if (type === "analyze") {
          finalMessage = "analyze this image in detail";
        } else if (type === "objectremoval") {
          finalMessage = "remove unwanted objects from this image";
        } else if (type === "chainofzoom") {
          finalMessage = "create dynamic zoom effect with this image";
        } else if (type === "mirrormagic") {
          finalMessage = "apply mirror magic effects to this image";
        } else {
          // Fallback for unknown action types
          finalMessage = `apply ${type} to this image`;
        }

        console.log("📝 Message being sent:", finalMessage);
        console.log("🔗 Image URL being sent:", imageUrlToUse ? "YES" : "NO");
        
        // ❌ CRITICAL FIX: Message field was missing! Always add the message
        if (finalMessage) {
          formData.append("message", finalMessage);
          console.log("📤 Added message field:", finalMessage);
        } else {
          console.error("❌ No message to send for action:", type);
          return;
        }
        
        // Add conversation history for context
        const conversationHistory = messages.map(msg => ({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.text || "",
          images: msg.images || []
        }));
        
        formData.append("conversation_history", JSON.stringify(conversationHistory));
        
        // Debug FormData contents
        const formDataEntries = Array.from(formData.entries());
        const formDataDebug: Record<string, any> = {};
        formDataEntries.forEach(([key, value]) => {
          if (typeof value === 'string') {
            formDataDebug[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
          } else {
            formDataDebug[key] = '[File]';
          }
        });
        console.log("📋 FormData being sent:", formDataDebug);

        // Create loading message
        const loadingMessage: ChatMessage = {
          id: `action-${type}-${Date.now()}`,
          sender: "agent",
          type: "images",
          text: finalMessage + "...",
          chatId: chatId,
          createdAt: Timestamp.now(),
          isLoading: true,
        };

>>>>>>> Stashed changes
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

<<<<<<< Updated upstream
        // Call video upscale API
        const formData = new FormData();
        formData.append("video_url", videoUrl);

        const response = await fetch("/api/videoupscaler", {
=======
        // Submit to intentroute
        const response = await fetch("/api/intentroute", {
>>>>>>> Stashed changes
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
<<<<<<< Updated upstream
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && result.video_url) {
          // Create upscaled video message
          const upscaleMessage: ChatMessage = {
            id: `upscale-video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your upscaled video:",
            videos: [result.video_url],
=======
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ API Response:", result);

        // 🔧 CRITICAL FIX: Process the response and display the generated image
        // Handle different response formats from different APIs
        let generatedImageUrl: string | null = null;
        
        if (result.status === "success") {
          // Try different possible image URL locations
          generatedImageUrl = 
            result.result?.firebaseOutputUrl ||  // Design API format
            result.imageUrl ||                   // Upscale/Reframe API format  
            result.result?.imageUrl ||           // Alternative format (reframe nested)
            result.images?.[0] ||                // New: Images array from intentroute
            result.videoUrl ||                   // Video API format
            result.result?.videoUrl ||           // Alternative video format
            null;
        }

        console.log("🔍 Image URL detection:", {
          hasResult: !!result.result,
          firebaseOutputUrl: result.result?.firebaseOutputUrl || "not found",
          imageUrl: result.imageUrl || "not found", 
          resultImageUrl: result.result?.imageUrl || "not found",
          finalUrl: generatedImageUrl || "not found"
        });

        if (generatedImageUrl) {
          // Create success message with generated image
          const successMessage: ChatMessage = {
            id: `action-result-${type}-${Date.now()}`,
            sender: "agent",
            type: "images",
            text: result.message || `Here's your ${type} result:`,
            images: [generatedImageUrl],
>>>>>>> Stashed changes
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

<<<<<<< Updated upstream
          // Update Firestore with the upscaled video
          // First, get current messages to replace loading message
=======
          // Replace loading message with success message
>>>>>>> Stashed changes
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

<<<<<<< Updated upstream
            // Replace loading message with upscale video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? upscaleMessage : msg,
=======
            // Replace loading message with success message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? successMessage : msg,
>>>>>>> Stashed changes
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

<<<<<<< Updated upstream
          console.log("✅ Upscaled video saved to chat");
        } else {
          throw new Error("Invalid response from video upscaler API");
        }
      } catch (error) {
        console.error("❌ Video upscale failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `upscale-video-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't upscale the video. Please try again later.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
        try {
          const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

          // Get current messages to replace loading message
          const chatDoc = await getDocs(
            query(
              collection(firestore, `chats/${userId}/prompts`),
              where("__name__", "==", chatId),
            ),
          );

          if (!chatDoc.empty) {
            const chatData = chatDoc.docs[0].data();
            const currentMessages = chatData.messages || [];

            // Replace loading message with error message
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? errorMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          } else {
            // If no chat found, just add the error message
            await updateDoc(chatRef, {
              messages: arrayUnion(errorMessage),
            });
          }
        } catch (updateError) {
          console.error("❌ Failed to save error message:", updateError);
        }
      }
    },
    [userId, chatId],
=======
          console.log("✅ Generated image added to chat:", generatedImageUrl);
        } else {
          console.error("❌ No image URL found in response:", result);
          throw new Error(`No image generated in response. Status: ${result.status}, Available keys: ${Object.keys(result).join(', ')}`);
        }
              } catch (error) {
          console.error("❌ Error submitting action:", error);
          
          // Create error message to replace loading message
          const errorMessage: ChatMessage = {
            id: `action-error-${type}-${Date.now()}`,
            sender: "agent",
            type: "prompt",
            text: `Sorry, I couldn't ${type} the image. Please try again later.`,
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Replace loading message with error message
          try {
            const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
            const chatDoc = await getDocs(
              query(
                collection(firestore, `chats/${userId}/prompts`),
                where("__name__", "==", chatId),
              ),
            );

            if (!chatDoc.empty) {
              const chatData = chatDoc.docs[0].data();
              const currentMessages = chatData.messages || [];

              // Replace loading message with error message (only if loading message was created)
              const updatedMessages = loadingMessage 
                ? currentMessages.map((msg: ChatMessage) =>
                    msg.id === loadingMessage.id ? errorMessage : msg,
                  )
                : [...currentMessages, errorMessage];

              await updateDoc(chatRef, {
                messages: updatedMessages,
              });
            }
          } catch (updateError) {
            console.error("❌ Failed to save error message:", updateError);
          }
        }
    },
    [userId, chatId, messages]
>>>>>>> Stashed changes
  );

  // Initialize auth state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user: User | null) => {
      setUserId(user?.uid || null);
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Load user preferences when userId changes
  useEffect(() => {
    if (userId) {
      loadUserPreferences();
    } else {
      // Clear preferences when user logs out
      setLikedImages(new Set());
      setDislikedImages(new Set());
    }
  }, [userId, loadUserPreferences]);

  // Reset and load messages when chat changes
  useEffect(() => {
    if (!chatId || !userId || loading) return;

    console.log("🔄 ChatWindow: Loading chat:", chatId);

    // Clean up previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Reset state for new chat
    setInitialLoad(true);

    // Try to load from cache first for instant display
    const cachedMessages = loadFromCache();
    if (cachedMessages && cachedMessages.length > 0) {
      console.log(
        "📦 ChatWindow: Loaded",
        cachedMessages.length,
        "messages from cache",
      );
      setMessages(cachedMessages);
      setInitialLoad(false);
      // Scroll to bottom after a brief delay to ensure rendering
      setTimeout(scrollToBottom, 50);
    } else {
      // No cache, show loading state
      setMessages([]);
    }

    // Set up Firestore listener
    const docRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);

    unsubscribeRef.current = onSnapshot(
      docRef,
      (doc) => {
        if (doc.exists()) {
          const chatData = doc.data();
          const firebaseMessages = chatData.messages as ChatMessage[];

          if (firebaseMessages && firebaseMessages.length > 0) {
            // Sort messages by timestamp
            const sortedMessages = [...firebaseMessages].sort((a, b) => {
              const aSeconds =
                a.createdAt && typeof a.createdAt === "object"
                  ? (a.createdAt as Timestamp).seconds ||
                    (a.createdAt as any).seconds
                  : 0;
              const bSeconds =
                b.createdAt && typeof b.createdAt === "object"
                  ? (b.createdAt as Timestamp).seconds ||
                    (b.createdAt as any).seconds
                  : 0;
              return aSeconds - bSeconds;
            });

            // Update messages and cache
            setMessages(sortedMessages);
            saveToCache(sortedMessages);

            // Only scroll to bottom if this is initial load or if we have new messages
            if (initialLoad || sortedMessages.length !== messages.length) {
              setTimeout(scrollToBottom, 50);
            }

            console.log(
              "🔄 ChatWindow: Loaded",
              sortedMessages.length,
              "messages from Firestore",
            );
          } else {
            // No messages
            setMessages([]);
            saveToCache([]);
          }
        } else {
          // Document doesn't exist
          setMessages([]);
          if (cacheKey) {
            sessionStorage.removeItem(cacheKey);
          }
        }

        setInitialLoad(false);
      },
      (error) => {
        console.error("❌ ChatWindow: Error loading messages:", error);
        setInitialLoad(false);
      },
    );

    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [
    chatId,
    userId,
    loading,
    loadFromCache,
    saveToCache,
    scrollToBottom,
    cacheKey,
    messages.length,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return (
    <div className="w-full flex flex-col h-full hide-scrollbar">
      <div
        ref={chatContainerRef}
        className="flex-1 w-full md:pl-6 md:pr-6 p-4 overflow-y-auto hide-scrollbar"
      >
        <div className="flex flex-col gap-6 min-h-full justify-end w-full md:max-w-4xl mx-auto">
          {messages.map((msg, index) => (
            <div key={`${msg.id || msg.chatId}-${index}`}>
              {/* User messages */}
              {msg.sender === "user" ? (
                <div className="flex justify-end group">
                  <div className="flex items-end gap-2">
                    <div className="max-w-4xl">
                      {/* 🔧 NEW: Reply icon indicator - always on top */}
                      {msg.isReferenced && (
                        <div className="flex justify-end mb-1">
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Undo2 size={16} />
                            <span>Replied</span>
                          </div>
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2 justify-end">
                          {msg.images.map((img, i) => (
                            <div
                              key={`${index}-${i}`}
                              className="relative group/image"
                            >
                              <ImageZoomModal
                                src={img}
                                alt={`image-${i}`}
                                className="min-w-20 max-h-20 object-cover rounded-lg"
                                onInpaint={handleInpainting}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.text && (
                        <div className="relative">
                          <div className="text-sm  text-white bg-primary rounded-full py-2 px-4 leading-relaxed text-left">
                            <p>{msg.text}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Agent messages */
                <div className="group">
                  {/* 🔧 NEW: Loading spinner for agent messages */}
                  {msg.isLoading && (
                    <div className="flex justify-start mb-2">
                      <div className="flex items-end gap-2">
                        <div className="max-w-[75%] bg-transparent text-primary-foreground rounded-2xl px-4 py-3">
                          <div className="flex items-center justify-center">
                            <Lottie
                              animationData={catLoadingAnimation}
                              loop={true}
                              className="w-60 h-60"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {msg.text && !msg.isLoading && (
                    <div className="flex justify-start mb-2">
                      <div className="flex items-end gap-2">
                        <div className="max-w-[75%] bg-transparent text-primary-foreground rounded-2xl py-2">
                          <div className="text-sm leading-relaxed">
                            <ClickableText
                              text={msg.text || ""}
                              onActionClick={handleActionClick}
                              className="text-black dark:text-white no-underline capitalize"
                            />
                              {(msg as any).isStreaming && (
                                <span className="animate-pulse">▊</span>
                              )}
                          </div>

                        </div>
                      </div>
                    </div>
                  )}

                  {msg.images && msg.images.length > 0 && !msg.isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-end gap-2">
                        <div className="max-w-[75%]">
                          <div className="flex flex-wrap gap-2">
                            {msg.images.map((img, i) => (
                              <div
                                key={`${index}-${i}`}
                                className="relative group/image"
                              >
                                <ImageZoomModal
                                  src={img}
                                  alt={`image-${i}`}
                                  className="w-auto h-36 md:h-96 object-cover rounded-lg"
                                  onInpaint={handleInpainting}
                                />
                                {/* Icon row below the image */}
                                <div className="flex items-start justify-start gap-1 mt-2">
                                  <button
                                    onClick={() => handleLike(img)}
                                    className="p-1"
                                    title={
                                      likedImages.has(img) ? "Unlike" : "Like"
                                    }
                                  >
                                    <ThumbsUp
                                      size={16}
                                      className={`${
                                        likedImages.has(img)
                                          ? "text-green-600 dark:text-green-400 "
                                          : "text-black dark:text-white"
                                      }`}
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleDislike(img)}
                                    className="p-1"
                                    title={
                                      dislikedImages.has(img)
                                        ? "Remove dislike"
                                        : "Dislike"
                                    }
                                  >
                                    <ThumbsDown
                                      size={16}
                                      className={`${
                                        dislikedImages.has(img)
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-black dark:text-white"
                                      }`}
                                    />
                                  </button>
                                  <button
                                    onClick={() => console.log("Refresh:", img)}
                                    className="p-1 rounded-full "
                                    title="Retry"
                                  >
                                    <RefreshCcw
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleVideo(img)}
                                    className="p-1 rounded-full "
                                    title="Generate Video"
                                  >
                                    <Clapperboard
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() =>
                                      console.log("Landscape:", img)
                                    }
                                    className="p-1 rounded-full "
                                    title="Landscape"
                                  >
                                    <UnfoldHorizontal
                                      size={16}
                                      onClick={() => handleReframe(img)}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleUpscale(img)}
                                    className="p-1 rounded-full "
                                    title="Upscale Image"
                                  >
                                    <Sparkles
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleAnalyzeImage(img)}
                                    className="p-1 rounded-full "
                                    title="Image to Prompt"
                                  >
                                    <LetterText
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={(event) => {
                                      handleDownload(img);
                                      // Optional: Add visual feedback
                                      const button =
                                        event.currentTarget as HTMLElement;
                                      button.style.transform = "scale(0.95)";
                                      setTimeout(() => {
                                        button.style.transform = "scale(1)";
                                      }, 150);
                                    }}
                                    className="p-1 rounded-full"
                                    title="Download Image"
                                  >
                                    <Download
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => {
                                      showShareModal({
                                        mediaUrl: img,
                                        mediaType: "image",
                                        caption: msg.text,
                                        onShare: handleShare,
                                      });
                                    }}
                                    className="p-1 rounded-full "
                                    title="Share"
                                  >
                                    <Share2
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1">
                          {/* Reply button with hover effect for icons */}
                          <div className="group/reply relative flex items-center">
                            <button
                              onClick={() => handleReply(msg, index)}
                              className="flex items-center space-x-1 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
                              title="Reply to this image"
                            >
                              <Reply size={16} className="text-gray-500" />
                              <span className="text-sm text-gray-500">
                                Reply
                              </span>
                            </button>

                            {/* Reference mode icons - show on reply hover */}
                            <div className="opacity-0 group-hover/reply:opacity-100 transition-opacity duration-200 flex items-center space-x-1 ml-2">
                              <button
                                onClick={() => {
                                  setReferenceMode("product");
                                  handleReply(msg, index, "product");
                                }}
                                className={`p-1 rounded-full transition-all duration-200 ${
                                  referenceMode === "product"
                                    ? "bg-blue-500 text-white"
                                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                                title="Product reference"
                              >
                                <Package size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setReferenceMode("design");
                                  handleReply(msg, index, "design");
                                }}
                                className={`p-1 rounded-full transition-all duration-200 ${
                                  referenceMode === "design"
                                    ? "bg-blue-500 text-white"
                                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                                title="Design reference"
                              >
                                <Palette size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setReferenceMode("color");
                                  handleReply(msg, index, "color");
                                }}
                                className={`p-1 rounded-full transition-all duration-200 ${
                                  referenceMode === "color"
                                    ? "bg-blue-500 text-white"
                                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                                title="Color reference"
                              >
                                <Droplets size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 🔧 NEW: Video rendering section */}
                  {msg.videos && msg.videos.length > 0 && !msg.isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-end gap-2">
                        <div className="max-w-[75%]">
                          <div className="flex flex-wrap gap-2">
                            {msg.videos.map((video, i) => (
                              <div
                                key={`${index}-video-${i}`}
                                className="relative group/video"
                              >
                                <div className="w-96 h-auto rounded-lg overflow-hidden flex items-center justify-center">
                                  <VideoZoomModal
                                    src={video}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                {/* Icon row below the video */}
                                <div className="flex items-start justify-start gap-1 mt-2">
                                  <button
                                    onClick={() => handleLike(video)}
                                    className="p-1"
                                    title={
                                      likedImages.has(video) ? "Unlike" : "Like"
                                    }
                                  >
                                    <ThumbsUp
                                      size={16}
                                      className={`${
                                        likedImages.has(video)
                                          ? "text-green-600 dark:text-green-400 "
                                          : "text-black dark:text-white"
                                      }`}
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleDislike(video)}
                                    className="p-1"
                                    title={
                                      dislikedImages.has(video)
                                        ? "Remove dislike"
                                        : "Dislike"
                                    }
                                  >
                                    <ThumbsDown
                                      size={16}
                                      className={`${
                                        dislikedImages.has(video)
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-black dark:text-white"
                                      }`}
                                    />
                                  </button>
                                  <button
                                    onClick={() =>
                                      console.log("Refresh:", video)
                                    }
                                    className="p-1 rounded-full "
                                    title="Retry"
                                  >
                                    <RefreshCcw
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>

                                  <button
                                    className="p-1 rounded-full "
                                    title="Add Audio"
                                  >
                                    <AudioWaveform
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => handlelandscapevideo(video)}
                                    className="p-1 rounded-full "
                                    title="Landscape"
                                  >
                                    <Proportions
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>

                                  <button
                                    onClick={() => handleVideoreframe(video)}
                                    className="p-1 rounded-full "
                                    title="Portrait"
                                  >
                                    <RectangleVertical
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>



                                  <button
                                    onClick={() => handleVideoUpscale(video)}
                                    className="p-1 rounded-full "
                                    title="Upscale Video"
                                  >
                                    <Sparkles
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => handleDownload(video)}
                                    className="p-1 rounded-full"
                                    title="Download Video"
                                  >
                                    <Download
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                  <button
                                    onClick={() => {
                                      showShareModal({
                                        mediaUrl: video,
                                        mediaType: "video",
                                        caption: msg.text,
                                        onShare: handleShare,
                                      });
                                    }}
                                    className="p-1 rounded-full"
                                    title="Share Video"
                                  >
                                    <Share2
                                      size={16}
                                      className="text-black dark:text-white"
                                    />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
