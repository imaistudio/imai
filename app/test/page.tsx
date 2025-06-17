"use client";

import React, { useState } from "react";
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import UnifiedPromptContainer from '../components/unified-prompt-container';
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
}

interface DesignAPIResponse {
  status: string;
  firebaseInputUrls?: {
    product?: string;
    design?: string;
    color?: string;
  };
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  revised_prompt?: string;
  response_id?: string;
  model_used?: string;
  generation_method?: "responses_api" | "image_api";
  streaming_supported?: boolean;
  error?: string;
}

export default function TestPage() {
  const [user, loading, error] = useAuthState(auth);
  const [apiResponse, setApiResponse] = useState<DesignAPIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);

  const handleSubmission = async (data: SubmissionData) => {
    console.log("Submission data received:", data);
    setSubmissionData(data);
    
    if (!user) {
      console.error("User not authenticated");
      setApiResponse({
        status: "error",
        error: "User not authenticated. Please sign in first."
      });
      return;
    }

    setIsLoading(true);
    setApiResponse(null);

    try {
      // Prepare FormData for the API call
      const formData = new FormData();
      formData.append("userid", user.uid);
      formData.append("prompt", data.prompt || "");

      // Handle product image/URL
      if (data.product) {
        if (data.product.startsWith('http')) {
          formData.append("product_image_url", data.product);
        } else {
          formData.append("preset_product_type", data.product);
        }
      }

      // Handle design images/URLs
      if (data.design && data.design.length > 0) {
        const designUrl = data.design[0]; // Use first design for now
        if (designUrl.startsWith('http')) {
          formData.append("design_image_url", designUrl);
        } else {
          formData.append("preset_design_style", designUrl);
        }
      }

      // Handle color images/URLs
      if (data.color && data.color.length > 0) {
        const colorUrl = data.color[0]; // Use first color for now
        if (colorUrl.startsWith('http')) {
          formData.append("color_image_url", colorUrl);
        } else {
          formData.append("preset_color_palette", colorUrl);
        }
      }

      // Optional parameters with defaults
      formData.append("size", "1024x1024");
      formData.append("quality", "auto");
      formData.append("n", "1");
      formData.append("background", "opaque");
      formData.append("output_format", "png");
      formData.append("output_compression", "0");

      console.log("Calling design API with FormData...");
      
      const response = await fetch('/api/design', {
        method: 'POST',
        body: formData,
      });

      const result: DesignAPIResponse = await response.json();
      console.log("API Response:", result);
      
      setApiResponse(result);
    } catch (error) {
      console.error("Error calling design API:", error);
      setApiResponse({
        status: "error",
        error: `Failed to call API: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setApiResponse(null);
    setSubmissionData(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Icon icon="lucide:loader-2" className="animate-spin" width={24} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Icon icon="lucide:alert-circle" className="text-red-500 mx-auto mb-2" width={48} />
          <h2 className="text-xl font-semibold text-red-600 mb-2">Authentication Error</h2>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Icon icon="lucide:user-x" className="text-gray-400 mx-auto mb-4" width={64} />
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please sign in to test the design API.</p>
          <Button 
            color="primary"
            onClick={() => window.location.href = '/login'}
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Design API Test Page
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Test the unified prompt input with Firebase auth and design API
          </p>
          <div className="mt-4 p-4 bg-green-100 dark:bg-green-900 rounded-lg">
            <p className="text-green-800 dark:text-green-200">
              ✅ Authenticated as: <strong>{user.email}</strong>
            </p>
          </div>
        </div>

        {/* Unified Prompt Container */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Unified Prompt Input
            </h2>
            <UnifiedPromptContainer 
              onSubmit={handleSubmission}
              placeholder="Enter your design prompt..."
              maxLength={1000}
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
              <div className="flex items-center space-x-3">
                <Icon icon="lucide:loader-2" className="animate-spin text-blue-600" width={24} />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Processing Request...
                  </h3>
                  <p className="text-blue-700 dark:text-blue-200">
                    Calling the design API with your inputs. This may take a few moments.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submission Data Display */}
        {submissionData && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Submission Data
                </h3>
                <Button size="sm" variant="light" onClick={clearResults}>
                  Clear
                </Button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(submissionData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* API Response Display */}
        {apiResponse && (
          <div className="max-w-4xl mx-auto">
            <div className={`rounded-lg p-6 ${
              apiResponse.status === 'error' 
                ? 'bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700'
                : 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-lg font-semibold ${
                  apiResponse.status === 'error' 
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-green-900 dark:text-green-100'
                }`}>
                  API Response
                </h3>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  apiResponse.status === 'error'
                    ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                    : 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                }`}>
                  {apiResponse.status}
                </div>
              </div>

              {/* Error Display */}
              {apiResponse.error && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-800 rounded-lg">
                  <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">Error:</h4>
                  <p className="text-red-800 dark:text-red-200">{apiResponse.error}</p>
                </div>
              )}

              {/* Success Response Details */}
              {apiResponse.status === 'success' && (
                <div className="space-y-4">
                  {apiResponse.workflow_type && (
                    <div>
                      <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                        Workflow Type:
                      </h4>
                      <p className="text-green-800 dark:text-green-200">{apiResponse.workflow_type}</p>
                    </div>
                  )}

                  {apiResponse.generated_prompt && (
                    <div>
                      <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                        Generated Prompt:
                      </h4>
                      <p className="text-green-800 dark:text-green-200">{apiResponse.generated_prompt}</p>
                    </div>
                  )}

                  {apiResponse.firebaseOutputUrl && (
                    <div>
                      <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                        Generated Image:
                      </h4>
                      <img 
                        src={apiResponse.firebaseOutputUrl} 
                        alt="Generated design" 
                        className="max-w-full h-auto rounded-lg shadow-lg"
                      />
                    </div>
                  )}

                  {apiResponse.model_used && (
                    <div>
                      <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                        Model Used:
                      </h4>
                      <p className="text-green-800 dark:text-green-200">{apiResponse.model_used}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Raw Response */}
              <details className="mt-4">
                <summary className={`cursor-pointer font-medium ${
                  apiResponse.status === 'error' 
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-green-900 dark:text-green-100'
                }`}>
                  Raw API Response
                </summary>
                <pre className="mt-2 bg-gray-50 dark:bg-gray-900 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(apiResponse, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
