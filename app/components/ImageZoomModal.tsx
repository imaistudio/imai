"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  ThumbsUp,
  ThumbsDown,
  Download,
  Share2,
  Paintbrush,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShareModal } from "@/contexts/ShareModalContext";

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  className?: string;
  onLike?: (imageUrl: string) => void;
  onDislike?: (imageUrl: string) => void;
  onDownload?: (imageUrl: string) => void;
  onShare?: (platform: string, content: any) => void;
  onPaint?: (imageUrl: string) => void;
  isLiked?: boolean;
  isDisliked?: boolean;
  userId?: string;
  likedImages?: Set<string>;
  dislikedImages?: Set<string>;
}

export const ImageZoomModal = ({
  src,
  alt = "",
  className,
  onLike,
  onDislike,
  onDownload,
  onShare,
  onPaint,
  isLiked = false,
  isDisliked = false,
  likedImages,
  dislikedImages,
}: ImageZoomModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { showShareModal } = useShareModal();
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const touchThreshold = 10; // pixels
  const touchTimeThreshold = 200; // milliseconds

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

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const deltaTime = Date.now() - touchStartRef.current.time;

    // Only open modal if:
    // 1. Touch movement was minimal (not scrolling)
    // 2. Touch duration was short (quick tap)
    if (
      deltaX < touchThreshold &&
      deltaY < touchThreshold &&
      deltaTime < touchTimeThreshold
    ) {
      setIsOpen(true);
    }
  };

  const handleClick = (e: React.PointerEvent) => {
    // Only handle click events from mouse (not touch events)
    if (e.pointerType !== "touch") {
      setIsOpen(true);
    }
  };

  const handleLike = () => {
    if (onLike) {
      onLike(src);
    }
  };

  const handleDislike = () => {
    if (onDislike) {
      onDislike(src);
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload(src);
    }
  };

  const handleShare = () => {
    showShareModal({
      mediaUrl: src,
      mediaType: "image",
      caption: alt,
      onShare,
    });
  };

  const handlePaint = () => {
    if (onPaint) {
      onPaint(src);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  // Determine like/dislike states
  const currentlyLiked = likedImages ? likedImages.has(src) : isLiked;
  const currentlyDisliked = dislikedImages
    ? dislikedImages.has(src)
    : isDisliked;

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={cn(
          "cursor-pointer hover:opacity-90 transition-opacity",
          className,
        )}
        onPointerDown={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        loading="lazy"
      />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
          onClick={handleClose}
        >
          {/* Header with close button and action icons */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            {/* Close button - top left */}
            <button
              className="p-2 text-white hover:text-gray-300 hover:bg-white/20 rounded-full transition-colors"
              onClick={handleClose}
            >
              <X size={20} />
            </button>

            {/* Action icons - top right */}
            <div className="flex items-center gap-0">
              {onLike && (
                <button
                  onClick={handleLike}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title={currentlyLiked ? "Unlike" : "Like"}
                >
                  <ThumbsUp
                    size={20}
                    className={`${
                      currentlyLiked ? "text-green-400 " : "text-white"
                    }`}
                  />
                </button>
              )}

              {onDislike && (
                <button
                  onClick={handleDislike}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title={currentlyDisliked ? "Remove dislike" : "Dislike"}
                >
                  <ThumbsDown
                    size={20}
                    className={`${
                      currentlyDisliked ? "text-red-400 " : "text-white"
                    }`}
                  />
                </button>
              )}

              {/* <button
                onClick={handlePaint}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                title="Paint/Edit"
              >
                <Paintbrush size={20} className="text-white" />
              </button> */}

              {onDownload && (
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Download"
                >
                  <Download size={20} className="text-white" />
                </button>
              )}

              <button
                onClick={handleShare}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                title="Share"
              >
                <Share2 size={20} className="text-white" />
              </button>
            </div>
          </div>

          {/* Left close area */}
          <div
            className="absolute left-0 top-0 w-20 h-full cursor-pointer"
            onClick={handleClose}
          />

          {/* Right close area */}
          <div
            className="absolute right-0 top-0 w-20 h-full cursor-pointer"
            onClick={handleClose}
          />

          {/* Image container */}
          <div className="flex-1 flex items-center justify-center p-4 pt-20">
            <img
              src={src}
              alt={alt}
              className="max-h-[60vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};
