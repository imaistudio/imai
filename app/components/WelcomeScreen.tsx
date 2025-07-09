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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAIIcon } from "@/app/components/imai";

interface WelcomeScreenProps {
  onExampleClick: (prompt: string) => void;
}

export default function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  const allExamplePrompts = [
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

  // Randomly select 6 prompts each time the component renders
  const examplePrompts = useMemo(() => {
    const shuffled = [...allExamplePrompts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-auto md:max-w-4xlmx-auto px-4">
      <div className="w-full md:max-w-4xl flex flex-col items-center justify-center">
        <IMAIIcon className="text-black dark:text-white" size={32} />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
          Need Inspiration?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {examplePrompts.map((example, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full h-auto p-4 text-left flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => onExampleClick(example.prompt)}
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
