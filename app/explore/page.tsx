"use client";
import Footer from "../components/footer";
import Header from "../components/header";
import { ImageZoomModal } from "../components/ImageZoomModal";
import { VideoZoomModal } from "../components/VideoZoomModal";
import { useState, useEffect, useCallback } from "react";
import { storage } from "@/lib/firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";

interface MediaItem {
  url: string;
  type: "image" | "video";
  name: string;
}

export default function Masonry() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numColumns, setNumColumns] = useState(2);

  const ITEMS_PER_PAGE = 20;

  const isImageFile = (filename: string): boolean => {
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".avif",
      ".svg",
    ];
    return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  };

  const isVideoFile = (filename: string): boolean => {
    const videoExtensions = [
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mkv",
      ".flv",
      ".wmv",
    ];
    return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  };

  const extractNumericValue = (filename: string): number => {
    // Extract the numeric part from the filename (e.g., "1.png" -> 1, "23.jpg" -> 23)
    const match = filename.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const distributeItemsAcrossColumns = (items: MediaItem[], numColumns: number): MediaItem[][] => {
    const columns: MediaItem[][] = Array.from({ length: numColumns }, () => []);
    
    // Distribute items across columns in round-robin fashion to maintain horizontal order
    items.forEach((item, index) => {
      const columnIndex = index % numColumns;
      columns[columnIndex].push(item);
    });
    
    return columns;
  };

  const fetchMediaItems = useCallback(
    async (isLoadMore: boolean = false) => {
      try {
        if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const exploreRef = ref(storage, "expolore");
        const result = await listAll(exploreRef);

        // Get all files and their download URLs
        const allFiles = await Promise.all(
          result.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            const filename = itemRef.name;
            let type: "image" | "video" = "image";

            if (isImageFile(filename)) {
              type = "image";
            } else if (isVideoFile(filename)) {
              type = "video";
            }

            return {
              url,
              type,
              name: filename,
            };
          }),
        );

        // Filter out unsupported file types
        const supportedFiles = allFiles.filter(
          (file) => isImageFile(file.name) || isVideoFile(file.name),
        );

        // Sort files numerically based on their filename numbers
        supportedFiles.sort((a, b) => {
          const numA = extractNumericValue(a.name);
          const numB = extractNumericValue(b.name);
          return numA - numB;
        });

        if (isLoadMore) {
          // Calculate pagination
          const currentLength = mediaItems.length;
          const newItems = supportedFiles.slice(
            currentLength,
            currentLength + ITEMS_PER_PAGE,
          );

          if (newItems.length > 0) {
            setMediaItems((prev) => [...prev, ...newItems]);
            setHasMore(currentLength + newItems.length < supportedFiles.length);
          } else {
            setHasMore(false);
          }
        } else {
          // Initial load
          const initialItems = supportedFiles.slice(0, ITEMS_PER_PAGE);
          setMediaItems(initialItems);
          setHasMore(initialItems.length < supportedFiles.length);
        }
        setError(null);
      } catch (err) {
        console.error("Error fetching media items:", err);
        setError("Failed to load media items");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mediaItems.length],
  );

  const loadMoreItems = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchMediaItems(true);
    }
  }, [loadingMore, hasMore, fetchMediaItems]);

  useEffect(() => {
    fetchMediaItems();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 1000
      ) {
        loadMoreItems();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMoreItems]);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setNumColumns(4); // lg
      } else if (width >= 768) {
        setNumColumns(3); // md
      } else {
        setNumColumns(2); // sm and below
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const renderMediaItem = (item: MediaItem, index: number) => {
    const key = `${item.name}-${index}`;

    if (item.type === "video") {
      return (
        <div
          key={key}
          className="w-full mb-2 break-inside-avoid overflow-hidden rounded-lg lg:rounded-2xl"
        >
          <VideoZoomModal
            src={item.url}
            className="w-full h-auto rounded-lg lg:rounded-2xl object-cover cursor-pointer"
          />
        </div>
      );
    } else {
      return (
        <div
          key={key}
          className="w-full mb-2 break-inside-avoid overflow-hidden rounded-lg lg:rounded-2xl"
        >
          <ImageZoomModal
            src={item.url}
            alt={`Gallery ${index + 1}`}
            className="w-full h-auto rounded-lg lg:rounded-2xl object-cover cursor-pointer"
          />
        </div>
      );
    }
  };

  if (error) {
    return (
      <>
        <Header />
        <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => fetchMediaItems()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
        <div className="flex gap-2">
          {distributeItemsAcrossColumns(mediaItems, numColumns).map((columnItems, columnIndex) => (
            <div key={columnIndex} className="flex-1 flex flex-col">
              {columnItems.map((item, itemIndex) => {
                const originalIndex = mediaItems.findIndex(mediaItem => mediaItem.name === item.name);
                return renderMediaItem(item, originalIndex);
              })}
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
