"use client"
import React, { useState } from 'react';
import { Upload, X, Image, Palette, Sparkles, Loader2 } from 'lucide-react';

interface FileState {
  product: File | null;
  design: File | null;
  color: File | null;
}

interface WorkflowOption {
  value: string;
  label: string;
  description: string;
  required: Array<keyof FileState>;
}

interface Result {
  status: string;
  detail: string;
  inputs: {
    workflowType: string;
    prompt: string;
    productImagePath?: string;
    designImagePath?: string;
    colorImagePath?: string;
  };
}

const ImageCompositionApp: React.FC = () => {
  const [files, setFiles] = useState<FileState>({
    product: null,
    design: null,
    color: null
  });
  const [workflowType, setWorkflowType] = useState<string>('full_composition');
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string>('');

  const workflowOptions: WorkflowOption[] = [
    {
      value: 'full_composition',
      label: 'Full Composition',
      description: 'Uses all three images: product, design, and color',
      required: ['product', 'design', 'color']
    },
    {
      value: 'product_color',
      label: 'Product + Color',
      description: 'Applies color palette to product',
      required: ['product', 'color']
    },
    {
      value: 'product_design',
      label: 'Product + Design',
      description: 'Applies design to product',
      required: ['product', 'design']
    },
    {
      value: 'color_design',
      label: 'Color + Design',
      description: 'Combines color and design (requires prompt)',
      required: ['color', 'design']
    }
  ];

  const currentWorkflow = workflowOptions.find(w => w.value === workflowType);

  const handleFileChange = (type: keyof FileState, file: File | null) => {
    if (!file) return;
    setFiles(prev => ({ ...prev, [type]: file }));
    setError('');
  };

  const removeFile = (type: keyof FileState) => {
    setFiles(prev => ({ ...prev, [type]: null }));
  };

  const validateForm = (): boolean => {
    if (!currentWorkflow) return false;
    const requiredFiles = currentWorkflow.required;
    const missingFiles = requiredFiles.filter(fileType => !files[fileType]);
    if (missingFiles.length > 0) {
      setError(`Missing required files: ${missingFiles.join(', ')}`);
      return false;
    }
    if (workflowType === 'color_design' && !prompt.trim()) {
      setError('Prompt is required for Color + Design workflow');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      if (files.product) formData.append('product', files.product);
      if (files.design) formData.append('design', files.design);
      if (files.color) formData.append('color', files.color);
      formData.append('workflowType', workflowType);
      if (prompt.trim()) formData.append('prompt', prompt);

      const response = await fetch('/api/composeproduct', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.status === 'success') {
        setResult(data);
      } else {
        setError(data.detail || 'An error occurred');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  interface FileUploadProps {
    type: keyof FileState;
    label: string;
    icon: React.ElementType;
    required: boolean;
  }

  const FileUpload: React.FC<FileUploadProps> = ({ type, label, icon: Icon, required }) => {
    const file = files[type];
    const isRequired = currentWorkflow?.required.includes(type) ?? false;

    return (
      <div className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
        isRequired ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}>
        <div className="text-center">
          <Icon className={`mx-auto h-12 w-12 ${isRequired ? 'text-blue-400' : 'text-gray-400'}`} />
          <div className="mt-4">
            <label htmlFor={`file-${type}`} className="cursor-pointer">
              <span className={`mt-2 block text-sm font-medium ${isRequired ? 'text-blue-900' : 'text-gray-900'}`}>
                {label} {isRequired && <span className="text-red-500">*</span>}
              </span>
              {file ? (
                <div className="mt-2 flex items-center justify-center space-x-2">
                  <span className="text-sm text-green-600">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(type)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <span className="mt-2 block text-sm text-gray-500">
                  Click to upload or drag and drop
                </span>
              )}
              <input
                id={`file-${type}`}
                name={`file-${type}`}
                type="file"
                className="sr-only"
                accept="image/*"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] || null;
                  handleFileChange(type, selectedFile);
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Image Composition Studio
          </h1>
          <p className="text-lg text-gray-600">
            Create stunning compositions by combining product, design, and color images
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="space-y-8">
            {/* Workflow Selection */}
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-3">
                Workflow Type
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {workflowOptions.map((option) => (
                  <div key={option.value}>
                    <input
                      type="radio"
                      id={`workflow-${option.value}`}
                      name="workflowType"
                      value={option.value}
                      checked={workflowType === option.value}
                      onChange={(e) => setWorkflowType(e.target.value)}
                      className="sr-only"
                    />
                    <label
                      htmlFor={`workflow-${option.value}`}
                      className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
                        workflowType === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-gray-900">{option.label}</div>
                        <div className="text-sm text-gray-600 mt-1">{option.description}</div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* File Uploads */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FileUpload type="product" label="Product Image" icon={Image} required={currentWorkflow?.required.includes('product') ?? false} />
              <FileUpload type="design" label="Design Image" icon={Sparkles} required={currentWorkflow?.required.includes('design') ?? false} />
              <FileUpload type="color" label="Color Image" icon={Palette} required={currentWorkflow?.required.includes('color') ?? false} />
            </div>

            {/* Prompt Input */}
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                Custom Prompt {workflowType === 'color_design' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                id="prompt"
                name="prompt"
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                placeholder={
                  workflowType === 'color_design'
                    ? 'Describe how you want to combine the colors and design...'
                    : 'Optional: Add specific instructions for the composition...'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-red-800">{error}</div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>Generate Composition</span>
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {result && (
            <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">Success!</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Status:</strong> {result.detail}</p>
                <p><strong>Workflow:</strong> {result.inputs.workflowType}</p>
                <p><strong>Prompt:</strong> {result.inputs.prompt}</p>
                {result.inputs.productImagePath && (
                  <p><strong>Product:</strong> {result.inputs.productImagePath.split('/').pop()}</p>
                )}
                {result.inputs.designImagePath && (
                  <p><strong>Design:</strong> {result.inputs.designImagePath.split('/').pop()}</p>
                )}
                {result.inputs.colorImagePath && (
                  <p><strong>Color:</strong> {result.inputs.colorImagePath.split('/').pop()}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Workflow Types:</h3>
              <ul className="space-y-2">
                <li><strong>Full Composition:</strong> Combines all three image types</li>
                <li><strong>Product + Color:</strong> Applies color palette to product</li>
                <li><strong>Product + Design:</strong> Applies design to product</li>
                <li><strong>Color + Design:</strong> Creates new composition from color and design</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Tips:</h3>
              <ul className="space-y-2">
                <li>• Use high-quality images for best results</li>
                <li>• Supported formats: JPG, PNG, GIF</li>
                <li>• Keep file sizes under 10MB</li>
                <li>• Add custom prompts for specific requirements</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCompositionApp;
