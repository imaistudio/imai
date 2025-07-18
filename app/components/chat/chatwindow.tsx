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
import { ImageZoomModal } from "@/app/components/ImageZoomModal";
import { useShareModal } from "@/contexts/ShareModalContext";

import {
  Reply,
  ThumbsUp,
  ThumbsDown,
  UnfoldHorizontal,
  Sparkles,
  Download,
  Share2,
  Package,
  Palette,
  Droplets,
  Clapperboard,
  Undo2,
  AudioWaveform,
  Proportions,
  RectangleVertical,
  Wrench,
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
  isTool?: boolean; // 🔧 NEW: Boolean to track if this message used a tool
  toolName?: string; // 🔧 NEW: Name of the tool used
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

  // Handle video landscape (outpainting)
  const handlelandscapevideo = useCallback(
    async (videoUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      console.log("🎬 Starting video landscape outpainting for:", videoUrl);

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `landscape-video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Converting video to landscape format...",
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

        // Call video outpainting API
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("video_url", videoUrl);
        formData.append("aspect_ratio", "16:9");
        formData.append("resolution", "720p");
        formData.append("expand_left", "true");
        formData.append("expand_right", "true");
        formData.append("expand_ratio", "0.25"); // Changed from 0.25 to 0.15 for better quality
        formData.append("num_frames", "81");
        formData.append("frames_per_second", "16");
        formData.append("num_inference_steps", "30");
        formData.append("guidance_scale", "5.0");

        const response = await fetch("/api/videooutpainting", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === "success" && result.videoUrl) {
          // Create landscape video message
          const landscapeMessage: ChatMessage = {
            id: `landscape-video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your landscape video:",
            videos: [result.videoUrl],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the landscape video
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

            // Replace loading message with landscape video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? landscapeMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

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
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
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

          // Replace loading message with error message
          const updatedMessages = currentMessages.map((msg: ChatMessage) =>
            msg.id === loadingMessage.id ? errorMessage : msg,
          );

          await updateDoc(chatRef, {
            messages: updatedMessages,
          });
        }
      }
    },
    [userId, chatId],
  );

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

  // Handle video sound effects
  const handleVideoSound = useCallback(
    async (videoUrl: string) => {
      if (!userId || !chatId) {
        console.error("User not authenticated or no chat ID");
        return;
      }

      // Create loading message
      const loadingMessage: ChatMessage = {
        id: `sound-video-${Date.now()}`,
        sender: "agent",
        type: "videos",
        text: "Adding sound effects to video...",
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

        // Call video sound effects API
        const formData = new FormData();
        formData.append("video_url", videoUrl);
        formData.append(
          "prompt",
          "Generate realistic ambient and foreground sounds that match the visual content, timing, environment, and actions in the video. Ensure the audio reflects the correct atmosphere, object interactions, materials, spatial depth, and motion. Maintain temporal alignment and avoid adding unrelated sounds.",
        );
        formData.append("original_sound_switch", "false"); // Default to false

        const response = await fetch("/api/videosound", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && result.video_url) {
          // Create sound effects video message
          const soundMessage: ChatMessage = {
            id: `sound-video-result-${Date.now()}`,
            sender: "agent",
            type: "videos",
            text: "Here's your video with sound effects:",
            videos: [result.video_url],
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the sound effects video
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

            // Replace loading message with sound effects video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? soundMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

          console.log("✅ Video with sound effects saved to chat");
        } else {
          throw new Error("Invalid response from video sound effects API");
        }
      } catch (error) {
        console.error("❌ Video sound effects failed:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `sound-video-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't add sound effects to the video. Please try again later.",
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
        // Add loading message to Firestore
        const chatRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        await updateDoc(chatRef, {
          messages: arrayUnion(loadingMessage),
        });

        // Call upscale API
        const formData = new FormData();
        formData.append("video_url", videoUrl);

        const response = await fetch("/api/videoupscaler", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
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
            chatId: chatId,
            createdAt: Timestamp.now(),
          };

          // Update Firestore with the upscaled video
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

            // Replace loading message with upscale video result
            const updatedMessages = currentMessages.map((msg: ChatMessage) =>
              msg.id === loadingMessage.id ? upscaleMessage : msg,
            );

            await updateDoc(chatRef, {
              messages: updatedMessages,
            });
          }

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
  );

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

      // Find the most recent image from messages
      const recentImage = messages
        .slice()
        .reverse()
        .find((m) => m.images && m.images.length > 0)?.images?.[0];

      if (!recentImage) {
        alert(
          "No recent image found to process. Please ensure there's an image in the conversation.",
        );
        return;
      }

      // Create loading message based on action type
      let loadingText = "";
      let messageType: "images" | "prompt" = "images";
      if (type === "upscale") {
        loadingText = "Upscaling image to higher resolution...";
      } else if (type === "reframe") {
        loadingText = param
          ? `Reframing to ${param} format...`
          : "Reframing image...";
      } else if (type === "design") {
        loadingText = "Creating new design...";
      } else if (type === "removebg") {
        loadingText = "Removing background...";
      } else if (type === "scene") {
        loadingText = "Enhancing scene composition...";
      } else if (type === "timeofday") {
        loadingText = "Changing time of day...";
      } else {
        loadingText = `Processing ${type}...`;
      }

      const loadingMessage: ChatMessage = {
        id: `action-${type}-${Date.now()}`,
        sender: "agent",
        type: messageType,
        text: loadingText,
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

        // Create form data for the action
        const formData = new FormData();
        formData.append("userid", userId);
        formData.append("chatId", chatId);
        formData.append("image_url", recentImage);

        let finalMessage = "";
        if (type === "upscale") {
          finalMessage = "upscale this image to higher resolution";
        } else if (type === "reframe") {
          finalMessage = param
            ? `change to ${param} format`
            : "reframe this image";
          if (param) formData.append("aspect_ratio", param);
        } else if (type === "design") {
          finalMessage =
            param === "similar"
              ? "create similar design"
              : "create new design based on this";
        } else if (type === "removebg") {
          finalMessage = "remove background from this image";
        } else if (type === "scene") {
          finalMessage = "enhance the scene composition";
        } else if (type === "timeofday") {
          finalMessage = "change the time of day in this image";
        } else {
          finalMessage = `apply ${type} to this image`;
        }

        formData.append("message", finalMessage);

        // Submit to intentroute
        const response = await fetch("/api/intentroute", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Action processed:", result);

        if (result.status === "success") {
          // 🔧 CRITICAL FIX: Sanitize recommendations for Firebase
          const sanitizeRecommendations = (recommendations: any[]) => {
            if (!Array.isArray(recommendations)) return [];
            
            return recommendations.map((rec) => ({
              id: String(rec.id || ""),
              label: String(rec.label || ""),
              intent: String(rec.intent || ""),
              endpoint: String(rec.endpoint || ""),
              // 🔧 FIX: Convert parameters object to simple string to avoid nested entity issues
              parameters: typeof rec.parameters === 'object' 
                ? JSON.stringify(rec.parameters || {}) 
                : String(rec.parameters || "{}"),
              icon: String(rec.icon || ""),
            }));
          };

          // Create success message
          const successMessage: ChatMessage = {
            id: `action-result-${Date.now()}`,
            sender: "agent",
            type:
              result.images && result.images.length > 0 ? "images" : "prompt",
            text: result.message,
            images:
              result.images && result.images.length > 0
                ? result.images
                : undefined,
            chatId: chatId,
            createdAt: Timestamp.now(),
            recommendations: sanitizeRecommendations(result.recommendations || []) as any, // 🔧 FIX: Type assertion for Firebase-safe version
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

          console.log("✅ Action result saved to chat");
        } else {
          throw new Error(result.error || "Failed to process action");
        }
      } catch (error) {
        console.error("❌ Error processing action:", error);

        // Create error message
        const errorMessage: ChatMessage = {
          id: `action-error-${Date.now()}`,
          sender: "agent",
          type: "prompt",
          text: "Sorry, I couldn't complete that action. Please try again.",
          chatId: chatId,
          createdAt: Timestamp.now(),
        };

        // Update Firestore with error message
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

          // Replace loading message with error message
          const updatedMessages = currentMessages.map((msg: ChatMessage) =>
            msg.id === loadingMessage.id ? errorMessage : msg,
          );

          await updateDoc(chatRef, {
            messages: updatedMessages,
          });
        }
      }
    },
    [userId, chatId, messages],
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
    <div className="w-full flex flex-col h-full">
      <div
        ref={chatContainerRef}
        className="flex-1 w-full md:pl-6 md:pr-6 p-4"
        style={{ touchAction: "auto", overscrollBehaviorX: "none" }}
      >
        <div className="flex flex-col gap-6 min-h-full justify-end w-full md:max-w-4xl mx-auto overflow-x-hidden">
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
                            <span className="capitalize">Replied</span>
                          </div>
                        </div>
                      )}
                      {/* 🔧 NEW: Tool icon indicator - show when tool was used */}
                      {msg.isTool && msg.toolName && (
                        <div className="flex justify-end mb-1">
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Wrench size={16} />
                            <span className="capitalize">{msg.toolName}</span>
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
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.text && (
                        <div className="relative">
                          <div className="text-sm w-full text-white bg-primary rounded-2xl py-3 px-4 leading-relaxed text-left">
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
                                  className="w-auto  h-36 md:h-96 object-cover rounded-lg"
                                  onLike={handleLike}
                                  onDislike={handleDislike}
                                  likedImages={likedImages}
                                  dislikedImages={dislikedImages}
                                  onPaint={() => console.log("Paint:", img)}
                                  onDownload={handleDownload}
                                  onShare={handleShare}
                                />
                                {/* Icon row below the image */}
                                <div className="flex items-start justify-start gap-2 mt-2 flex-wrap">
                                  <button
                                    title={
                                      likedImages.has(img) ? "Unlike" : "Like"
                                    }
                                    className={`cursor-pointer transition-all ${
                                      likedImages.has(img)
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-black dark:text-white"
                                    }`}
                                    onClick={() => handleLike(img)}
                                  >
                                    <ThumbsUp size={16} />
                                  </button>
                                  <button
                                    title={
                                      dislikedImages.has(img)
                                        ? "Remove dislike"
                                        : "Dislike"
                                    }
                                    className={`cursor-pointer transition-all ${
                                      dislikedImages.has(img)
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-black dark:text-white"
                                    }`}
                                    onClick={() => handleDislike(img)}
                                  >
                                    <ThumbsDown size={16} />
                                  </button>
                                  <button
                                    title="Download Image"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={(event) => {
                                      handleDownload(img);
                                      const icon = event.currentTarget;
                                      icon.style.transform = "scale(0.95)";
                                      setTimeout(() => {
                                        icon.style.transform = "scale(1)";
                                      }, 150);
                                    }}
                                  >
                                    <Download size={16} />
                                  </button>
                                  <button
                                    title="Share"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() =>
                                      showShareModal({
                                        mediaUrl: img,
                                        mediaType: "image",
                                        caption: msg.text,
                                        onShare: handleShare,
                                      })
                                    }
                                  >
                                    <Share2 size={16} />
                                  </button>
                                  <button
                                    title="Videogen"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleVideo(img)}
                                  >
                                    <Clapperboard size={16} />
                                  </button>
                                  <button
                                    title="Landscape"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleReframe(img)}
                                  >
                                    <UnfoldHorizontal size={16} />
                                  </button>
                                  <button
                                    title="Upscale"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleUpscale(img)}
                                  >
                                    <Sparkles size={16} />
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
                                <VideoZoomModal
                                  src={video}
                                  className="w-auto h-36 md:h-96 object-cover rounded-lg"
                                  onLike={handleLike}
                                  onDislike={handleDislike}
                                  likedImages={likedImages}
                                  dislikedImages={dislikedImages}
                                  onPaint={() => console.log("Paint:", video)}
                                  onDownload={handleDownload}
                                  onShare={handleShare}
                                />
                                {/* Icon row below the video */}

                                <div className="flex items-start justify-start gap-2 mt-2 flex-wrap">
                                  <button
                                    title={
                                      likedImages.has(video) ? "Unlike" : "Like"
                                    }
                                    className={`cursor-pointer transition-all ${
                                      likedImages.has(video)
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-black dark:text-white"
                                    }`}
                                    onClick={() => handleLike(video)}
                                  >
                                    <ThumbsUp size={16} />
                                  </button>
                                  <button
                                    title={
                                      dislikedImages.has(video)
                                        ? "Remove dislike"
                                        : "Dislike"
                                    }
                                    className={`cursor-pointer transition-all ${
                                      dislikedImages.has(video)
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-black dark:text-white"
                                    }`}
                                    onClick={() => handleDislike(video)}
                                  >
                                    <ThumbsDown size={16} />
                                  </button>
                                  <button
                                    title="Download Video"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={(event) => {
                                      handleDownload(video);
                                      const icon = event.currentTarget;
                                      icon.style.transform = "scale(0.95)";
                                      setTimeout(() => {
                                        icon.style.transform = "scale(1)";
                                      }, 150);
                                    }}
                                  >
                                    <Download size={16} />
                                  </button>
                                  <button
                                    title="Share Video"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() =>
                                      showShareModal({
                                        mediaUrl: video,
                                        mediaType: "video",
                                        caption: msg.text,
                                        onShare: handleShare,
                                      })
                                    }
                                  >
                                    <Share2 size={16} />
                                  </button>
                                  <button
                                    title="AudioGen"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleVideoSound(video)}
                                  >
                                    <AudioWaveform size={16} />
                                  </button>
                                  <button
                                    title="Landscape"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handlelandscapevideo(video)}
                                  >
                                    <Proportions size={16} />
                                  </button>
                                  <button
                                    title="Portrait"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleVideoreframe(video)}
                                  >
                                    <RectangleVertical size={16} />
                                  </button>
                                  <button
                                    title="Upscale"
                                    className="cursor-pointer text-black dark:text-white transition-all"
                                    onClick={() => handleVideoUpscale(video)}
                                  >
                                    <Sparkles size={16} />
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
