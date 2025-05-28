'use client';

import { useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { firestore, storage } from '@/lib/firebase'; // adjust path
import { useAuth } from '@/contexts/AuthContext';
import Header from '../components/header';
import Footer from '../components/footer';
import { Icon } from "@iconify/react";

export default function PromptContainer() {
  const [prompt, setPrompt] = useState<string>('');
  const [images, setImages] = useState<File[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { user: currentUser } = useAuth();
  const router = useRouter();

  const suggestions = [
    { id: "general-inquiry", label: "General inquiry", icon: "solar:chat-line-linear" },
    { id: "technical-support", label: "Technical support", icon: "solar:headphones-round-linear" },
    { id: "billing-issues", label: "Billing", icon: "solar:wallet-2-linear" },
    { id: "account-help", label: "Account assistance", icon: "solar:user-circle-linear" },
    { id: "report-problem", label: "Report a problem", icon: "solar:bug-linear" },
    { id: "feature-request", label: "Suggest a feature", icon: "solar:lightbulb-linear" },
    { id: "business-inquiry", label: "Business inquiry", icon: "solar:backpack-outline" },
  ];

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setImages(prev => [...prev, ...files]);
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviewImages(prev => [...prev, ...newPreviews]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(previewImages[index]);
    setPreviewImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSuggestionClick = (text: string) => {
    setPrompt(text);
  };

  const handleSubmit = async () => {
    if (!currentUser) {
      router.push('/signup');
      return;
    }

    setIsSubmitting(true);

    try {
      const uid = currentUser.uid;
      const imageUrls: string[] = [];
      // Upload images
      for (const img of images) {
        const storageRef = ref(storage, `contact/${uid}/${Date.now()}-${img.name}`);
        const snapshot = await uploadBytes(storageRef, img);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        imageUrls.push(downloadUrl);
      }

      // Firestore submission
      const userDocRef = doc(firestore, 'contact', uid);
      await setDoc(userDocRef, {
        uid,
        submissions: arrayUnion({
          text: prompt,
          images: imageUrls,
          timestamp: new Date(),
        })
      }, { merge: true });

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-black p-4">
        {submitted ? (
        <div className='flex flex-col items-center justify-center text-center min-h-screen'>
          <h1 className="text-3xl font-bold text-center">
            Thank you for contacting us!
          </h1>
          <small className="lg:pt-4">
            Our dedicated team at Imai Support has received your message & will get back to you shortly. <br></br> We truly appreciate you reaching out and look forward to assisting you!
          </small>
        </div>
        ) : (
          <>
            <h2 className="font-medium text-blue-600">Contact Us</h2>
            <h1 className="text-3xl font-semibold text-black dark:text-white mb-8 text-center">
              How Can We Help You Today?
            </h1>
            <div className="w-full max-w-2xl bg-[#f4f4f5] dark:bg-[#27272a] rounded-lg p-4">
              <div className="flex flex-col space-y-4">

                {previewImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {previewImages.map((url, i) => (
                      <div key={i} className="relative w-[72px] h-[72px]">
                        <img src={url} alt={`Preview ${i}`} className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute -top-2 -right-2 bg-black text-white rounded-full w-6 h-6 flex items-center justify-center"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end space-x-2">
                  <textarea
                    value={prompt}
                    onChange={handlePromptChange}
                    placeholder="Enter your query here"
                    className="w-full bg-transparent border-none outline-none resize-none text-black dark:text-white text-lg min-h-[45px]"
                    rows={2}
                    onInput={(e) => {
                      const el = e.target as HTMLTextAreaElement;
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                    }}
                  />
                </div>

                <div className='w-full flex justify-between items-center'>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <div className="p-2 rounded-full text-gray-400">
                      <Icon icon="solar:paperclip-outline" width="22" height="22" />
                    </div>
                  </label>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || (!prompt && images.length === 0)}
                    className={`p-2 rounded-full transition-colors ${
                      prompt || images.length > 0 ? 'bg-blue-500' : 'bg-gray-400'
                    }`}
                  >
                    <Icon icon="solar:arrow-up-outline" width="22" height="22" color="#fff" />
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden md:flex flex-wrap justify-center gap-2 mt-6 w-full md:max-w-4xl px-4">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSuggestionClick(s.label)}
                  className="flex items-center gap-1 px-4 py-2 dark:text-white rounded-full border dark:border-[#3f3f46] dark:hover:bg-[#27272a] transition-colors"
                >
                  <Icon icon={s.icon} width="16" height="16" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
