"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { firestore, auth } from "@/lib/firebase";
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
import { ImageZoomModal } from "@/components/ImageZoomModal";
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
} from "lucide-react";
import Lottie from "lottie-react";
import catLoadingAnimation from "@/public/lottie/catloading.json";

interface ChatMessage {
  id?: string;
  sender: "user" | "agent";
  type: "prompt" | "images";
  text?: string;
  images?: string[];
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  chatId: string;
  isStreaming?: boolean;
  isLoading?: boolean;
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number };
}

// 🔧 NEW: Interface for referenced message
interface ReferencedMessage {
  id: string;
  sender: "user" | "agent";
  text?: string;
  images?: string[];
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    (msg: ChatMessage, index: number) => {
      if (!onReplyToMessage) return;

      const referencedMessage: ReferencedMessage = {
        id: msg.id || `${msg.chatId}-${index}`,
        sender: msg.sender,
        text: msg.text,
        images: msg.images || [],
        timestamp:
          msg.createdAt && typeof msg.createdAt === "object"
            ? new Date(
                (msg.createdAt as Timestamp).seconds * 1000,
              ).toISOString()
            : new Date().toISOString(),
        referencemode: referenceMode, // 🔧 NEW: Include selected reference mode
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

      console.log("🔗 Created download link with href:", link.href);
      console.log("📥 Download attribute:", link.download);

      document.body.appendChild(link);

      // Force click
      link.click();

      console.log("✅ Download link clicked");

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
    <div className="w-full flex flex-col min-h-screen hide-scrollbar pb-6 md:pb-32 lg:pb-44">
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
                        <div className="text-sm  text-white bg-primary rounded-full py-2 px-4 leading-relaxed text-left">
                          <p>{msg.text}</p>
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
                            <p className="text-black dark:text-white">
                              {msg.text}
                              {(msg as any).isStreaming && (
                                <span className="animate-pulse">▊</span>
                              )}
                            </p>
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
                                    onClick={() => console.log("Enhance:", img)}
                                    className="p-1 rounded-full "
                                    title="Enhance"
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
                                    onClick={() => console.log("Share:", img)}
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
                              <span className="text-sm text-gray-500">Reply</span>
                            </button>
                            
                            {/* Reference mode icons - show on reply hover */}
                            <div className="opacity-0 group-hover/reply:opacity-100 transition-opacity duration-200 flex items-center space-x-1 ml-2">
                              <button
                                onClick={() => {
                                  setReferenceMode("product");
                                  handleReply(msg, index);
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
                                  handleReply(msg, index);
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
                                  handleReply(msg, index);
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
