"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";

const MODAL_SHOWN_KEY = "modalDismissedOnce";

export default function GlobalModalController() {
  const { user: currentUser, loading } = useAuth();
  const { openModal, closeModal } = useGlobalModal();
  const pathname = usePathname();
  
  const [modalShown, setModalShown] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MODAL_SHOWN_KEY) === "true";
    }
    return false;
  });

  // Pages where the global modal should NOT be shown
  const excludedPaths = ['/invite', '/login'];
  const shouldShowModal = !excludedPaths.includes(pathname);

  useEffect(() => {
    // Only show modal if:
    // 1. Not loading
    // 2. No current user
    // 3. Modal hasn't been shown before
    // 4. Current page is not excluded
    if (!loading && !currentUser && !modalShown && shouldShowModal) {
      openModal();
      localStorage.setItem(MODAL_SHOWN_KEY, "true");
      setModalShown(true);
    }

    // Close modal if user is authenticated
    if (!loading && currentUser && modalShown) {
      closeModal();
    }
  }, [loading, currentUser, modalShown, shouldShowModal, openModal, closeModal]);

  // This component doesn't render anything, it just manages the modal state
  return null;
} 