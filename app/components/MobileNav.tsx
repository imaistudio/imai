"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Menu } from "lucide-react";
import { IMAIIcon } from "./imai";
import { SearchForm } from "./search-form";
import SidebarData from "./SidebarData";
import { NavUser } from "./nav-user";

interface MobileNavProps {
  onNewChatClick?: () => Promise<void>; // 🔧 NEW: Optional custom new chat handler
}

export default function MobileNav({ onNewChatClick }: MobileNavProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = React.useState("");

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

  return (
    <>
      <nav className="md:hidden flex items-center justify-between px-4 py-2 bg-white dark:bg-black">
        <button onClick={() => setIsOpen(true)} className="p-2">
          <Menu size={24} />
        </button>
        <div className="text-lg font-semibold pl-2">
          <IMAIIcon size={32} />
        </div>
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
        <SearchForm onSearchChange={setSearchTerm} onNewChatClick={onNewChatClick} />
        <div className="flex-1 overflow-y-auto">
          <SidebarData searchTerm={searchTerm} />
        </div>
        <div className="sticky bottom-0 z-50 bg-white dark:bg-black">
          <NavUser />
        </div>
      </div>
    </>
  );
}
