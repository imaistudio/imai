"use client";

import { useEffect, useState } from "react";
import { firestore, auth } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { v4 as uuidv4 } from "uuid";
const now = new Date();

const sampleImages = [
  "https://images.unsplash.com/photo-1728443139578-cdfbf43e1a72?q=80&w=2964&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1541363111435-5c1b7d867904?q=80&w=2940&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1747582411588-f9b4acabe995?q=80&w=3027&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1749324440929-6a9b5cb008b7?q=80&w=3035&auto=format&fit=crop",
];

const sampleTexts = [
  "Generate a sunset over mountains",
  "Try a pastel color scheme",
  "Add vintage film grain effect",
  "Make it feel more modern",
  "Remove the dark shadows",
  "Perfect! Save this one",
];

export default function TestChatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [newDocId, setNewDocId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const getRandom = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  const createDummyChat = async () => {
    if (!userId) return;

    const docId = uuidv4();
    const chatId = `${userId}_${docId}`;
    const chatRef = doc(firestore, `chats/${userId}/${docId}`);

    const timestamp = serverTimestamp();

    const messages = Array.from({ length: 50 }).map((_, idx) => {
      const isUser = idx % 2 === 0;
      const isImage = Math.random() < 0.5;

      return {
        sender: isUser ? "user" : "agent",
        type: isImage ? "images" : "prompt",
        text: isImage ? "" : getRandom(sampleTexts),
        images: isImage ? [getRandom(sampleImages)] : [],
        createdAt: now,
        updatedAt: now,
        userId,
        chatId,
      };
    });

    const chatDoc = {
      chatId,
      userId,
      createdAt: now,
      updatedAt: now,
      messages,
    };

    try {
      await setDoc(chatRef, chatDoc);
      setNewDocId(docId);
    } catch (err) {
      console.error("❌ Failed to create chat:", err);
    }
  };

  return (
    <main className="p-8 space-y-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold">🧪 Chat Test Page</h1>

      {userId ? (
        <div className="space-y-4">
          <button
            onClick={createDummyChat}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create 50-message Dummy Chat
          </button>

          {newDocId && (
            <div className="p-3 border rounded bg-gray-50 dark:bg-gray-900">
              <p className="text-sm text-gray-700 dark:text-white">
                ✅ Dummy chat created with 50 messages.
              </p>
              <p className="font-mono text-blue-600 break-all">{newDocId}</p>
              <p className="text-sm text-gray-500 mt-2">
                Use in <code>&lt;ChatWindow chatId="..." /&gt;</code>:
              </p>
              <pre className="text-xs text-black dark:text-white mt-1">{`chatId = "${userId}_${newDocId}"`}</pre>
            </div>
          )}
        </div>
      ) : (
        <p className="text-red-500">🔒 Please login to test chat creation.</p>
      )}
    </main>
  );
}