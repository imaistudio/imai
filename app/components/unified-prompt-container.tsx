// Create a new unified component file that combines all functionality

import React, { useCallback, useState, useRef } from "react";
import { Badge, Button, cn, Form, Image, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { VisuallyHidden } from "@react-aria/visually-hidden";
import { useAuth } from "@/contexts/AuthContext";

// Define types for our component
interface ImageAsset {
  type: 'product' | 'design' | 'color';
  path: string;
}

export default function UnifiedPromptContainer() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const designFileInputRef = useRef<HTMLInputElement>(null);
  const colorFileInputRef = useRef<HTMLInputElement>(null);

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!user) {
      setError('User must be logged in');
      return;
    }

    // Validate inputs
    if (!prompt && images.length === 0) {
      setError('Please provide either a prompt or at least one image');
      return;
    }

    // Validate user ID
    if (!user.uid || typeof user.uid !== 'string') {
      setError('Invalid user ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    // Don't reset the form here - wait for successful completion
    
    try {
      // Find images by type
      const productImage = images.find(img => img.type === 'product')?.path || '';
      const designImage = images.find(img => img.type === 'design')?.path || '';
      const colorImage = images.find(img => img.type === 'color')?.path || '';

      // Create form data
      const formData = new FormData();
      formData.append('prompt', prompt);
      
      // Convert base64 images to files if they exist
      if (productImage) {
        const productFile = await fetch(productImage).then(r => r.blob());
        formData.append('product_image', new File([productFile], 'product.jpg', { type: 'image/jpeg' }));
      }
      if (designImage) {
        const designFile = await fetch(designImage).then(r => r.blob());
        formData.append('design_image', new File([designFile], 'design.jpg', { type: 'image/jpeg' }));
      }
      if (colorImage) {
        const colorFile = await fetch(colorImage).then(r => r.blob());
        formData.append('color_image', new File([colorFile], 'color.jpg', { type: 'image/jpeg' }));
      }

      // Add user ID
      formData.append('userid', user.uid);

      // Log the data being sent
      console.log('Submitting form data with:');
      console.log('User ID:', user.uid);
      console.log('Prompt:', prompt);
      console.log('Images:', images.map(img => ({ type: img.type, hasPath: !!img.path })));
      
      // Call the API
      try {
        const response = await fetch('/api/design', {
          method: 'POST',
          body: formData,
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        // Try to get the response body regardless of status
        let errorData;
        try {
          errorData = await response.json();
          console.log('Response body:', errorData);
        } catch (e) {
          console.error('Failed to parse response as JSON:', e);
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log('Response data:', data);

        if (data.status === 'success' && data.firebaseOutputUrl) {
          setOutputImage(data.firebaseOutputUrl);
          // Only reset form after successful generation
          setPrompt("");
          setImages([]);
          inputRef.current?.focus();
        } else {
          throw new Error(data.error || 'Failed to generate image');
        }
      } catch (error) {
        console.error('Error generating image:', error);
        setError(error instanceof Error ? error.message : 'Failed to generate image');
      }
    } finally {
      setIsLoading(false);
    }
  }, [prompt, images, user]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Handle file upload for different image types
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'design' | 'color') => {
    const files = Array.from(e.target.files || []);
    
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      const file = files[0];
      const reader = new FileReader();
      
      reader.onload = () => {
        const path = reader.result as string;
        
        // Remove any existing image of this type
        setImages(prev => {
          const filtered = prev.filter(img => img.type !== type);
          return [...filtered, { type, path }];
        });
      };
      
      reader.readAsDataURL(file);
    }
    
    // Reset input value to allow uploading the same file again
    if (e.target) {
      e.target.value = "";
    }
  }, []);

  // Remove an image by type
  const handleRemoveImage = (type: 'product' | 'design' | 'color') => {
    setImages(prev => prev.filter(img => img.type !== type));
  };

  // Check if a specific image type exists
  const hasImageType = useCallback((type: 'product' | 'design' | 'color') => {
    return images.some(img => img.type === type);
  }, [images]);

  // Clear output image
  const clearOutput = () => {
    setOutputImage(null);
    setError(null);
  };

  // Render image assets
  const renderImageAssets = () => {
    if (images.length === 0) return null;

    return (
      <>
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
                onPress={() => handleRemoveImage(image.type)}
              >
                <Icon className="text-foreground" icon="lucide:x" width={16} />
              </Button>
            }
          >
            <div className="relative">
              <Image
                alt={`${image.type} image`}
                className="h-14 w-14 rounded-small border-small border-default-200/50 object-cover"
                src={image.path}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[10px] text-white text-center">
                {image.type.charAt(0).toUpperCase() + image.type.slice(1)}
              </div>
            </div>
          </Badge>
        ))}
      </>
    );
  };

  return (
    <div className="flex h-screen max-h-[calc(100vh-140px)] w-full">
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex w-full max-w-xl flex-col items-center gap-8">
          <h1 className="text-3xl font-semibold leading-9 text-default-foreground">
            Generate Newness
          </h1>
          <div className="flex w-full flex-col gap-4">
            <Form
              className="flex w-full flex-col items-start gap-0 rounded-medium bg-default-100 dark:bg-default-100"
              validationBehavior="native"
              onSubmit={handleSubmit}
            >
              <div className={cn("group flex gap-2 pl-[20px] pr-3", images.length > 0 ? "pt-4" : "")}>
                {renderImageAssets()}
              </div>
              
              <textarea
                ref={inputRef}
                className="min-h-[40px] text-medium h-auto w-full py-0 !bg-transparent shadow-none pr-3 pl-[20px] pt-3 pb-4 outline-none resize-none"
                maxLength={1000}
                name="content"
                placeholder="Enter a prompt here"
                rows={2}
                spellCheck={false}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              
              <div className="flex w-full flex-row items-center justify-between px-3 pb-3">
                <div className="flex space-x-2">
                  {/* Product Image Button */}
                  <Tooltip showArrow content="Add Product Image">
                    <Button
                      isIconOnly
                      radius="full"
                      size="sm"
                      variant={hasImageType('product') ? "solid" : "light"}
                      color={hasImageType('product') ? "primary" : "default"}
                      onPress={() => productFileInputRef.current?.click()}
                    >
                      <Icon 
                        className={hasImageType('product') ? "text-primary-foreground" : "text-default-500"} 
                        icon="lucide:package" 
                        width={20} 
                      />
                      <VisuallyHidden>
                        <input
                          ref={productFileInputRef}
                          accept="image/*"
                          type="file"
                          onChange={(e) => handleFileUpload(e, 'product')}
                        />
                      </VisuallyHidden>
                    </Button>
                  </Tooltip>
                  
                  {/* Design Image Button */}
                  <Tooltip showArrow content="Add Design Image">
                    <Button
                      isIconOnly
                      radius="full"
                      size="sm"
                      variant={hasImageType('design') ? "solid" : "light"}
                      color={hasImageType('design') ? "primary" : "default"}
                      onPress={() => designFileInputRef.current?.click()}
                    >
                      <Icon 
                        className={hasImageType('design') ? "text-primary-foreground" : "text-default-500"} 
                        icon="lucide:palette" 
                        width={20} 
                      />
                      <VisuallyHidden>
                        <input
                          ref={designFileInputRef}
                          accept="image/*"
                          type="file"
                          onChange={(e) => handleFileUpload(e, 'design')}
                        />
                      </VisuallyHidden>
                    </Button>
                  </Tooltip>
                  
                  {/* Color Image Button */}
                  <Tooltip showArrow content="Add Color Image">
                    <Button
                      isIconOnly
                      radius="full"
                      size="sm"
                      variant={hasImageType('color') ? "solid" : "light"}
                      color={hasImageType('color') ? "primary" : "default"}
                      onPress={() => colorFileInputRef.current?.click()}
                    >
                      <Icon 
                        className={hasImageType('color') ? "text-primary-foreground" : "text-default-500"} 
                        icon="lucide:droplets" 
                        width={20} 
                      />
                      <VisuallyHidden>
                        <input
                          ref={colorFileInputRef}
                          accept="image/*"
                          type="file"
                          onChange={(e) => handleFileUpload(e, 'color')}
                        />
                      </VisuallyHidden>
                    </Button>
                  </Tooltip>
                </div>
                
                <Button
                  isIconOnly
                  color={!prompt && images.length === 0 ? "default" : "primary"}
                  isDisabled={!prompt && images.length === 0}
                  isLoading={isLoading}
                  radius="full"
                  size="sm"
                  type="submit"
                  variant="solid"
                >
                  <Icon
                    className={cn(
                      "[&>path]:stroke-[2px]",
                      !prompt && images.length === 0 ? "text-default-600" : "text-primary-foreground",
                    )}
                    icon="lucide:arrow-up"
                    width={20}
                  />
                </Button>
              </div>
            </Form>
            
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-red-800 text-sm">{error}</p>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => setError(null)}
                  >
                    <Icon icon="lucide:x" width={16} />
                  </Button>
                </div>
              </div>
            )}
            
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-default-500">Generating your design...</p>
              </div>
            )}
            
            {/* Output Image */}
            {outputImage && !isLoading && (
              <div className="mt-4">
                <div className="relative">
                  <img
                    src={outputImage}
                    alt="Generated design"
                    width={512}
                    height={512}
                    className="rounded-lg shadow-lg w-full max-w-[512px] h-auto object-cover mx-auto"
                    onLoad={() => console.log('Image loaded successfully')}
                    onError={(e) => {
                      console.error('Error loading image:', e);
                      setError('Failed to load generated image');
                    }}
                  />
                  <div className="absolute top-2 right-2">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="solid"
                      color="default"
                      className="bg-white/80 backdrop-blur-sm"
                      onPress={clearOutput}
                    >
                      <Icon icon="lucide:x" width={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}