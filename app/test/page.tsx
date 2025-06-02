'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

interface ComposeResponse {
  status: string;
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  error?: string;
}

export default function DesignTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComposeResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Form state
  const [productImage, setProductImage] = useState<File | null>(null);
  const [designImage, setDesignImage] = useState<File | null>(null);
  const [colorImage, setColorImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('standard');

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sign in anonymously
  const signInAnon = async () => {
    try {
      setAuthLoading(true);
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      setAuthLoading(false);
    }
  };

  // Handle file uploads
  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setter(file);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('Please sign in first');
      return;
    }

    // Validate inputs
    if (!productImage && !designImage && !colorImage && !prompt.trim()) {
      alert('Please provide at least one image or a prompt');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Get ID token
      const idToken = await user.getIdToken();
      
      // Create form data
      const formData = new FormData();
      formData.append('userId', user.uid);
      formData.append('idToken', idToken);
      
      if (productImage) formData.append('product_image', productImage);
      if (designImage) formData.append('design_image', designImage);
      if (colorImage) formData.append('color_image', colorImage);
      if (prompt.trim()) formData.append('prompt', prompt.trim());
      formData.append('size', size);
      formData.append('quality', quality);

      console.log('Sending request with:', {
        userId: user.uid,
        hasProductImage: !!productImage,
        hasDesignImage: !!designImage,
        hasColorImage: !!colorImage,
        hasPrompt: !!prompt.trim(),
        size,
        quality
      });

      const response = await fetch('/api/design', {
        method: 'POST',
        body: formData,
      });

      const data: ComposeResponse = await response.json();
      console.log('API Response:', data);
      setResult(data);

    } catch (error) {
      console.error('Request failed:', error);
      setResult({
        status: 'error',
        error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  // Clear form
  const clearForm = () => {
    setProductImage(null);
    setDesignImage(null);
    setColorImage(null);
    setPrompt('');
    setResult(null);
    
    // Clear file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
    fileInputs.forEach(input => input.value = '');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Design API Test Page</h1>
          
          {/* Auth Status */}
          <div className="mb-6 p-4 bg-gray-100 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Authentication Status</h2>
            {user ? (
              <div className="text-green-600">
                <p>✅ Signed in as: {user.uid}</p>
                <p className="text-sm text-gray-600">Anonymous: {user.isAnonymous ? 'Yes' : 'No'}</p>
              </div>
            ) : (
              <div className="text-red-600">
                <p>❌ Not signed in</p>
                <button
                  onClick={signInAnon}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  disabled={authLoading}
                >
                  {authLoading ? 'Signing in...' : 'Sign In Anonymously'}
                </button>
              </div>
            )}
          </div>

          {/* Test Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Product Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, setProductImage)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {productImage && (
                  <p className="mt-1 text-sm text-green-600">✅ {productImage.name}</p>
                )}
              </div>

              {/* Design Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Design Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, setDesignImage)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {designImage && (
                  <p className="mt-1 text-sm text-green-600">✅ {designImage.name}</p>
                )}
              </div>

              {/* Color Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, setColorImage)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {colorImage && (
                  <p className="mt-1 text-sm text-green-600">✅ {colorImage.name}</p>
                )}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Prompt (optional)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your custom prompt here..."
              />
            </div>

            {/* Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Size
                </label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1024x1024">1024x1024 (Square)</option>
                  <option value="1792x1024">1792x1024 (Landscape)</option>
                  <option value="1024x1792">1024x1792 (Portrait)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quality
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="standard">Standard</option>
                  <option value="hd">HD</option>
                </select>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading || !user}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Generate Design'}
              </button>
              
              <button
                type="button"
                onClick={clearForm}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Clear Form
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Results</h2>
            
            {result.status === 'success' ? (
              <div className="space-y-4">
                <div className="text-green-600 font-semibold">✅ Success!</div>
                
                <div>
                  <h3 className="font-semibold mb-2">Generated Image:</h3>
                  {result.firebaseOutputUrl && (
                    <img
                      src={result.firebaseOutputUrl}
                      alt="Generated design"
                      className="max-w-full h-auto rounded-lg border"
                    />
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Workflow Type:</h3>
                  <p className="text-gray-700 bg-gray-100 px-3 py-2 rounded">
                    {result.workflow_type}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Generated Prompt:</h3>
                  <p className="text-gray-700 bg-gray-100 px-3 py-2 rounded whitespace-pre-wrap">
                    {result.generated_prompt}
                  </p>
                </div>

                {result.firebaseOutputUrl && (
                  <div>
                    <h3 className="font-semibold mb-2">Download URL:</h3>
                    <a
                      href={result.firebaseOutputUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline break-all"
                    >
                      {result.firebaseOutputUrl}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-red-600 font-semibold">❌ Error</div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{result.error}</p>
                </div>
              </div>
            )}

            {/* Raw Response */}
            <details className="mt-6">
              <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                Show Raw Response
              </summary>
              <pre className="mt-2 bg-gray-100 p-4 rounded-lg text-sm overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}