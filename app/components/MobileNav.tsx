'use client';

import { useState, useRef, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { IMAIIcon } from './imai';
import { AppSidebar } from './app-sidebar';

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <nav className="md:hidden flex items-center justify-between px-4 py-2">
        <button onClick={() => setIsOpen(true)} className="p-2">
          <Menu size={24} />
        </button>
        <div className="text-lg font-semibold pl-2">
            <IMAIIcon size={32} />
        </div>
      </nav>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30" />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white p-4 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        
      </div>
    </>
  );
}