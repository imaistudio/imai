"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  Menu,
  Home,
  Compass,
  CreditCard,
  HelpCircle,
  FileText,
  X,
} from "lucide-react";
import { IMAIIcon } from "./imai";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

interface MobileNavProps {
  onNewChatClick?: () => Promise<void>;
}

export default function MobileNavRest({ onNewChatClick }: MobileNavProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  // Track authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });

    return () => unsubscribe();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleLoginClick = () => {
    router.push("/login");
  };

  return (
    <>
      <nav className="md:hidden flex items-center justify-between px-4 py-2 bg-white dark:bg-black sticky top-0 z-50">
        <button onClick={() => setIsOpen(true)} className="p-2">
          <Menu size={24} />
        </button>

        {isAuthenticated ? (
          <div className="text-lg font-semibold pl-2">
            <IMAIIcon size={32} />
          </div>
        ) : (
          <button
            onClick={handleLoginClick}
            className="px-4 py-2 text-xs font-medium text-white bg-black rounded-full dark:text-black dark:bg-white"
          >
            login
          </button>
        )}
      </nav>

      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/30" />}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed bg-white dark:bg-black top-0 left-0 z-50 h-full w-3/4 py-2 transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Navigation Links */}
        <div className="flex flex-col space-y-2 p-4">
          <a
            href="/"
            className="flex items-center px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Home size={18} className="mr-3" />
            IMAI
          </a>
          <a
            href="/explore"
            className="flex items-center px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Compass size={18} className="mr-3" />
            Explore
          </a>
          <a
            href="/pricing"
            className="flex items-center px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <CreditCard size={18} className="mr-3" />
            Pricing
          </a>

          {/* Separator */}
          <div className="h-px bg-gray-200 dark:bg-gray-800 my-2"></div>

          <a
            href="/contact"
            className="flex items-center px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <HelpCircle size={18} className="mr-3" />
            Help
          </a>
          <a
            href="/terms"
            className="flex items-center px-4 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <FileText size={18} className="mr-3" />
            Terms
          </a>
        </div>
      </div>
    </>
  );
}
