"use client";

import { useState, useEffect } from "react";
import { X, ThumbsUp, ThumbsDown, Download, Share2, Paintbrush } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShareModal } from "@/contexts/ShareModalContext";
import UnifiedPromptContainer from "./unified-prompt-container";

interface VideoZoomModalProps {
  src: string;
  className?: string;
  onLike?: (videoUrl: string) => void;
  onDislike?: (videoUrl: string) => void;
  onDownload?: (videoUrl: string) => void;
  onShare?: (platform: string, content: any) => void;
  onPaint?: (videoUrl: string) => void;
  isLiked?: boolean;
  isDisliked?: boolean;
  userId?: string;
  likedImages?: Set<string>;
  dislikedImages?: Set<string>;
}

export const VideoZoomModal = ({
  src,
  className,
  onLike,
  onDislike,
  onDownload,
  onShare,
  onPaint,
  isLiked = false,
  isDisliked = false,
  userId,
  likedImages,
  dislikedImages,
}: VideoZoomModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { showShareModal } = useShareModal();

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
      mediaType: "video",
      caption: "",
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
  const currentlyDisliked = dislikedImages ? dislikedImages.has(src) : isDisliked;

  return (
    <>
      <video
        src={src}
        className={cn("cursor-pointer hover:opacity-90 transition-opacity", className)}
        onClick={() => setIsOpen(true)}
        autoPlay
        loop
        muted
        controls={false}
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
            <div className="flex items-center gap-1">
              {onLike && (
                <button
                  onClick={handleLike}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title={currentlyLiked ? "Unlike" : "Like"}
                >
                  <ThumbsUp
                    size={20}
                    className={`${
                      currentlyLiked
                        ? "text-green-400 fill-green-400"
                        : "text-white"
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
                      currentlyDisliked
                        ? "text-red-400 fill-red-400"
                        : "text-white"
                    }`}
                  />
                </button>
              )}

              <button
                onClick={handlePaint}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                title="Paint/Edit"
              >
                <Paintbrush size={20} className="text-white" />
              </button>

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

          {/* Video container */}
          <div className="flex-1 flex items-center justify-center p-4 pt-20">
            <video
              src={src}
              className="max-h-[60vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
              autoPlay
              loop
              muted
              controls={false}
            />
          </div>
        </div>
      )}
    </>
  );
};
