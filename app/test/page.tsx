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
	const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);

	const handleSubmit = (data: SubmissionData) => {
		setSubmissionData(data);
		console.log("Submission Data:", data);
	};

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-4xl mx-auto space-y-8">
				<h1 className="text-2xl font-bold text-center">
					Unified Prompt Container Test
				</h1>
				
				<UnifiedPromptContainer 
					onSubmit={handleSubmit}
					placeholder="Test your prompt here..."
				/>

				{submissionData && (
					<div className="mt-8">
						<h2 className="text-xl font-semibold mb-4">JSON Response:</h2>
						<div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-auto">
							<pre className="text-sm">
								{JSON.stringify(submissionData, null, 2)}
							</pre>
						</div>
					</div>
				)}

				{!submissionData && (
					<div className="text-center text-gray-500 mt-8">
						<p>Submit a prompt with images to see the JSON response</p>
					</div>
				)}
			</div>
		</div>
	);
}
