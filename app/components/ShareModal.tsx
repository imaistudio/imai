"use client";

import React, { useState } from "react";
import {
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  X,
  Check,
  Copy,
  Download,
  MessageSquare,
  Camera,
  Instagram,
  Music,
  MapPin,
  Send,
  Gamepad2,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalBody } from "@heroui/modal";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  onShare?: (platform: string, content: any) => void;
}

interface SocialPlatform {
  name: string;
  icon: React.ReactNode;
  color: string;
  shareUrl: (url: string, text: string) => string;
}

const socialPlatforms: SocialPlatform[] = [
  {
    name: "Twitter",
    icon: <Twitter className="w-5 h-5" />,
    color: "bg-[#1DA1F2] hover:bg-[#1A91DA]",
    shareUrl: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    name: "Facebook",
    icon: <Facebook className="w-5 h-5" />,
    color: "bg-[#1877F2] hover:bg-[#165CD9]",
    shareUrl: (url, text) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
  },
  {
    name: "LinkedIn",
    icon: <Linkedin className="w-5 h-5" />,
    color: "bg-[#0077b5] hover:bg-[#00669e]",
    shareUrl: (url, text) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`,
  },
  {
    name: "WhatsApp",
    icon: <MessageCircle className="w-5 h-5" />,
    color: "bg-[#25D366] hover:bg-[#1EBE5E]",
    shareUrl: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    name: "Reddit",
    icon: <MessageSquare className="w-5 h-5" />,
    color: "bg-[#FF4500] hover:bg-[#E63E00]",
    shareUrl: (url, text) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
  {
    name: "Snapchat",
    icon: <Camera className="w-5 h-5" />,
    color: "bg-[#FFFC00] hover:bg-[#F0ED00] text-black",
    shareUrl: (url, text) => `https://www.snapchat.com/share?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Instagram",
    icon: <Instagram className="w-5 h-5" />,
    color: "bg-gradient-to-r from-[#405DE6] via-[#5851DB] via-[#833AB4] via-[#C13584] via-[#E1306C] to-[#FD1D1D] hover:opacity-90",
    shareUrl: (url, text) => `https://www.instagram.com/share?url=${encodeURIComponent(url)}`,
  },
  {
    name: "TikTok",
    icon: <Music className="w-5 h-5" />,
    color: "bg-[#000000] hover:bg-[#161823]",
    shareUrl: (url, text) => `https://www.tiktok.com/share?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Pinterest",
    icon: <MapPin className="w-5 h-5" />,
    color: "bg-[#BD081C] hover:bg-[#A00713]",
    shareUrl: (url, text) =>
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}`,
  },
  {
    name: "Telegram",
    icon: <Send className="w-5 h-5" />,
    color: "bg-[#0088cc] hover:bg-[#0077b3]",
    shareUrl: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    name: "Discord",
    icon: <Gamepad2 className="w-5 h-5" />,
    color: "bg-[#5865F2] hover:bg-[#4752C4]",
    shareUrl: (url, text) => `https://discord.com/channels/@me?message=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    name: "Tumblr",
    icon: <Hash className="w-5 h-5" />,
    color: "bg-[#00cf35] hover:bg-[#00b82f]",
    shareUrl: (url, text) =>
      `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
];

export function ShareModal({ isOpen, onClose, mediaUrl, mediaType, caption = "", onShare }: ShareModalProps) {
  const [shareText, setShareText] = useState(caption);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(mediaUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Could not copy link");
    }
  };

  const handleDownload = async () => {
    console.log("🔄 Starting download for:", mediaUrl);

    try {
      // Extract filename from URL
      let fileName = mediaUrl.split("/").pop() || `shared-${Date.now()}.${mediaType === "image" ? "jpg" : "mp4"}`;

      // Clean up filename - remove query parameters
      if (fileName.includes("?")) {
        fileName = fileName.split("?")[0];
      }

      // Ensure filename has an extension
      if (!fileName.includes(".")) {
        fileName += mediaType === "image" ? ".jpg" : ".mp4";
      }

      console.log("📁 Using filename:", fileName);

      // Use server-side proxy for ALL URLs (most reliable approach)
      const proxyUrl = `/api/download-image?url=${encodeURIComponent(mediaUrl)}`;

      console.log("🔗 Proxy URL:", proxyUrl);

      // Create download link and trigger immediately
      const link = document.createElement("a");
      link.href = proxyUrl;
      link.download = fileName;
      link.style.display = "none";

      console.log("🔗 Created download link with href:", link.href);
      console.log("📥 Download attribute:", link.download);

      document.body.appendChild(link);

      // Force click
      link.click();

      console.log("✅ Download link clicked");

      // Clean up after a short delay
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          console.log("🗑️ Cleaned up download link");
        } catch (e) {
          console.warn("⚠️ Could not clean up link:", e);
        }
      }, 1000);
    } catch (error) {
      console.error("❌ Download failed:", error);

      // Simple fallback: direct window.open
      console.log("🔄 Fallback: Opening in new tab");
      window.open(mediaUrl, "_blank");
    }
  };

  const handleShare = (platform: SocialPlatform) => {
    setIsSharing(true);
    try {
      const url = platform.shareUrl(mediaUrl, shareText);
      window.open(url, "_blank", "width=600,height=500");
      onShare?.(platform.name, { url: mediaUrl, text: shareText, mediaType });
    } catch {
      console.error(`Could not share to ${platform.name}`);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      hideCloseButton
      shouldBlockScroll
      backdrop="blur"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="m-4 max-w-md rounded-2xl overflow-hidden bg-white dark:bg-black"
    >
      <ModalContent>
        <>
          {/* Media Header */}
          <div className="relative w-full h-auto pb-4 overflow-hidden">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 z-10">
              <X className="w-6 h-6 text-white dark:text-black" />
            </button>
            {mediaType === "image" ? (
              <img src={mediaUrl} alt="Preview" className="w-full md:h-72 h-48 object-cover rounded-md" />
            ) : (
              <video src={mediaUrl} className="w-full md:h-72 h-48 object-cover rounded-md" controls={false} muted />
            )}
          </div>

          

          {/* Social Buttons */}
          <div className="px-6 pb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Share to</h3>
            <div className="flex flex-wrap justify-center gap-3">
              {socialPlatforms.map((platform) => (
                <button
                  key={platform.name}
                  onClick={() => handleShare(platform)}
                  disabled={isSharing}
                  className={`w-10 h-10 rounded-full ${platform.color} flex items-center justify-center text-white transition-transform hover:scale-110`}
                  title={platform.name}
                >
                  {platform.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div className="px-6 pb-4">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Add a message</label>
            <textarea
              value={shareText}
              onChange={(e) => setShareText(e.target.value)}
              placeholder="Say something..."
              className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-black text-sm resize-none"
              rows={3}
            />
            <div className="text-xs text-right text-muted-foreground mt-1">{shareText.length}/280</div>
          </div>

          {/* Link + Download */}
          <div className="px-6 pb-6 space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={mediaUrl} className="text-sm" />
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              onClick={handleDownload}
              className="w-full bg-black dark:bg-white text-white dark:text-black rounded-full py-3 mt-2"
            >
              Download
            </Button>
          </div>
        </>
      </ModalContent>
    </Modal>
  );
}