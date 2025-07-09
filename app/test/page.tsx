"use client"

import React, { useState } from "react"
import { ShareModal } from "@/app/components/ShareModal"
import { Button } from "@/components/ui/button"

export default function TestPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleShare = (platform: string, content: any) => {
    console.log(`Shared to ${platform}:`, content)
  }

  // Sample data for testing
  const sampleImageUrl = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
  const sampleCaption = "Check out this amazing image I found!"

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center space-y-6">
          <h1 className="text-3xl font-bold">ShareModal Test Page</h1>
          <p className="text-muted-foreground">
            Click the button below to test the ShareModal component
          </p>
          
          <div className="space-y-4">
            <Button 
              onClick={handleOpenModal}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Open Share Modal
            </Button>
            
            <div className="text-sm text-muted-foreground">
              <p>This will open a modal with:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Sample image from Unsplash</li>
                <li>Sample caption text</li>
                <li>Social media sharing options</li>
                <li>Copy link and download functionality</li>
              </ul>
            </div>
          </div>
        </div>

        <ShareModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          mediaUrl={sampleImageUrl}
          mediaType="image"
          caption={sampleCaption}
          onShare={handleShare}
        />
      </div>
    </div>
  )
}
