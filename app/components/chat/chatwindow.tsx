"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { firestore, auth } from "@/lib/firebase";
import { doc, getDoc, Timestamp, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { ImageZoomModal } from "@/components/ImageZoomModal";

interface ChatMessage {
  id?: string;
  sender: "user" | "agent";
  type: "prompt" | "images";
  text?: string;
  images?: string[];
  createdAt: Timestamp | { seconds: number; nanoseconds: number };
  chatId: string;
}

interface ChatWindowProps {
  chatId: string;
}

const MESSAGES_PER_PAGE = 20;

export default function ChatWindow({ chatId }: ChatWindowProps) {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [displayedMessages, setDisplayedMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isReady, setIsReady] = useState<boolean>(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const lastMessageCount = useRef<number>(0);

  // Always scroll to bottom for new messages
  const scrollToBottom = useCallback((smooth: boolean = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ 
        behavior: smooth ? "smooth" : "auto" 
      });
    }, smooth ? 50 : 0);
  }, []);

  // Maintain scroll position when loading older messages
  const maintainScrollPosition = useCallback(() => {
    if (chatContainerRef.current && previousScrollHeight.current > 0) {
      const newScrollHeight = chatContainerRef.current.scrollHeight;
      const scrollDifference = newScrollHeight - previousScrollHeight.current;
      chatContainerRef.current.scrollTop = scrollDifference;
    }
  }, []);

  // Handle scroll events for pagination
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current || loadingOlder || !hasMoreMessages) return;

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    
    // Check if user is near the bottom (within 50px)
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
    
    // Set scrolling flag
    isUserScrolling.current = !isNearBottom;
    
    // Load more messages when user scrolls near the top (within 100px)
    if (scrollTop < 100) {
      loadOlderMessages();
    }
  }, [loadingOlder, hasMoreMessages]);

  // Load older messages for pagination
  const loadOlderMessages = useCallback(() => {
    if (loadingOlder || !hasMoreMessages || allMessages.length === 0) return;

    setLoadingOlder(true);
    previousScrollHeight.current = chatContainerRef.current?.scrollHeight || 0;

    setTimeout(() => {
      const newPage = currentPage + 1;
      const startIndex = Math.max(0, allMessages.length - (newPage * MESSAGES_PER_PAGE));
      const endIndex = allMessages.length - ((newPage - 1) * MESSAGES_PER_PAGE);
      
      if (startIndex < endIndex && startIndex >= 0) {
        const olderMessages = allMessages.slice(startIndex, endIndex);
        setDisplayedMessages(prevDisplayed => [...olderMessages, ...prevDisplayed]);
        setCurrentPage(newPage);
        
        // Check if there are more messages to load
        setHasMoreMessages(startIndex > 0);
        
        // Maintain scroll position after DOM update
        setTimeout(maintainScrollPosition, 50);
      } else {
        setHasMoreMessages(false);
      }
      
      setLoadingOlder(false);
    }, 100);
  }, [allMessages, currentPage, loadingOlder, hasMoreMessages, maintainScrollPosition]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Session storage for caching messages
  const getCacheKey = (userId: string, chatId: string) => 
    `chat_messages_${userId}_${chatId}`;

  const saveToSessionStorage = (messages: ChatMessage[]) => {
    if (userId && chatId) {
      try {
        const cacheKey = getCacheKey(userId, chatId);
        sessionStorage.setItem(cacheKey, JSON.stringify(messages));
      } catch (error) {
        console.warn("Failed to save to session storage:", error);
      }
    }
  };

  const loadFromSessionStorage = (): ChatMessage[] | null => {
    if (userId && chatId) {
      try {
        const cacheKey = getCacheKey(userId, chatId);
        const cached = sessionStorage.getItem(cacheKey);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        console.warn("Failed to load from session storage:", error);
      }
    }
    return null;
  };

  // Load and monitor messages
  useEffect(() => {
    if (!userId || !chatId || loading) return;

    const loadMessages = async () => {
      try {
        // Try to load from cache first for faster initial load
        const cachedMessages = loadFromSessionStorage();
        if (cachedMessages && cachedMessages.length > 0) {
          setAllMessages(cachedMessages);
          // Show the most recent messages first
          const recentMessages = cachedMessages.slice(-MESSAGES_PER_PAGE);
          setDisplayedMessages(recentMessages);
          setHasMoreMessages(cachedMessages.length > MESSAGES_PER_PAGE);
          setInitialLoadComplete(true);
          lastMessageCount.current = cachedMessages.length;
          setIsReady(true);
          scrollToBottom(false); // Instant scroll on initial load
        }

        // Set up real-time listener
        const docRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        const unsubscribe = onSnapshot(docRef, (doc) => {
          if (doc.exists()) {
            const chatData = doc.data();
            const firebaseMessages = chatData.messages as ChatMessage[];
            
            if (firebaseMessages && firebaseMessages.length > 0) {
              const sorted = [...firebaseMessages].sort((a, b) => {
                const aSeconds = a.createdAt && typeof a.createdAt === 'object' 
                  ? (a.createdAt as Timestamp).seconds || (a.createdAt as any).seconds
                  : 0;
                const bSeconds = b.createdAt && typeof b.createdAt === 'object'
                  ? (b.createdAt as Timestamp).seconds || (b.createdAt as any).seconds
                  : 0;
                return aSeconds - bSeconds;
              });
              
              // Update all messages
              setAllMessages(sorted);
              saveToSessionStorage(sorted);
              
              // Check if there are new messages
              const hasNewMessages = sorted.length > lastMessageCount.current;
              lastMessageCount.current = sorted.length;
              
                             if (!initialLoadComplete) {
                 // Initial load - show recent messages and scroll to bottom
                 const recentMessages = sorted.slice(-MESSAGES_PER_PAGE);
                 setDisplayedMessages(recentMessages);
                 setHasMoreMessages(sorted.length > MESSAGES_PER_PAGE);
                 setCurrentPage(1);
                 setInitialLoadComplete(true);
                 scrollToBottom(false); // Instant scroll on initial load
               } else if (hasNewMessages && !isUserScrolling.current) {
                // New messages arrived and user is at bottom - show them and scroll
                const recentMessages = sorted.slice(-MESSAGES_PER_PAGE);
                setDisplayedMessages(recentMessages);
                setHasMoreMessages(sorted.length > MESSAGES_PER_PAGE);
                setCurrentPage(1);
                scrollToBottom();
                             } else if (hasNewMessages && isUserScrolling.current) {
                 // New messages arrived but user is scrolled up - just add to displayed messages
                 const previousLength = sorted.length - (lastMessageCount.current - (sorted.length - lastMessageCount.current));
                 const newMessagesCount = sorted.length - (allMessages.length || 0);
                 if (newMessagesCount > 0) {
                   const newMessages = sorted.slice(-newMessagesCount);
                   setDisplayedMessages(prev => [...prev, ...newMessages]);
                 }
               }
            }
          } else {
            setAllMessages([]);
            setDisplayedMessages([]);
            setHasMoreMessages(false);
            lastMessageCount.current = 0;
            if (userId && chatId) {
              const cacheKey = getCacheKey(userId, chatId);
              sessionStorage.removeItem(cacheKey);
            }
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("❌ Error loading chat:", err);
        setInitialLoadComplete(true);
      }
    };

    loadMessages();
  }, [userId, chatId, loading, scrollToBottom, initialLoadComplete]);

  // Add scroll event listener
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container && initialLoadComplete) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll, initialLoadComplete]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (initialLoadComplete && displayedMessages.length > 0 && !isUserScrolling.current) {
      scrollToBottom();
    }
  }, [displayedMessages.length, scrollToBottom, initialLoadComplete]);

  // Clean up session storage on unmount
  useEffect(() => {
    return () => {
      // Optional: Clear session storage on unmount
      // sessionStorage.clear();
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="w-full flex flex-col min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col min-h-screen hide-scrollbar pb-12 md:pb-32 lg:pb-44">
      <div 
        ref={chatContainerRef}
        className="flex-1 w-full pl-6 pr-6 p-4 overflow-y-auto hide-scrollbar"
      >
        <div className="flex flex-col gap-6 min-h-full justify-end max-w-7xl mx-auto">
          {/* Loading indicator for older messages */}
          {loadingOlder && (
            <div className="flex justify-center py-4">
              <div className="text-sm text-gray-500 animate-pulse">Loading older messages...</div>
            </div>
          )}
          
          {displayedMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No messages yet. Start a conversation!
            </div>
          ) : (
            displayedMessages.map((msg, index) => (
              <div key={`${msg.id || msg.chatId}-${index}`}>
                {/* Handle user messages (keep text and images together) */}
                {msg.sender === "user" ? (
                  <div className="flex justify-end">
                    <div
                      className={`max-w-[75%] ${
                        msg.type === "prompt" || (msg.images && msg.images.length > 0)
                          ? ""
                          : ""
                      }`}
                    >
                      {msg.text && (
                        <div className={`text-sm bg-primary text-primary-foreground rounded-2xl px-4 py-3 leading-relaxed ${msg.images && msg.images.length > 0 ? 'mb-3' : ''}`}>
                          <p>{msg.text}</p>
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.images.map((img, i) => (
                            <ImageZoomModal
                              key={`${index}-${i}`}
                              src={img}
                              alt={`image-${i}`}
                              className="w-32 h-32 object-cover rounded-lg "
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Handle agent messages (separate text and images) */
                  <>
                    {/* Text bubble for agent */}
                    {msg.text && (
                      <div className="flex justify-start mb-2">
                        <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl px-4 py-3">
                          <div className="text-sm leading-relaxed">
                            <p>{msg.text}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Images without background for agent */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex justify-start">
                        <div className="max-w-[75%]">
                          <div className="flex flex-wrap gap-2">
                            {msg.images.map((img, i) => (
                              <ImageZoomModal
                                key={`${index}-${i}`}
                                src={img}
                                alt={`image-${i}`}
                                className="w-auto h-auto max-h-36 object-cover rounded-lg border border-border/20 hover:border-border/40 transition-colors cursor-pointer"
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}