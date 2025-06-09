"use client";

import React, { useRef, useState, useEffect } from "react";
import { Badge, Button, cn, Form, Image, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";

// Import constants from the separate file
import {
  ProductType,
  ProductImages,
  defaultProductImages,
  productSpecificDesigns,
  defaultDesignImages,
  defaultColorImages,
  defaultPlaceholders,
  designPlaceholders,
  colorPlaceholders,
} from "@/constants/inputs";

interface ImageAsset {
  type: "product" | "design" | "color";
  path: string;
  productType?: string;
  designCategory?: string;
}

type DrawerType = "product" | "design" | "color";

// Add interface for the submission data
interface SubmissionData {
  prompt: string;
  images: ImageAsset[];
}

// Add interface for component props
interface UnifiedPromptContainerProps {
  onSubmit?: (data: SubmissionData) => void;
  placeholder?: string;
  maxLength?: number;
}

export default function UnifiedPromptContainer({
  onSubmit,
  placeholder = "Reimagine ArtWork",
  maxLength = 1000
}: UnifiedPromptContainerProps) {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [drawerType, setDrawerType] = useState<DrawerType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState<ProductType | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const productImage = images.find(img => img.type === "product");
    if (productImage && productImage.productType && productImage.productType !== "custom") {
      setSelectedProductType(productImage.productType as ProductType);
    } else if (!productImage) {
      setSelectedProductType(null);
    }
  }, [images]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submissionData: SubmissionData = {
      prompt: prompt.trim(),
      images: images,
    };
    // Call the callback function if provided
    if (onSubmit) {
      onSubmit(submissionData);
    } 
  };

  const handleUpload = (type: DrawerType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const newImage: ImageAsset = {
          type,
          path: reader.result as string,
          ...(type === "product" && { productType: "custom" }),
        };
        setImages(prev => [...prev.filter(img => img.type !== type), newImage]);
        setDrawerOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectRandomFromLabel = (label: string, urls: string[], type: DrawerType) => {
    const randomPath = urls[Math.floor(Math.random() * urls.length)];
    const newImage: ImageAsset = {
      type,
      path: randomPath,
      ...(type === "product" && { productType: label }),
      ...(type === "design" && {
        designCategory: label,
        productType: selectedProductType || undefined
      }),
    };
    setImages(prev => [...prev.filter(img => img.type !== type), newImage]);
    setDrawerOpen(false);
  };

  const getDesignCategories = (): ProductImages => {
    if (selectedProductType && productSpecificDesigns[selectedProductType]) {
      return productSpecificDesigns[selectedProductType];
    }
    return defaultDesignImages;
  };

  const getPlaceholder = (image: ImageAsset): string => {
    if (image.type === "product" && image.productType && image.productType !== "custom") {
      return defaultPlaceholders[image.productType as ProductType] || image.path;
    }
    if (image.type === "design" && image.designCategory) {
      return designPlaceholders[image.designCategory] || image.path;
    }
    if (image.type === "color") {
      const label = Object.keys(colorPlaceholders).find(key =>
        image.path.includes(key)
      );
      return label ? colorPlaceholders[label] : image.path;
    }
    return image.path;
  };

  const renderDrawer = () => {
    if (!drawerOpen || !drawerType) return null;

    let presetMap: ProductImages;
    let titleSuffix = "";

    if (drawerType === "product") {
      presetMap = defaultProductImages;
    } else if (drawerType === "design") {
      presetMap = getDesignCategories();
      titleSuffix = selectedProductType ? ` for ${selectedProductType}` : "";
    } else {
      presetMap = defaultColorImages;
    }

    return (
      <div className="w-full bg-default-100 rounded-t-lg shadow-sm pl-4 py-2 pr-4 z-10 mb-4">
        {/* <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold capitalize">
            Choose {drawerType}{titleSuffix}
          </h2>
          <Button onPress={() => setDrawerOpen(false)} isIconOnly size="sm" variant="light">
            <Icon icon="lucide:x" width={16} />
          </Button>
        </div> */}

        <div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
          <div className="grid grid-rows-2 auto-cols-max gap-4 grid-flow-col min-w-max">
            <div className="flex flex-col items-center">
              <label className="w-24 h-24 flex items-center justify-center bg-[#fafafa] dark:bg-[#18181b] border rounded-lg text-xs cursor-pointer hover:border-primary">
                <Icon icon="lucide:upload" width={18} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(drawerType, e)}
                  className="hidden"
                />
              </label>
              <span className="mt-1 text-xs text-center capitalize">Upload {drawerType}</span>
            </div>

            {Object.entries(presetMap).map(([label, urls]) => (
              <div key={label} className="flex flex-col items-center">
                <button
                  onClick={() => selectRandomFromLabel(label, urls, drawerType)}
                  className="w-24 h-24 bg-[#fafafa] dark:bg-[#18181b] border rounded-lg flex items-center justify-center hover:border-primary"
                >
                  <Image
                    alt={label}
                    src={
                      drawerType === "product"
                        ? defaultPlaceholders[label as ProductType]
                        : drawerType === "design"
                        ? designPlaceholders[label] || "/placeholders/default.jpg"
                        : colorPlaceholders[label] || "/placeholders/default.jpg"
                    }
                    className="w-full h-full object-cover rounded-md"
                  />
                </button>
                <span className="mt-1 text-xs capitalize text-center">{label}</span>
              </div>
            ))}
          </div>
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
              onPress={() => setImages(prev => prev.filter(img => img.type !== image.type))}
            >
              <Icon icon="lucide:x" width={16} />
            </Button>
          }
        >
          <div className="relative">
            <Image
              alt={`${image.type} image`}
              className="h-14 w-14 rounded-small border-small border-default-200/50 object-cover"
              src={getPlaceholder(image)}
            />
          </div>
        </Badge>
      ))}
    </div>
  );

  const buttonTypes: readonly DrawerType[] = ["product", "design", "color"] as const;

  return (
    <div className="flex h-screen max-h-[calc(100vh-140px)] w-full relative">
      <div className="flex h-full w-full items-center justify-center">
        <div className="relative w-full max-w-xl flex flex-col items-center gap-8">
          <Form onSubmit={handleSubmit} className="flex w-full flex-col gap-0 rounded-medium bg-default-100 overflow-hidden">
            {renderDrawer()}
            {renderImageAssets()}
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
            />
            <div className="flex w-full items-center justify-between px-3 pb-3">
              <div className="flex space-x-2">
                {buttonTypes.map((type) => {
                  const isActive = images.some(img => img.type === type);
                  const iconName =
                    type === "product"
                      ? "lucide:package"
                      : type === "design"
                      ? "lucide:palette"
                      : "lucide:droplets";

                  return (
                    <Tooltip key={type} content={`Select ${type}`}>
                      <Button
                        isIconOnly
                        radius="full"
                        size="sm"
                        variant="light"
                        onPress={() => {
                          setDrawerType(type);
                          setDrawerOpen(true);
                        }}
                        className={isActive ? "bg-primary text-white dark:text-white" : "text-black dark:text-white"}
                      >
                        <Icon icon={iconName} width={20} />
                      </Button>
                    </Tooltip>
                  );
                })}
              </div>
              <Button
                isIconOnly
                color={!prompt && images.length === 0 ? "default" : "primary"}
                isDisabled={!prompt && images.length === 0}
                radius="full"
                size="sm"
                type="submit"
                variant="solid"
              >
                <Icon
                  className={cn("[&>path]:stroke-[2px]", !prompt && images.length === 0 ? "text-default-600" : "text-primary-foreground")}
                  icon="lucide:arrow-up"
                  width={20}
                />
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}