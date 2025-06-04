"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import { MorphingText } from "@/components/magicui/morphing-text";
import UnifiedPromptContainer from "./components/unified-prompt-container";
const MODAL_SHOWN_KEY = "modalDismissedOnce";

const texts = [
  "Coming",
  "Soon",
  "IMAI",
  "Creating",
  "Newness",
];

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

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <MorphingText texts={texts} />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center">
      <UnifiedPromptContainer />
    </div>
  );
}


