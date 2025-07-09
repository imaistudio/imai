"use client";

import React from 'react';
import { Sparkles, Palette, Wand2, Camera, Heart, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMAIIcon } from "@/app/components/imai";

interface WelcomeScreenProps {
  onExampleClick: (prompt: string) => void;
}

export default function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  const examplePrompts = [
    {
      icon: <Sparkles className="w-4 h-4" />,
      title: "Design a modern backpack",
      prompt: "Create a sleek, modern backpack design with minimalist aesthetics and functional compartments"
    },
    {
      icon: <Palette className="w-4 h-4" />,
      title: "Generate color palette",
      prompt: "Create a warm autumn color palette for a cozy fashion collection"
    },
    {
      icon: <Wand2 className="w-4 h-4" />,
      title: "Style a living room",
      prompt: "Design a contemporary living room with neutral tones and natural materials"
    },
    {
      icon: <Camera className="w-4 h-4" />,
      title: "Product photography",
      prompt: "Create a professional product photo setup for luxury jewelry"
    },
    {
      icon: <Heart className="w-4 h-4" />,
      title: "Wedding dress design",
      prompt: "Design an elegant wedding dress with vintage lace details and modern silhouette"
    },
    {
      icon: <Zap className="w-4 h-4" />,
      title: "Tech gadget concept",
      prompt: "Create a futuristic smartwatch design with health monitoring features"
    }
  ];

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
