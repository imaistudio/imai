"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import UnifiedPromptContainer from "./components/unified-prompt-container";
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
    <div className="w-full min-h-screen flex flex-col items-center justify-center">
      <UnifiedPromptContainer 
        onSubmit={handleFormSubmission}
        placeholder="Reimagine Artwork"
        maxLength={500}
      />
    </div>
  );
}


