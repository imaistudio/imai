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
    { key: "bags", name: "Handbag", placeholder: "bags.svg" },
    { key: "footwear", name: "Shoes", placeholder: "footwear.svg" },
    {
      key: "kitchenware",
      name: "Kitchen Utensils",
      placeholder: "kitchenware.svg",
    },
    { key: "homedecor", name: "Home Decor", placeholder: "homedecor.svg" },
    {
      key: "officesupplies",
      name: "Office Supplies",
      placeholder: "officesupplies.svg",
    },
    { key: "furniture", name: "Furniture", placeholder: "furniture.svg" },
  ];

  const designStyles = [
    { key: "minimalist", name: "Minimalist", folder: "fashion" },
    { key: "luxury", name: "Luxury", folder: "fashion" },
    { key: "artistic", name: "Artistic", folder: "general" },
    { key: "futuristic", name: "Futuristic", folder: "general" },
    { key: "romantic", name: "Romantic", folder: "general" },
    { key: "minimalsleek", name: "Minimal Sleek", folder: "general" },
    { key: "vintagefeel", name: "Vintage Feel", folder: "fashion" },
    { key: "bold", name: "Bold", folder: "general" },
    { key: "sportysleek", name: "Sporty Sleek", folder: "general" },
    { key: "funcoolquriky", name: "Fun & Quirky", folder: "general" },
    {
      key: "elegantandsophesticated",
      name: "Elegant & Sophisticated",
      folder: "bags",
    },
    { key: "professional", name: "Professional", folder: "general" },
    { key: "cozy", name: "Cozy", folder: "general" },
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
    { key: "monochrome", name: "Monochrome" },
    { key: "electric", name: "Electric" },
    { key: "warm", name: "Warm" },
    { key: "corporate", name: "Corporate" },
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
      title: "Generate color palette",
      prompt:
        "Create a warm autumn color palette for a cozy fashion collection",
    },
    {
      title: "Style a living room",
      prompt:
        "Design a contemporary living room with neutral tones and natural materials",
    },
    {
      title: "Product photography",
      prompt: "Create a professional product photo setup for luxury jewelry",
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
      title: "Kitchen renovation",
      prompt:
        "Design a modern kitchen with smart appliances and sustainable materials",
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
      title: "Coffee shop interior",
      prompt:
        "Design a cozy coffee shop with industrial elements and warm lighting",
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
      title: "Ultrabook concept",
      prompt:
        "Design a lightweight laptop with long battery life and premium build quality",
    },
    {
      title: "Smart lighting system",
      prompt:
        "Create an intelligent lighting solution with mood settings and energy efficiency",
    },
    {
      title: "Garden landscape",
      prompt:
        "Design a sustainable garden with native plants and water-efficient irrigation",
    },
    {
      title: "Art studio setup",
      prompt:
        "Create an inspiring art studio with optimal lighting and organized storage",
    },
    {
      title: "Salon interior design",
      prompt:
        "Design a modern hair salon with comfortable seating and premium finishes",
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
    const basicPrompts = shuffledBasicPrompts.slice(0, 4);
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3 w-full">
          {examplePrompts.slice(0, 6).map((example, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full h-auto p-4 text-left flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
  );
}
