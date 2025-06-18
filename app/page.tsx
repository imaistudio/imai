"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import UnifiedPromptContainer from "./components/unified-prompt-container";
import ChatWindow from "./components/chat/chatwindow";
import { doc, setDoc, Timestamp, getDoc, collection, addDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { v4 as uuidv4 } from "uuid";

const MODAL_SHOWN_KEY = "modalDismissedOnce";

export default function Home() {
  const { user: currentUser, loading } = useAuth();
  const { openModal, closeModal } = useGlobalModal();
  const [currentChatId, setCurrentChatId] = useState<string>("");

  const [modalShown, setModalShown] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MODAL_SHOWN_KEY) === "true";
    }
    return false;
  });

  // Create a new chat every time user visits
  useEffect(() => {
    const createNewChat = async () => {
      if (!currentUser) return;

      try {
        // Always create a new chat ID
        const newChatId = `${currentUser.uid}_${uuidv4()}`;
        setCurrentChatId(newChatId);

        // Create chat metadata for sidebar
        const sidebarRef = collection(firestore, `users/${currentUser.uid}/sidebar`);
        await addDoc(sidebarRef, {
          chatId: newChatId,
          chatSummary: "New Chat", // Default summary, will be updated when first message is sent
          userId: currentUser.uid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          isPinned: false,
          pinnedAt: null
        });

        console.log("Created new chat:", newChatId);
      } catch (error) {
        console.error("Error creating new chat:", error);
      }
    };

    if (!loading && currentUser) {
      createNewChat();
    }
  }, [currentUser, loading]);

  // Clear chat ID when user logs out
  useEffect(() => {
    if (!loading && !currentUser) {
      setCurrentChatId("");
    }
  }, [loading, currentUser]);

  useEffect(() => {
    if (!loading && !currentUser && !modalShown) {
      openModal();
      localStorage.setItem(MODAL_SHOWN_KEY, "true");
      setModalShown(true);
    }

    if (!loading && currentUser && modalShown) {
      closeModal();
    }
  }, [loading, currentUser, modalShown, openModal, closeModal]);

  const handleFormSubmission = async (data: any) => {
    console.log('Form submission started with data:', data);
    
    if (!currentUser) {
      console.log('No current user found, opening modal');
      openModal();
      return;
    }

    if (!currentChatId) {
      console.log('No chat ID available');
      return;
    }

    try {
      // Store user's message in Firestore
      const chatRef = doc(firestore, `chats/${currentUser.uid}/prompts/${currentChatId}`);
      
      // Collect all images from the unified container data
      const allImages: string[] = [];
      
      // Helper function to safely add only string URLs to the array
      const addImageIfValid = (item: any) => {
        if (typeof item === 'string' && item.trim().length > 0) {
          // Only add if it's a valid URL, base64, or preset name
          if (item.startsWith('http') || item.startsWith('data:image/') || item.startsWith('/') || 
              (!item.includes('/') && !item.includes('\\') && item.length < 100)) {
            allImages.push(item);
          }
        }
      };
      
      // Add product image if exists (only valid strings)
      if (data.product) {
        addImageIfValid(data.product);
      }
      
      // Add design images if they exist (only valid strings)
      if (data.design && Array.isArray(data.design)) {
        data.design.forEach(addImageIfValid);
      }
      
      // Add color images if they exist (only valid strings)  
      if (data.color && Array.isArray(data.color)) {
        data.color.forEach(addImageIfValid);
      }
      
      // Create the user message object
      const userMessage = {
        sender: "user",
        type: allImages.length > 0 ? "images" : "prompt",
        text: data.prompt || "",
        images: allImages,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        userId: currentUser.uid,
        chatId: currentChatId
      };

      console.log('Storing user message in Firestore:', userMessage);

      // Get existing messages first
      const chatDoc = await getDoc(chatRef);
      const existingMessages = chatDoc.exists() ? chatDoc.data().messages || [] : [];

      // Store the user message by appending to existing messages
      try {
        // Create a completely safe message for Firestore
        const safeUserMessage = {
          sender: "user",
          type: allImages.length > 0 ? "images" : "prompt",
          text: String(data.prompt || ""),
          images: allImages.filter(img => typeof img === 'string' && img.length > 0),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: String(currentUser.uid),
          chatId: String(currentChatId)
        };
        
        console.log('Safe user message for Firestore:', safeUserMessage);
        
        await setDoc(chatRef, {
          messages: [...existingMessages, safeUserMessage]
        }, { merge: true });
        console.log('Successfully stored user message in Firestore');

        // Update chat summary in sidebar if this is the first message
        if (existingMessages.length === 0 && data.prompt) {
          await updateChatSummary(currentUser.uid, currentChatId, data.prompt);
        }
      } catch (firestoreError: any) {
        console.error('❌ Firestore error storing user message:', firestoreError);
        console.error('Full error details:', {
          name: firestoreError.name,
          message: firestoreError.message,
          code: firestoreError.code,
          stack: firestoreError.stack
        });
        
        // Final fallback - store only essential data
        try {
          const minimalMessage = {
            sender: "user",
            text: String(data.prompt || ""),
            timestamp: Timestamp.now(),
            userId: String(currentUser.uid)
          };
          
          await setDoc(chatRef, {
            messages: [...existingMessages, minimalMessage]
          }, { merge: true });
          console.log('✅ Stored minimal user message in Firestore');
        } catch (finalError) {
          console.error('❌ Even minimal storage failed:', finalError);
        }
      }

      // Call the intent route API
      const formData = new FormData();
      formData.append("userid", currentUser.uid);
      formData.append("message", data.prompt || "");

      // Helper function to determine if a string is a Firebase URL or local path
      const isFirebaseUrl = (path: string): boolean => {
        return path.includes('firebasestorage.googleapis.com') || path.startsWith('http');
      };

      // Helper function to determine if a string is a base64 data URL
      const isBase64 = (path: string): boolean => {
        return path.startsWith('data:image/');
      };

      // Process product image
      if (data.product) {
        if (isBase64(data.product)) {
          formData.append("product_image_base64", data.product);
        } else if (isFirebaseUrl(data.product)) {
          formData.append("product_image_url", data.product);
        } else {
          // It's a preset product type
          formData.append("preset_product_type", data.product);
        }
        console.log('Added product data:', data.product);
      }

      // Process design images
      if (data.design && Array.isArray(data.design)) {
        data.design.forEach((designItem: string, index: number) => {
          if (isBase64(designItem)) {
            formData.append(`design_image_${index}_base64`, designItem);
          } else if (isFirebaseUrl(designItem)) {
            formData.append(`design_image_${index}_url`, designItem);
          } else {
            // It's a preset design style - combine all preset designs
            const existingPresets = formData.get("preset_design_style") as string;
            const newPreset = existingPresets ? `${existingPresets}, ${designItem}` : designItem;
            formData.set("preset_design_style", newPreset);
          }
        });
        console.log('Added design data:', data.design);
      }

      // Process color images
      if (data.color && Array.isArray(data.color)) {
        data.color.forEach((colorItem: string, index: number) => {
          if (isBase64(colorItem)) {
            formData.append(`color_image_${index}_base64`, colorItem);
          } else if (isFirebaseUrl(colorItem)) {
            formData.append(`color_image_${index}_url`, colorItem);
          } else {
            // It's a preset color palette - combine all preset colors
            const existingPresets = formData.get("preset_color_palette") as string;
            const newPreset = existingPresets ? `${existingPresets}, ${colorItem}` : colorItem;
            formData.set("preset_color_palette", newPreset);
          }
        });
        console.log('Added color data:', data.color);
      }

      console.log('Calling intent route API with formData:', {
        userid: currentUser.uid,
        message: data.prompt,
        hasImages: allImages.length > 0,
        imageCount: allImages.length,
        hasProduct: !!data.product,
        hasDesign: data.design?.length > 0,
        hasColor: data.color?.length > 0
      });

      const response = await fetch("/api/intentroute", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      console.log('Received intent route API response:', result);

      if (result.status === "success") {
        // Extract the actual API result from the intent route response
        const apiResult = result.result;
        
        // Create agent message based on the API result
        let agentMessage = {
          sender: "agent",
          type: "prompt", // Default to prompt
          text: result.message || "",
          images: [] as string[],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: currentUser.uid,
          chatId: currentChatId
        };

        // Check for image outputs in the API result
        if (apiResult) {
          console.log('API Result structure:', JSON.stringify(apiResult, null, 2));
          
          const imageUrl = apiResult.firebaseOutputUrl || 
                          apiResult.data_url || 
                          apiResult.outputUrl || 
                          apiResult.output_image || 
                          apiResult.imageUrl ||
                          apiResult.url ||
                          apiResult.image_url ||
                          // Handle nested result structure (for reframe/upscale)
                          (apiResult.result && apiResult.result.imageUrl) ||
                          (apiResult.result && apiResult.result.upscaled_image_url) ||
                          // Handle other possible nested structures
                          (apiResult.result && apiResult.result.firebaseOutputUrl);
          
          console.log('Extracted image URL:', imageUrl);
          
          if (imageUrl) {
            agentMessage.type = "images";
            agentMessage.images = [imageUrl];
            console.log('✅ Agent message will include image:', imageUrl);
          } else {
            console.log('❌ No image URL found in API result');
          }
          
          // If there's a generated prompt or description, include it
          if (apiResult.generated_prompt && !agentMessage.text) {
            agentMessage.text = apiResult.generated_prompt;
          }
        } else {
          console.log('❌ No API result found');
        }

        console.log('Storing agent message in Firestore:', agentMessage);

        // Get the latest messages including the user message we just added
        const updatedChatDoc = await getDoc(chatRef);
        const updatedMessages = updatedChatDoc.exists() ? updatedChatDoc.data().messages || [] : [];

        // Update Firestore with the agent response
        try {
          // Create a completely safe agent message for Firestore
          const safeAgentMessage = {
            sender: "agent",
            type: agentMessage.images.length > 0 ? "images" : "prompt",
            text: String(result.message || ""),
            images: agentMessage.images.filter(img => typeof img === 'string' && img.length > 0),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            userId: String(currentUser.uid),
            chatId: String(currentChatId)
          };
          
          console.log('Safe agent message for Firestore:', safeAgentMessage);
          console.log('🔍 DEBUGGING - Agent message details:');
          console.log('  - Type:', safeAgentMessage.type);
          console.log('  - Text:', safeAgentMessage.text);
          console.log('  - Images array:', safeAgentMessage.images);
          console.log('  - Images count:', safeAgentMessage.images.length);
          
          await setDoc(chatRef, {
            messages: [...updatedMessages, safeAgentMessage]
          }, { merge: true });
          console.log('Successfully stored agent message in Firestore');
        } catch (firestoreError: any) {
          console.error('❌ Firestore error storing agent message:', firestoreError);
          console.error('Full error details:', {
            name: firestoreError.name,
            message: firestoreError.message,
            code: firestoreError.code,
            stack: firestoreError.stack
          });
          
          // Final fallback - store only essential data
          try {
            const minimalAgentMessage = {
              sender: "agent",
              text: String(result.message || ""),
              timestamp: Timestamp.now(),
              userId: String(currentUser.uid)
            };
            
            await setDoc(chatRef, {
              messages: [...updatedMessages, minimalAgentMessage]
            }, { merge: true });
            console.log('✅ Stored minimal agent message in Firestore');
          } catch (finalError) {
            console.error('❌ Even minimal agent storage failed:', finalError);
          }
        }
      }
    } catch (error) {
      console.error("Error in chat submission:", error);
    }
  };

  // Helper function to update chat summary in sidebar
  const updateChatSummary = async (userId: string, chatId: string, firstMessage: string) => {
    try {
      // Generate a summary from the first message (first 50 characters)
      const summary = firstMessage.length > 50 
        ? firstMessage.substring(0, 50) + "..." 
        : firstMessage;

      // Find and update the sidebar document with this chatId
      const sidebarCollection = collection(firestore, `users/${userId}/sidebar`);
      const sidebarSnapshot = await getDoc(doc(sidebarCollection, chatId));
      
      // If we can't find by document ID, we'll need to query by chatId field
      // For now, let's create a simpler approach by using chatId as document ID
      const sidebarDocRef = doc(firestore, `users/${userId}/sidebar/${chatId}`);
      
      await setDoc(sidebarDocRef, {
        chatId: chatId,
        chatSummary: summary,
        userId: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isPinned: false,
        pinnedAt: null
      }, { merge: true });

      console.log('Updated chat summary:', summary);
    } catch (error) {
      console.error('Error updating chat summary:', error);
    }
  };

  // Function to aggressively sanitize data for Firestore storage
  const sanitizeForFirestore = (obj: any, depth: number = 0): any => {
    // Prevent infinite recursion
    if (depth > 10) {
      console.warn('Max depth reached in sanitization, returning null');
      return null;
    }
    
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // Handle primitive types
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    
    // Handle Firestore Timestamps
    if (obj instanceof Timestamp) {
      return obj;
    }
    
    // Handle Date objects - convert to Timestamp
    if (obj instanceof Date) {
      return Timestamp.fromDate(obj);
    }
    
    // Handle File objects, Blob objects, and other browser objects
    if (obj instanceof File || obj instanceof Blob || obj instanceof FileList) {
      console.warn('Removing File/Blob object from Firestore data:', obj.constructor.name);
      return null;
    }
    
    // Handle DOM elements
    if (obj instanceof Element || obj instanceof Node) {
      console.warn('Removing DOM element from Firestore data:', obj.constructor.name);
      return null;
    }
    
    // Handle Functions
    if (typeof obj === 'function') {
      console.warn('Removing function from Firestore data');
      return null;
    }
    
    // Handle Arrays
    if (Array.isArray(obj)) {
      const sanitizedArray = obj
        .map(item => sanitizeForFirestore(item, depth + 1))
        .filter(item => item !== null && item !== undefined);
      
      // Only return strings in arrays for maximum safety
      return sanitizedArray.filter(item => 
        typeof item === 'string' || 
        typeof item === 'number' || 
        typeof item === 'boolean' ||
        item instanceof Timestamp
      );
    }
    
    // Handle Objects
    if (typeof obj === 'object' && obj.constructor === Object) {
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Skip keys that might cause issues
        if (key.startsWith('_') || key.includes('$') || key.includes('.')) {
          console.warn(`Skipping problematic key: ${key}`);
          continue;
        }
        
        const sanitizedValue = sanitizeForFirestore(value, depth + 1);
        if (sanitizedValue !== null && sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
      
      return sanitized;
    }
    
    // Handle any other object types (class instances, etc.)
    console.warn('Removing complex object from Firestore data:', obj.constructor?.name || typeof obj);
    return null;
  };

  return (
    <div className="relative h-screen w-full overflow-hidden hide-scrollbar">
      {/* ChatWindow fills the screen */}
      <div className="absolute inset-0 overflow-y-auto hide-scrollbar">
        <ChatWindow chatId={currentChatId} />
      </div>

      {/* Sticky prompt at the bottom */}
      <div className="absolute bottom-0 left-0 w-full pb-4 pl-4 pr-4 flex flex-col gap-2 bg-background text-center">
        <UnifiedPromptContainer
          onSubmit={handleFormSubmission}
          placeholder="Reimagine Artwork"
          maxLength={500}
        />
        <small className="text-xs">AI-generated content may not be perfect. Review <a href="/terms" className="text-primary hover:underline">Terms & Conditions</a>.</small>
      </div>
    </div>
  );
}


