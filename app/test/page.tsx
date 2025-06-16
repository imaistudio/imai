"use client";

import React, { useState } from "react";
import UnifiedPromptContainer from "../components/unified-prompt-container";

interface SubmissionData {
  prompt: string;
  product: string;
  design: string[];
  color: string[];
}

export default function TestPage() {
  const [jsonOutput, setJsonOutput] = useState<SubmissionData | null>(null);

  const handleSubmit = (data: SubmissionData) => {
    setJsonOutput(data);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-black dark:text-white">
          Unified Prompt Container Test
        </h1>
        
        <div className="mb-8">
          <UnifiedPromptContainer
            onSubmit={handleSubmit}
            placeholder="Genrating Newness..."
            maxLength={1000}
          />
        </div>

        {jsonOutput && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4 text-black dark:text-white">
              JSON Output:
            </h2>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-black dark:text-white whitespace-pre-wrap">
                {JSON.stringify(jsonOutput, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {!jsonOutput && (
          <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
            <p>Fill out the form above and submit to see the JSON output here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
