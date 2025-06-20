"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { collection, addDoc, Timestamp, doc, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid';

interface ChatContextType {
  currentChatId: string;
  setCurrentChatId: (chatId: string) => void;
  createNewChat: () => Promise<void>;
  switchToChat: (chatId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user: currentUser, loading } = useAuth();
  const [currentChatId, setCurrentChatId] = useState<string>("");

  // Initialize chat when user is loaded
  useEffect(() => {
    const initializeChat = async () => {
      if (!currentUser) return;

      try {
        // Check if there's an existing chat ID in sessionStorage for this user
        const sessionKey = `currentChatId_${currentUser.uid}`;
        const existingChatId = sessionStorage.getItem(sessionKey);

        if (existingChatId) {
          // Use existing chat from session
          setCurrentChatId(existingChatId);
          console.log("Restored existing chat from session:", existingChatId);
        }
        // Note: New chat creation is now handled in page.tsx for new sessions
      } catch (error) {
        console.error("Error initializing chat:", error);
      }
    };

    if (!loading && currentUser) {
      initializeChat();
    }
  }, [currentUser, loading]);

  // Clear chat ID and session when user logs out
  useEffect(() => {
    if (!loading && !currentUser) {
      setCurrentChatId("");
      // Clear any existing chat sessions when user logs out
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('currentChatId_')) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [loading, currentUser]);

  const createNewChatInternal = async (): Promise<string> => {
    if (!currentUser) throw new Error("No user logged in");

    const newChatId = `${currentUser.uid}_${uuidv4()}`;
    
    // Store in sessionStorage
    const sessionKey = `currentChatId_${currentUser.uid}`;
    sessionStorage.setItem(sessionKey, newChatId);
    
    // Create chat metadata for sidebar using chatId as document ID
    const sidebarDocRef = doc(firestore, `users/${currentUser.uid}/sidebar/${newChatId}`);
    await setDoc(sidebarDocRef, {
      chatId: newChatId,
      chatSummary: "New Chat",
      userId: currentUser.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isPinned: false,
      pinnedAt: null
    });

    setCurrentChatId(newChatId);
    console.log("Created new chat:", newChatId);
    
    return newChatId;
  };

  const createNewChat = async () => {
    try {
      await createNewChatInternal();
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
  };

  const switchToChat = (chatId: string) => {
    if (!chatId || !currentUser) {
      console.log("❌ ChatContext: Cannot switch chat - missing chatId or user:", { chatId, hasUser: !!currentUser });
      return;
    }
    
    console.log("🔄 ChatContext: Switching from", currentChatId, "to", chatId);
    
    // Update session storage
    const sessionKey = `currentChatId_${currentUser.uid}`;
    sessionStorage.setItem(sessionKey, chatId);
    console.log("📝 ChatContext: Updated session storage with key:", sessionKey, "value:", chatId);
    
    // Update current chat
    setCurrentChatId(chatId);
    console.log("✅ ChatContext: Set current chat ID to:", chatId);
  };

  const value: ChatContextType = {
    currentChatId,
    setCurrentChatId,
    createNewChat,
    switchToChat
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
} 