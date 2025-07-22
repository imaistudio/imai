"use client";

import React, { useRef, useState, useEffect } from "react";
import { Badge, Button, cn, Form, Image, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuthState } from "react-firebase-hooks/auth";
import { storage, auth } from "@/lib/firebase";
import { useSVGTheme } from "@/hooks/use-svg-theme";

import {
  ProductType,
  ToolType, // 🔧 NEW: Import ToolType
  ProductImages,
  defaultProductImages,
  productSpecificDesigns,
  generalDesignImages,
  defaultColorImages,
  defaultToolImages, // 🔧 NEW: Import tool images
  defaultPlaceholders,
  designPlaceholders,
  colorPlaceholders,
  toolPlaceholders, // 🔧 NEW: Import tool placeholders
  productLabels,
  designLabels,
  colorLabels,
  toolLabels, // 🔧 NEW: Import tool labels
} from "@/constants/inputs";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface ImageAsset {
  type: "product" | "design" | "color" | "tool"; // 🔧 NEW: Add "tool" type
  path: string;
  productType?: string;
  designCategory?: string;
  colorIndex?: number;
  toolType?: ToolType; // 🔧 NEW: Add tool type
}

type DrawerType = "product" | "design" | "color" | "tool"; // 🔧 NEW: Add "tool" to drawer types

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
  productplaceholder: string;
  designplaceholder: string[];
  colorplaceholder: string[];
  toolcall?: string; // 🔧 NEW: Add toolcall parameter
  referencemode?: "product" | "color" | "design"; // 🔧 NEW: Reference mode
}

// 🔧 NEW: Interface for referenced message
interface ReferencedMessage {
  id: string;
  sender: "user" | "agent";
  text?: string;
  images?: string[];
  timestamp: string;
  referencemode?: "product" | "color" | "design"; // 🔧 NEW: Reference mode for contextual replies
}

interface UnifiedPromptContainerProps {
  onSubmit?: (data: SubmissionData) => void;
  placeholder?: string;
  maxLength?: number;
  referencedMessage?: ReferencedMessage | null; // 🔧 NEW: Referenced message prop
  onClearReference?: () => void; // 🔧 NEW: Clear reference callback
  isSubmitting?: boolean; // 🔧 NEW: Loading state to prevent multiple submissions
}

