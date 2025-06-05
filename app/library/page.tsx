"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "../components/header";
import Footer from "../components/footer";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

const IMAGES_PER_PAGE = 50;

export default function Reset() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // All image URLs fetched from Firebase (sorted: newest first)
  const [images, setImages] = useState<string[]>([]);

  // Currently visible subset (for infinite scroll)
  const [paginatedImages, setPaginatedImages] = useState<string[]>([]);

  // Which “page” we’re on (1-based). page = 1 means the first IMAGES_PER_PAGE, etc.
  const [page, setPage] = useState(1);

  // Toggle while fetching from storage
  const [isLoading, setIsLoading] = useState(true);

  // When user logs out, redirect to login
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Once we have a userId, fetch all output images from `${userId}/output`
  useEffect(() => {
    if (user?.uid) {
      fetchImages(user.uid);
    }
  }, [user?.uid]);

  const fetchImages = async (userId: string) => {
    setIsLoading(true);
    try {
      const folderRef = ref(storage, `${userId}/output`);
      const res = await listAll(folderRef);

      const urlPromises = res.items.map(async (item) => {
        const url = await getDownloadURL(item);
        return { url, name: item.name };
      });

      const files = await Promise.all(urlPromises);

      const sortedUrls = files
        .sort((a, b) => a.name.localeCompare(b.name)) // ascending by filename
        .reverse() // so newest filenames appear first
        .map((file) => file.url);

      setImages(sortedUrls);

      // Initialize first “page” of images
      setPaginatedImages(sortedUrls.slice(0, IMAGES_PER_PAGE));
      setPage(1);
    } catch (error) {
      console.error("Error loading images:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Append the next batch when the user scrolls near the bottom
  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    const startIndex = (page) * IMAGES_PER_PAGE;
    const endIndex = startIndex + IMAGES_PER_PAGE;

    // If no more images to load, do nothing
    if (startIndex >= images.length) {
      return;
    }

    const nextSlice = images.slice(startIndex, endIndex);
    setPaginatedImages((prev) => [...prev, ...nextSlice]);
    setPage(nextPage);
  }, [images, page]);

  // Scroll listener: when near bottom, call loadMore()
  useEffect(() => {
    const handleScroll = () => {
      // Distance from bottom (in pixels) at which we trigger loadMore
      const threshold = 200;

      // How far have we scrolled?
      const scrolledToBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - threshold;

      // If we're at bottom and there are still images left, load more
      if (scrolledToBottom && page * IMAGES_PER_PAGE < images.length) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [images.length, loadMore, page]);

  return (
    <>
      <Header />

      <main className="p-4 min-h-screen">
        {isLoading ? (
          <div className="flex justify-center items-center h-[50vh]">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {paginatedImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`User output ${index}`}
                  className="w-full aspect-square object-cover rounded"
                />
              ))}
            </div>

            {/* Optional: A little “Loading…” indicator at the bottom while fetching more.
                You can conditionally show this only if page * IMAGES_PER_PAGE < images.length. */}
            {page * IMAGES_PER_PAGE < images.length && (
              <div className="flex justify-center my-6">
                <Spinner />
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
