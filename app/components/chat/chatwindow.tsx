"use client";

import { useEffect, useState } from "react";
import { firestore, auth } from "@/lib/firebase";
import {
  collection,
  orderBy,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

interface ChatMessage {
  sender: "user" | "agent";
  type: "prompt" | "images";
  text?: string;
  images?: string[];
  createdAt: Timestamp | any;
  chatId: string;
}

export default function ChatWindow({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const chatRef = collection(firestore, `users/${userId}/Chats`);
    const q = query(chatRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => doc.data() as ChatMessage)
        .filter((msg) => msg.chatId === chatId);
      setMessages(data);
    });

    return () => unsubscribe();
  }, [userId, chatId]);

  return (
  <div className="w-full flex items-center justify-center min-h-screen hide-scrollbar"> {/* full screen height */}
    <div className="w-full pl-12 pr-12 h-full p-4 overflow-y-auto hide-scrollbar">
      <div className="flex flex-col gap-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[60%] text-sm ${
                msg.type === "prompt"
                  ? msg.sender === "user"
                    ? "bg-blue-500 text-white rounded-xl px-4 py-2"
                    : "bg-gray-200 text-black dark:bg-blue-500 dark:text-white rounded-xl px-4 py-2"
                  : "p-0 bg-transparent"
              }`}
            >
              {msg.type === "prompt" && <p>{msg.text}</p>}

              {msg.type === "images" && msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`image-${i}`}
                      className="w-36 lg:w-42 h-auto max-h-76 object-cover rounded-md"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
}