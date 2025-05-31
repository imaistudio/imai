'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

interface AnalysisResult {
  colors?: {
    primary?: string[]
    contrast?: string
  } | string[]
  shapes?: {
    dominant?: string
    accents?: string
  } | string[]
  patterns?: {
    background?: string
    foreground?: string
  } | string[]
  textures?: {
    background?: string
    foreground?: string
  } | string[]
  composition?: {
    focus?: string
    movement?: string
    balance?: string
  } | string
  raw_analysis?: string
}

export default function ImageAnalyzer() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [base64Image, setBase64Image] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove the data:image/...;base64, prefix
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = error => reject(error)
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB')
      return
    }

    try {
      setError('')
      setAnalysis(null)
      
      // Create preview URL
      const imageUrl = URL.createObjectURL(file)
      setSelectedImage(imageUrl)

      // Convert to base64
      const base64 = await convertToBase64(file)
      setBase64Image(base64)
    } catch (err) {
      setError('Failed to process image')
      console.error('Error processing image:', err)
    }
  }

  const analyzeImage = async () => {
    if (!base64Image) {
      setError('Please select an image first')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/analyzeimage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Image: base64Image,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze image')
      }

      setAnalysis(data.result)
    } catch (err: any) {
      setError(err.message || 'Failed to analyze image')
      console.error('Error analyzing image:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const resetUpload = () => {
    setSelectedImage(null)
    setBase64Image('')
    setAnalysis(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const renderColorSection = (colors: any) => {
    if (!colors) return null

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-red-400 to-purple-500 rounded-full mr-3"></div>
          <h3 className="text-xl font-bold text-gray-800">Colors</h3>
        </div>
        
        {colors.primary && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Primary Colors</h4>
            <div className="flex flex-wrap gap-2">
              {colors.primary.map((color: string, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium border"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {colors.contrast && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Contrast Analysis</h4>
            <p className="text-gray-700 leading-relaxed">{colors.contrast}</p>
          </div>
        )}
      </div>
    )
  }

  const renderShapesSection = (shapes: any) => {
    if (!shapes) return null

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-lg mr-3"></div>
          <h3 className="text-xl font-bold text-gray-800">Shapes</h3>
        </div>
        
        {shapes.dominant && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Dominant Forms</h4>
            <p className="text-gray-700 leading-relaxed bg-blue-50 p-3 rounded-md">{shapes.dominant}</p>
          </div>
        )}
        
        {shapes.accents && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Accent Elements</h4>
            <p className="text-gray-700 leading-relaxed">{shapes.accents}</p>
          </div>
        )}
      </div>
    )
  }

  const renderPatternsSection = (patterns: any) => {
    if (!patterns) return null

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full mr-3"></div>
          <h3 className="text-xl font-bold text-gray-800">Patterns</h3>
        </div>
        
        <div className="space-y-4">
          {patterns.background && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Background</h4>
              <p className="text-gray-700 leading-relaxed bg-green-50 p-3 rounded-md">{patterns.background}</p>
            </div>
          )}
          
          {patterns.foreground && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Foreground</h4>
              <p className="text-gray-700 leading-relaxed">{patterns.foreground}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderTexturesSection = (textures: any) => {
    if (!textures) return null

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-amber-400 to-orange-500 rounded-lg mr-3"></div>
          <h3 className="text-xl font-bold text-gray-800">Textures</h3>
        </div>
        
        <div className="space-y-4">
          {textures.background && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Background Texture</h4>
              <p className="text-gray-700 leading-relaxed bg-amber-50 p-3 rounded-md">{textures.background}</p>
            </div>
          )}
          
          {textures.foreground && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Foreground Texture</h4>
              <p className="text-gray-700 leading-relaxed">{textures.foreground}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderCompositionSection = (composition: any) => {
    if (!composition) return null

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full mr-3"></div>
          <h3 className="text-xl font-bold text-gray-800">Composition</h3>
        </div>
        
        {/* Handle both object and string formats */}
        {typeof composition === 'object' ? (
          <div className="space-y-4">
            {composition.focus && (
              <div>
                <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Focus Point</h4>
                <p className="text-gray-700 leading-relaxed bg-purple-50 p-3 rounded-md">{composition.focus}</p>
              </div>
            )}
            
            {composition.movement && (
              <div>
                <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Visual Movement</h4>
                <p className="text-gray-700 leading-relaxed">{composition.movement}</p>
              </div>
            )}
            
            {composition.balance && (
              <div>
                <h4 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">Balance</h4>
                <p className="text-gray-700 leading-relaxed bg-pink-50 p-3 rounded-md">{composition.balance}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-700 leading-relaxed">{composition}</p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <h1 className="text-2xl font-bold text-white">Image Design Analyzer</h1>
            <p className="text-blue-100 mt-1">Upload an image to analyze its design elements</p>
          </div>

          <div className="p-6">
            {/* Upload Section */}
            <div className="mb-8">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="cursor-pointer block"
                >
                  <div className="space-y-2">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium text-blue-600 hover:text-blue-500">
                        Click to upload
                      </span>{' '}
                      or drag and drop
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Image Preview and Controls */}
            {selectedImage && (
              <div className="mb-8">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Image Preview */}
                  <div className="lg:w-1/2">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Selected Image</h2>
                    <div className="relative rounded-lg overflow-hidden border border-gray-200">
                      <Image
                        src={selectedImage}
                        alt="Selected image for analysis"
                        width={400}
                        height={300}
                        className="w-full h-auto object-contain max-h-96"
                      />
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="lg:w-1/2">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Actions</h2>
                    <div className="space-y-3">
                      <button
                        onClick={analyzeImage}
                        disabled={isLoading || !base64Image}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-md transition-colors flex items-center justify-center"
                      >
                        {isLoading ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Analyzing...
                          </>
                        ) : (
                          'Analyze Image'
                        )}
                      </button>
                      
                      <button
                        onClick={resetUpload}
                        className="w-full bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-md transition-colors"
                      >
                        Upload New Image
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Results */}
            {analysis && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-800 mb-2">Design Analysis Results</h2>
                  <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
                </div>
                
                <div className="space-y-6">
                  {/* Colors Section */}
                  {renderColorSection(analysis.colors)}
                  
                  {/* Shapes Section */}
                  {renderShapesSection(analysis.shapes)}
                  
                  {/* Patterns Section */}
                  {renderPatternsSection(analysis.patterns)}
                  
                  {/* Textures Section */}
                  {renderTexturesSection(analysis.textures)}
                  
                  {/* Composition Section */}
                  {renderCompositionSection(analysis.composition)}
                </div>
                
                {analysis.raw_analysis && (
                  <div className="mt-8 pt-8 border-t border-gray-300">
                    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
                      <div className="flex items-center mb-4">
                        <div className="w-8 h-8 bg-gray-400 rounded mr-3"></div>
                        <h3 className="text-xl font-bold text-gray-800">Raw Analysis</h3>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 border">
                        <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono">
                          {analysis.raw_analysis}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}