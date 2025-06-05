"use client";
import React, { useEffect, useState } from "react";
import Header from "../components/header";
import Footer from "../components/footer";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Spinner, Button } from "@heroui/react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

const IMAGES_PER_PAGE = 50;

export default function Reset() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [images, setImages] = useState<string[]>([]);
  const [paginatedImages, setPaginatedImages] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

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

      const sorted = files
        .sort((a, b) => a.name.localeCompare(b.name)) // ascending
        .reverse() // latest on top
        .map((file) => file.url);

      setImages(sorted);
      setPaginatedImages(sorted.slice(0, IMAGES_PER_PAGE));
    } catch (error) {
      console.error("Error loading images:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    const start = page * IMAGES_PER_PAGE;
    const end = start + IMAGES_PER_PAGE;
    setPaginatedImages(images.slice(start, end));
    setPage((prev) => prev + 1);
  };

  const handlePrev = () => {
    const start = (page - 2) * IMAGES_PER_PAGE;
    const end = start + IMAGES_PER_PAGE;
    setPaginatedImages(images.slice(start, end));
    setPage((prev) => prev - 1);
  };

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6  gap-2">
              {paginatedImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`User output ${index}`}
                  className="w-full aspect-square object-cover rounded"
                />
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <Button onClick={handlePrev} disabled={page === 1}>
                Previous
              </Button>
              <Button
                onClick={handleNext}
                disabled={page * IMAGES_PER_PAGE >= images.length}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
