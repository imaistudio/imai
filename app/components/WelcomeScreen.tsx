"use client";

import React, { useMemo } from "react";
import {
  Sparkles,
  Palette,
  Wand2,
  Camera,
  Heart,
  Zap,
  Home,
  Shirt,
  Watch,
  Gem,
  Sofa,
  Car,
  Coffee,
  Glasses,
  Headphones,
  Smartphone,
  Laptop,
  Lightbulb,
  Flower,
  Paintbrush,
  Scissors,
  Mountain,
  Sun,
  Moon,
  Star,
  ArrowUpCircle,
  Video,
  Monitor,
  Clock,
  Layout,
  Layers,
  Clapperboard,
  Maximize,
  Sunrise,
  Building,
  RotateCcw,
  Workflow,
  Eraser,
  Trash2,
  FlipHorizontal,
  ZoomIn,
  Crop,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAIIcon } from "@/app/components/imai";

interface PresetCombination {
  preset_product_type?: string;
  preset_design_style?: string;
  preset_color_palette?: string;
}

interface ExamplePrompt {
  icon: React.ReactNode;
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
  onExampleClick: (prompt: string, presets?: PresetCombination, defaultImages?: {
    product?: string;
    design?: string;
    color?: string;
  }) => void;
}

export default function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  // Define arrays for random combinations
  const productTypes = [
    { key: "tshirt", name: "T-shirt", icon: <Shirt className="w-4 h-4" />, placeholder: "t-shirt.svg" },
    { key: "watches", name: "Watch", icon: <Watch className="w-4 h-4" />, placeholder: "watches.svg" },
    { key: "coffecup", name: "Coffee Mug", icon: <Coffee className="w-4 h-4" />, placeholder: "coffeecup.svg" },
    { key: "phonecase", name: "Phone Case", icon: <Smartphone className="w-4 h-4" />, placeholder: "phonecase.svg" },
    { key: "earrings", name: "Earrings", icon: <Gem className="w-4 h-4" />, placeholder: "earrings.svg" },
    { key: "sofa", name: "Sofa", icon: <Sofa className="w-4 h-4" />, placeholder: "sofa.svg" },
    { key: "glasses", name: "Sunglasses", icon: <Glasses className="w-4 h-4" />, placeholder: "glasses.svg" },
    { key: "notebook", name: "Notebook", icon: <Laptop className="w-4 h-4" />, placeholder: "notebook.svg" },
    { key: "vehicles", name: "Vehicle", icon: <Car className="w-4 h-4" />, placeholder: "vehicles.svg" },
    { key: "toys", name: "Toy", icon: <Star className="w-4 h-4" />, placeholder: "toys.svg" },
    { key: "bags", name: "Handbag", icon: <Heart className="w-4 h-4" />, placeholder: "bags.svg" },
    { key: "footwear", name: "Shoes", icon: <Zap className="w-4 h-4" />, placeholder: "footwear.svg" },
    { key: "kitchenware", name: "Kitchen Utensils", icon: <Home className="w-4 h-4" />, placeholder: "kitchenware.svg" },
    { key: "homedecor", name: "Home Decor", icon: <Lightbulb className="w-4 h-4" />, placeholder: "homedecor.svg" },
    { key: "officesupplies", name: "Office Supplies", icon: <Paintbrush className="w-4 h-4" />, placeholder: "officesupplies.svg" },
    { key: "furniture", name: "Furniture", icon: <Sofa className="w-4 h-4" />, placeholder: "furniture.svg" },
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
    { key: "elegantandsophesticated", name: "Elegant & Sophisticated", folder: "bags" },
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

  // Function to generate random preset combinations
  const generateRandomPresetCombination = (): ExamplePrompt => {
    const randomProduct = productTypes[Math.floor(Math.random() * productTypes.length)];
    const randomDesign = designStyles[Math.floor(Math.random() * designStyles.length)];
    const randomColor = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

    return {
      icon: randomProduct.icon,
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
      icon: <Sparkles className="w-4 h-4" />,
      title: "Design a modern backpack",
      prompt:
        "Create a sleek, modern backpack design with minimalist aesthetics and functional compartments",
    },
    {
      icon: <Palette className="w-4 h-4" />,
      title: "Generate color palette",
      prompt:
        "Create a warm autumn color palette for a cozy fashion collection",
    },
    {
      icon: <Wand2 className="w-4 h-4" />,
      title: "Style a living room",
      prompt:
        "Design a contemporary living room with neutral tones and natural materials",
    },
    {
      icon: <Camera className="w-4 h-4" />,
      title: "Product photography",
      prompt: "Create a professional product photo setup for luxury jewelry",
    },
    {
      icon: <Heart className="w-4 h-4" />,
      title: "Wedding dress design",
      prompt:
        "Design an elegant wedding dress with vintage lace details and modern silhouette",
    },
    {
      icon: <Zap className="w-4 h-4" />,
      title: "Tech gadget concept",
      prompt:
        "Create a futuristic smartwatch design with health monitoring features",
    },
    {
      icon: <Home className="w-4 h-4" />,
      title: "Kitchen renovation",
      prompt:
        "Design a modern kitchen with smart appliances and sustainable materials",
    },
    {
      icon: <Shirt className="w-4 h-4" />,
      title: "Streetwear collection",
      prompt:
        "Create a bold streetwear clothing line with urban graphics and comfortable fits",
    },
    {
      icon: <Watch className="w-4 h-4" />,
      title: "Luxury timepiece",
      prompt:
        "Design a sophisticated luxury watch with Swiss movement and premium materials",
    },
    {
      icon: <Gem className="w-4 h-4" />,
      title: "Gemstone jewelry",
      prompt:
        "Create an elegant necklace featuring emeralds and diamonds in an Art Deco style",
    },
    {
      icon: <Sofa className="w-4 h-4" />,
      title: "Ergonomic office chair",
      prompt:
        "Design a comfortable office chair with lumbar support and breathable materials",
    },
    {
      icon: <Car className="w-4 h-4" />,
      title: "Electric vehicle concept",
      prompt:
        "Create a futuristic electric car design with aerodynamic styling and sustainable materials",
    },
    {
      icon: <Coffee className="w-4 h-4" />,
      title: "Coffee shop interior",
      prompt:
        "Design a cozy coffee shop with industrial elements and warm lighting",
    },
    {
      icon: <Glasses className="w-4 h-4" />,
      title: "Designer sunglasses",
      prompt:
        "Create trendy sunglasses with unique frame shapes and premium lenses",
    },
    {
      icon: <Headphones className="w-4 h-4" />,
      title: "Premium headphones",
      prompt:
        "Design noise-cancelling headphones with premium audio quality and comfort",
    },
    {
      icon: <Smartphone className="w-4 h-4" />,
      title: "Phone case design",
      prompt:
        "Create a protective phone case with artistic patterns and wireless charging compatibility",
    },
    {
      icon: <Laptop className="w-4 h-4" />,
      title: "Ultrabook concept",
      prompt:
        "Design a lightweight laptop with long battery life and premium build quality",
    },
    {
      icon: <Lightbulb className="w-4 h-4" />,
      title: "Smart lighting system",
      prompt:
        "Create an intelligent lighting solution with mood settings and energy efficiency",
    },
    {
      icon: <Flower className="w-4 h-4" />,
      title: "Garden landscape",
      prompt:
        "Design a sustainable garden with native plants and water-efficient irrigation",
    },
    {
      icon: <Paintbrush className="w-4 h-4" />,
      title: "Art studio setup",
      prompt:
        "Create an inspiring art studio with optimal lighting and organized storage",
    },
    {
      icon: <Scissors className="w-4 h-4" />,
      title: "Salon interior design",
      prompt:
        "Design a modern hair salon with comfortable seating and premium finishes",
    },
    {
      icon: <Mountain className="w-4 h-4" />,
      title: "Hiking gear collection",
      prompt:
        "Create durable outdoor gear for mountain hiking with weather protection",
    },
    {
      icon: <Sun className="w-4 h-4" />,
      title: "Summer fashion line",
      prompt:
        "Design a breezy summer collection with light fabrics and vibrant colors",
    },
    {
      icon: <Moon className="w-4 h-4" />,
      title: "Evening wear collection",
      prompt:
        "Create elegant evening dresses with sophisticated silhouettes and luxurious fabrics",
    },
    {
      icon: <Star className="w-4 h-4" />,
      title: "Celebrity red carpet look",
      prompt:
        "Design a show-stopping red carpet outfit with dramatic details and perfect fit",
    },
  ];

  // Randomly select prompts and generate random preset combinations
  const examplePrompts = useMemo(() => {
    const shuffledBasicPrompts = [...allExamplePrompts].sort(() => Math.random() - 0.5);
    const basicPrompts = shuffledBasicPrompts.slice(0, 4); // 4 basic prompts
    
    // Generate 4 random preset combinations
    const randomPresetPrompts = Array.from({ length: 4 }, () => generateRandomPresetCombination());
    
    // Combine and shuffle again
    const allPrompts = [...basicPrompts, ...randomPresetPrompts];
    return allPrompts.sort(() => Math.random() - 0.5);
  }, [Math.floor(Date.now() / 10000)]); // Rotate every 10 seconds

  return (
    <div className="flex flex-col items-center justify-center h-auto md:max-w-4xlmx-auto px-4">
      <div className="w-full md:max-w-4xl flex flex-col items-center justify-center">
        <IMAIIcon className="text-black dark:text-white" size={32} />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
          Explore IMAI's Features
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center max-w-2xl">
          Try these examples to discover image generation, upscaling, video creation, reframing, lighting changes, and multi-step operations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3 w-full">
          {examplePrompts.map((example, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full h-auto p-4 text-left flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => onExampleClick(example.prompt, example.presets, example.defaultImages)}
            >
              <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                {example.icon}
              </div>
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
