"use client";

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import UnifiedPromptContainer from '@/app/components/unified-prompt-container';
import { Card, CardBody, CardHeader, Divider, Code, Spinner, Button } from '@heroui/react';
import { Icon } from '@iconify/react';

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export default function TestPage() {
  const [user, loading, error] = useAuthState(auth);
  const [responses, setResponses] = useState<ChatResponse[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [submissionData, setSubmissionData] = useState<SubmissionData[]>([]);

  // Auto-scroll to bottom when new responses are added
  useEffect(() => {
    const scrollElement = document.getElementById('responses-container');
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [responses]);

  const handleSubmission = async (data: SubmissionData) => {
    if (!user) {
      console.error('User must be authenticated');
      return;
    }

    // Store the submission data for display
    setSubmissionData(prev => [...prev, { ...data, timestamp: new Date().toISOString() } as SubmissionData & { timestamp: string }]);

    setIsSubmitting(true);

    try {
      // Create FormData for the API call
      const formData = new FormData();
      
      // Add user ID from Firebase auth
      formData.append('userid', user.uid);
      
      // Add the prompt as message
      formData.append('message', data.prompt);
      
      // Add conversation history
      formData.append('conversation_history', JSON.stringify(conversationHistory));

      // Handle product data
      if (data.product) {
        if (data.product.startsWith('http') || data.product.startsWith('data:')) {
          // It's an image URL or base64 - treat as uploaded image
          formData.append('product_image', data.product);
        } else {
          // It's a preset selection
          formData.append('preset_product', data.product);
        }
      }

      // Handle design data
      data.design.forEach((designItem, index) => {
        if (designItem.startsWith('http') || designItem.startsWith('data:')) {
          // It's an image URL or base64
          formData.append(`design_image_${index}`, designItem);
        } else {
          // It's a preset selection
          formData.append(`preset_design_${index}`, designItem);
        }
      });

      // Handle color data
      data.color.forEach((colorItem, index) => {
        if (colorItem.startsWith('http') || colorItem.startsWith('data:')) {
          // It's an image URL or base64
          formData.append(`color_image_${index}`, colorItem);
        } else {
          // It's a preset selection
          formData.append(`preset_color_${index}`, colorItem);
        }
      });

      // Make API call to intentroute
      const response = await fetch('/api/intentroute', {
        method: 'POST',
        body: formData,
      });

      const result: ChatResponse = await response.json();
      
      // Debug: Log the API response structure
      console.log('API Response:', result);
      if (result.result) {
        console.log('Result structure:', Object.keys(result.result));
        console.log('Full result:', result.result);
      }
      
      // Add user message to conversation history
      const userMessage: ChatMessage = {
        role: 'user',
        content: data.prompt,
        timestamp: new Date().toISOString(),
      };

      // Add assistant response to conversation history
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      };

      // Update conversation history
      setConversationHistory(prev => [...prev, userMessage, assistantMessage]);
      
      // Add response to display list
      setResponses(prev => [...prev, result]);

    } catch (error) {
      console.error('Error submitting to API:', error);
      const errorResponse: ChatResponse = {
        status: 'error',
        message: 'Failed to connect to API',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      setResponses(prev => [...prev, errorResponse]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearResponses = () => {
    setResponses([]);
    setConversationHistory([]);
    setSubmissionData([]);
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return new Date().toLocaleTimeString();
    return new Date(timestamp).toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon icon="lucide:alert-circle" className="text-danger" />
              <h3>Authentication Error</h3>
            </div>
          </CardHeader>
          <CardBody>
            <p>Error loading authentication: {error.message}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon icon="lucide:user-x" className="text-warning" />
              <h3>Authentication Required</h3>
            </div>
          </CardHeader>
          <CardBody>
            <p>Please sign in to use this test page.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Test Page - Intent Route</h1>
        <p className="text-default-600">
          Connected to intentroute API | User ID: <Code size="sm">{user.uid}</Code>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Input Component</h2>
            </CardHeader>
            <CardBody>
              <UnifiedPromptContainer
                onSubmit={handleSubmission}
                placeholder="Test your prompt here..."
                maxLength={2000}
              />
              {isSubmitting && (
                <div className="flex items-center gap-2 mt-4 p-3 bg-primary-50 rounded-lg">
                  <Spinner size="sm" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Processing request...</span>
                    <span className="text-xs text-default-600">
                      Image generation may take 20-60 seconds
                    </span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* User Info Card */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">User Information</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              <div><strong>User ID:</strong> <Code size="sm">{user.uid}</Code></div>
              <div><strong>Email:</strong> {user.email || 'Not available'}</div>
              <div><strong>Display Name:</strong> {user.displayName || 'Not set'}</div>
            </CardBody>
          </Card>
        </div>

        {/* Right Column - Responses */}
        <div className="space-y-4">
          {/* Unified Prompt Output */}
          {submissionData.length > 0 && (
            <Card>
              <CardHeader className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Unified Prompt Output ({submissionData.length})</h2>
                {submissionData.length > 0 && (
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={clearResponses}
                    startContent={<Icon icon="lucide:trash-2" />}
                  >
                    Clear
                  </Button>
                )}
              </CardHeader>
              <CardBody>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {submissionData.map((submission, index) => (
                    <Card key={index} className="border-primary">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex items-center gap-2">
                            <Icon icon="lucide:send" className="text-primary" />
                            <span className="font-semibold">Submission #{index + 1}</span>
                          </div>
                          <Code size="sm" color="primary">
                            {(submission as any).timestamp ? formatTimestamp((submission as any).timestamp) : 'Now'}
                          </Code>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        {/* Prompt */}
                        <div>
                          <strong>Prompt:</strong>
                          <p className="mt-1 p-2 bg-primary-50 rounded text-sm">
                            {submission.prompt}
                          </p>
                        </div>

                        <Divider />

                        {/* Product */}
                        {submission.product && (
                          <div>
                            <strong>Product:</strong>
                            {submission.product.startsWith('http') || submission.product.startsWith('data:') ? (
                              <div className="mt-2">
                                <p className="text-sm text-default-600 mb-1">Uploaded Image:</p>
                                <img 
                                  src={submission.product} 
                                  alt="Product" 
                                  className="max-w-32 h-auto rounded border border-default-200"
                                />
                              </div>
                            ) : (
                              <Code size="sm" className="ml-2">{submission.product}</Code>
                            )}
                          </div>
                        )}

                        {/* Design */}
                        {submission.design.length > 0 && (
                          <div>
                            <strong>Design ({submission.design.length}):</strong>
                            <div className="mt-2 space-y-2">
                              {submission.design.map((design, designIndex) => (
                                <div key={designIndex} className="flex items-center gap-2">
                                  <span className="text-xs bg-default-100 px-2 py-1 rounded">#{designIndex + 1}</span>
                                  {design.startsWith('http') || design.startsWith('data:') ? (
                                    <div>
                                      <p className="text-xs text-default-600 mb-1">Uploaded Image:</p>
                                      <img 
                                        src={design} 
                                        alt={`Design ${designIndex + 1}`} 
                                        className="max-w-24 h-auto rounded border border-default-200"
                                      />
                                    </div>
                                  ) : (
                                    <Code size="sm">{design}</Code>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Color */}
                        {submission.color.length > 0 && (
                          <div>
                            <strong>Color ({submission.color.length}):</strong>
                            <div className="mt-2 space-y-2">
                              {submission.color.map((color, colorIndex) => (
                                <div key={colorIndex} className="flex items-center gap-2">
                                  <span className="text-xs bg-default-100 px-2 py-1 rounded">#{colorIndex + 1}</span>
                                  {color.startsWith('http') || color.startsWith('data:') ? (
                                    <div>
                                      <p className="text-xs text-default-600 mb-1">Uploaded Image:</p>
                                      <img 
                                        src={color} 
                                        alt={`Color ${colorIndex + 1}`} 
                                        className="max-w-24 h-auto rounded border border-default-200"
                                      />
                                    </div>
                                  ) : (
                                    <Code size="sm">{color}</Code>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Raw JSON for debugging */}
                        <details className="mt-2">
                          <summary className="text-sm cursor-pointer hover:text-primary">
                            Show Raw Submission Data
                          </summary>
                          <Code className="block mt-1 text-xs max-h-32 overflow-y-auto">
                            {JSON.stringify(submission, null, 2)}
                          </Code>
                        </details>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">API Responses ({responses.length})</h2>
              {responses.length > 0 && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={clearResponses}
                  startContent={<Icon icon="lucide:trash-2" />}
                >
                  Clear
                </Button>
              )}
            </CardHeader>
            <CardBody>
              <div 
                id="responses-container"
                className="space-y-4 max-h-96 overflow-y-auto"
              >
                {responses.length === 0 ? (
                  <div className="text-center text-default-500 py-8">
                    <Icon icon="lucide:message-circle" className="mx-auto mb-2" width={48} height={48} />
                    <p>No responses yet. Submit a prompt to see API responses here.</p>
                  </div>
                ) : (
                  responses.map((response, index) => (
                    <Card key={index} className={`${response.status === 'error' ? 'border-danger' : 'border-success'}`}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex items-center gap-2">
                            <Icon 
                              icon={response.status === 'success' ? 'lucide:check-circle' : 'lucide:x-circle'} 
                              className={response.status === 'success' ? 'text-success' : 'text-danger'}
                            />
                            <span className="font-semibold">Response #{index + 1}</span>
                          </div>
                          <Code size="sm" color={response.status === 'success' ? 'success' : 'danger'}>
                            {response.status}
                          </Code>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        {/* Status and Intent */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {response.intent && (
                            <div>
                              <strong>Intent:</strong> 
                              <Code size="sm" className="ml-1">
                                {response.intent}
                              </Code>
                            </div>
                          )}
                          {response.conversation_id && (
                            <div>
                              <strong>Conv ID:</strong> 
                              <Code size="sm" className="ml-1">
                                {response.conversation_id.split('_')[1]}
                              </Code>
                            </div>
                          )}
                        </div>

                        <Divider />

                        {/* Message */}
                        <div>
                          <strong>Message:</strong>
                          <p className="mt-1 p-2 bg-default-100 rounded text-sm">
                            {response.message}
                          </p>
                        </div>

                        {/* Error */}
                        {response.error && (
                          <div>
                            <strong className="text-danger">Error:</strong>
                            <Code color="danger" className="block mt-1 text-xs">
                              {response.error}
                            </Code>
                          </div>
                        )}

                        {/* Result */}
                        {response.result && (
                          <div>
                            <strong>Result:</strong>
                            
                            {/* Display generated images if they exist */}
                            {(response.result.firebaseOutputUrl || response.result.image_url || response.result.output_url || response.result.generated_image) && (
                              <div className="mt-2 mb-3">
                                <p className="text-sm font-medium mb-2">Generated Image:</p>
                                <img 
                                  src={response.result.firebaseOutputUrl || response.result.image_url || response.result.output_url || response.result.generated_image} 
                                  alt="Generated design" 
                                  className="max-w-full h-auto rounded-lg border border-default-200 shadow-sm"
                                  style={{ maxHeight: '300px' }}
                                  onError={(e) => {
                                    console.error('Failed to load generated image');
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                                
                                {/* Display the Firebase URL */}
                                {response.result.firebaseOutputUrl && (
                                  <div className="mt-2 p-2 bg-default-50 rounded border">
                                    <p className="text-xs font-medium text-default-700 mb-1">Firebase URL:</p>
                                    <Code size="sm" className="break-all text-xs">
                                      {response.result.firebaseOutputUrl}
                                    </Code>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Display multiple images if they exist in an array */}
                            {response.result.images && Array.isArray(response.result.images) && (
                              <div className="mt-2 mb-3">
                                <p className="text-sm font-medium mb-2">Generated Images:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {response.result.images.map((imageUrl: string, imgIndex: number) => (
                                    <img 
                                      key={imgIndex}
                                      src={imageUrl} 
                                      alt={`Generated design ${imgIndex + 1}`} 
                                      className="w-full h-auto rounded-lg border border-default-200 shadow-sm"
                                      style={{ maxHeight: '200px', objectFit: 'cover' }}
                                      onError={(e) => {
                                        console.error(`Failed to load generated image ${imgIndex + 1}`);
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Success status display */}
                            {response.result.status === 'success' && (
                              <div className="mt-2 mb-3 p-2 bg-success-50 border border-success-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <Icon icon="lucide:check-circle" className="text-success" width={16} />
                                  <span className="text-sm font-medium text-success-700">
                                    Design Generated Successfully!
                                  </span>
                                </div>
                                {response.result.execution_time && (
                                  <p className="text-xs text-success-600 mt-1">
                                    Generated in {response.result.execution_time}ms
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Raw JSON for debugging */}
                            <details className="mt-2">
                              <summary className="text-sm cursor-pointer hover:text-primary">
                                Show Raw JSON Response
                              </summary>
                              <Code className="block mt-1 text-xs max-h-32 overflow-y-auto">
                                {JSON.stringify(response.result, null, 2)}
                              </Code>
                            </details>
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          {/* Conversation History */}
          {conversationHistory.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Conversation History ({conversationHistory.length})</h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {conversationHistory.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`p-2 rounded text-sm ${
                        msg.role === 'user' 
                          ? 'bg-primary-50 border-l-2 border-primary' 
                          : 'bg-default-100 border-l-2 border-success'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <strong className="capitalize">{msg.role}:</strong>
                        <span className="text-xs text-default-500">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
