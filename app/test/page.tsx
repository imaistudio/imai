// app/compose/test/page.tsx
"use client";

import { useState, useRef, ChangeEvent } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

export default function ComposeTestPage() {
  const [user] = useAuthState(auth);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<{
    firebaseOutputUrl?: string;
    workflow_type?: string;
    generated_prompt?: string;
    error?: string;
  }>({});
  
  // Form refs
  const formRef = useRef<HTMLFormElement>(null);
  const productImageRef = useRef<HTMLInputElement>(null);
  const designImageRef = useRef<HTMLInputElement>(null);
  const colorImageRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    prompt: '',
    size: '1024x1024',
    quality: 'standard'
  });

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setResult({ error: 'You must be logged in to use this feature' });
      setStatus('error');
      return;
    }

    setStatus('loading');
    setResult({});

    try {
      // Get the Firebase ID token
      const idToken = await user.getIdToken();
      
      const submitFormData = new FormData();
      submitFormData.append('userId', user.uid);
      submitFormData.append('idToken', idToken);
      submitFormData.append('prompt', formData.prompt);
      submitFormData.append('size', formData.size);
      submitFormData.append('quality', formData.quality);

      // Append files if they exist
      if (productImageRef.current?.files?.[0]) {
        submitFormData.append('product_image', productImageRef.current.files[0]);
      }
      if (designImageRef.current?.files?.[0]) {
        submitFormData.append('design_image', designImageRef.current.files[0]);
      }
      if (colorImageRef.current?.files?.[0]) {
        submitFormData.append('color_image', colorImageRef.current.files[0]);
      }

      const response = await fetch('/api/design', {
        method: 'POST',
        body: submitFormData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred while processing your request');
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error occurred');
      }

      setResult(data);
      setStatus('success');
    } catch (error: any) {
      console.error('Error:', error);
      setResult({ error: error.message });
      setStatus('error');
    }
  };

  const resetForm = () => {
    formRef.current?.reset();
    setFormData({
      prompt: '',
      size: '1024x1024',
      quality: 'standard'
    });
    setStatus('idle');
    setResult({});
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Compose API Test</h1>
      
      {!user && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6">
          <p>You need to be logged in to test this API.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Product Image</label>
              <input
                type="file"
                ref={productImageRef}
                accept="image/*"
                className="w-full p-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Upload a product image to modify</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Design Image</label>
              <input
                type="file"
                ref={designImageRef}
                accept="image/*"
                className="w-full p-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Upload a design pattern to apply</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Color Image</label>
              <input
                type="file"
                ref={colorImageRef}
                accept="image/*"
                className="w-full p-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Upload a color palette to apply</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Prompt</label>
              <textarea
                name="prompt"
                value={formData.prompt}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
                rows={3}
                placeholder="Describe what you want to generate..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Size</label>
                <select
                  name="size"
                  value={formData.size}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="1024x1024">1024x1024</option>
                  <option value="1792x1024">1792x1024</option>
                  <option value="1024x1792">1024x1792</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quality</label>
                <select
                  name="quality"
                  value={formData.quality}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="standard">Standard</option>
                  <option value="hd">HD</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-4 pt-4">
              <button
                type="submit"
                disabled={status === 'loading' || !user}
                className={`px-4 py-2 rounded text-white ${status === 'loading' || !user ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {status === 'loading' ? 'Processing...' : 'Generate Image'}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          
          {status === 'loading' && (
            <div className="flex items-center justify-center p-8 border rounded bg-gray-50">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
              <p className="font-medium">Error:</p>
              <p>{result.error}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="border rounded overflow-hidden">
                {result.firebaseOutputUrl ? (
                  <img 
                    src={result.firebaseOutputUrl} 
                    alt="Generated result" 
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="p-8 text-center text-gray-500 bg-gray-50">
                    No image generated
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-medium mb-1">Workflow Type:</h3>
                <p className="text-sm bg-gray-100 p-2 rounded">{result.workflow_type}</p>
              </div>

              <div>
                <h3 className="font-medium mb-1">Generated Prompt:</h3>
                <p className="text-sm bg-gray-100 p-2 rounded whitespace-pre-wrap">{result.generated_prompt}</p>
              </div>

              <div>
                <h3 className="font-medium mb-1">Result URL:</h3>
                <a 
                  href={result.firebaseOutputUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {result.firebaseOutputUrl}
                </a>
              </div>
            </div>
          )}

          {status === 'idle' && (
            <div className="p-8 border rounded bg-gray-50 text-center text-gray-500">
              Submit the form to see results here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}