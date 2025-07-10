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
    // Advanced Features Section
    {
      icon: <ArrowUpCircle className="w-4 h-4" />,
      title: "Upscale image quality",
      prompt: "upscale this image to higher resolution with enhanced details",
    },
    {
      icon: <Video className="w-4 h-4" />,
      title: "Create product video",
      prompt: "generate a video showcasing this product with smooth motion",
    },
    {
      icon: <Clapperboard className="w-4 h-4" />,
      title: "Dance video generation",
      prompt: "create a dance video with energetic movements and music",
    },
    {
      icon: <Monitor className="w-4 h-4" />,
      title: "Reframe to landscape",
      prompt: "change this image to 16:9 landscape format for social media",
    },
    {
      icon: <Maximize className="w-4 h-4" />,
      title: "Reframe to square",
      prompt: "reframe this to 1:1 square aspect ratio for Instagram",
    },
    {
      icon: <RotateCcw className="w-4 h-4" />,
      title: "Reframe to portrait",
      prompt: "change this to 9:16 portrait orientation for mobile viewing",
    },
    {
      icon: <Sunrise className="w-4 h-4" />,
      title: "Change to sunset lighting",
      prompt: "change the time of day to golden hour sunset with warm lighting",
    },
    {
      icon: <Moon className="w-4 h-4" />,
      title: "Transform to night scene",
      prompt: "change this to a night scene with dramatic evening lighting",
    },
    {
      icon: <Sun className="w-4 h-4" />,
      title: "Bright daytime lighting",
      prompt: "change the lighting to bright sunny daytime with natural light",
    },
    {
      icon: <Building className="w-4 h-4" />,
      title: "Place in modern kitchen",
      prompt: "place this product in a modern kitchen scene with contemporary design",
    },
    {
      icon: <Sofa className="w-4 h-4" />,
      title: "Living room scene",
      prompt: "create a scene composition with this product in a cozy living room",
    },
    {
      icon: <Camera className="w-4 h-4" />,
      title: "Studio photography scene",
      prompt: "place this in a professional photography studio with perfect lighting",
    },
    {
      icon: <Workflow className="w-4 h-4" />,
      title: "Multi-step: Upscale then reframe",
      prompt: "upscale this image to higher quality and then reframe to landscape",
    },
    {
      icon: <Layers className="w-4 h-4" />,
      title: "Multi-step: Enhance and transform",
      prompt: "first upscale this image, then change the lighting to sunset",
    },
    {
      icon: <Sparkles className="w-4 h-4" />,
      title: "Multi-step: Quality and format",
      prompt: "enhance image quality with upscaling then change to square format",
    },
    // Background & Object Editing
    {
      icon: <Eraser className="w-4 h-4" />,
      title: "Remove background",
      prompt: "remove the background from this image for clean product shots",
    },
    {
      icon: <Trash2 className="w-4 h-4" />,
      title: "Remove unwanted objects",
      prompt: "remove the unwanted objects from this photo while keeping the main subject",
    },
    {
      icon: <FlipHorizontal className="w-4 h-4" />,
      title: "Mirror magic effect",
      prompt: "create a mirror magic effect with this image for artistic presentation",
    },
    // Advanced Enhancement
    {
      icon: <ZoomIn className="w-4 h-4" />,
      title: "Chain of zoom enhancement",
      prompt: "create a chain of zoom effect with multiple resolution levels",
    },
    {
      icon: <Eye className="w-4 h-4" />,
      title: "Clarity upscaler",
      prompt: "enhance image clarity and sharpness with advanced upscaling",
    },
    {
      icon: <Camera className="w-4 h-4" />,
      title: "Analyze image content",
      prompt: "analyze this image and describe its visual elements and composition",
    },
    // Video Advanced Features
    {
      icon: <Crop className="w-4 h-4" />,
      title: "Video outpainting",
      prompt: "expand the video frame with outpainting to create wider scenes",
    },
    {
      icon: <Monitor className="w-4 h-4" />,
      title: "Video reframe",
      prompt: "reframe this video to landscape format for YouTube",
    },
    {
      icon: <ArrowUpCircle className="w-4 h-4" />,
      title: "Video upscaling",
      prompt: "upscale this video to higher resolution with enhanced quality",
    },
    // Preset Combination Examples
    {
      icon: <Shirt className="w-4 h-4" />,
      title: "Minimalist T-shirt Design",
      prompt: "Create a clean, minimal design composition",
      presets: {
        preset_product_type: "tshirt",
        preset_design_style: "minimalist",
        preset_color_palette: "neutral"
      },
      defaultImages: {
        product: "/inputs/placeholders/t-shirt.svg",
        design: "/inputs/placeholders/fashion/minimalist.webp",
        color: "/inputs/placeholders/colors/neutral.webp"
      }
    },
    {
      icon: <Watch className="w-4 h-4" />,
      title: "Luxury Watch Design",
      prompt: "Design an elegant timepiece with premium details",
      presets: {
        preset_product_type: "watches",
        preset_design_style: "luxury",
        preset_color_palette: "jewel"
      },
      defaultImages: {
        product: "/inputs/placeholders/watches.svg",
        design: "/inputs/placeholders/fashion/luxury.webp",
        color: "/inputs/placeholders/colors/jewel.webp"
      }
    },
    {
      icon: <Coffee className="w-4 h-4" />,
      title: "Artisan Coffee Mug",
      prompt: "Create a handcrafted ceramic mug with artistic patterns",
      presets: {
        preset_product_type: "coffecup",
        preset_design_style: "artistic",
        preset_color_palette: "earth"
      },
      defaultImages: {
        product: "/inputs/placeholders/coffeecup.svg",
        design: "/inputs/placeholders/general/artistic.webp",
        color: "/inputs/placeholders/colors/earth.webp"
      }
    },
    {
      icon: <Smartphone className="w-4 h-4" />,
      title: "Futuristic Phone Case",
      prompt: "Design a cutting-edge phone case with advanced features",
      presets: {
        preset_product_type: "phonecase",
        preset_design_style: "futuristic",
        preset_color_palette: "neon"
      },
      defaultImages: {
        product: "/inputs/placeholders/phonecase.svg",
        design: "/inputs/placeholders/general/futuristic.webp",
        color: "/inputs/placeholders/colors/neon.webp"
      }
    },
    {
      icon: <Gem className="w-4 h-4" />,
      title: "Romantic Earrings",
      prompt: "Create sophisticated earrings with romantic details",
      presets: {
        preset_product_type: "earrings",
        preset_design_style: "romantic",
        preset_color_palette: "romantic"
      },
      defaultImages: {
        product: "/inputs/placeholders/earrings.svg",
        design: "/inputs/placeholders/general/romantic.webp",
        color: "/inputs/placeholders/colors/romantic.webp"
      }
    },
    {
      icon: <Sofa className="w-4 h-4" />,
      title: "Modern Sofa Design",
      prompt: "Design a comfortable sofa with contemporary aesthetics",
      presets: {
        preset_product_type: "sofa",
        preset_design_style: "minimalsleek",
        preset_color_palette: "cool"
      },
      defaultImages: {
        product: "/inputs/placeholders/sofa.svg",
        design: "/inputs/placeholders/bags/minimalsleeksophisticated.webp",
        color: "/inputs/placeholders/colors/cool.webp"
      }
    },
    {
      icon: <Glasses className="w-4 h-4" />,
      title: "Vintage Sunglasses",
      prompt: "Create retro-style sunglasses with classic appeal",
      presets: {
        preset_product_type: "glasses",
        preset_design_style: "vintagefeel",
        preset_color_palette: "vintage"
      },
      defaultImages: {
        product: "/inputs/placeholders/glasses.svg",
        design: "/inputs/placeholders/fashion/vintage feel.webp",
        color: "/inputs/placeholders/colors/vintage.webp"
      }
    },
    {
      icon: <Laptop className="w-4 h-4" />,
      title: "Bold Notebook Design",
      prompt: "Design a striking notebook with bold graphics",
      presets: {
        preset_product_type: "notebook",
        preset_design_style: "bold",
        preset_color_palette: "vibrant"
      },
      defaultImages: {
        product: "/inputs/placeholders/notebook.svg",
        design: "/inputs/placeholders/general/bold.webp",
        color: "/inputs/placeholders/colors/vibrant.webp"
      }
    },
    {
      icon: <Car className="w-4 h-4" />,
      title: "Sporty Vehicle Design",
      prompt: "Create a dynamic vehicle with aerodynamic features",
      presets: {
        preset_product_type: "vehicles",
        preset_design_style: "sportysleek",
        preset_color_palette: "cyberpunk"
      },
      defaultImages: {
        product: "/inputs/placeholders/vehicles.svg",
        design: "/inputs/placeholders/general/sportysleek.webp",
        color: "/inputs/placeholders/colors/cyberpunk.webp"
      }
    },
    {
      icon: <Headphones className="w-4 h-4" />,
      title: "Fun Colorful Toy",
      prompt: "Design a playful toy with bright colors and whimsical patterns",
      presets: {
        preset_product_type: "toys",
        preset_design_style: "funcoolquriky",
        preset_color_palette: "tropical"
      },
      defaultImages: {
        product: "/inputs/placeholders/toys.svg",
        design: "/inputs/placeholders/general/funcoolquriky.webp",
        color: "/inputs/placeholders/colors/tropical.webp"
      }
    },
  ];

  // Randomly select 8 prompts each time the component renders to showcase variety
  const examplePrompts = useMemo(() => {
    const shuffled = [...allExamplePrompts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  }, []);

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
