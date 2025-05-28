"use client";

import {
  Modal,
  ModalContent,
} from "@heroui/react";
import { useGlobalModal } from "@/contexts/GlobalModalContext";
import { X } from "lucide-react";

export default function GlobalModal() {
  const { isOpen, closeModal } = useGlobalModal();

  return (
    <Modal
      isOpen={isOpen}
      hideCloseButton
      shouldBlockScroll
      backdrop="blur"
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
      className="p-0 max-w-md rounded-2xl overflow-hidden bg-white dark:bg-black"
    >
      <ModalContent>
        <>
          {/* Image Collage Header */}
          <div className="relative w-full h-auto  pb-12  overflow-hidden">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2  z-10"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src="/popup.jpg" // Replace with your image path
              alt="Design Collage"
              className="object-cover w-full h-auto  rounded-md"
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
              Create an account to design products, edit visuals, and bring your illustrations to life.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col gap-3 px-6 pb-6">
            <a href="/login" onClick={closeModal} className="w-full">
              <button className="bg-black text-white dark:bg-white dark:text-black w-full rounded-full py-3">
                Log in
              </button>
            </a>

            <a href="/signup" onClick={closeModal} className="w-full">
              <button className="border border-gray-300 w-full rounded-full py-3 ">
                Sign up for free
              </button>
            </a>

            <a
              href="/explore"
              onClick={closeModal}
              className="text-sm py-4 hover:underline text-center cursor-pointer"
            >
              Explore
            </a>
          </div>
        </>
      </ModalContent>
    </Modal>
  );
}
