"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoZoomModalProps {
  src: string;
  className?: string;
}

export const VideoZoomModal = ({ src, className }: VideoZoomModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      <video
        src={src}
        className={cn(className)}
        onClick={() => setIsOpen(true)}
        autoPlay
        loop
        muted
        controls={false}
      />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setIsOpen(false)}
        >
          <button
            className="absolute right-4 top-4 text-white hover:text-gray-300"
            onClick={() => setIsOpen(false)}
          >
            <X size={24} />
          </button>
          <video
            src={src}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
            autoPlay
            loop
            muted
            controls={false}
          />
        </div>
      )}
    </>
  );
};
