"use client";

import React, { useState } from 'react';
import UnifiedPromptContainer from '@/app/components/unified-prompt-container';

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
}

export default function TestPage() {
  const [lastSubmission, setLastSubmission] = useState<SubmissionData | null>(null);

  const handleSubmit = (data: SubmissionData) => {
    console.log('Form submitted with data:', data);
    setLastSubmission(data);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">UnifiedPromptContainer Test Page</h1>
          <p className="text-muted-foreground">
            Test the unified prompt container component with all its features
          </p>
        </div>

        {/* Component Test Area */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">Component Demo</h2>
            <UnifiedPromptContainer
              onSubmit={handleSubmit}
              placeholder="Test your prompt here..."
              maxLength={1000}
            />
          </div>

          {/* Submission Display */}
          {lastSubmission && (
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Last Submission Data</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">PROMPT</h3>
                  <p className="bg-muted p-3 rounded text-sm">
                    {lastSubmission.prompt || 'No prompt provided'}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">PRODUCT</h3>
                  <p className="bg-muted p-3 rounded text-sm">
                    {lastSubmission.product || 'No product selected'}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">DESIGN ({lastSubmission.design.length})</h3>
                  <div className="bg-muted p-3 rounded text-sm">
                    {lastSubmission.design.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">
                        {lastSubmission.design.map((design, index) => (
                          <li key={index}>{design}</li>
                        ))}
                      </ul>
                    ) : (
                      'No design selected'
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">COLOR ({lastSubmission.color.length})</h3>
                  <div className="bg-muted p-3 rounded text-sm">
                    {lastSubmission.color.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">
                        {lastSubmission.color.map((color, index) => (
                          <li key={index}>{color}</li>
                        ))}
                      </ul>
                    ) : (
                      'No color selected'
                    )}
                  </div>
                </div>
              </div>
              
              {/* Raw JSON */}
              <details className="mt-4">
                <summary className="cursor-pointer font-medium text-sm text-muted-foreground">
                  View Raw JSON
                </summary>
                <pre className="mt-2 bg-muted p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(lastSubmission, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-xl font-semibold mb-4">Testing Instructions</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>• <strong>Text Input:</strong> Type in the text area and press Enter or click the submit button</p>
              <p>• <strong>Voice Input:</strong> Click the microphone icon to start/stop voice recording</p>
              <p>• <strong>Product Selection:</strong> Click the package icon to choose products</p>
              <p>• <strong>Design Selection:</strong> Click the palette icon to choose designs</p>
              <p>• <strong>Color Selection:</strong> Click the droplets icon to choose colors</p>
              <p>• <strong>Image Upload:</strong> Use the upload option in any category to add custom images</p>
              <p>• <strong>Remove Items:</strong> Click the X button on any selected item to remove it</p>
              <p>• Check the console and the "Last Submission Data" section to see the output</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
