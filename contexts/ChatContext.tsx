"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { collection, addDoc, Timestamp, doc, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid';

interface ChatContextType {
  currentChatId: string;
  setCurrentChatId: (chatId: string) => void;
  createNewChat: () => Promise<void>;
  switchToChat: (chatId: string) => void;
  isLoading: boolean;
  isSwitching: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user: currentUser, loading } = useAuth();
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  
  // Ref to track the last switch operation to prevent race conditions
  const lastSwitchRef = useRef<string>("");
  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize chat when user is loaded
  useEffect(() => {
    const initializeChat = async () => {
      if (!currentUser || isLoading) return;

      try {
        setIsLoading(true);
        
        // Check if there's an existing chat ID in sessionStorage for this user
        const sessionKey = `currentChatId_${currentUser.uid}`;
        const existingChatId = sessionStorage.getItem(sessionKey);

        if (existingChatId) {
          // Use existing chat from session
          setCurrentChatId(existingChatId);
          console.log("✅ Restored existing chat from session:", existingChatId);
        }
        // Note: New chat creation is now handled in page.tsx for new sessions
      } catch (error) {
        console.error("❌ Error initializing chat:", error);
      } finally {
        setIsLoading(false);
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
      setIsLoading(false);
      setIsSwitching(false);
      
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
    console.log("✅ Created new chat:", newChatId);
    
    return newChatId;
  };

  const createNewChat = async () => {
    try {
      setIsLoading(true);
      await createNewChatInternal();
    } catch (error) {
      console.error("❌ Error creating new chat:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced chat switching with optimistic updates
  const switchToChat = useCallback((chatId: string) => {
    if (!chatId || !currentUser) {
      console.log("❌ ChatContext: Cannot switch chat - missing chatId or user:", { chatId, hasUser: !!currentUser });
      return;
    }

    // Prevent duplicate switches
    if (chatId === currentChatId || chatId === lastSwitchRef.current) {
      console.log("🔄 ChatContext: Already on this chat or switch in progress:", chatId);
      return;
    }

    // Clear any pending switch operations
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
    }

    console.log("🔄 ChatContext: Switching from", currentChatId, "to", chatId);
    
    // Track the switch operation
    lastSwitchRef.current = chatId;
    setIsSwitching(true);

    // Optimistic update - update UI immediately
    setCurrentChatId(chatId);
    
    // Update session storage asynchronously
    switchTimeoutRef.current = setTimeout(() => {
      try {
        const sessionKey = `currentChatId_${currentUser.uid}`;
        sessionStorage.setItem(sessionKey, chatId);
        console.log("📝 ChatContext: Updated session storage with key:", sessionKey, "value:", chatId);
      } catch (error) {
        console.error("❌ Error updating session storage:", error);
      } finally {
        setIsSwitching(false);
        lastSwitchRef.current = "";
      }
    }, 50); // Small delay to batch operations
    
    console.log("✅ ChatContext: Optimistically set current chat ID to:", chatId);
  }, [currentUser, currentChatId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current);
      }
    };
  }, []);

  const value: ChatContextType = {
    currentChatId,
    setCurrentChatId,
    createNewChat,
    switchToChat,
    isLoading,
    isSwitching
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