"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { firestore, auth } from "@/lib/firebase";
import { doc, Timestamp, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { Reply, ThumbsUp, ThumbsDown, RefreshCcw, UnfoldHorizontal, Sparkles, LetterText,  Search, Download, Share2 } from "lucide-react";
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

  // Initialize auth state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user: User | null) => {
      setUserId(user?.uid || null);
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

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
                                  <div className="flex items-start justify-start gap-2 mt-2">
                                    <button
                                      onClick={() => console.log('Like:', img)}
                                      className="p-1 rounded-full "
                                      title="Like"
                                    >
                                      <ThumbsUp size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Dislike:', img)}
                                      className="p-1 rounded-full "
                                      title="Dislike"
                                    >
                                      <ThumbsDown size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Refresh:', img)}
                                      className="p-1 rounded-full "
                                      title="Retry"
                                    >
                                      <RefreshCcw size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Landscape:', img)}
                                      className="p-1 rounded-full "
                                      title="Landscape"
                                    >
                                      <UnfoldHorizontal size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Enhance:', img)}
                                      className="p-1 rounded-full "
                                      title="Enhance"
                                    >
                                      <Sparkles size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Analyze:', img)}
                                      className="p-1 rounded-full "
                                      title="Image to Promot"
                                    >
                                      <LetterText size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Download:', img)}
                                      className="p-1 rounded-full "
                                      title="Download"
                                    >
                                      <Download size={16} className="text-black dark:text-white" />
                                    </button>
                                    <button
                                      onClick={() => console.log('Share:', img)}
                                      className="p-1 rounded-full "
                                      title="Share"
                                    >
                                      <Share2 size={16} className="text-black dark:text-white" />
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
