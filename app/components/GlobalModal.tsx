"use client";

import { Modal, ModalContent } from "@heroui/react";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { IMAIIcon } from "./imai";


export default function GlobalModal() {
  const { isOpen, closeModal } = useGlobalModal();
  const router = useRouter();

  const handleClose = () => {
    closeModal();
    router.push("/explore");
  };



  return (
    <Modal
      isOpen={isOpen}
      hideCloseButton
      shouldBlockScroll
      backdrop="blur"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      className="m-4 md:m-0 lg:p-0 max-w-md lg:max-w-4xl rounded-2xl overflow-hidden bg-white dark:bg-black"
    >
      <ModalContent>
        <>
          {/* Mobile/Tablet Modal - Hidden on Desktop */}
          <div className="block lg:hidden">
            {/* Image Collage Header */}
            <div className="relative w-full h-auto pb-4 overflow-hidden">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 z-10 bg-transparent"
              >
                <X className="w-8 h-8 text-transparent" />
              </button>
              <video
                src="/videos/intro.mp4"
                className="object-cover w-full h-auto rounded-md"
                autoPlay
                loop
                muted
                playsInline
                controls={false}
                preload="auto"
                webkit-playsinline="true"
                disablePictureInPicture
                disableRemotePlayback
                style={{ 
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              />
            </div>

            {/* Modal Text Content */}
            <div className="p-6 text-center text-black dark:text-white">
              <h2 className="text-xl font-semibold mb-2">
                <span className="font-bold">Blurring</span> the lines between
                <br />
                Imagination and the new Reality
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mt-2">
                Create an account to design products, edit visuals, and bring
                your illustrations to life.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col gap-3 px-6 pb-6">
              <a href="/login" onClick={closeModal} className="w-full">
                <button className="bg-black text-white dark:bg-white dark:text-black w-full rounded-full py-3">
                  Log in
                </button>
              </a>

              <a href="/invite" onClick={closeModal} className="w-full">
                <button className="border border-gray-300 w-full rounded-full py-3">
                  Request Early Access
                </button>
              </a>

              <a
                href="/explore"
                onClick={closeModal}
                className="text-sm py-4 text-gray-500 dark:text-gray-400 underline text-center cursor-pointer"
              >
                Explore
              </a>
            </div>
          </div>

          {/* Desktop Modal - Hidden on Mobile/Tablet */}
          <div className="hidden lg:flex bg-white dark:bg-black rounded-2xl overflow-hidden">
            {/* Left Content Section */}
            <div className="flex-1 p-8 pr-4">
              <div className="mb-6">
                <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-sm text-sm font-medium mb-4">
                  NEW
                </span>
                <h1 className="text-3xl font-bold text-black dark:text-white mb-2">
                  IMAI studio is here
                </h1>
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Product design has never been this easy. <br></br>Join the
                  Waitlist.
                </p>
              </div>

              {/* Features List */}
              <div className="space-y-6 mb-8">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-gray-600 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-black dark:text-white font-medium">
                      IMAI is your AI design co-pilot. <br></br>
                      No templates, no photoshop, <br></br>
                      just your imagination visualized.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-gray-600 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-black dark:text-white font-medium">
                      It enables you to design products, <br></br> create
                      visuals, manage imagery and bring <br></br> your
                      illustrations to life.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-gray-600 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-black dark:text-white font-medium">
                      World's most advanced image models <br></br> and
                      up-to-date with the latest trends
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons - Same as Mobile */}
              <div className="flex flex-col gap-3">
                <a href="/login" onClick={closeModal} className="w-full">
                  <button className="bg-black text-white dark:bg-white dark:text-black w-full rounded-full py-3 font-medium hover:opacity-90 transition-opacity">
                    Log in
                  </button>
                </a>

                <a href="/invite" onClick={closeModal} className="w-full">
                  <button className="border border-gray-300 dark:border-gray-600 w-full rounded-full py-3 font-medium hover:opacity-90 transition-opacity">
                    Request Early Access
                  </button>
                </a>

                <a
                  href="/explore"
                  onClick={closeModal}
                  className="text-sm py-4 text-gray-500 dark:text-gray-400 underline text-center cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Explore
                </a>
              </div>
            </div>

            {/* Right Video Section */}
            <div className="flex-1 bg-[#da7757] flex items-center justify-center p-8">
              <video
                key={isOpen ? 'video-playing' : 'video-stopped'}
                src="/videos/intro.mp4"
                className="object-cover w-full h-auto rounded-md"
                autoPlay
                loop
                muted
                playsInline
                controls={false}
                preload="auto"
                webkit-playsinline="true"
                disablePictureInPicture
                disableRemotePlayback
                style={{ 
                  pointerEvents: 'none',
                  userSelect: 'none',
                  maxHeight: '400px'
                }}
              />
            </div>
          </div>
        </>
      </ModalContent>
    </Modal>
  );
}
