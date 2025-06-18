"use client";

import React, { useState } from 'react';
import UnifiedPromptContainer from '@/app/components/unified-prompt-container';

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
  productplaceholder: string;
  designplaceholder: string[];
  colorplaceholder: string[];
}

export default function TestPage() {
  const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);

  const handleSubmission = (data: SubmissionData) => {
    setSubmissionData(data);
    console.log('Received submission data:', data);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Unified Prompt Container Test</h1>
      
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">Component:</h2>
          <UnifiedPromptContainer onSubmit={handleSubmission} />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold mb-2">JSON Callback Data:</h2>
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <pre className="text-sm overflow-auto whitespace-pre-wrap">
              {submissionData ? JSON.stringify(submissionData, null, 2) : 'No data submitted yet...'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
