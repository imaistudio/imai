"use client";

import React, { useState } from 'react';
import { Card, CardBody, CardHeader, Divider, Spinner, Image as NextUIImage, Button } from "@heroui/react";
import UnifiedPromptContainer, { ImageAsset } from '@/app/components/unified-prompt-container';
import { Icon } from "@iconify/react";

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
}

interface ChatResponse {
  status: "success" | "error";
  message: string;
  intent?: "text_conversation" | "image_generation";
  result?: any;
  conversation_id?: string;
  error?: string;
}

export default function TestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: SubmissionData) => {
    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      console.log('Submitting data:', data);

      // Create FormData to send to the intent route
      const formData = new FormData();
      
      // Add the prompt
      formData.append('message', data.prompt);
      
      // Add userid (you might want to get this from auth context)
      formData.append('userid', 'test_user_123');
      
      // Handle product data
      if (data.product) {
        if (data.product.startsWith('http')) {
          // It's a URL (Firebase or preset)
          formData.append('preset_product', data.product);
        } else {
          // It's a product type
          formData.append('preset_product', data.product);
        }
      }
      
      // Handle design data
      data.design.forEach((design, index) => {
        if (design.startsWith('http')) {
          formData.append(`preset_design_${index}`, design);
        } else {
          formData.append(`preset_design_${index}`, design);
        }
      });
      
      // Handle color data
      data.color.forEach((color, index) => {
        if (color.startsWith('http')) {
          formData.append(`preset_color_${index}`, color);
        } else {
          formData.append(`preset_color_${index}`, color);
        }
      });

      // Call the intent route API
      const response = await fetch('/api/intentroute', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ChatResponse = await response.json();
      console.log('API Response:', result);
      setResponse(result);

    } catch (err: any) {
      console.error('Error calling API:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setResponse(null);
    setError(null);
  };

  const renderImageResults = () => {
    if (!response?.result?.images || !Array.isArray(response.result.images)) {
      return null;
    }

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Generated Images</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {response.result.images.map((imageUrl: string, index: number) => (
            <div key={index} className="space-y-2">
              <NextUIImage
                src={imageUrl}
                alt={`Generated image ${index + 1}`}
                className="w-full h-64 object-cover rounded-lg"
                fallbackSrc="/api/placeholder/300/200"
              />
              <p className="text-sm text-gray-600">Image {index + 1}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderApiResult = () => {
    if (!response?.result) return null;

    return (
      <div className="space-y-2">
        <h4 className="font-medium">Raw API Result:</h4>
        <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm overflow-auto max-h-60">
          {JSON.stringify(response.result, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">IMAI Test Page</h1>
          <p className="text-gray-600">Test the unified prompt container with intent route API</p>
        </div>

        {/* Unified Prompt Container */}
        <Card className="w-full">
          <CardHeader>
            <h2 className="text-xl font-semibold">Create Your Design</h2>
          </CardHeader>
          <CardBody>
            <UnifiedPromptContainer
              onSubmit={handleSubmit}
              placeholder="Describe what you want to create..."
              maxLength={2000}
            />
          </CardBody>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardBody className="flex flex-row items-center justify-center gap-3 py-8">
              <Spinner size="md" />
              <span>Processing your request...</span>
            </CardBody>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Card className="border-danger">
            <CardBody>
              <div className="flex items-center gap-2 text-danger">
                <Icon icon="lucide:alert-circle" width={20} />
                <span className="font-medium">Error:</span>
              </div>
              <p className="mt-2 text-danger">{error}</p>
            </CardBody>
          </Card>
        )}

        {/* Results Display */}
        {response && (
          <div className="space-y-4">
            {/* Clear Results Button */}
            <div className="flex justify-end">
              <Button
                color="default"
                variant="bordered"
                onPress={clearResults}
                startContent={<Icon icon="lucide:trash-2" width={16} />}
              >
                Clear Results
              </Button>
            </div>

            {/* Response Summary */}
            <Card>
              <CardHeader className="flex gap-3">
                <Icon 
                  icon={response.intent === "image_generation" ? "lucide:image" : "lucide:message-circle"} 
                  width={24} 
                />
                <div>
                  <h3 className="text-lg font-semibold">
                    {response.intent === "image_generation" ? "Image Generation" : "Text Conversation"}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Status: <span className={response.status === "success" ? "text-success" : "text-danger"}>
                      {response.status}
                    </span>
                  </p>
                </div>
              </CardHeader>
              <Divider />
              <CardBody>
                <div className="space-y-4">
                  {/* Text Response */}
                  <div>
                    <h4 className="font-medium mb-2">Response Message:</h4>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                      <p className="whitespace-pre-wrap">{response.message}</p>
                    </div>
                  </div>

                  {/* Image Results */}
                  {renderImageResults()}

                  {/* Raw API Result */}
                  {renderApiResult()}
                </div>
              </CardBody>
            </Card>

            {/* Additional Debug Info */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Debug Information</h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-3">
                  <div>
                    <span className="font-medium">Intent:</span> {response.intent}
                  </div>
                  <div>
                    <span className="font-medium">Conversation ID:</span> {response.conversation_id}
                  </div>
                  <div>
                    <span className="font-medium">Has Result:</span> {response.result ? "Yes" : "No"}
                  </div>
                  {response.result && (
                    <div>
                      <span className="font-medium">Result Keys:</span> {Object.keys(response.result).join(", ")}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
