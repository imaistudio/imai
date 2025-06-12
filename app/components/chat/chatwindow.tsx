"use client";

import { useEffect, useState, useRef } from "react";
import { firestore, auth } from "@/lib/firebase";
import { doc, getDoc, Timestamp, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";

interface ChatMessage {
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

export default function ChatWindow({ chatId }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  useEffect(() => {
    if (!userId || !chatId || loading) return;

    const fetchChatMessages = async () => {
      try {
        const cachedMessages = loadFromSessionStorage();
        if (cachedMessages) {
          setMessages(cachedMessages);
        }
        const docRef = doc(firestore, `chats/${userId}/prompts/${chatId}`);
        const unsubscribe = onSnapshot(docRef, (doc) => {
          if (doc.exists()) {
            const chatData = doc.data();
            const firebaseMessages = chatData.messages as ChatMessage[];
            const sorted = [...firebaseMessages].sort((a, b) => {
              const aSeconds = a.createdAt && typeof a.createdAt === 'object' 
                ? (a.createdAt as Timestamp).seconds || (a.createdAt as any).seconds
                : 0;
              const bSeconds = b.createdAt && typeof b.createdAt === 'object'
                ? (b.createdAt as Timestamp).seconds || (b.createdAt as any).seconds
                : 0;
              return aSeconds - bSeconds;
            });
            
            setMessages(sorted);
            saveToSessionStorage(sorted);
          } else {
            setMessages([]);
            if (userId && chatId) {
              const cacheKey = getCacheKey(userId, chatId);
              sessionStorage.removeItem(cacheKey);
            }
          }
        });
        return () => unsubscribe();
      } catch (err) {
        console.error("❌ Error loading chat:", err);
      }
    };

    fetchChatMessages();
  }, [userId, chatId, loading]);

  useEffect(() => {
    return () => {
      // Optional: Clear session storage on unmount
      // sessionStorage.clear();
    };
  }, [userId]);



  return (
    <div className="w-full flex flex-col min-h-screen hide-scrollbar pb-12 md:pb-32  lg:pb-44">
      <div 
        ref={chatContainerRef}
        className="flex-1 w-full pl-12 pr-12 p-4 overflow-y-auto hide-scrollbar"
      >
        <div className="flex flex-col gap-4 min-h-full justify-end">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={`${msg.chatId}-${index}`}
                className={`flex ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[60%] text-sm ${
                    msg.type === "prompt"
                      ? msg.sender === "user"
                        ? "bg-blue-500 text-white rounded-xl px-4 py-2"
                        : "bg-blue-500 text-black dark:bg-blue-500 dark:text-white rounded-xl px-4 py-2"
                      : "p-0 bg-transparent"
                  }`}
                >
                  {msg.type === "prompt" && msg.text && <p>{msg.text}</p>}

                  {msg.type === "images" && msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.images.map((img, i) => (
                        <img
                          key={`${index}-${i}`}
                          src={img}
                          alt={`image-${i}`}
                          className="w-36 lg:w-52 h-auto max-h-76 object-cover rounded-md"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}