"use client"

import React from "react"
import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useShareModal } from "@/contexts/ShareModalContext"

interface ShareButtonProps {
  mediaUrl: string
  mediaType: "image" | "video"
  caption?: string
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "lg"
  className?: string
  onShare?: (platform: string, content: any) => void
}

export function ShareButton({
  mediaUrl,
  mediaType,
  caption = "",
  variant = "outline",
  size = "sm",
  className = "",
  onShare,
}: ShareButtonProps) {
  const { showShareModal } = useShareModal()

  const handleShare = () => {
    showShareModal({
      mediaUrl,
      mediaType,
      caption,
      onShare,
    })
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleShare}
      className={className}
    >
      <Share2 className="w-4 h-4" />
      <span className="ml-2">Share</span>
    </Button>
  )
}

// Example usage as an icon-only button
export function ShareIconButton({
  mediaUrl,
  mediaType,
  caption = "",
  className = "",
  onShare,
}: Omit<ShareButtonProps, "variant" | "size">) {
  const { showShareModal } = useShareModal()

  const handleShare = () => {
    showShareModal({
      mediaUrl,
      mediaType,
      caption,
      onShare,
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleShare}
      className={className}
      title="Share"
    >
      <Share2 className="w-4 h-4" />
    </Button>
  )
} 