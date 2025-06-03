'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { auth } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  User,
} from 'firebase/auth';

interface ApiResponse {
  status: string;
  firebaseInputUrls?: {
    product?: string;
    design?: string;
    color?: string;
  };
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  error?: string;
}

export default function TestDesignPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [productFile, setProductFile] = useState<File | null>(null);
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [colorFile, setColorFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('standard');
  const [n, setN] = useState(1);

  const [apiResult, setApiResult] = useState<ApiResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, current => {
      setUser(current);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      await signInAnonymously(auth);
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setApiResult(null);

    const formData = new FormData();
    formData.append('userid', user.uid);

    if (productFile) {
      formData.append('product_image', productFile);
    }
    if (designFile) {
      formData.append('design_image', designFile);
    }
    if (colorFile) {
      formData.append('color_image', colorFile);
    }
    if (prompt.trim()) {
      formData.append('prompt', prompt.trim());
    }
    formData.append('size', size);
    formData.append('quality', quality);
    formData.append('n', n.toString());

    try {
      const res = await fetch('/api/design', {
        method: 'POST',
        body: formData,
      });
      const data: ApiResponse = await res.json();
      setApiResult(data);
    } catch (err) {
      console.error('API request error:', err);
      setApiResult({ status: 'error', error: 'Network or server error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Test /api/design</h1>

      {/* Auth Section */}
      <div className="mb-6 p-4 border rounded-md">
        {authLoading ? (
          <p>Checking authentication...</p>
        ) : user ? (
          <div>
            <p>
              Logged in as <code className="bg-gray-100 px-1 py-0.5 rounded">{user.uid}</code>
            </p>
            <button
              onClick={handleLogout}
              className="mt-2 px-4 py-2 bg-red-500 text-white rounded-md"
            >
              Logout
            </button>
          </div>
        ) : (
          <div>
            <p>Not logged in</p>
            <button
              onClick={handleLogin}
              className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md"
            >
              Login Anonymously
            </button>
          </div>
        )}
      </div>

      {/* If not logged in, do not show the form */}
      {!user ? (
        <p className="text-gray-600">Please log in to test the API.</p>
      ) : (
        <>
          {/* Test Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <p className="block mb-1 font-medium">Product Image (optional)</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  setProductFile(e.target.files ? e.target.files[0] : null);
                }}
                className="border p-2 rounded-md w-full"
              />
            </div>

            <div>
              <p className="block mb-1 font-medium">Design Image (optional)</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  setDesignFile(e.target.files ? e.target.files[0] : null);
                }}
                className="border p-2 rounded-md w-full"
              />
            </div>

            <div>
              <p className="block mb-1 font-medium">Color Image (optional)</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  setColorFile(e.target.files ? e.target.files[0] : null);
                }}
                className="border p-2 rounded-md w-full"
              />
            </div>

            <div>
              <p className="block mb-1 font-medium">Prompt (optional)</p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="border p-2 rounded-md w-full"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="block mb-1 font-medium">Size</p>
                <select
                  value={size}
                  onChange={e => setSize(e.target.value)}
                  className="border p-2 rounded-md w-full"
                >
                  <option value="256x256">256x256</option>
                  <option value="512x512">512x512</option>
                  <option value="1024x1024">1024x1024</option>
                </select>
              </div>

              <div>
                <p className="block mb-1 font-medium">Quality</p>
                <select
                  value={quality}
                  onChange={e => setQuality(e.target.value)}
                  className="border p-2 rounded-md w-full"
                >
                  <option value="low">low</option>
                  <option value="standard">standard</option>
                  <option value="high">high</option>
                  <option value="auto">auto</option>
                </select>
              </div>

              <div>
                <p className="block mb-1 font-medium">Number of Images (n)</p>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={n}
                  onChange={e => setN(parseInt(e.target.value, 10))}
                  className="border p-2 rounded-md w-full"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded-md"
            >
              {submitting ? 'Submitting…' : 'Submit to /api/design'}
            </button>
          </form>

          {/* API Result */}
          {apiResult && (
            <div className="p-4 border rounded-md bg-gray-50 space-y-4">
              <h2 className="text-xl font-medium">API Response</h2>
              {apiResult.status === 'success' ? (
                <div className="space-y-4">
                  <p>
                    <strong>Status:</strong> {apiResult.status}
                  </p>

                  {/* Show input image previews if available */}
                  {apiResult.firebaseInputUrls && (
                    <div className="space-y-2">
                      <strong>Input Previews:</strong>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {apiResult.firebaseInputUrls.product && (
                          <div className="flex flex-col items-center">
                            <span className="text-sm mb-1">Product</span>
                            <img
                              src={apiResult.firebaseInputUrls.product}
                              alt="Product Preview"
                              className="w-32 h-32 object-contain rounded-md border"
                            />
                          </div>
                        )}
                        {apiResult.firebaseInputUrls.design && (
                          <div className="flex flex-col items-center">
                            <span className="text-sm mb-1">Design</span>
                            <img
                              src={apiResult.firebaseInputUrls.design}
                              alt="Design Preview"
                              className="w-32 h-32 object-contain rounded-md border"
                            />
                          </div>
                        )}
                        {apiResult.firebaseInputUrls.color && (
                          <div className="flex flex-col items-center">
                            <span className="text-sm mb-1">Color</span>
                            <img
                              src={apiResult.firebaseInputUrls.color}
                              alt="Color Preview"
                              className="w-32 h-32 object-contain rounded-md border"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Show output image preview */}
                  {apiResult.firebaseOutputUrl && (
                    <div>
                      <strong>Output Preview:</strong>
                      <div className="mt-2">
                        <img
                          src={apiResult.firebaseOutputUrl}
                          alt="Output Preview"
                          className="w-64 h-64 object-contain rounded-md border"
                        />
                      </div>
                    </div>
                  )}

                  {/* Other metadata */}
                  {apiResult.workflow_type && (
                    <p>
                      <strong>Inferred Workflow:</strong> {apiResult.workflow_type}
                    </p>
                  )}
                  {apiResult.generated_prompt && (
                    <div>
                      <strong>Generated Prompt:</strong>
                      <pre className="whitespace-pre-wrap bg-white p-2 rounded-md border mt-1">
                        {apiResult.generated_prompt}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p>
                    <strong>Status:</strong> {apiResult.status}
                  </p>
                  <p className="text-red-600">
                    <strong>Error:</strong> {apiResult.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
