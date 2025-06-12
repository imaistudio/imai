"use client";

import { useEffect, useState } from "react";
import { firestore, auth } from "@/lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { v4 as uuidv4 } from "uuid";

const sampleImages = [
  "https://images.unsplash.com/photo-1728443139578-cdfbf43e1a72?q=80&w=2964&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1541363111435-5c1b7d867904?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1747582411588-f9b4acabe995?q=80&w=3027&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1749324440929-6a9b5cb008b7?q=80&w=3035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

const sampleTexts = [
  "Can you show me something modern?",
  "That looks great! Any more like that?",
  "Try a vintage aesthetic next.",
  "Looks too dark, make it brighter.",
  "Perfect! Save this style.",
  "What about a pastel version?",
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
    const chatPath = `users/${userId}/Chats`;

    const batch = writeBatch(firestore);
    const baseData = {
      chatId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId,
    };

    const messages = Array.from({ length: 50 }).map((_, idx) => {
      const isUser = idx % 2 === 0;
      const isImage = Math.random() < 0.5;
      return {
        ...baseData,
        sender: isUser ? "user" : "agent",
        type: isImage ? "images" : "prompt",
        text: isImage ? "" : getRandom(sampleTexts),
        images: isImage ? [getRandom(sampleImages)] : [],
      };
    });

    messages.forEach((msg, idx) => {
      const msgRef = doc(firestore, `${chatPath}/${docId}_msg${idx}`);
      batch.set(msgRef, msg);
    });

    try {
      await batch.commit();
      setNewDocId(docId);
    } catch (err) {
      console.error("❌ Failed to create dummy messages:", err);
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