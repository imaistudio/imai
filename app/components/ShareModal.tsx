"use client"

import React, { useState } from "react"
import {
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  X,
  Check,
  Copy,
  Download,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal"

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  mediaUrl: string
  mediaType: "image" | "video"
  caption?: string
  onShare?: (platform: string, content: any) => void
}

interface SocialPlatform {
  name: string
  icon: React.ReactNode
  color: string
  shareUrl: (url: string, text: string) => string
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
]

export function ShareModal({ isOpen, onClose, mediaUrl, mediaType, caption = "", onShare }: ShareModalProps) {
  const [shareText, setShareText] = useState(caption)
  const [isSharing, setIsSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(mediaUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error("Could not copy link")
    }
  }

  const handleDownload = async () => {
    try {
      const res = await fetch(mediaUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `shared-${Date.now()}.${mediaType === "image" ? "jpg" : "mp4"}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      console.error("Download failed")
    }
  }

  const handleShare = (platform: SocialPlatform) => {
    setIsSharing(true)
    try {
      const url = platform.shareUrl(mediaUrl, shareText)
      window.open(url, "_blank", "width=600,height=500")
      onShare?.(platform.name, { url: mediaUrl, text: shareText, mediaType })
    } catch {
      console.error(`Could not share to ${platform.name}`)
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <Modal backdrop="blur" isOpen={isOpen} onClose={onClose}>
      <ModalContent className="rounded-xl">
        <ModalBody>
          {/* Media Preview */}
          <div className="relative overflow-hidden rounded-lg">
            <div className="w-full h-[300px] relative">
              {mediaType === "image" ? (
                <img
                  src={mediaUrl}
                  alt="Preview"
                  className="w-full h-full object-cover object-center rounded-md"
                />
              ) : (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover object-center rounded-md"
                  controls={false}
                  muted
                />
              )}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition" />
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium text-muted-foreground">Add a message</label>
            <textarea
              value={shareText}
              onChange={(e) => setShareText(e.target.value)}
              placeholder="Say something..."
              className="resize-none w-full p-2 border rounded-md"
              rows={3}
            />
            <div className="text-xs text-muted-foreground text-right">{shareText.length}/280</div>
          </div>

          {/* Platforms */}
          <div className="space-y-3 mt-4">
            <h3 className="text-sm font-medium text-muted-foreground">Share to</h3>
            <div className="flex flex-wrap gap-3 justify-center">
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

          {/* Direct Link */}
          <div className="space-y-2 pt-4 border-t mt-4">
            <label className="text-sm font-medium text-muted-foreground">Direct Link</label>
            <div className="flex gap-2">
              <Input readOnly value={mediaUrl} className="text-sm" />
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
