"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import { useChat } from "@/contexts/ChatContext";
import UnifiedPromptContainer from "./components/unified-prompt-container";
import ChatWindow from "./components/chat/chatwindow";
import WelcomeScreen from "./components/WelcomeScreen";
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
const MODAL_SHOWN_KEY = "modalDismissedOnce";
import MobileNav from "./components/MobileNav";

// 🔧 NEW: Interface for reply/reference functionality
interface ReferencedMessage {
  id: string;
  sender: "user" | "agent";
  text?: string;
  images?: string[];
  videos?: string[]; // 🔧 NEW: Added videos array
  timestamp: string;
  isLoading?: boolean; // 🔧 NEW: Loading state for API calls
  referencemode?: "product" | "color" | "design"; // 🔧 NEW: Reference mode for contextual replies
  recommendations?: any[]; // 🔧 NEW: Added recommendations array
}

export default function Home() {
  const { user: currentUser, loading } = useAuth();
  const { openModal, closeModal } = useGlobalModal();
  const {
    currentChatId,
    createNewChatIfNeeded,
    backgroundCleanup,
    isLoading: chatLoading,
    isSwitching,
    createNewChat,
  } = useChat();

  // Debug: Track currentChatId changes
  useEffect(() => {
    // Removed debug log
  }, [currentChatId]);

  // 🔧 NEW: Check if current chat has messages
  useEffect(() => {
    // 🔧 OPTIMIZED: Immediately reset hasMessages when chatId changes to prevent glitches
    setHasMessages(false);
    setIsCheckingMessages(true);

    const checkChatMessages = async () => {
      if (!currentChatId || !currentUser) {
        setHasMessages(false);
        setIsCheckingMessages(false);
        return;
      }

      try {
        const chatRef = doc(
          firestore,
          `chats/${currentUser.uid}/prompts/${currentChatId}`,
        );
        const chatDoc = await getDoc(chatRef);

        if (chatDoc.exists()) {
          const chatData = chatDoc.data();
          const messages = chatData.messages || [];
          setHasMessages(messages.length > 0);
        } else {
          setHasMessages(false);
        }
      } catch (error) {
        console.error("Error checking chat messages:", error);
        setHasMessages(false);
      } finally {
        setIsCheckingMessages(false);
      }
    };

    // 🔧 OPTIMIZED: Add small delay to prevent excessive API calls during rapid switching
    const timeoutId = setTimeout(checkChatMessages, 100);

    return () => clearTimeout(timeoutId);
  }, [currentChatId, currentUser]);

  // 🔧 NEW: State for reply/reference functionality
  const [referencedMessage, setReferencedMessage] =
    useState<ReferencedMessage | null>(null);

  // 🔧 NEW: State to prevent multiple submissions
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔧 OPTIMIZED: Track if we've already attempted to create a session chat
  const [sessionChatAttempted, setSessionChatAttempted] = useState(false);

  // 🔧 NEW: State to track if current chat has messages
  const [hasMessages, setHasMessages] = useState(false);
  // 🔧 NEW: State to track if we're checking for messages
  const [isCheckingMessages, setIsCheckingMessages] = useState(false);

  const [modalShown, setModalShown] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MODAL_SHOWN_KEY) === "true";
    }
    return false;
  });

  // 🔧 OPTIMIZED: Load sessionChatAttempted from sessionStorage when user is available
  useEffect(() => {
    if (currentUser && typeof window !== "undefined") {
      const key = `sessionChatAttempted_${currentUser.uid}`;
      const attempted = sessionStorage.getItem(key) === "true";
      setSessionChatAttempted(attempted);
    }
  }, [currentUser]);

  // 🔧 OPTIMIZED: Create new chat for new sessions (fixed logic)
  useEffect(() => {
    const initializeSessionChat = async () => {
      if (!currentUser || loading || chatLoading || sessionChatAttempted) {
        return;
      }

      backgroundCleanup();

      // Wait a bit more to ensure ChatContext has finished initializing from sessionStorage
      setTimeout(async () => {
        // Double-check after timeout - don't create if we now have a currentChatId
        if (currentChatId) {
          return;
        }

        try {
          // Mark as attempted and persist to sessionStorage
          setSessionChatAttempted(true);
          if (typeof window !== "undefined") {
            const key = `sessionChatAttempted_${currentUser.uid}`;
            sessionStorage.setItem(key, "true");
          }

          await createNewChatIfNeeded();
        } catch (error) {
          console.error("❌ Error creating session chat:", error);
          // Reset attempt flag on error so we can try again
          setSessionChatAttempted(false);
          if (typeof window !== "undefined") {
            const key = `sessionChatAttempted_${currentUser.uid}`;
            sessionStorage.removeItem(key);
          }
        }
      }, 100); // Small delay to let ChatContext finish initializing
    };

    initializeSessionChat();
  }, [
    currentUser,
    loading,
    currentChatId,
    chatLoading,
    sessionChatAttempted,
    createNewChatIfNeeded,
    backgroundCleanup,
  ]);

  // Reset session chat attempt flag when user changes or logs out
  useEffect(() => {
    if (!currentUser) {
      setSessionChatAttempted(false);
      // Also clear from sessionStorage
      if (typeof window !== "undefined") {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith("sessionChatAttempted_")) {
            sessionStorage.removeItem(key);
          }
        });
      }
    }
  }, [currentUser]);

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

  // 🔧 NEW: Function to handle reply to message
  const handleReplyToMessage = (message: ReferencedMessage) => {
    setReferencedMessage(message);
  };

  // 🔧 NEW: Function to clear reference
  const clearReference = () => {
    setReferencedMessage(null);
  };

  // 🔧 NEW: Function to handle example button clicks from WelcomeScreen
  const handleExampleClick = async (
    prompt: string,
    presets?: {
      preset_product_type?: string;
      preset_design_style?: string;
      preset_color_palette?: string;
    },
    defaultImages?: {
      product?: string;
      design?: string;
      color?: string;
    },
  ) => {
    if (!currentUser) {
      openModal();
      return;
    }

    // Create a formatted data object like the UnifiedPromptContainer would
    const exampleData = {
      prompt: prompt,
      product: defaultImages?.product || null,
      design: defaultImages?.design ? [defaultImages.design] : [],
      color: defaultImages?.color ? [defaultImages.color] : [],
      productplaceholder: defaultImages?.product || null,
      designplaceholder: defaultImages?.design ? [defaultImages.design] : [],
      colorplaceholder: defaultImages?.color ? [defaultImages.color] : [],
      // Add preset information to be passed to the API
      preset_product_type: presets?.preset_product_type,
      preset_design_style: presets?.preset_design_style,
      preset_color_palette: presets?.preset_color_palette,
    };

    // Call the same form submission handler
    await handleFormSubmission(exampleData);
  };

  // 🔧 NEW: Custom new chat handler that immediately resets hasMessages
  const handleNewChatClick = async () => {
    try {
      // Immediately reset hasMessages to show welcome screen
      setHasMessages(false);
      setIsCheckingMessages(false);

      // Create the new chat
      await createNewChat();

      console.log("✅ New chat created and hasMessages reset");
    } catch (error) {
      console.error("❌ Error creating new chat:", error);
      // Reset hasMessages on error too
      setHasMessages(false);
      setIsCheckingMessages(false);
    }
  };

  // 🔧 NEW: Function to handle title rename callback
  const handleTitleRenamed = useCallback(
    async (chatId: string, newTitle: string, category: string) => {
      console.log("🎉 SUCCESS! Title rename callback fired:");
      console.log("  - Chat ID:", chatId);
      console.log("  - New Title:", newTitle);
      console.log("  - Category:", category);

      if (!currentUser) {
        console.error("❌ No current user for title update");
        return;
      }

      try {
        // Update the sidebar document with the new title
        const sidebarDocRef = doc(
          firestore,
          `users/${currentUser.uid}/sidebar/${chatId}`,
        );

        await setDoc(
          sidebarDocRef,
          {
            chatSummary: newTitle,
            category: category,
            titleRenamed: true,
            renamedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );

        console.log(
          "✅ Sidebar updated successfully with new title:",
          newTitle,
        );
      } catch (error) {
        console.error("❌ Failed to update sidebar with new title:", error);
      }
    },
    [currentUser],
  );

  const handleFormSubmission = async (data: any) => {
    if (!currentUser) {
      openModal();
      return;
    }

    if (!currentChatId) {
      return;
    }

    // 🔧 NEW: Set loading state to prevent multiple submissions
    setIsSubmitting(true);

    try {
      // Store user's message in Firestore
      const chatRef = doc(
        firestore,
        `chats/${currentUser.uid}/prompts/${currentChatId}`,
      );

      // Collect all images from the unified container data - USE PLACEHOLDER DATA FOR CHAT DISPLAY
      const allImages: string[] = [];

      // Helper function to safely add only string URLs to the array
      const addImageIfValid = (item: any) => {
        if (typeof item === "string" && item.trim().length > 0) {
          // Only add if it's a valid URL, base64, or preset name
          if (
            item.startsWith("http") ||
            item.startsWith("data:image/") ||
            item.startsWith("/") ||
            (!item.includes("/") && !item.includes("\\") && item.length < 100)
          ) {
            allImages.push(item);
          }
        }
      };

      // Add product placeholder image if exists (only valid strings)
      if (data.productplaceholder) {
        addImageIfValid(data.productplaceholder);
      }

      // Add design placeholder images if they exist (only valid strings)
      if (data.designplaceholder && Array.isArray(data.designplaceholder)) {
        data.designplaceholder.forEach(addImageIfValid);
      }

      // Add color placeholder images if they exist (only valid strings)
      if (data.colorplaceholder && Array.isArray(data.colorplaceholder)) {
        data.colorplaceholder.forEach(addImageIfValid);
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
        chatId: currentChatId,
        isReferenced: !!referencedMessage, // 🔧 NEW: Set to true if user is replying to a message
      };

      // Get existing messages first
      const chatDoc = await getDoc(chatRef);
      const existingMessages = chatDoc.exists()
        ? chatDoc.data().messages || []
        : [];

      // Store the user message by appending to existing messages
      try {
        // Create a completely safe message for Firestore
        const safeUserMessage = {
          sender: "user",
          type: allImages.length > 0 ? "images" : "prompt",
          text: String(data.prompt || ""),
          images: allImages.filter(
            (img) => typeof img === "string" && img.length > 0,
          ),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: String(currentUser.uid),
          chatId: String(currentChatId),
          isReferenced: !!referencedMessage, // 🔧 NEW: Set to true if user is replying to a message
        };

        await setDoc(
          chatRef,
          {
            messages: [...existingMessages, safeUserMessage],
          },
          { merge: true },
        );

        // 🔧 NEW: Update hasMessages state to switch from welcome screen to chat view
        setHasMessages(true);

        // Update chat summary in sidebar if this is the first message
        if (existingMessages.length === 0 && data.prompt) {
          await updateChatSummary(currentUser.uid, currentChatId, data.prompt);
        }
      } catch (firestoreError: any) {
        console.error(
          "❌ Firestore error storing user message:",
          firestoreError,
        );
        console.error("Full error details:", {
          name: firestoreError.name,
          message: firestoreError.message,
          code: firestoreError.code,
          stack: firestoreError.stack,
        });

        // Final fallback - store only essential data
        try {
          const minimalMessage = {
            sender: "user",
            text: String(data.prompt || ""),
            timestamp: Timestamp.now(),
            userId: String(currentUser.uid),
            isReferenced: !!referencedMessage, // 🔧 NEW: Include reference status in fallback
          };

          await setDoc(
            chatRef,
            {
              messages: [...existingMessages, minimalMessage],
            },
            { merge: true },
          );
        } catch (finalError) {
          console.error("❌ Even minimal storage failed:", finalError);
        }
      }

      // 🔧 NEW: Add loading message to show spinner
      const loadingMessage = {
        sender: "agent",
        type: "prompt",
        text: "",
        images: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        userId: currentUser.uid,
        chatId: currentChatId,
        isLoading: true, // 🔧 NEW: This will trigger the spinner
      };

      // Get existing messages and add the loading message
      const chatDocForLoading = await getDoc(chatRef);
      const existingMessagesForLoading = chatDocForLoading.exists()
        ? chatDocForLoading.data().messages || []
        : [];

      // Add loading message to Firestore to show spinner immediately
      await setDoc(
        chatRef,
        {
          messages: [...existingMessagesForLoading, loadingMessage],
        },
        { merge: true },
      );

      // Call the intent route API
      const formData = new FormData();
      formData.append("userid", currentUser.uid);
      formData.append("chatId", currentChatId); // 🔧 NEW: Add chatId for title renaming
      formData.append("message", data.prompt || "");

      // 🔧 FIX: Add conversation history for context awareness
      try {
        const chatDoc = await getDoc(chatRef);
        if (chatDoc.exists()) {
          const existingMessages = chatDoc.data().messages || [];
          // Convert to the format expected by intentroute
          const conversationHistory = existingMessages.map((msg: any) => ({
            role: msg.sender === "user" ? "user" : "assistant",
            content: msg.text || "",
            timestamp:
              msg.createdAt?.toDate?.()?.toISOString() ||
              new Date().toISOString(),
            images: msg.images || [], // 🔧 FIX: Include images field for context extraction
          }));
          formData.append(
            "conversation_history",
            JSON.stringify(conversationHistory),
          );
        }
      } catch (error) {
        console.warn("Failed to load conversation history:", error);
      }

      // 🔧 NEW: Add explicit reference if user selected one
      if (referencedMessage) {
        const reference = {
          id: referencedMessage.id,
          sender: referencedMessage.sender,
          text: referencedMessage.text || "",
          images: referencedMessage.images || [],
          videos: referencedMessage.videos || [], // 🔧 NEW: Include videos in reference
          timestamp: referencedMessage.timestamp,
          referencemode: referencedMessage.referencemode || "product", // 🔧 NEW: Include reference mode
        };
        formData.append("explicit_reference", JSON.stringify(reference));

        // 🔧 CRITICAL FIX: Add referencemode as separate FormData field for API detection
        if (referencedMessage.referencemode) {
          formData.append("referencemode", referencedMessage.referencemode);
        }
      }

      // 🔧 NEW: Add referencemode from submission data if present (fallback)
      if (data.referencemode) {
        formData.append("referencemode", data.referencemode);
      }

      // Clear the reference after sending (moved outside)
      if (referencedMessage) {
        clearReference();
      }

      // Helper function to determine if a string is a Firebase URL or local path
      const isFirebaseUrl = (path: string): boolean => {
        return (
          path.includes("firebasestorage.googleapis.com") ||
          path.startsWith("http")
        );
      };

      // Helper function to determine if a string is a base64 data URL
      const isBase64 = (path: string): boolean => {
        return path.startsWith("data:image/");
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
            const existingPresets = formData.get(
              "preset_design_style",
            ) as string;
            const newPreset = existingPresets
              ? `${existingPresets}, ${designItem}`
              : designItem;
            formData.set("preset_design_style", newPreset);
          }
        });
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
            const existingPresets = formData.get(
              "preset_color_palette",
            ) as string;
            const newPreset = existingPresets
              ? `${existingPresets}, ${colorItem}`
              : colorItem;
            formData.set("preset_color_palette", newPreset);
          }
        });
      }

      let response, result;

      try {
        response = await fetch("/api/intentroute", {
          method: "POST",
          body: formData,
        });

        result = await response.json();
      } catch (apiError) {
        console.error("❌ API call failed:", apiError);

        // 🔧 NEW: Remove loading message on API error
        const chatDocForError = await getDoc(chatRef);
        const messagesForError = chatDocForError.exists()
          ? chatDocForError.data().messages || []
          : [];
        const messagesWithoutLoadingError = messagesForError.filter(
          (msg: any) => !msg.isLoading,
        );

        // Add error message
        const errorMessage = {
          sender: "agent",
          type: "prompt",
          text: "Sorry, I encountered an error while processing your request. Please try again.",
          images: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: currentUser.uid,
          chatId: currentChatId,
          isLoading: false,
        };

        await setDoc(
          chatRef,
          {
            messages: [...messagesWithoutLoadingError, errorMessage],
          },
          { merge: true },
        );

        // 🔧 NEW: Reset loading state on error
        setIsSubmitting(false);
        return; // Exit early on API error
      }

      if (result.status === "success") {
        // Extract the actual API result from the intent route response
        const apiResult = result.result;

        // Create agent message based on the API result
        let agentMessage = {
          sender: "agent",
          type: "prompt", // Default to prompt
          text: result.message || "",
          images: [] as string[],
          videos: [] as string[], // 🔧 NEW: Added videos array
          recommendations: result.recommendations || [], // 🔧 NEW: Added recommendations array
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          userId: currentUser.uid,
          chatId: currentChatId,
        };

        // Check for image and video outputs in the API result
        if (apiResult) {
          console.log(
            "API Result structure:",
            JSON.stringify(apiResult, null, 2),
          );

          // Extract image URL
          const imageUrl =
            apiResult.firebaseOutputUrl ||
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

          // 🔧 NEW: Extract video URL
          const videoUrl =
            apiResult.videoUrl ||
            apiResult.video_url ||
            apiResult.firebaseVideoUrl ||
            apiResult.output_video ||
            apiResult.video ||
            // Handle nested result structure for videos
            (apiResult.result && apiResult.result.videoUrl) ||
            (apiResult.result && apiResult.result.video_url) ||
            (apiResult.result && apiResult.result.firebaseVideoUrl);

          console.log("Extracted image URL:", imageUrl);
          console.log("Extracted video URL:", videoUrl);

          if (imageUrl) {
            agentMessage.type = "images";
            agentMessage.images = [imageUrl];
            console.log("✅ Agent message will include image:", imageUrl);
          } else if (videoUrl) {
            // 🔧 NEW: Set type to videos if video URL is found
            agentMessage.type = "videos";
            agentMessage.videos = [videoUrl];
            console.log("✅ Agent message will include video:", videoUrl);
          } else {
            console.log("❌ No image or video URL found in API result");
          }

          // If there's a generated prompt or description, include it
          if (apiResult.generated_prompt && !agentMessage.text) {
            agentMessage.text = apiResult.generated_prompt;
          }
        } else {
          console.log("❌ No API result found");
        }

        console.log("Storing agent message in Firestore:", agentMessage);

        // Get the latest messages including the user message and loading message
        const updatedChatDoc = await getDoc(chatRef);
        const updatedMessages = updatedChatDoc.exists()
          ? updatedChatDoc.data().messages || []
          : [];

        // 🔧 NEW: Remove the loading message and replace with actual response
        const messagesWithoutLoading = updatedMessages.filter(
          (msg: any) => !msg.isLoading,
        );

        // Update Firestore with the agent response
        try {
          // Create a completely safe agent message for Firestore
          const safeAgentMessage = {
            sender: "agent",
            type:
              agentMessage.videos.length > 0
                ? "videos"
                : agentMessage.images.length > 0
                  ? "images"
                  : "prompt",
            text: String(result.message || ""),
            images: agentMessage.images.filter(
              (img) => typeof img === "string" && img.length > 0,
            ),
            videos: agentMessage.videos.filter(
              (video) => typeof video === "string" && video.length > 0,
            ), // 🔧 NEW: Added videos array
            recommendations: result.recommendations || [], // 🔧 NEW: Added recommendations array
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            userId: String(currentUser.uid),
            chatId: String(currentChatId),
            isLoading: false, // 🔧 NEW: Explicitly set loading to false
          };

          console.log("Safe agent message for Firestore:", safeAgentMessage);
          console.log("🔍 DEBUGGING - Agent message details:");
          console.log("  - Type:", safeAgentMessage.type);
          console.log("  - Text:", safeAgentMessage.text);
          console.log("  - Images array:", safeAgentMessage.images);
          console.log("  - Images count:", safeAgentMessage.images.length);
          console.log("  - Videos array:", safeAgentMessage.videos);
          console.log("  - Videos count:", safeAgentMessage.videos.length);

          await setDoc(
            chatRef,
            {
              messages: [...messagesWithoutLoading, safeAgentMessage],
            },
            { merge: true },
          );
          console.log("Successfully stored agent message in Firestore");
        } catch (firestoreError: any) {
          console.error(
            "❌ Firestore error storing agent message:",
            firestoreError,
          );
          console.error("Full error details:", {
            name: firestoreError.name,
            message: firestoreError.message,
            code: firestoreError.code,
            stack: firestoreError.stack,
          });

          // Final fallback - store only essential data
          try {
            const minimalAgentMessage = {
              sender: "agent",
              text: String(result.message || ""),
              videos: agentMessage.videos.filter(
                (video) => typeof video === "string" && video.length > 0,
              ), // 🔧 NEW: Include videos in fallback
              timestamp: Timestamp.now(),
              userId: String(currentUser.uid),
              isLoading: false, // 🔧 NEW: Ensure loading is false in fallback too
            };

            await setDoc(
              chatRef,
              {
                messages: [...messagesWithoutLoading, minimalAgentMessage],
              },
              { merge: true },
            );
            console.log("✅ Stored minimal agent message in Firestore");
          } catch (finalError) {
            console.error("❌ Even minimal agent storage failed:", finalError);
          }
        }
      }
    } catch (error) {
      console.error("Error in chat submission:", error);
    } finally {
      // 🔧 NEW: Always reset loading state when done
      setIsSubmitting(false);
    }
  };

  // Helper function to update chat summary in sidebar
  const updateChatSummary = async (
    userId: string,
    chatId: string,
    firstMessage: string,
  ) => {
    try {
      // Generate a summary from the first message (first 50 characters)
      const summary =
        firstMessage.length > 50
          ? firstMessage.substring(0, 50) + "..."
          : firstMessage;

      // Update the sidebar document (now using chatId as document ID)
      const sidebarDocRef = doc(firestore, `users/${userId}/sidebar/${chatId}`);

      // Only update the summary and updatedAt, preserve other fields
      await setDoc(
        sidebarDocRef,
        {
          chatSummary: summary,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      console.log("Updated chat summary to:", summary);
    } catch (error) {
      console.error("Error updating chat summary:", error);
    }
  };

  // Function to aggressively sanitize data for Firestore storage
  const sanitizeForFirestore = (obj: any, depth: number = 0): any => {
    // Prevent infinite recursion
    if (depth > 10) {
      console.warn("Max depth reached in sanitization, returning null");
      return null;
    }

    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitive types
    if (
      typeof obj === "string" ||
      typeof obj === "number" ||
      typeof obj === "boolean"
    ) {
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
      console.warn(
        "Removing File/Blob object from Firestore data:",
        obj.constructor.name,
      );
      return null;
    }

    // Handle DOM elements
    if (obj instanceof Element || obj instanceof Node) {
      console.warn(
        "Removing DOM element from Firestore data:",
        obj.constructor.name,
      );
      return null;
    }

    // Handle Functions
    if (typeof obj === "function") {
      console.warn("Removing function from Firestore data");
      return null;
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
      const sanitizedArray = obj
        .map((item) => sanitizeForFirestore(item, depth + 1))
        .filter((item) => item !== null && item !== undefined);

      // Only return strings in arrays for maximum safety
      return sanitizedArray.filter(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean" ||
          item instanceof Timestamp,
      );
    }

    // Handle Objects
    if (typeof obj === "object" && obj.constructor === Object) {
      const sanitized: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Skip keys that might cause issues
        if (key.startsWith("_") || key.includes("$") || key.includes(".")) {
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
    console.warn(
      "Removing complex object from Firestore data:",
      obj.constructor?.name || typeof obj,
    );
    return null;
  };

  return (
    <div className="mobile-layout-grid h-[100dvh] w-full">
      {/* Fixed MobileNav at the top */}
      <div className="mobile-nav-area">
        <MobileNav onNewChatClick={handleNewChatClick} />
      </div>

      {/* Main content area - switches between WelcomeScreen and ChatWindow */}
      <div className="mobile-chat-area overflow-hidden px-2">
        <div className="h-full overflow-y-auto hide-scrollbar">
          {loading || chatLoading || isSwitching || isCheckingMessages ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            </div>
          ) : !currentUser ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-gray-400">
                Please log in to start chatting
              </div>
            </div>
          ) : !hasMessages ? (
            <div className="flex items-center justify-center h-full">
              <WelcomeScreen
                onExampleClick={handleExampleClick}
                onPromptSubmit={handleFormSubmission}
              />
            </div>
          ) : (
            <ChatWindow
              chatId={currentChatId}
              onReplyToMessage={handleReplyToMessage}
              onTitleRenamed={handleTitleRenamed}
            />
          )}
        </div>
      </div>

      {/* Fixed Prompt Input at the bottom - Only show in chat mode */}
      {hasMessages && (
        <div className="mobile-input-area px-2">
          <UnifiedPromptContainer
            onSubmit={handleFormSubmission}
            placeholder="Design starts here.."
            maxLength={500}
            referencedMessage={referencedMessage}
            onClearReference={clearReference}
            isSubmitting={isSubmitting}
          />
          <small className="hidden md:block text-xs text-center mt-2">
            AI-generated content may not be perfect. Review{" "}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms & Conditions
            </a>
            .
          </small>
        </div>
      )}
    </div>
  );
}