export default function UnifiedPromptContainer({
  onSubmit,
  placeholder = "Design Starts Here...",
  maxLength = 1000,
  referencedMessage, // 🔧 NEW: Referenced message prop
  onClearReference, // 🔧 NEW: Clear reference callback
  isSubmitting, // 🔧 NEW: Loading state to prevent multiple submissions
}: UnifiedPromptContainerProps) {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [drawerType, setDrawerType] = useState<DrawerType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [selectedProductType, setSelectedProductType] =
    useState<ProductType | null>(null);
  const [uploadingImages, setUploadingImages] = useState<Set<DrawerType>>(
    new Set(),
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLFormElement>(null); // 🔧 NEW: Ref for click outside detection
  const [user, loading, error] = useAuthState(auth);

  // Use SVG theme hook to handle product placeholder styling
  useSVGTheme();

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(
    null,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number | null>(null);

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent handling if no files are being dragged
    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }

    dragCounter.current += 1;

    if (drawerType && dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current -= 1;

    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent default to stop browser from opening the image
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current = 0;
    setIsDragging(false);

    if (!drawerType || !e.dataTransfer.files.length) return;

    const file = e.dataTransfer.files[0];
    if (!file.type.startsWith("image/")) {
      // You might want to show an error toast here
      console.error("Please drop an image file");
      return;
    }

    // Create a synthetic event object to reuse existing upload logic
    const syntheticEvent = {
      target: {
        files: [file],
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await handleUpload(drawerType, syntheticEvent);
  };

  // 🔧 NEW: Handle click outside to close drawer
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDrawerOpen(false);
        setDrawerType(null);
      }
    };

    if (drawerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [drawerOpen]);

  // Add cleanup for drag counter when drawer closes
  useEffect(() => {
    if (!drawerOpen) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, [drawerOpen]);

  // 🔧 NEW: Close tools drawer if uploaded product is removed
  useEffect(() => {
    const hasUploadedProduct = images.some(
      (img) => img.type === "product" && img.productType === "custom",
    );

    if (drawerOpen && drawerType === "tool" && !hasUploadedProduct) {
      setDrawerOpen(false);
      setDrawerType(null);
      // Also remove any selected tool
      setImages((prev) => prev.filter((img) => img.type !== "tool"));
    }
  }, [images, drawerOpen, drawerType]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionConstructor =
        window.webkitSpeechRecognition || window.SpeechRecognition;

      if (SpeechRecognitionConstructor) {
        const recog: SpeechRecognition = new SpeechRecognitionConstructor();
        recog.continuous = false;
        recog.lang = "en-US";
        recog.interimResults = false;
        recog.maxAlternatives = 1;

        recog.onresult = (event: SpeechRecognitionEvent) => {
          const speechResult = event.results[0][0].transcript;
          setPrompt((prev) => prev + (prev ? " " : "") + speechResult);
        };

        recog.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error("Speech recognition error", event.error);
        };

        recog.onend = () => {
          setIsRecording(false);
          if (animationIdRef.current) {
            cancelAnimationFrame(animationIdRef.current);
            animationIdRef.current = null;
          }
        };

        setRecognition(recog);
      }
    }
  }, []);

  const startWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let x = 0;
    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      const amplitude = 5 + Math.random() * 15;
      const frequency = 0.05;
      ctx.moveTo(0, height / 2);
      for (let i = 0; i < width; i++) {
        const y = height / 2 + Math.sin(i * frequency + x) * amplitude;
        ctx.lineTo(i, y);
      }
      ctx.strokeStyle = "#3b82f6"; // Tailwind blue-500
      ctx.lineWidth = 2;
      ctx.stroke();

      x += 0.05;
      animationIdRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const toggleVoiceInput = () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      setIsRecording(false);
    } else {
      setPrompt("");
      recognition.start();
      startWaveform();
      setIsRecording(true);
    }
  };

  useEffect(() => {
    const productImage = images.find((img) => img.type === "product");
    if (productImage?.productType && productImage.productType !== "custom") {
      setSelectedProductType(productImage.productType as ProductType);
    } else if (!productImage) {
      setSelectedProductType(null);
    }
  }, [images]);

  // Helper function to extract filename from path
  const extractFilename = (path: string): string => {
    if (path.startsWith("data:")) {
      // For uploaded files (data URLs), return a generic filename
      return "uploaded-image";
    }
    if (path.includes("firebasestorage.googleapis.com")) {
      // For Firebase Storage URLs, extract filename from the path
      const urlParts = path.split("/");
      const encodedPath = urlParts[urlParts.length - 1];
      const decodedPath = decodeURIComponent(encodedPath.split("?")[0]);
      const pathParts = decodedPath.split("/");
      return pathParts[pathParts.length - 1];
    }
    // Extract filename from path
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 🔧 NEW: Prevent submission if already submitting
    if (isSubmitting) {
      return;
    }

    // Separate images by type
    const productImage = images.find((img) => img.type === "product");
    const designImages = images.filter((img) => img.type === "design");
    const colorImages = images.filter((img) => img.type === "color");
    const toolImage = images.find((img) => img.type === "tool"); // 🔧 NEW: Get selected tool

    // Helper function to get placeholder for an image
    const getImagePlaceholder = (image: ImageAsset): string => {
      if (image.type === "product" && image.productType === "custom") {
        return image.path; // Return the Firebase URL for custom uploads
      }
      if (
        image.type === "product" &&
        image.productType &&
        image.productType !== "custom"
      ) {
        return defaultPlaceholders[image.productType as ProductType] || "";
      }
      if (image.type === "design") {
        // Check if it's a custom upload (Firebase URL) or preset
        if (image.path.includes("firebasestorage.googleapis.com")) {
          return image.path; // Return the Firebase URL for custom uploads
        }
        return image.designCategory
          ? designPlaceholders[image.designCategory] || ""
          : "";
      }
      if (image.type === "color") {
        // Check if it's a custom upload (Firebase URL) or preset
        if (image.path.includes("firebasestorage.googleapis.com")) {
          return image.path; // Return the Firebase URL for custom uploads
        }
        const label = Object.keys(colorPlaceholders).find((key) =>
          image.path.includes(key),
        );
        return label ? colorPlaceholders[label] : "";
      }
      if (image.type === "tool" && image.toolType) {
        // 🔧 NEW: Handle tool placeholders
        return toolPlaceholders[image.toolType] || "";
      }
      return "";
    };

    const submissionData: SubmissionData = {
      prompt: prompt.trim(),
      product:
        productImage?.productType === "custom"
          ? productImage.path // Return the actual Firebase URL for uploaded images
          : productImage?.path || productImage?.productType || "", // Return full path for preset images
      design: designImages.map((img) => img.path), // Return full path for all design images
      color: colorImages.map((img) => img.path), // Return full path for all color images
      productplaceholder: productImage ? getImagePlaceholder(productImage) : "",
      designplaceholder: designImages.map((img) => getImagePlaceholder(img)),
      colorplaceholder: colorImages.map((img) => getImagePlaceholder(img)),
      toolcall: toolImage?.toolType, // 🔧 NEW: Include selected tool
      referencemode: referencedMessage?.referencemode, // 🔧 NEW: Include reference mode from referenced message
    };

    if (onSubmit) onSubmit(submissionData);

    // Clear form after submission
    setPrompt("");
    setImages([]);
    setDrawerOpen(false);
    setDrawerType(null);
    setSelectedProductType(null);
  };

  // Helper function to convert iOS formats to JPG
  const convertToJpg = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const fileType = file.type.toLowerCase();
      const fileName = file.name.toLowerCase();

      // Check if it's a HEIF/HEIC file
      const isHEIF =
        fileType.includes("heif") ||
        fileType.includes("heic") ||
        fileName.endsWith(".heif") ||
        fileName.endsWith(".heic");

      // Check if it's a MOV file
      const isMOV = fileType.includes("quicktime") || fileName.endsWith(".mov");

      if (!isHEIF && !isMOV) {
        // If it's not an iOS-specific format, return the original file
        resolve(file);
        return;
      }

      if (isMOV) {
        // For MOV files, extract first frame as JPG
        const video = document.createElement("video") as HTMLVideoElement;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        video.onloadedmetadata = () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          video.currentTime = 0.1; // Seek to 0.1 seconds to get a frame
        };

        video.onseeked = () => {
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const baseName = file.name.replace(/\.[^/.]+$/, "");
                  const convertedFile = new File([blob], `${baseName}.jpg`, {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  });
                  resolve(convertedFile);
                } else {
                  reject(new Error("Failed to convert MOV to JPG"));
                }
              },
              "image/jpeg",
              0.8,
            );
          }

          // Clean up
          URL.revokeObjectURL(video.src);
          video.src = "";
          video.remove();
        };

        video.onerror = () => reject(new Error("Failed to load MOV file"));
        video.src = URL.createObjectURL(file);
        video.load();
      } else {
        // For HEIF/HEIC files, use Image element with canvas conversion
        const img = document.createElement("img");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;

          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const baseName = file.name.replace(/\.[^/.]+$/, "");
                  const convertedFile = new File([blob], `${baseName}.jpg`, {
                    type: "image/jpeg",
                    lastModified: Date.now(),
                  });
                  resolve(convertedFile);
                } else {
                  reject(new Error("Failed to convert HEIF/HEIC to JPG"));
                }
              },
              "image/jpeg",
              0.8,
            );
          }

          // Clean up
          URL.revokeObjectURL(img.src);
        };

        img.onerror = () => reject(new Error("Failed to load HEIF/HEIC file"));
        img.src = URL.createObjectURL(file);
      }
    });
  };

  const handleUpload = async (
    type: DrawerType,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;

    // Check if user is authenticated
    if (!user) {
      console.error("User must be authenticated to upload images");
      // You might want to show a toast notification or redirect to login
      return;
    }

    setUploadingImages((prev) => new Set(Array.from(prev).concat(type)));

    try {
      // Convert iOS formats to JPG if needed
      const file = await convertToJpg(originalFile);

      // Create a unique filename using converted file name
      const fileExtension = file.name.split(".").pop();
      const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const fileName = `${type}_${baseName}.${fileExtension}`;

      // Create storage reference: userid/input/filename
      const storageRef = ref(storage, `${user.uid}/input/${fileName}`);

      // Upload converted file
      const snapshot = await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Create new image asset with Firebase URL
      const newImage: ImageAsset = {
        type,
        path: downloadURL,
        ...(type === "product" && { productType: "custom" }),
        ...(type === "design" && { designCategory: "custom" }),
      };

      setImages((prev) => [
        ...prev.filter((img) => img.type !== type),
        newImage,
      ]);

      setDrawerOpen(false);
    } catch (error) {
      console.error("Error uploading image:", error);
      // You might want to show an error notification to the user
    } finally {
      setUploadingImages((prev) => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(type);
        return newSet;
      });
    }
  };

  const selectRandomFromLabel = (
    label: string,
    urls: string[],
    type: DrawerType,
  ) => {
    const randomPath = urls[Math.floor(Math.random() * urls.length)];
    const newImage: ImageAsset = {
      type,
      path: randomPath,
      ...(type === "product" && { productType: label }),
      ...(type === "design" && {
        designCategory: label,
        productType: selectedProductType || undefined,
      }),
      ...(type === "color" && {
        colorIndex: images.filter((img) => img.type === "color").length,
      }),
      ...(type === "tool" && { toolType: label as ToolType }), // 🔧 NEW: Handle tool type
    };

    if (type === "color") {
      // Keep only the two most recent color selections and clear tool selection
      const colorImages = images.filter((img) => img.type === "color");
      if (colorImages.length >= 2) {
        setImages((prev) => [
          ...prev.filter((img) => img.type !== "color" && img.type !== "tool"), // Clear all colors and tools
          newImage,
        ]);
      } else {
        setImages((prev) => [
          ...prev.filter((img) => img.type !== "tool"), // Clear tools but keep existing colors
          newImage,
        ]);
      }
    } else if (type === "design") {
      // Clear tool selection when selecting design
      setImages((prev) => [
        ...prev.filter((img) => img.type !== type && img.type !== "tool"), // Clear existing design and tools
        newImage,
      ]);
    } else if (type === "tool") {
      // 🔧 NEW: Only allow one tool selection at a time and clear design/color
      setImages((prev) => [
        ...prev.filter(
          (img) =>
            img.type !== "tool" &&
            img.type !== "design" &&
            img.type !== "color",
        ), // Clear design/color when selecting tool
        newImage,
      ]);
    } else {
      setImages((prev) => [
        ...prev.filter((img) => img.type !== type && img.type !== "tool"), // Clear same type and tools
        newImage,
      ]);
    }
    setDrawerOpen(false);
  };

  const getDesignCategories = (): ProductImages => {
    if (selectedProductType && productSpecificDesigns[selectedProductType]) {
      return productSpecificDesigns[selectedProductType];
    }
    return generalDesignImages;
  };

  const getPlaceholder = (image: ImageAsset): string => {
    if (
      image.type === "product" &&
      image.productType &&
      image.productType !== "custom"
    ) {
      return (
        defaultPlaceholders[image.productType as ProductType] || image.path
      );
    }
    if (image.type === "design" && image.designCategory) {
      return designPlaceholders[image.designCategory] || image.path;
    }
    if (image.type === "color") {
      const label = Object.keys(colorPlaceholders).find((key) =>
        image.path.includes(key),
      );
      return label ? colorPlaceholders[label] : image.path;
    }
    if (image.type === "tool" && image.toolType) {
      // 🔧 NEW: Handle tool placeholders
      return toolPlaceholders[image.toolType] || image.path;
    }
    return image.path;
  };

  const renderDrawer = () => {
    if (!drawerOpen || !drawerType) return null;

    let presetMap: ProductImages | Record<ToolType, string[]>; // 🔧 NEW: Update type to include tools
    if (drawerType === "product") {
      presetMap = defaultProductImages;
    } else if (drawerType === "design") {
      presetMap = getDesignCategories();
    } else if (drawerType === "color") {
      presetMap = defaultColorImages;
    } else if (drawerType === "tool") {
      // 🔧 NEW: Handle tools drawer
      presetMap = defaultToolImages;
    } else {
      presetMap = defaultColorImages;
    }

    const presetKeys = Object.keys(presetMap);
    // 🔧 NEW: Don't add UPLOAD_MARKER for tools since tools don't support uploads
    const reordered =
      drawerType === "tool"
        ? presetKeys
        : [presetKeys[0], "UPLOAD_MARKER", ...presetKeys.slice(1)];

    return (
      <div
        className="w-full bg-default-100 rounded-t-lg shadow-sm pl-4 py-2 pr-4 z-10 mb-4 relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging &&
          drawerType !== "tool" && ( // 🔧 NEW: Don't show drag overlay for tools
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg z-50 flex items-center justify-center">
              <div className="text-primary flex items-center gap-2">
                <Icon icon="lucide:upload" width={24} />
                <span>Drop to upload</span>
              </div>
            </div>
          )}
        <div className="flex overflow-x-auto gap-4 pb-2 drawer-scroll-horizontal">
          <div className="grid grid-rows-2 auto-cols-max gap-4 grid-flow-col min-w-max">
            {reordered.map((label, index) => {
              if (label === "UPLOAD_MARKER") {
                const isUploading = uploadingImages.has(drawerType);
                return (
                  <div
                    key={`upload-${drawerType}`}
                    className="flex flex-col items-center"
                  >
                    <label
                      className={`w-24 h-24 flex items-center justify-center bg-[#fafafa] dark:bg-[#18181b] border rounded-lg text-xs ${isUploading ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary"}`}
                    >
                      {isUploading ? (
                        <Icon
                          icon="lucide:loader-2"
                          width={18}
                          className="animate-spin"
                        />
                      ) : (
                        <Icon icon="lucide:upload" width={18} />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUpload(drawerType, e)}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </label>
                    <span className="mt-1 text-xs text-center capitalize">
                      {isUploading ? "Uploading..." : `Upload ${drawerType}`}
                    </span>
                  </div>
                );
              }

              const urls = (presetMap as Record<string, string[]>)[label];

              // 🔧 NEW: Handle tool icons differently
              let imageSrc: string;
              if (drawerType === "tool") {
                imageSrc = ""; // We'll render Icon component instead
              } else {
                imageSrc =
                  drawerType === "product"
                    ? (defaultPlaceholders as Record<string, string>)[label]
                    : drawerType === "design"
                      ? (designPlaceholders as Record<string, string>)[label]
                      : (colorPlaceholders as Record<string, string>)[label];
              }

              // Get custom label or fallback to original label
              const customLabel =
                drawerType === "product"
                  ? productLabels[label as ProductType] || label
                  : drawerType === "design"
                    ? designLabels[label] || label
                    : drawerType === "color"
                      ? colorLabels[label] || label
                      : drawerType === "tool" // 🔧 NEW: Handle tool labels
                        ? toolLabels[label as ToolType] || label
                        : label;

              return (
                <div
                  key={`${drawerType}-${label}-${index}`}
                  className="flex flex-col items-center"
                >
                  <button
                    onClick={() =>
                      selectRandomFromLabel(label, urls, drawerType)
                    }
                    className="w-24 h-24 flex items-center justify-center"
                  >
                    {drawerType === "tool" ? ( // 🔧 NEW: Render Icon for tools
                      <div className="w-full h-full bg-[#fafafa] dark:bg-[#18181b] border rounded-md flex items-center justify-center">
                        <Icon
                          icon={toolPlaceholders[label as ToolType]}
                          width={32}
                          className="text-default-600"
                        />
                      </div>
                    ) : (
                      <img
                        src={imageSrc}
                        className="w-full h-full object-cover rounded-md text-white bg-[#fafafa] dark:bg-transparent"
                      />
                    )}
                  </button>
                  <span
                    className="mt-1 text-xs text-center"
                    dangerouslySetInnerHTML={{ __html: customLabel }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // 🔧 NEW: Render referenced message display
  const renderReferencedMessage = () => {
    if (!referencedMessage) return null;

    return (
      <div className="mx-3 mt-3 p-3 bg-default-50 border-l-4 border-primary rounded-r-md">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon="lucide:reply" width={14} className="text-primary" />
              <span className="text-xs font-medium text-default-600 capitalize">
                Replying to{" "}
                {referencedMessage.sender === "user" ? "You" : "Assistant"}
                {referencedMessage.referencemode &&
                  referencedMessage.sender === "agent" && (
                    <span className="text-primary font-semibold capitalize">
                      {" "}
                      as {referencedMessage.referencemode}
                    </span>
                  )}
              </span>
            </div>
            {referencedMessage.text && (
              <p className="text-sm text-default-700 mb-2 line-clamp-2">
                {referencedMessage.text}
              </p>
            )}
            {referencedMessage.images &&
              referencedMessage.images.length > 0 && (
                <div className="flex gap-1 mb-2">
                  {referencedMessage.images.slice(0, 3).map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Referenced image ${i + 1}`}
                      className="w-8 h-8 object-cover rounded border"
                    />
                  ))}
                  {referencedMessage.images.length > 3 && (
                    <div className="w-8 h-8 bg-default-200 rounded border flex items-center justify-center text-xs">
                      +{referencedMessage.images.length - 3}
                    </div>
                  )}
                </div>
              )}
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={onClearReference}
          >
            <Icon icon="lucide:x" width={14} />
          </Button>
        </div>
      </div>
    );
  };

  const renderImageAssets = () => (
    <div className="group flex gap-2 pl-[20px] pt-4 pr-3 pb-2">
      {images.map((image, index) => (
        <Badge
          key={`${image.type}-${index}`}
          isOneChar
          className="opacity-100"
          content={
            <Button
              isIconOnly
              radius="full"
              size="sm"
              variant="light"
              onPress={() =>
                setImages((prev) =>
                  prev.filter(
                    (img) =>
                      img.type !== image.type ||
                      (img.type === "color" &&
                        img.colorIndex !== image.colorIndex),
                  ),
                )
              }
            >
              <Icon icon="lucide:x" width={16} />
            </Button>
          }
        >
          <div className="relative">
            {image.type === "tool" ? ( // 🔧 NEW: Render Icon for tool chips
              <div className="h-14 w-14 rounded-small border-small border-default-200/50 bg-[#fafafa] dark:bg-[#18181b] flex items-center justify-center">
                <Icon
                  icon={getPlaceholder(image)}
                  width={24}
                  className="text-default-600"
                />
              </div>
            ) : (
              <Image
                alt={`${image.type} image`}
                className="h-14 w-14 rounded-small border-small border-default-200/50 object-cover"
                src={getPlaceholder(image)}
              />
            )}
            {image.type === "color" && image.colorIndex !== undefined && (
              <div className="absolute -top-2 -right-2  text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {image.colorIndex + 1}
              </div>
            )}
          </div>
        </Badge>
      ))}
    </div>
  );

  const buttonTypes: readonly DrawerType[] = [
    "product",
    "design",
    "color",
    "tool", // 🔧 NEW: Add tools button
  ] as const;

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-auto w-full relative">
      <div className="flex h-full w-full items-center justify-center">
        <div className="relative w-full md:max-w-4xl flex flex-col items-center gap-8">
          <Form
            ref={containerRef}
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-0 rounded-medium bg-default-100 overflow-hidden"
          >
            {renderDrawer()}
            {renderReferencedMessage()} {/* 🔧 NEW: Show referenced message */}
            {renderImageAssets()}
            {!drawerOpen && (
              <textarea
                ref={inputRef}
                className="min-h-[40px] text-medium h-auto w-full py-0 !bg-transparent shadow-none pr-3 pl-[20px] pt-3 pb-4 outline-none resize-none"
                maxLength={maxLength}
                name="content"
                placeholder={placeholder}
                rows={1}
                spellCheck={false}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if ((prompt.trim() || images.length > 0) && !isSubmitting) {
                      const form = e.currentTarget.closest("form");
                      if (form) {
                        form.requestSubmit();
                      }
                    }
                  }
                }}
              />
            )}
            {isRecording && (
              <canvas
                ref={canvasRef}
                width={300}
                height={30}
                className="w-full mb-2"
              />
            )}
            <div className="flex w-full items-center justify-between px-3 pb-3">
              <div className="flex space-x-2">
                {buttonTypes.map((type) => {
                  const isActive = images.some((img) => img.type === type);
                  const iconName =
                    type === "product"
                      ? "lucide:package"
                      : type === "design"
                        ? "lucide:palette"
                        : type === "color"
                          ? "lucide:palette"
                          : "lucide:wrench"; // 🔧 NEW: Tools icon

                  // 🔧 NEW: Check if tools should be enabled (only when custom product is uploaded)
                  const hasUploadedProduct = images.some(
                    (img) =>
                      img.type === "product" && img.productType === "custom",
                  );
                  const isToolsDisabled =
                    type === "tool" && !hasUploadedProduct;

                  return (
                    <Tooltip
                      key={type}
                      content={
                        isToolsDisabled
                          ? "Upload a product image to enable tools"
                          : `Select ${type}`
                      }
                    >
                      <Button
                        isIconOnly
                        radius="full"
                        size="sm"
                        variant="light"
                        isDisabled={isToolsDisabled}
                        onPress={() => {
                          if (isToolsDisabled) return;
                          if (drawerType === type && drawerOpen) {
                            setDrawerOpen(false);
                          } else {
                            setDrawerType(type);
                            setDrawerOpen(true);
                          }
                        }}
                        className={
                          isToolsDisabled
                            ? "text-default-300 cursor-not-allowed"
                            : isActive
                              ? "bg-primary text-white dark:text-white"
                              : "text-black dark:text-white"
                        }
                      >
                        {type === "design" ? (
                          <img
                            src="/inputs/placeholders/design.svg"
                            alt="Design Icon"
                            width={20}
                            height={20}
                          />
                        ) : (
                          <Icon icon={iconName} width={20} />
                        )}
                      </Button>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  isIconOnly
                  radius="full"
                  size="sm"
                  variant="light"
                  onPress={toggleVoiceInput}
                  className={
                    isRecording ? "bg-primary animate-pulse text-white" : ""
                  }
                >
                  <Icon icon="lucide:mic" width={20} />
                </Button>
                <Button
                  isIconOnly
                  color={
                    prompt.trim() || images.length > 0 ? "primary" : "default"
                  }
                  isDisabled={
                    (!prompt.trim() && images.length === 0) || isSubmitting
                  }
                  isLoading={isSubmitting}
                  radius="full"
                  size="sm"
                  type="submit"
                  variant="solid"
                >
                  <Icon
                    className={cn(
                      "[&>path]:stroke-[2px]",
                      (!prompt.trim() && images.length === 0) || isSubmitting
                        ? "text-default-600"
                        : "text-primary-foreground",
                    )}
                    icon="lucide:arrow-up"
                    width={20}
                  />
                </Button>
              </div>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
