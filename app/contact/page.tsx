'use client';
import { useState, ChangeEvent } from 'react';
import Footer from '../components/footer';
import Header from '../components/header';
import { Icon } from "@iconify/react";

export default function PromptContainer() {
  const [prompt, setPrompt] = useState<string>('');
  const [images, setImages] = useState<File[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  
  const suggestions = [
    {
      id: "general-inquiry",
      label: "General inquiry",
      icon: "solar:chat-line-linear",
    },
    {
      id: "technical-support",
      label: "Technical support",
      icon: "solar:headphones-round-linear",
    },
    {
      id: "billing-issues",
      label: "Billing",
      icon: "solar:wallet-2-linear",
    },
    {
      id: "account-help",
      label: "Account assistance",
      icon: "solar:user-circle-linear",
    },
    {
      id: "report-problem",
      label: "Report a problem",
      icon: "solar:bug-linear",
    },
    {
      id: "feature-request",
      label: "Suggest a feature",
      icon: "solar:lightbulb-linear",
    },
    {
      id: "business-inquiry",
      label: "Business inquiry",
      icon: "solar:backpack-outline",
    },
  ];

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };
  
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setImages(prevImages => [...prevImages, ...files]);
    const newPreviewImages = files.map(file => URL.createObjectURL(file));
    setPreviewImages(prevImages => [...prevImages, ...newPreviewImages]);
  };
  
  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
    URL.revokeObjectURL(previewImages[index]);
    setPreviewImages(previewImages.filter((_, i) => i !== index));
  };
  
  const handleSubmit = () => {
    console.log('Submitted prompt:', prompt);
    console.log('Submitted images:', images);
  };
  
  const handleSuggestionClick = (suggestionText: string) => {
    setPrompt(suggestionText);
  };
  
  return (
    <>
    <Header></Header>
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-black p-4 md:p-0">
      <h2 className="font-medium leading-7 dark:text-purple-600 text-blue-600">Contact Us</h2>
      <h1 className="text-3xl font-semibold leading-9 text-black dark:text-white mb-8 p-2 md:p-0 text-center">
        How Can We Help You Today?
      </h1>
      <div className="w-full max-w-2xl bg-[#f4f4f5] dark:bg-[#27272a] rounded-lg p-4">
        <div className="flex flex-col space-y-4">
          {/* Preview images */}
          {previewImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previewImages.map((url, index) => (
                <div key={index} className="relative">
                  <img 
                    src={url} 
                    alt={`Preview ${index}`} 
                    className="h-18 w-18 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-black text-white rounded-full w-6 h-6 flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Prompt input and buttons */}
          <div className="flex items-end space-x-2">
            <div className="flex-grow relative">
              <textarea
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Enter your query here"
                className="w-full bg-transparent border-none outline-none resize-none text-black dark:text-white text-lg min-h-[45px]"
                rows={2}
                style={{ height: 'auto' }}
                onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                  // Auto-resize the textarea
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = target.scrollHeight + 'px';
                }}
              />
            </div>
          </div>
          <div className='w-full flex flex-row justify-between'>
            {/* Upload button */}
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <div className={`p-2 rounded-full ${prompt ? 'text-gray-400' : 'text-gray-400'}`}>
                <Icon icon="solar:paperclip-outline" width="22" height="22" />
              </div>
            </label>
            {/* Submit button */}
            <button
              onClick={handleSubmit}
              className={`p-2 rounded-full transition-colors duration-200 ${
                prompt || images.length > 0 ? 'bg-blue-500' : 'bg-gray-400'
              }`}
              disabled={!prompt && images.length === 0}
            >
              <Icon icon="solar:arrow-up-outline" width="22" height="22" color="#fff" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Suggestion chips */}
      <div className="hidden md:flex flex-wrap justify-center gap-2 mt-6 w-full md:max-w-4xl px-4">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => handleSuggestionClick(suggestion.label)}
            className="flex items-center gap-1 px-4 py-2 dark:text-white  rounded-full border dark:border-[#3f3f46] dark:hover:bg-[#27272a] transition-colors duration-200"
          >
            <Icon icon={suggestion.icon} width="16" height="16" />
            <span>{suggestion.label}</span>
          </button>
        ))}
      </div>
    </div>
    <Footer></Footer>
    </>
  );
}