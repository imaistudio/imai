"use client"
import React, { useState, useRef } from 'react';
import { Upload, Wand2, Download, Eye, Loader2, Image, Sparkles } from 'lucide-react';

interface MirrorMagicResponse {
  status: string;
  output_image?: string;
  cloudinaryUrl?: string;
  localPath?: string;
  analysis?: string;
  enhanced_prompt?: string;
  metadata_path?: string;
  note?: string;
  error?: string;
}

export default function MirrorMagicPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [workflow, setWorkflow] = useState('standard');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('high');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MirrorMagicResponse | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setResult(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setResult(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('prompt', prompt);
      formData.append('workflow', workflow);
      formData.append('size', size);
      formData.append('quality', quality);
      formData.append('n', '1');

      const response = await fetch('/api/mirrormagic', {
        method: 'POST',
        body: formData,
      });

      const data: MirrorMagicResponse = await response.json();
      setResult(data);

      if (data.status !== 'success') {
        console.error('Mirror Magic error:', data.error);
      }
    } catch (error) {
      console.error('Request failed:', error);
      setResult({
        status: 'error',
        error: 'Failed to process request. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mirror-magic-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-12 h-12 text-purple-400 mr-3" />
            <h1 className="text-5xl font-bold text-white">Mirror Magic Demo</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Upload className="w-6 h-6 mr-2" />
              Upload & Configure
            </h2>

            <div onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload */}
              <div
                className="border-2 border-dashed border-purple-400 rounded-xl p-8 text-center cursor-pointer hover:border-purple-300 transition-colors"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {previewUrl ? (
                  <div className="space-y-4">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-w-full max-h-48 mx-auto rounded-lg shadow-lg"
                    />
                    <p className="text-green-400 font-medium">{selectedFile?.name}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Image className="w-16 h-16 text-purple-400 mx-auto" />
                    <div className="text-white">
                      <p className="text-lg font-medium">Drop your image here</p>
                      <p className="text-gray-300">or click to browse</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Prompt Input */}
              <div>
                <label className="block text-white font-medium mb-2">
                  Additional Prompt (Optional)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe how you'd like to transform the image..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                  rows={3}
                />
              </div>

              {/* Workflow Selection */}
              <div>
                <label className="block text-white font-medium mb-2">Workflow</label>
                <select
                  value={workflow}
                  onChange={(e) => setWorkflow(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                >
                  <option value="standard">Standard - Full Generation</option>
                  <option value="remix">Remix - Creative Interpretation</option>
                  <option value="black_mirror">Black Mirror - Image Editing</option>
                </select>
              </div>

              {/* Size and Quality */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Size</label>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                  >
                    <option value="1024x1024">Square (1024×1024)</option>
                    <option value="1024x1792">Portrait (1024×1792)</option>
                    <option value="1792x1024">Landscape (1792×1024)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white font-medium mb-2">Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!selectedFile || loading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Transforming...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    <span>Apply Mirror Magic</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Section */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Eye className="w-6 h-6 mr-2" />
              Results
            </h2>

            {loading && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-white text-lg">AI is working its magic...</p>
                <p className="text-gray-300 text-sm mt-2">This may take 30-60 seconds</p>
              </div>
            )}

            {result && result.status === 'success' && (
              <div className="space-y-6">
                {/* Generated Image */}
                <div className="relative">
                  <img
                    src={result.cloudinaryUrl || result.output_image}
                    alt="Generated result"
                    className="w-full rounded-lg shadow-lg"
                  />
                  <button
                    onClick={() => downloadImage(result.cloudinaryUrl || result.output_image!)}
                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>

                {/* Workflow Note */}
                {result.note && (
                  <div className="bg-purple-500/20 border border-purple-400/30 rounded-lg p-4">
                    <p className="text-purple-200 text-sm font-medium">{result.note}</p>
                  </div>
                )}

                {/* Enhanced Prompt */}
                {result.enhanced_prompt && (
                  <div className="bg-blue-500/20 border border-blue-400/30 rounded-lg p-4">
                    <h3 className="text-blue-200 font-medium mb-2">Enhanced Prompt:</h3>
                    <p className="text-blue-100 text-sm">{result.enhanced_prompt}</p>
                  </div>
                )}

                {/* Analysis Toggle */}
                {result.analysis && (
                  <div>
                    <button
                      onClick={() => setShowAnalysis(!showAnalysis)}
                      className="text-gray-300 hover:text-white transition-colors mb-2 flex items-center space-x-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{showAnalysis ? 'Hide' : 'Show'} Image Analysis</span>
                    </button>
                    
                    {showAnalysis && (
                      <div className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-4">
                        <p className="text-gray-200 text-sm">{result.analysis}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {result && result.status === 'error' && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-6 text-center">
                <p className="text-red-200 font-medium mb-2">Something went wrong</p>
                <p className="text-red-300 text-sm">{result.error}</p>
              </div>
            )}

            {!loading && !result && (
              <div className="text-center py-12 text-gray-400">
                <Image className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Upload an image to see the magic happen!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}