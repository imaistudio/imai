"use client";

import { useState, useEffect, useRef } from "react";
import { X, Edit3, Eye, Brush, Eraser, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  className?: string;
  onInpaint?: (imageUrl: string, maskDataUrl: string, prompt: string) => Promise<any>;
}

type Mode = "view" | "edit";
type Tool = "brush" | "eraser";

export const ImageZoomModal = ({
  src,
  alt = "",
  className,
  onInpaint,
}: ImageZoomModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(20);
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [maskData, setMaskData] = useState<ImageData | null>(null);

  // Initialize canvas when switching to edit mode
  useEffect(() => {
    if (mode === "edit" && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = imageRef.current;
      
      if (ctx) {
        // Wait for image to load if not already loaded
        const initCanvas = () => {
          // Set canvas size to match displayed image size
          const rect = img.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          
          // Initialize with transparent mask
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Store initial mask data
          setMaskData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };

        if (img.complete) {
          initCanvas();
        } else {
          img.onload = initCanvas;
        }
      }
    }
  }, [mode, isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
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

  const handleClose = () => {
    setIsOpen(false);
    setMode("view");
    setEditedImage(null);
    setPrompt("");
    setMaskData(null);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "edit") return;
    setIsDrawing(true);
    draw(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== "edit") return;
    draw(e);
  };

  const handleCanvasMouseUp = () => {
    if (mode !== "edit") return;
    setIsDrawing(false);
    
    // Update mask data
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      setMaskData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ensure coordinates are within canvas bounds
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    if (tool === "brush") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)"; // Red semi-transparent for visibility
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
    }
    
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, 2 * Math.PI);
    ctx.fill();
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setMaskData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }
  };

  const generateMaskDataUrl = (): string | null => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return null;
    
    // Create a new canvas for the final mask at original image resolution
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;
    
    // Set mask canvas to original image size
    maskCanvas.width = img.naturalWidth;
    maskCanvas.height = img.naturalHeight;
    
    // Fill with black background
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Create a temporary canvas to process the mask
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return null;
    
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    
    // Scale the drawn mask to original image size
    const scaleX = img.naturalWidth / canvas.width;
    const scaleY = img.naturalHeight / canvas.height;
    
    tempCtx.save();
    tempCtx.scale(scaleX, scaleY);
    tempCtx.drawImage(canvas, 0, 0);
    tempCtx.restore();
    
    // Convert red areas to white mask
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const alpha = data[i + 3];
      
      if (alpha > 0 && red > 0) {
        // Convert red areas to white
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      } else {
        // Keep black areas black
        data[i] = 0;       // R
        data[i + 1] = 0;   // G
        data[i + 2] = 0;   // B
        data[i + 3] = 255; // A
      }
    }
    
    maskCtx.putImageData(imageData, 0, 0);
    
    return maskCanvas.toDataURL("image/png");
  };

  const handleInpaint = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt describing what to paint");
      return;
    }

    // Check if user has drawn any mask
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      alert("Canvas not ready");
      return;
    }

    // Check if canvas has any drawn content
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = imageData.data.some((value, index) => index % 4 === 3 && value > 0);
    
    if (!hasDrawing) {
      alert("Please draw a mask on the image first using the brush tool");
      return;
    }

    const maskDataUrl = generateMaskDataUrl();
    if (!maskDataUrl) {
      alert("Failed to generate mask");
      return;
    }

    setIsProcessing(true);
    
    try {
      if (onInpaint) {
        // Use the chat handler to add result to conversation
        const resultUrl = await onInpaint(src, maskDataUrl, prompt);
        if (resultUrl) {
          setEditedImage(resultUrl);
          setMode("view");
          // Close modal after successful inpainting to show result in chat
          setTimeout(() => {
            handleClose();
          }, 1000);
        }
      } else {
        // Fallback to direct API call (standalone usage)
        const formData = new FormData();
        formData.append("userid", "user123");
        formData.append("image_url", src);
        formData.append("mask", maskDataUrl);
        formData.append("prompt", prompt);
        formData.append("size", "1024x1024");

        const response = await fetch("/api/inpainting", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();
        
        if (result.status === "success" && result.imageUrl) {
          setEditedImage(result.imageUrl);
          setMode("view");
        } else {
          throw new Error(result.error || "Inpainting failed");
        }
      }
    } catch (error) {
      console.error("Inpainting error:", error);
      alert(`Inpainting failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    const imageToDownload = editedImage || src;
    const link = document.createElement("a");
    link.href = imageToDownload;
    link.download = `${alt || "image"}_${editedImage ? "edited" : "original"}.png`;
    link.click();
  };

  const currentImageSrc = editedImage || src;

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={cn(className, "cursor-pointer")}
        onClick={() => setIsOpen(true)}
      />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={handleClose}
        >
          {/* Header Controls - FORCED VISIBILITY */}
          <div 
            style={{
              position: 'fixed',
              top: '20px',
              left: '20px',
              right: '20px',
              zIndex: 9999,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {mode === "edit" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode("view");
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Eye size={16} />
                  Back to View
                </button>
              )}
              
              {mode === "view" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode("edit");
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                  title="Edit with Inpainting"
                >
                  <Edit3 size={16} />
                  Edit
                </button>
              )}
              
              {editedImage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadImage();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={16} />
                  Download
                </button>
              )}
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <X size={24} />
            </button>
          </div>

          {/* Edit Controls */}
          {mode === "edit" && (
            <div 
              className="absolute top-20 left-4 right-4 bg-black/90 border border-white/20 rounded-lg p-4 text-white z-40 backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-4">
                {/* Instructions */}
                <div className="text-sm text-white/80 mb-2">
                  💡 Click and drag on the image to mark areas you want to edit (red areas will be inpainted)
                </div>

                {/* Tool Selection */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTool("brush");
                    }}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                      tool === "brush" 
                        ? "bg-blue-600 border-blue-500 text-white" 
                        : "bg-white/10 border-white/30 text-white hover:bg-white/20"
                    }`}
                  >
                    <Brush size={16} />
                    Brush
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTool("eraser");
                    }}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                      tool === "eraser" 
                        ? "bg-blue-600 border-blue-500 text-white" 
                        : "bg-white/10 border-white/30 text-white hover:bg-white/20"
                    }`}
                  >
                    <Eraser size={16} />
                    Eraser
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearMask();
                    }}
                    className="flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/30 rounded-lg text-white transition-all"
                  >
                    Clear
                  </button>
                </div>

                {/* Brush Size */}
                <div 
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-sm font-medium">Size:</span>
                  <input
                    type="range"
                    value={brushSize}
                    onChange={(e) => {
                      e.stopPropagation();
                      setBrushSize(parseInt(e.target.value));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    min={5}
                    max={50}
                    step={1}
                    className="flex-1 max-w-32 accent-blue-600"
                  />
                  <span className="text-sm w-8 font-mono">{brushSize}px</span>
                </div>

                {/* Prompt Input */}
                <div 
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    placeholder="Describe what to paint in the masked area..."
                    value={prompt}
                    onChange={(e) => {
                      e.stopPropagation();
                      setPrompt(e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInpaint();
                    }}
                    disabled={isProcessing || !prompt.trim()}
                    className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-all ${
                      isProcessing || !prompt.trim()
                        ? "bg-gray-600 cursor-not-allowed text-gray-300"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    {isProcessing ? "Processing..." : "Inpaint"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Image Container */}
          <div className="relative max-h-[70vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              ref={imageRef}
              src={currentImageSrc}
              alt={alt}
              className="max-h-[70vh] max-w-[90vw] object-contain"
            />
            
            {/* Canvas Overlay for Drawing */}
            {mode === "edit" && (
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full cursor-crosshair"
                style={{ 
                  backgroundColor: "transparent",
                  pointerEvents: "auto",
                  zIndex: 10
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};
