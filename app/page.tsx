"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import UnifiedPromptContainer from "./components/unified-prompt-container";
import ChatWindow from "./components/chat/chatwindow";
const MODAL_SHOWN_KEY = "modalDismissedOnce";
export default function Home() {
  const { user: currentUser, loading } = useAuth();
  const { openModal, closeModal } = useGlobalModal();

  const [modalShown, setModalShown] = useState<boolean>(() => {
    // Check localStorage only on client
    if (typeof window !== "undefined") {
      return localStorage.getItem(MODAL_SHOWN_KEY) === "true";
    }
    return false;
  });

  useEffect(() => {
    if (!loading && !currentUser && !modalShown) {
      openModal();
      localStorage.setItem(MODAL_SHOWN_KEY, "true");
      setModalShown(true);
    }

    // Optional: Close modal if user logs in (optional behavior)
    if (!loading && currentUser && modalShown) {
      closeModal();
      // Note: you might not want to reset localStorage here
    }
  }, [loading, currentUser, modalShown, openModal, closeModal]);


  const handleFormSubmission = (data:any) => {
    console.log('Bruhhhhhhhhh!:', data);
  };

  return (
  <div className="relative h-screen w-full overflow-hidden hide-scrollbar">
  {/* ChatWindow fills the screen */}
  <div className="absolute inset-0 overflow-y-auto hide-scrollbar">
    {/* <ChatWindow chatId="uTiXKRbCYbhWnBbkLFZoMdEMdgf2_2681d98a-a29c-4d74-8fe4-fa98e1fe3d68" /> */}
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


