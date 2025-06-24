"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { collection, addDoc, Timestamp, doc, setDoc, getDoc, query, orderBy, limit, getDocs, deleteDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid';

interface ChatContextType {
  currentChatId: string;
  setCurrentChatId: (chatId: string) => void;
  createNewChat: () => Promise<void>;
  createNewChatIfNeeded: () => Promise<void>;
  switchToChat: (chatId: string) => void;
  cleanupEmptyChats: () => Promise<void>;
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

  // Function to check if a chat has any messages
  const checkChatHasMessages = useCallback(async (chatId: string): Promise<boolean> => {
    if (!currentUser || !chatId) return false;
    
    try {
      const chatRef = doc(firestore, `chats/${currentUser.uid}/prompts/${chatId}`);
      const chatDoc = await getDoc(chatRef);
      
      if (chatDoc.exists()) {
        const chatData = chatDoc.data();
        const messages = chatData.messages || [];
        return messages.length > 0;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking chat messages:', error);
      return false;
    }
  }, [currentUser]);

  // Function to clean up duplicate empty chats and keep only the most recent one
  const cleanupDuplicateEmptyChats = useCallback(async (): Promise<string | null> => {
    if (!currentUser) return null;
    
    try {
      // Get all chats ordered by most recent
      const sidebarRef = collection(firestore, `users/${currentUser.uid}/sidebar`);
      const q = query(sidebarRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      
      const emptyChats: Array<{id: string, chatId: string, createdAt: any}> = [];
      
      // Check each chat to see if it's empty
      for (const doc of snapshot.docs) {
        const chatData = doc.data();
        const chatId = chatData.chatId;
        
        if (chatId) {
          const hasMessages = await checkChatHasMessages(chatId);
          if (!hasMessages) {
            emptyChats.push({
              id: doc.id,
              chatId: chatId,
              createdAt: chatData.createdAt
            });
          }
        }
      }
      
      if (emptyChats.length <= 1) {
        // 0 or 1 empty chat is fine
        return emptyChats.length === 1 ? emptyChats[0].chatId : null;
      }
      
      // Multiple empty chats found - keep the most recent and delete the rest
      console.log(`Found ${emptyChats.length} empty chats, cleaning up duplicates`);
      
      // Sort by creation time (most recent first)
      emptyChats.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      
      const mostRecentEmptyChat = emptyChats[0];
      const chatsToDelete = emptyChats.slice(1);
      
      // Delete duplicate empty chats from sidebar
      const deletePromises = chatsToDelete.map(async (chat) => {
        try {
          const sidebarDocRef = doc(firestore, `users/${currentUser.uid}/sidebar/${chat.chatId}`);
          await deleteDoc(sidebarDocRef);
          console.log(`🗑️ Deleted empty chat from sidebar: ${chat.chatId}`);
          
          // Also delete the actual chat document if it exists
          const chatDocRef = doc(firestore, `chats/${currentUser.uid}/prompts/${chat.chatId}`);
          const chatDoc = await getDoc(chatDocRef);
          if (chatDoc.exists()) {
            await deleteDoc(chatDocRef);
            console.log(`🗑️ Deleted empty chat document: ${chat.chatId}`);
          }
        } catch (error) {
          console.error(`❌ Error deleting empty chat ${chat.chatId}:`, error);
        }
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ Cleaned up ${chatsToDelete.length} duplicate empty chats, kept: ${mostRecentEmptyChat.chatId}`);
      
      return mostRecentEmptyChat.chatId;
    } catch (error) {
      console.error('Error cleaning up duplicate empty chats:', error);
      return null;
    }
  }, [currentUser, checkChatHasMessages]);

  // Function to find the most recent empty chat
  const findMostRecentEmptyChat = useCallback(async (): Promise<string | null> => {
    if (!currentUser) return null;
    
    try {
      // Get all chats ordered by most recent
      const sidebarRef = collection(firestore, `users/${currentUser.uid}/sidebar`);
      const q = query(sidebarRef, orderBy("createdAt", "desc"), limit(10));
      const snapshot = await getDocs(q);
      
      // Check each chat to see if it's empty
      for (const doc of snapshot.docs) {
        const chatData = doc.data();
        const chatId = chatData.chatId;
        
        if (chatId) {
          const hasMessages = await checkChatHasMessages(chatId);
          if (!hasMessages) {
            console.log('Found existing empty chat:', chatId);
            return chatId;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding empty chat:', error);
      return null;
    }
  }, [currentUser, checkChatHasMessages]);

  // Initialize chat when user is loaded
  useEffect(() => {
    const initializeChat = async () => {
      if (!currentUser || isLoading) return;

      try {
        setIsLoading(true);
        
        // Proactively clean up any duplicate empty chats when user logs in
        console.log('🧹 Proactively cleaning up duplicate empty chats for user:', currentUser.uid);
        await cleanupDuplicateEmptyChats();
        
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
  }, [currentUser, loading, cleanupDuplicateEmptyChats]);

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

  // Function to create a new chat only if needed (no existing empty chat)
  const createNewChatIfNeeded = async () => {
    try {
      setIsLoading(true);
      
      // First, check if current chat is empty
      if (currentChatId) {
        const hasMessages = await checkChatHasMessages(currentChatId);
        if (!hasMessages) {
          console.log('Current chat is empty, no need to create new one:', currentChatId);
          return;
        }
      }
      
      // Clean up any duplicate empty chats and get the most recent one
      const cleanedEmptyChat = await cleanupDuplicateEmptyChats();
      if (cleanedEmptyChat) {
        // Switch to the cleaned empty chat instead of creating new one
        const sessionKey = `currentChatId_${currentUser?.uid}`;
        sessionStorage.setItem(sessionKey, cleanedEmptyChat);
        setCurrentChatId(cleanedEmptyChat);
        console.log('✅ Switched to cleaned empty chat:', cleanedEmptyChat);
        return;
      }
      
      // No empty chat found, create a new one
      await createNewChatInternal();
    } catch (error) {
      console.error("❌ Error creating new chat if needed:", error);
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

  const cleanupEmptyChats = async () => {
    try {
      await cleanupDuplicateEmptyChats();
    } catch (error) {
      console.error("❌ Error cleaning up empty chats:", error);
    }
  };

  const value: ChatContextType = {
    currentChatId,
    setCurrentChatId,
    createNewChat,
    createNewChatIfNeeded,
    switchToChat,
    cleanupEmptyChats,
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