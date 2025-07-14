"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { IMAIIcon } from "@/app/components/imai";

interface PresetCombination {
  preset_product_type?: string;
  preset_design_style?: string;
  preset_color_palette?: string;
}

interface ExamplePrompt {
  title: string;
  prompt: string;
  presets?: PresetCombination;
  defaultImages?: {
    product?: string;
    design?: string;
    color?: string;
  };
}

interface WelcomeScreenProps {
  onExampleClick: (
    prompt: string,
    presets?: PresetCombination,
    defaultImages?: {
      product?: string;
      design?: string;
      color?: string;
    },
  ) => void;
}

export default function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  const productTypes = [
    { key: "tshirt", name: "T-shirt", placeholder: "t-shirt.svg" },
    { key: "watches", name: "Watch", placeholder: "watches.svg" },
    { key: "coffecup", name: "Coffee Mug", placeholder: "coffeecup.svg" },
    { key: "phonecase", name: "Phone Case", placeholder: "phonecase.svg" },
    { key: "earrings", name: "Earrings", placeholder: "earrings.svg" },
    { key: "sofa", name: "Sofa", placeholder: "sofa.svg" },
    { key: "glasses", name: "Sunglasses", placeholder: "glasses.svg" },
    { key: "notebook", name: "Notebook", placeholder: "notebook.svg" },
    { key: "vehicles", name: "Vehicle", placeholder: "vehicles.svg" },
    { key: "toys", name: "Toy", placeholder: "toys.svg" },
    { key: "totebag", name: "Tote Bag", placeholder: "totebag.svg" },
    { key: "shoulderbag", name: "Shoulder Bag", placeholder: "shoulderbag.svg" },
    { key: "shoes", name: "Shoes", placeholder: "shoes.svg" },
    { key: "plate", name: "Plate", placeholder: "plate.svg" },
    { key: "lamp", name: "Lamp", placeholder: "lamp.svg" },
    { key: "vase", name: "Vase", placeholder: "vase.svg" },
    { key: "backpack", name: "Backpack", placeholder: "backpack.svg" },
    { key: "hoodie", name: "Hoodie", placeholder: "hoodie.svg" },
    { key: "pillow", name: "Pillow", placeholder: "pillow.svg" },
    { key: "wallart", name: "Wall Art", placeholder: "wallart.svg" },
  ];

  const designStyles = [
    { key: "minimalist", name: "Minimalist", folder: "fashions" },
    { key: "luxury", name: "Luxury", folder: "fashions" },
    { key: "artistic", name: "Artistic", folder: "general" },
    { key: "futuristic", name: "Futuristic", folder: "general" },
    { key: "romantic", name: "Romantic", folder: "general" },
    { key: "minimalsleek", name: "Minimal Sleek", folder: "general" },
    { key: "vintagefeel", name: "Vintage Feel", folder: "fashions" },
    { key: "bold", name: "Bold", folder: "general" },
    { key: "sportysleek", name: "Sporty Sleek", folder: "general" },
    { key: "funcoolquriky", name: "Fun & Quirky", folder: "general" },
    {
      key: "elegantandsophisticated",
      name: "Elegant & Sophisticated",
      folder: "bags",
    },
    { key: "mystical", name: "Mystical", folder: "general" },
    { key: "vintage", name: "Vintage", folder: "Jewelry" },
    { key: "bohemian", name: "Bohemian", folder: "Jewelry" },
    { key: "industrial", name: "Industrial", folder: "Jewelry" },
    { key: "animeinspired", name: "Anime Inspired", folder: "general" },
  ];

  const colorPalettes = [
    { key: "neutral", name: "Neutral" },
    { key: "jewel", name: "Jewel Tones" },
    { key: "earth", name: "Earth Tones" },
    { key: "neon", name: "Neon" },
    { key: "romantic", name: "Romantic" },
    { key: "cool", name: "Cool" },
    { key: "vintage", name: "Vintage" },
    { key: "vibrant", name: "Vibrant" },
    { key: "cyberpunk", name: "Cyberpunk" },
    { key: "tropical", name: "Tropical" },
    { key: "warm", name: "Warm" },
    { key: "pastel", name: "Pastel" },
    { key: "fall", name: "Fall" },
    { key: "moody", name: "Moody" },
    { key: "spring", name: "Spring" },
    { key: "winter", name: "Winter" },
    { key: "summer", name: "Summer" },
    { key: "analogous", name: "Analogous" },
  ];

  const generateRandomPresetCombination = (): ExamplePrompt => {
    const randomProduct =
      productTypes[Math.floor(Math.random() * productTypes.length)];
    const randomDesign =
      designStyles[Math.floor(Math.random() * designStyles.length)];
    const randomColor =
      colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

    return {
      title: `${randomDesign.name} ${randomProduct.name}`,
      prompt: `Create a ${randomDesign.name.toLowerCase()} ${randomProduct.name.toLowerCase()} design with ${randomColor.name.toLowerCase()} color palette`,
      presets: {
        preset_product_type: randomProduct.key,
        preset_design_style: randomDesign.key,
        preset_color_palette: randomColor.key,
      },
      defaultImages: {
        product: `/inputs/placeholders/${randomProduct.placeholder}`,
        design: `/inputs/placeholders/${randomDesign.folder}/${randomDesign.key}.webp`,
        color: `/inputs/placeholders/colors/${randomColor.key}.webp`,
      },
    };
  };

  const allExamplePrompts: ExamplePrompt[] = [
    {
      title: "Design a modern backpack",
      prompt:
        "Create a sleek, modern backpack design with minimalist aesthetics and functional compartments",
    },
    {
      title: "Design a ceramic coffee mug",
      prompt:
        "Create a unique ceramic coffee mug with ergonomic handle and artistic patterns",
    },
    {
      title: "Create luxury handbag",
      prompt:
        "Design a sophisticated leather handbag with premium hardware and functional compartments",
    },
    {
      title: "Design running shoes",
      prompt: "Create athletic running shoes with advanced cushioning and breathable materials",
    },
    {
      title: "Wedding dress design",
      prompt:
        "Design an elegant wedding dress with vintage lace details and modern silhouette",
    },
    {
      title: "Tech gadget concept",
      prompt:
        "Create a futuristic smartwatch design with health monitoring features",
    },
    {
      title: "Design a desk organizer",
      prompt:
        "Create a modular desk organizer with compartments for pens, papers, and office supplies",
    },
    {
      title: "Streetwear collection",
      prompt:
        "Create a bold streetwear clothing line with urban graphics and comfortable fits",
    },
    {
      title: "Luxury timepiece",
      prompt:
        "Design a sophisticated luxury watch with Swiss movement and premium materials",
    },
    {
      title: "Gemstone jewelry",
      prompt:
        "Create an elegant necklace featuring emeralds and diamonds in an Art Deco style",
    },
    {
      title: "Ergonomic office chair",
      prompt:
        "Design a comfortable office chair with lumbar support and breathable materials",
    },
    {
      title: "Electric vehicle concept",
      prompt:
        "Create a futuristic electric car design with aerodynamic styling and sustainable materials",
    },
    {
      title: "Create a children's toy",
      prompt:
        "Design an educational toy that promotes creativity and learning through play",
    },
    {
      title: "Designer sunglasses",
      prompt:
        "Create trendy sunglasses with unique frame shapes and premium lenses",
    },
    {
      title: "Premium headphones",
      prompt:
        "Design noise-cancelling headphones with premium audio quality and comfort",
    },
    {
      title: "Phone case design",
      prompt:
        "Create a protective phone case with artistic patterns and wireless charging compatibility",
    },
    {
      title: "Design a leather wallet",
      prompt:
        "Create a premium leather wallet with RFID protection and card organization",
    },
    {
      title: "Design a modern lamp",
      prompt:
        "Create a contemporary table lamp with adjustable brightness and sleek design",
    },
    {
      title: "Design kitchen utensils",
      prompt:
        "Create a set of modern kitchen utensils with ergonomic handles and durable materials",
    },
    {
      title: "Hiking gear collection",
      prompt:
        "Create durable outdoor gear for mountain hiking with weather protection",
    },
    {
      title: "Summer fashion line",
      prompt:
        "Design a breezy summer collection with light fabrics and vibrant colors",
    },
    {
      title: "Evening wear collection",
      prompt:
        "Create elegant evening dresses with sophisticated silhouettes and luxurious fabrics",
    },
    {
      title: "Celebrity red carpet look",
      prompt:
        "Design a show-stopping red carpet outfit with dramatic details and perfect fit",
    },
  ];

  const examplePrompts = useMemo(() => {
    const shuffledBasicPrompts = [...allExamplePrompts].sort(
      () => Math.random() - 0.5,
    );
    const basicPrompts = shuffledBasicPrompts.slice(0, 2);
    const randomPresetPrompts = Array.from({ length: 4 }, () =>
      generateRandomPresetCombination(),
    );
    const allPrompts = [...basicPrompts, ...randomPresetPrompts];
    return allPrompts.sort(() => Math.random() - 0.5);
  }, [Math.floor(Date.now() / 10000)]);

  return (
    <div className="flex flex-col items-center justify-center h-auto md:max-w-4xlmx-auto px-4">
      <div className="w-full md:max-w-4xl flex flex-col items-center justify-center">
        <IMAIIcon className="text-black dark:text-white" size={32} />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
          Explore IMAI's Features
        </h2>

        <div className="w-full overflow-x-auto pb-4">
          <div className="flex gap-4 w-max">
            {examplePrompts.slice(0, 6).map((example, index) => (
              <Button
                key={index}
                variant="outline"
                className="flex-shrink-0 w-80 h-auto p-4 text-left flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() =>
                  onExampleClick(
                    example.prompt,
                    example.presets,
                    example.defaultImages,
                  )
                }
              >
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium text-gray-900 dark:text-white mb-1">
                    {example.title}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 break-words">
                    {example.prompt}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
