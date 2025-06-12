"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import UnifiedPromptContainer from "./components/unified-prompt-container";
import ChatWindow from "./components/chat/chatwindow";
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { v4 as uuidv4 } from "uuid";

const MODAL_SHOWN_KEY = "modalDismissedOnce";
const USER_CHAT_ID_KEY = "userChatId";

export default function Home() {
  const { user: currentUser, loading } = useAuth();
  const { openModal, closeModal } = useGlobalModal();
  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    // Check localStorage only on client
    if (typeof window !== "undefined") {
      return localStorage.getItem(USER_CHAT_ID_KEY) || "";
    }
    return "";
  });

  const [modalShown, setModalShown] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MODAL_SHOWN_KEY) === "true";
    }
    return false;
  });

  // Initialize or fetch user's chat ID from Firestore
  useEffect(() => {
    const initializeUserChat = async () => {
      if (!currentUser) return;

      try {
        // Check if user has an active chat in Firestore
        const userChatRef = doc(firestore, `users/${currentUser.uid}/activeChat`, 'current');
        const userChatDoc = await getDoc(userChatRef);

        if (userChatDoc.exists()) {
          // User has an existing chat, use that
          const { chatId } = userChatDoc.data();
          setCurrentChatId(chatId);
          localStorage.setItem(USER_CHAT_ID_KEY, chatId);
        } else {
          // Create new chat ID for user
          const newChatId = `${currentUser.uid}_${uuidv4()}`;
          await setDoc(userChatRef, { chatId: newChatId });
          setCurrentChatId(newChatId);
          localStorage.setItem(USER_CHAT_ID_KEY, newChatId);
        }
      } catch (error) {
        console.error("Error initializing user chat:", error);
      }
    };

    if (!loading && currentUser) {
      initializeUserChat();
    }
  }, [currentUser, loading]);

  // Clear chat ID when user logs out
  useEffect(() => {
    if (!loading && !currentUser) {
      localStorage.removeItem(USER_CHAT_ID_KEY);
      setCurrentChatId("");
    }
  }, [loading, currentUser]);

  useEffect(() => {
    if (!loading && !currentUser && !modalShown) {
      openModal();
      localStorage.setItem(MODAL_SHOWN_KEY, "true");
      setModalShown(true);
    }

    if (!loading && currentUser && modalShown) {
      closeModal();
    }
  }, [loading, currentUser, modalShown, openModal, closeModal]);

  const handleFormSubmission = async (data: any) => {
    console.log('Form submission started with data:', data);
    
    if (!currentUser) {
      console.log('No current user found, opening modal');
      openModal();
      return;
    }

    try {
      // Use existing chat ID or create new one if none exists
      const chatId = currentChatId || `${currentUser.uid}_${uuidv4()}`;
      console.log('Using chat ID:', chatId);
      
      if (!currentChatId) {
        setCurrentChatId(chatId);
        // Store the new chat ID in Firestore
        const userChatRef = doc(firestore, `users/${currentUser.uid}/activeChat`, 'current');
        await setDoc(userChatRef, { chatId });
      }

      // Store user's message in Firestore
      const chatRef = doc(firestore, `chats/${currentUser.uid}/prompts/${chatId}`);
      
      // Create the user message object
      const userMessage = {
        sender: "user",
        type: data.images?.length > 0 ? "images" : "prompt",
        text: data.prompt || "",
        images: data.images || [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        userId: currentUser.uid,
        chatId: chatId
      };

      console.log('Storing user message in Firestore:', userMessage);

      // Get existing messages first
      const chatDoc = await getDoc(chatRef);
      const existingMessages = chatDoc.exists() ? chatDoc.data().messages || [] : [];

      // Store the user message by appending to existing messages
      await setDoc(chatRef, {
        messages: [...existingMessages, userMessage]
      }, { merge: true });
      console.log('Successfully stored user message in Firestore');

      // Call the design API
      const formData = new FormData();
      formData.append("userid", currentUser.uid);
      formData.append("prompt", data.prompt || "");
      if (data.images?.length > 0) {
        data.images.forEach((image: string) => {
          formData.append("images", image);
        });
      }

      console.log('Calling design API with formData:', {
        userid: currentUser.uid,
        prompt: data.prompt,
        hasImages: data.images?.length > 0
      });

      const response = await fetch("/api/design", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      console.log('Received API response:', result);

      if (result.status === "success") {
        // Store the agent's response
        const agentMessage = {
          sender: "agent",
          type: result.firebaseOutputUrl ? "images" : "prompt",
          text: result.generated_prompt || "",
          images: result.firebaseOutputUrl ? [result.firebaseOutputUrl] : [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: currentUser.uid,
          chatId: chatId
        };

        console.log('Storing agent message in Firestore:', agentMessage);

        // Get the latest messages including the user message we just added
        const updatedChatDoc = await getDoc(chatRef);
        const updatedMessages = updatedChatDoc.exists() ? updatedChatDoc.data().messages || [] : [];

        // Update Firestore with both messages
        await setDoc(chatRef, {
          messages: [...updatedMessages, agentMessage]
        }, { merge: true });
        console.log('Successfully stored both messages in Firestore');
      }
    } catch (error) {
      console.error("Error in chat submission:", error);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden hide-scrollbar">
      {/* ChatWindow fills the screen */}
      <div className="absolute inset-0 overflow-y-auto hide-scrollbar">
        <ChatWindow chatId={currentChatId} />
      </div>

      {/* Sticky prompt at the bottom */}
      <div className="absolute bottom-0 left-0 w-full p-4">
        <UnifiedPromptContainer
          onSubmit={handleFormSubmission}
          placeholder="Reimagine Artwork"
          maxLength={500}
        />
      </div>
    </div>
  );
}


