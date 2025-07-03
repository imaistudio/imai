"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { firestore, auth } from "@/lib/firebase";
import {
  doc,
  Timestamp,
  onSnapshot,
  collection,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import {
  Reply,
  ThumbsUp,
  ThumbsDown,
  RefreshCcw,
  UnfoldHorizontal,
  Sparkles,
  LetterText,
  Search,
  Download,
  Share2,
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
}

// 🔧 NEW: Interface for title renaming callback
interface TitleRenameResult {
  success: boolean;
  title?: string;
  category?: string;
  error?: string;
}

/**
 * ChatWindow component for displaying chat messages
 *
 * Features:
 * - Displays chat messages with real-time updates
 * - Reply-to-message functionality
 * - Image zoom modal
 * - Loading states and animations
 * - Automatic title generation (handled server-side)
 */
interface ChatWindowProps {
  chatId: string;
  onReplyToMessage?: (message: ReferencedMessage) => void;
  onTitleRenamed?: (chatId: string, newTitle: string, category: string) => void; // For backward compatibility
}

const MESSAGES_PER_PAGE = 20;

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
      };

      onReplyToMessage(referencedMessage);
    },
    [onReplyToMessage],
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
                    <button
                      onClick={() => handleReply(msg, index)}
                      className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Reply to this message"
                    >
                      <Reply size={16} className="text-gray-500" />
                    </button>
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
                        <div className="max-w-[75%] bg-transparent text-primary-foreground rounded-2xl px-4 py-3">
                          <div className="text-sm leading-relaxed">
                            <p className="text-black dark:text-white">
                              {msg.text}
                              {(msg as any).isStreaming && (
                                <span className="animate-pulse ml-1">▊</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleReply(msg, index)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200  flex items-center space-x-1"
                          title="Reply to this message"
                        >
                          <Reply size={16} className="text-gray-500" />
                          <span className="text-sm text-gray-500">Reply</span>
                        </button>
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
                                    onClick={() => console.log("Analyze:", img)}
                                    className="p-1 rounded-full "
                                    title="Image to Promot"
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
                                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150"
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

                        <button
                          onClick={() => handleReply(msg, index)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1"
                          title="Reply to this image"
                        >
                          <Reply size={16} className="text-gray-500" />
                          <span className="text-sm text-gray-500">Reply</span>
                        </button>
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
