'use client';

import { useState, useEffect } from 'react';
import Footer from "../components/footer";
import Header from "../components/header";

interface DesignResult {
  status: string;
  output_image?: string;
  cloudinaryUrl?: string;
  localPath?: string;
  workflow_type?: string;
  generated_prompt?: string;
  note?: string;
  error?: string;
}

export default function DesignPage() {
  const [prompt, setPrompt] = useState('');
  const [n, setN] = useState(1);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [designImage, setDesignImage] = useState<File | null>(null);
  const [colorImage, setColorImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DesignResult | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{
    product?: string;
    design?: string;
    color?: string;
  }>({});

  // Auto-detect workflow based on inputs
  const [detectedWorkflow, setDetectedWorkflow] = useState<string>('');
  const [workflowDescription, setWorkflowDescription] = useState<string>('');

  const workflowInfo = {
    'full_composition': { label: 'Full Composition', description: 'Combining product + design + color references', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' },
    'product_color': { label: 'Product + Color', description: 'Applying color scheme to existing product', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
    'product_design': { label: 'Product + Design', description: 'Applying design patterns to existing product', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
    'color_design': { label: 'Color + Design', description: 'Creating new product from references', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' },
    'prompt_only': { label: 'Prompt Only', description: 'Generating product from text description', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300' },
    'product_prompt': { label: 'Product + Prompt', description: 'Enhancing existing product with custom instructions', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-300' }
  };

  // Parse prompt for size and quality preferences
  const parsePromptPreferences = (promptText: string) => {
    const lowerPrompt = promptText.toLowerCase();

    // Default values
    let size = '1024x1024'; // Always square unless specified
    let quality = 'hd'; // Always HD unless specified

    // Size detection
    if (lowerPrompt.includes('portrait') || lowerPrompt.includes('tall') || lowerPrompt.includes('vertical')) {
      size = '1024x1792';
    } else if (lowerPrompt.includes('landscape') || lowerPrompt.includes('wide') || lowerPrompt.includes('horizontal')) {
      size = '1792x1024';
    }

    // Quality detection - only override if explicitly mentioned as lower quality
    if (lowerPrompt.includes('standard quality') || lowerPrompt.includes('basic quality') || lowerPrompt.includes('lower quality')) {
      quality = 'standard';
    }

    return { size, quality };
  };

  // Auto-detect workflow whenever inputs change
  useEffect(() => {
    const hasProduct = !!productImage;
    const hasDesign = !!designImage;
    const hasColor = !!colorImage;
    const hasPrompt = !!prompt.trim();

    let workflow = '';
    let description = '';

    if (hasProduct && hasDesign && hasColor) {
      workflow = 'full_composition';
      description = 'Perfect! I&apos;ll combine all three references to create a comprehensive design.';
    } else if (hasProduct && hasColor && !hasDesign) {
      workflow = 'product_color';
      description = 'I&apos;ll apply the color scheme from your reference to the product.';
    } else if (hasProduct && hasDesign && !hasColor) {
      workflow = 'product_design';
      description = 'I&apos;ll apply the design patterns and style to your product.';
    } else if (hasProduct && hasPrompt && !hasDesign && !hasColor) {
      workflow = 'product_prompt';
      description = 'I&apos;ll enhance your product based on your custom instructions.';
    } else if ((hasDesign || hasColor) && hasPrompt && !hasProduct) {
      workflow = 'color_design';
      description = 'I&apos;ll create a new product inspired by your references and description.';
    } else if (hasPrompt && !hasProduct && !hasDesign && !hasColor) {
      workflow = 'prompt_only';
      description = 'I&apos;ll generate a completely new product from your description.';
    } else if (hasProduct && !hasPrompt && !hasDesign && !hasColor) {
      workflow = '';
      description = 'Add design references, color references, or a custom prompt to get started.';
    } else if ((hasDesign || hasColor) && !hasPrompt && !hasProduct) {
      workflow = '';
      description = 'Add a text prompt describing what kind of product you want to create.';
    } else if ((hasProduct || hasDesign || hasColor) && !hasPrompt) {
      workflow = '';
      description = 'Looking good! Add more references or a custom prompt to complete your request.';
    } else {
      workflow = '';
      description = 'Upload images or enter a prompt to get started with AI design generation.';
    }

    setDetectedWorkflow(workflow);
    setWorkflowDescription(description);
  }, [productImage, designImage, colorImage, prompt]);

  const handleFileChange = (type: 'product' | 'design' | 'color', file: File | null) => {
    if (type === 'product') {
      setProductImage(file);
      if (file) {
        setPreviewUrls(prev => ({ ...prev, product: URL.createObjectURL(file) }));
      } else {
        setPreviewUrls(prev => ({ ...prev, product: undefined }));
      }
    } else if (type === 'design') {
      setDesignImage(file);
      if (file) {
        setPreviewUrls(prev => ({ ...prev, design: URL.createObjectURL(file) }));
      } else {
        setPreviewUrls(prev => ({ ...prev, design: undefined }));
      }
    } else if (type === 'color') {
      setColorImage(file);
      if (file) {
        setPreviewUrls(prev => ({ ...prev, color: URL.createObjectURL(file) }));
      } else {
        setPreviewUrls(prev => ({ ...prev, color: undefined }));
      }
    }
  };

  const validateForm = () => {
    if (!detectedWorkflow) {
      return 'Please provide the necessary inputs to automatically detect a workflow.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();

      if (productImage) formData.append('product_image', productImage);
      if (designImage) formData.append('design_image', designImage);
      if (colorImage) formData.append('color_image', colorImage);

      formData.append('workflow_type', detectedWorkflow);
      if (prompt.trim()) formData.append('prompt', prompt);

      // Parse size and quality from prompt, use defaults if not specified
      const { size, quality } = parsePromptPreferences(prompt);
      formData.append('size', size);
      formData.append('quality', quality);
      formData.append('n', n.toString());

      console.log(`[DEBUG] Auto-detected: Size=${size}, Quality=${quality}`);

      const response = await fetch('/api/design', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
      setResult({
        status: 'error',
        error: 'Failed to process request'
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setProductImage(null);
    setDesignImage(null);
    setColorImage(null);
    setPrompt('');
    setResult(null);
    setPreviewUrls({});
  };

  const workflowInfo_current = detectedWorkflow ? workflowInfo[detectedWorkflow as keyof typeof workflowInfo] : null;

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              AI Product Design Composer
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Just upload images or enter a prompt - I&apos;ll automatically detect the best workflow for you
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              {/* Workflow Detection Display */}
              <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
                <div className="text-center">
                  <div className="mb-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Auto-detected workflow:</span>
                  </div>
                  {detectedWorkflow && workflowInfo_current ? (
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${workflowInfo_current.color} mb-2`}>
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {workflowInfo_current.label}
                    </div>
                  ) : (
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 mb-2">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      Waiting for input...
                    </div>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {workflowDescription}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Image Uploads */}
                <div className="space-y-4">
                  {/* Product Image */}
                  <div>
                    <label htmlFor="product-image-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Product Image
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (Upload your base product to modify or enhance)
                      </span>
                    </label>
                    <input
                      id="product-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('product', e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {previewUrls.product && (
                      <div className="mt-2 relative inline-block">
                        <img src={previewUrls.product} alt="Product preview" className="h-20 w-20 object-cover rounded-lg border-2 border-blue-200" />
                        <button
                          type="button"
                          onClick={() => handleFileChange('product', null)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Design Image */}
                  <div>
                    <label htmlFor="design-image-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Design Reference
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (Upload an image with patterns, textures, or style you want to apply)
                      </span>
                    </label>
                    <input
                      id="design-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('design', e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    />
                    {previewUrls.design && (
                      <div className="mt-2 relative inline-block">
                        <img src={previewUrls.design} alt="Design preview" className="h-20 w-20 object-cover rounded-lg border-2 border-green-200" />
                        <button
                          type="button"
                          onClick={() => handleFileChange('design', null)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Color Image */}
                  <div>
                    <label htmlFor="color-image-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Color Reference
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (Upload an image with colors, materials, or finishes you want to use)
                      </span>
                    </label>
                    <input
                      id="color-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('color', e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    {previewUrls.color && (
                      <div className="mt-2 relative inline-block">
                        <img src={previewUrls.color} alt="Color preview" className="h-20 w-20 object-cover rounded-lg border-2 border-purple-200" />
                        <button
                          type="button"
                          onClick={() => handleFileChange('color', null)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Prompt */}
                <div>
                  <label htmlFor="custom-instructions-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Custom Instructions
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (Describe your vision, style preferences, or specific modifications)
                    </span>
                  </label>
                  <textarea
                    id="custom-instructions-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., &apos;Make it more luxurious with gold accents&apos;, &apos;Create a modern minimalist backpack in portrait orientation&apos;, &apos;Apply a vintage leather texture in landscape format&apos;..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white placeholder-gray-400"
                  />
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    💡 <strong>Smart detection:</strong> Defaults to square HD images. Mention &quot;portrait&quot;, &quot;landscape&quot;, &quot;wide&quot;, &quot;tall&quot; for different sizes. Quality is always HD unless you specify &quot;standard quality&quot;.
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading || !detectedWorkflow}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating...
                      </div>
                    ) : (
                      `Generate Design ${detectedWorkflow && workflowInfo_current ? `(${workflowInfo_current.label})` : ''}`
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-3 border border-gray-300 text-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>

            {/* Results Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Generated Design
              </h3>

              {loading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-300">
                      {detectedWorkflow && workflowInfo_current ? `Running ${workflowInfo_current.label}...` : 'Processing...'}
                    </p>
                  </div>
                </div>
              )}

              {result && !loading && (
                <div className="space-y-4">
                  {result.status === 'success' ? (
                    <>
                      {result.output_image && (
                        <div className="text-center">
                          <img
                            src={`data:image/png;base64,${result.output_image}`}
                            alt="Generated design"
                            className="max-w-full h-auto rounded-lg shadow-md mx-auto"
                          />
                        </div>
                      )}

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Workflow:</span>
                          <span className="text-gray-900 dark:text-white">{result.workflow_type}</span>
                        </div>
                        {result.cloudinaryUrl && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Cloud URL:</span>
                            <a href={result.cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">View</a>
                          </div>
                        )}
                        {result.localPath && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Saved to:</span>
                            <span className="text-gray-900 dark:text-white text-xs">{result.localPath}</span>
                          </div>
                        )}
                      </div>

                      {result.note && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                          <p className="text-sm text-green-800 dark:text-green-200">{result.note}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                      <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Error</h4>
                      <p className="text-sm text-red-600 dark:text-red-300">{result.error}</p>
                    </div>
                  )}
                </div>
              )}

              {!result && !loading && (
                <div className="text-center text-gray-500 dark:text-gray-400 h-64 flex items-center justify-center">
                  <div>
                    <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2">Your generated design will appear here</p>
                    {detectedWorkflow && (
                      <p className="text-xs mt-1 text-gray-400">
                        Ready to run: {workflowInfo_current?.label}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}