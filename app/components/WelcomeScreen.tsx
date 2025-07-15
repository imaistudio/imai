"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { IMAIIcon } from "@/app/components/imai";
import UnifiedPromptContainer from "@/app/components/unified-prompt-container";

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
  onPromptSubmit?: (data: any) => void;
}

export default function WelcomeScreen({ onExampleClick, onPromptSubmit }: WelcomeScreenProps) {
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
        "Design a premium urban backpack with water-resistant matte textures, anti-theft compartments, magnetic closures, and hidden laptop sleeves. Emphasize a sleek, all-black aesthetic with modular interior organization for tech, travel, and daily use.",
    },
    {
      title: "Design a ceramic coffee mug",
      prompt:
        "Create a high-end ceramic mug collection featuring matte-glazed finishes, sculpted ergonomic handles, and artisanal, hand-painted geometric motifs. Designed for both functional comfort and contemporary kitchen display.",
    },
    {
      title: "Create luxury handbag",
      prompt:
        "Design an elegant, structured luxury handbag crafted from full-grain Italian leather, featuring gold-plated hardware, a detachable crossbody strap, and suede-lined compartments. Style for upscale urban fashion and timeless appeal.",
    },
    {
      title: "Design running shoes",
      prompt: "Create ultra-lightweight performance running shoes with responsive foam soles, knit mesh uppers for breathability, and an adaptive lacing system. Combine performance-driven engineering with futuristic streetwear styling.",
    },
    {
      title: "Wedding dress design",
      prompt:
        "Design a couture wedding gown featuring delicate Chantilly lace, a sculpted bodice with corset detailing, and a flowing silk chiffon skirt. Embellish with hand-sewn crystals for an ethereal, modern bridal silhouette.",
    },
    {
      title: "Tech gadget concept",
      prompt:
        "Envision a next-gen smartwatch with a frameless holographic display, biometric sensors for full-body analytics, gesture control, and modular AI-driven personalization. Combine utility with sleek wearable design.",
    },
    {
      title: "Design a desk organizer",
      prompt:
        "Create a modular desk organizer system made of sustainable bamboo and anodized aluminum, featuring magnetic connectors, stackable trays, and cable management zones. Tailored for productivity and minimalism.",
    },
    {
      title: "Streetwear collection",
      prompt:
        "Design a rebellious streetwear drop featuring oversized silhouettes, techwear layering, graffiti-inspired digital prints, and eco-conscious materials. Target youth culture and drop culture aesthetics.",
    },
    {
      title: "Luxury timepiece",
      prompt:
        "Design an heirloom-grade luxury watch with skeleton dial, Swiss tourbillon movement, sapphire crystal casing, and interchangeable alligator straps. Inspired by architectural precision and timeless masculinity.",
    },
    {
      title: "Gemstone jewelry",
      prompt:
        "Create a statement jewelry piece—a platinum necklace featuring a radiant-cut emerald centerpiece surrounded by pavé diamonds, inspired by vintage Art Deco geometry with a modern, clean finish.",
    },
    {
      title: "Ergonomic office chair",
      prompt:
        "Design a premium ergonomic office chair with dynamic lumbar support, mesh airflow zones, memory foam seating, and minimalist frame aesthetics. Focus on posture science blended with executive design.",
    },
    {
      title: "Electric vehicle concept",
      prompt:
        "Create a concept design for an electric SUV with solar roof integration, aerodynamic glass curves, plant-based leather interiors, and intelligent AI driving interface. Style it for luxury, range, and sustainability.",
    },
    {
      title: "Create a children's toy",
      prompt:
        "Design a STEM-based educational toy for kids aged 5–10 that merges storytelling.",
    },
    {
      title: "Designer sunglasses",
      prompt:
        "Create an avant-garde sunglasses line with sculptural acetate frames, gradient polarized lenses, and bold architectural silhouettes. Emphasize both high fashion and functional UV tech.",
    },
    {
      title: "Premium headphones",
      prompt:
        "Design wireless over-ear headphones with adaptive noise cancelation, spatial audio processing, vegan leather cushions, and a minimal titanium finish. Blend studio-grade performance with lifestyle aesthetics.",
    },
    {
      title: "Phone case design",
      prompt:
        "Create a series of shock-absorbing, MagSafe-compatible phone cases with 3D-printed textures, soft microfiber interiors, and artistic overlays inspired by abstract and pop culture design trends.",
    },
    {
      title: "Design a leather wallet",
      prompt:
        "Design a bi-fold wallet using hand-tanned leather, RFID shielding layers, precision stitching, and pull-tab card access. Focus on luxury craftsmanship and modern slim profiles.",
    },
    {
      title: "Design a modern lamp",
      prompt:
        "Create a smart LED table lamp, a pivoting metallic armature, and integrated wireless charging base. Designed with Scandinavian minimalism and modular lighting zones.",
    },
    {
      title: "Design kitchen utensils",
      prompt:
        "Design a curated set of high-end kitchen utensils crafted from matte stainless steel. Each tool should feature ergonomic shaping, seamless joints, and a sculptural aesthetic.",
    },
    {
      title: "Hiking gear collection",
      prompt:
        "Develop a rugged hiking gear collection featuring waterproof layers, lightweight insulated jackets, modular backpacks with hydration ports, and ultragrip boots. Built for alpine weather and high-altitude terrain.",
    },
    {
      title: "Tropical Luxe – Summer Capsule",
      prompt:
        "Create a premium summer capsule collection featuring flowy maxi dresses, linen co-ord sets, relaxed resort shirts, and lightweight jumpsuits. Emphasize breathable fabrics like cotton, linen, and chiffon, using a palette of tropical brights, sunset gradients, and ocean-inspired pastels. laid-back, high-fashion vacation vibe.",
    },
    {
      title: "Evening wear collection",
      prompt:
        "Design an eveningwear collection for luxury galas and high-society events. Include floor-length satin gowns, plunging necklines, tailored velvet suits, and intricate beadwork. Focus on elegance, movement, and cinematic impact.",
    },
    {
      title: "Celebrity red carpet look",
      prompt:
        "Create a one-of-a-kind red carpet look for a global A-list celebrity. Combine sculptural couture tailoring with dramatic high-slits, sequin layering, and a rich color story. Photogenic under flash, with maximum press impact.",
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
    <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-4xl mx-auto px-4 py-8">
      {/* Logo and Header - Top */}
      <div className="flex flex-col items-center justify-center mb-8">
        <IMAIIcon className="text-black dark:text-white mb-4" size={48} />
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 text-center mb-2">
          Welcome to IMAI
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 text-center">
          Explore IMAI's Features
        </p>
      </div>

      {/* Example Prompts - Upper Middle */}
      <div className="w-full mb-8">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-4 pb-4" style={{ width: 'max-content' }}>
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

      {/* Unified Prompt Container - Center */}
      <div className="w-full max-w-2xl">
        <UnifiedPromptContainer
          onSubmit={onPromptSubmit}
          placeholder="What would you like to design today?"
        />
      </div>
    </div>
  );
}
