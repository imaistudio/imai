"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { ShareModal } from "@/app/components/ShareModal"

interface ShareModalData {
  mediaUrl: string
  mediaType: "image" | "video"
  caption?: string
  onShare?: (platform: string, content: any) => void
}

interface ShareModalContextType {
  isOpen: boolean
  showShareModal: (data: ShareModalData) => void
  hideShareModal: () => void
}

const ShareModalContext = createContext<ShareModalContextType | undefined>(undefined)

export const ShareModalProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [modalData, setModalData] = useState<ShareModalData>({
    mediaUrl: "",
    mediaType: "image",
    caption: "",
  })

  const showShareModal = (data: ShareModalData) => {
    setModalData(data)
    setIsOpen(true)
  }

  const hideShareModal = () => {
    setIsOpen(false)
    // Clear data after animation completes
    setTimeout(() => {
      setModalData({
        mediaUrl: "",
        mediaType: "image",
        caption: "",
      })
    }, 200)
  }

  return (
    <ShareModalContext.Provider
      value={{
        isOpen,
        showShareModal,
        hideShareModal,
      }}
    >
      {children}
      <ShareModal
        isOpen={isOpen}
        onClose={hideShareModal}
        mediaUrl={modalData.mediaUrl}
        mediaType={modalData.mediaType}
        caption={modalData.caption}
        onShare={modalData.onShare}
      />
    </ShareModalContext.Provider>
  )
}

export const useShareModal = () => {
  const context = useContext(ShareModalContext)
  if (!context) {
    throw new Error("useShareModal must be used within a ShareModalProvider")
  }
  return context
} 