"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "../components/header";
import Footer from "../components/footer";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { VideoZoomModal } from "../components/VideoZoomModal";
const ITEMS_PER_PAGE = 50;

interface MediaFile {
  url: string;
  name: string;
  type: "image" | "video";
  createdAt: number;
}

export default function Reset() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // All media files fetched from Firebase (sorted: newest first)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  // Currently visible subset (for infinite scroll)
  const [paginatedMedia, setPaginatedMedia] = useState<MediaFile[]>([]);
  // Which "page" we're on (1-based). page = 1 means the first ITEMS_PER_PAGE, etc.
  const [page, setPage] = useState(1);
  // Toggle while fetching from storage
  const [isLoading, setIsLoading] = useState(true);
  // When user logs out, redirect to login
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);
  // Once we have a userId, fetch all output media files from `${userId}/output`
  useEffect(() => {
    if (user?.uid) {
      fetchMediaFiles(user.uid);
    }
  }, [user?.uid]);

  const getFileType = (fileName: string): "image" | "video" => {
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
    ];
    const videoExtensions = [
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mkv",
      ".flv",
      ".wmv",
    ];

    const extension = fileName
      .toLowerCase()
      .substring(fileName.lastIndexOf("."));

    if (imageExtensions.includes(extension)) return "image";
    if (videoExtensions.includes(extension)) return "video";

    return "image"; // default to image
  };

  const fetchMediaFiles = async (userId: string) => {
    setIsLoading(true);

    // Try to get cached data
    const cached = sessionStorage.getItem(`mediaCache-${userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      setMediaFiles(parsed);
      setPaginatedMedia(parsed.slice(0, ITEMS_PER_PAGE));
      setPage(1);
      setIsLoading(false);
      return;
    }

    try {
      const folderRef = ref(storage, `${userId}/output`);
      const res = await listAll(folderRef);

      const urlPromises = res.items.map(async (item) => {
        const url = await getDownloadURL(item);
        const metadata = await getMetadata(item);
        return {
          url,
          name: item.name,
          type: getFileType(item.name),
          createdAt: new Date(metadata.timeCreated).getTime(),
        };
      });

      const files = await Promise.all(urlPromises);

      const sortedFiles = files.sort((a, b) => b.createdAt - a.createdAt);

      // Cache for the session
      sessionStorage.setItem(
        `mediaCache-${userId}`,
        JSON.stringify(sortedFiles),
      );

      setMediaFiles(sortedFiles);
      setPaginatedMedia(sortedFiles.slice(0, ITEMS_PER_PAGE));
      setPage(1);
    } catch (error) {
      console.error("Error loading media files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Append the next batch when the user scrolls near the bottom
  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    // If no more media files to load, do nothing
    if (startIndex >= mediaFiles.length) {
      return;
    }

    const nextSlice = mediaFiles.slice(startIndex, endIndex);
    setPaginatedMedia((prev: MediaFile[]) => [...prev, ...nextSlice]);
    setPage(nextPage);
  }, [mediaFiles, page]);

  // Scroll listener: when near bottom, call loadMore()
  useEffect(() => {
    const handleScroll = () => {
      // Distance from bottom (in pixels) at which we trigger loadMore
      const threshold = 200;
      // How far have we scrolled?
      const scrolledToBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - threshold;
      // If we're at bottom and there are still media files left, load more
      if (scrolledToBottom && page * ITEMS_PER_PAGE < mediaFiles.length) {
        loadMore();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [mediaFiles.length, loadMore, page]);

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
              {paginatedMedia.map((media, index) => (
                <div
                  key={index}
                  className="w-full aspect-square rounded overflow-hidden"
                >
                  {media.type === "image" ? (
                    <ImageZoomModal
                      src={media.url}
                      alt={`User output ${index}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <VideoZoomModal
                      src={media.url}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
            {/* Optional: A little "Loading..." indicator at the bottom while fetching more.
                You can conditionally show this only if page * ITEMS_PER_PAGE < mediaFiles.length. */}
            {page * ITEMS_PER_PAGE < mediaFiles.length && (
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
