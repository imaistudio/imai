"use client";
import Footer from "../components/footer";
import Header from "../components/header";
import { ImageZoomModal } from "../components/ImageZoomModal";
import { VideoZoomModal } from "../components/VideoZoomModal";
import { useState, useEffect, useCallback } from "react";
import MobileNavRest from "@/app/components/MobileNavRest";
import { Spinner } from "@heroui/react";

interface MediaItem {
  url: string;
  type: "image" | "video";
  name: string;
}

interface ApiResponse {
  items: MediaItem[];
  pagination: {
    page: number;
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

export default function Masonry() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [numColumns, setNumColumns] = useState(2);

  const ITEMS_PER_PAGE = 20;

  const distributeItemsAcrossColumns = (
    items: MediaItem[],
    numColumns: number,
  ): MediaItem[][] => {
    const columns: MediaItem[][] = Array.from({ length: numColumns }, () => []);

    // Distribute items across columns in round-robin fashion to maintain horizontal order
    items.forEach((item, index) => {
      const columnIndex = index % numColumns;
      columns[columnIndex].push(item);
    });

    return columns;
  };

  const fetchMediaItems = useCallback(
    async (page: number = 1, isLoadMore: boolean = false) => {
      try {
        if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        console.log(`🔄 Fetching page ${page} from server-side API...`);
        
        const response = await fetch(
          `/api/explore?page=${page}&limit=${ITEMS_PER_PAGE}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ApiResponse = await response.json();
        
        console.log(`✅ Received ${data.items.length} items from server`);

        if (isLoadMore) {
          setMediaItems((prev) => [...prev, ...data.items]);
        } else {
          setMediaItems(data.items);
        }

        setHasMore(data.pagination.hasMore);
        setCurrentPage(data.pagination.page);
        setError(null);

      } catch (err) {
        console.error("❌ Error fetching media items:", err);
        setError("Failed to load media items. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  const loadMoreItems = useCallback(() => {
    if (!loadingMore && hasMore) {
      console.log(`📄 Loading more items - next page: ${currentPage + 1}`);
      fetchMediaItems(currentPage + 1, true);
    }
  }, [loadingMore, hasMore, currentPage, fetchMediaItems]);

  useEffect(() => {
    console.log("🚀 Initial load - fetching first page");
    fetchMediaItems(1, false);
  }, [fetchMediaItems]);

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

  const renderMediaItem = (item: MediaItem, uniqueKey: string) => {
    const key = `media-${uniqueKey}`;

    const handleDownload = async (url: string) => {
      console.log("🔄 Starting download for:", url);

      try {
        // Extract filename from URL
        let fileName = url.split("/").pop() || `download-${Date.now()}.jpg`;

        // Clean up filename - remove query parameters
        if (fileName.includes("?")) {
          fileName = fileName.split("?")[0];
        }

        // Ensure filename has an extension
        if (!fileName.includes(".")) {
          fileName += ".jpg";
        }

        console.log("📁 Using filename:", fileName);

        // Use server-side proxy for ALL URLs (most reliable approach)
        const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}`;

        console.log("🔗 Proxy URL:", proxyUrl);

        // Create download link and trigger immediately
        const link = document.createElement("a");
        link.href = proxyUrl;
        link.download = fileName;
        link.style.display = "none";
        document.body.appendChild(link);

        // Force click
        link.click();

        // Clean up after a short delay
        setTimeout(() => {
          try {
            document.body.removeChild(link);
            console.log("🗑️ Cleaned up download link");
          } catch (e) {
            console.warn("⚠️ Could not clean up link:", e);
          }
        }, 1000);
      } catch (error) {
        console.error("❌ Download failed:", error);

        // Simple fallback: direct window.open
        console.log("🔄 Fallback: Opening in new tab");
        window.open(url, "_blank");
      }
    };

    if (item.type === "video") {
      return (
        <div
          key={key}
          className="w-full mb-2 break-inside-avoid overflow-hidden rounded-lg lg:rounded-2xl"
        >
          <VideoZoomModal
            src={item.url}
            className="w-full h-auto rounded-lg lg:rounded-2xl object-cover cursor-pointer"
            onDownload={handleDownload}
            onShare={(platform, content) => {}}
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
            alt={`Gallery ${uniqueKey.split("-")[2] + 1}`}
            className="w-full h-auto rounded-lg lg:rounded-2xl object-cover cursor-pointer"
            onDownload={handleDownload}
            onShare={(platform, content) => {}}
          />
        </div>
      );
    }
  };

  if (loading && mediaItems.length === 0) {
    return (
      <>
        <Header />
        <MobileNavRest />
        <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
          <div className="flex justify-center items-center min-h-[50vh]">
            <Spinner size="md" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error && mediaItems.length === 0) {
    return (
      <>
        <Header />
        <MobileNavRest />
        <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => fetchMediaItems(1, false)}
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
      <MobileNavRest />
      <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
        <div className="flex gap-2">
          {distributeItemsAcrossColumns(mediaItems, numColumns).map(
            (columnItems, columnIndex) => (
              <div
                key={`column-${columnIndex}`}
                className="flex-1 flex flex-col"
              >
                {columnItems.map((item, itemIndex) => {
                  const originalIndex = mediaItems.findIndex(
                    (mediaItem) => mediaItem.url === item.url,
                  );
                  return renderMediaItem(
                    item,
                    `${columnIndex}-${itemIndex}-${originalIndex}`,
                  );
                })}
              </div>
            ),
          )}
        </div>
        
        {/* Loading indicator for infinite scroll */}
        {loadingMore && (
          <div className="flex justify-center items-center py-8">
             <Spinner size="md" />
          </div>
        )}
        
        {/* End of content indicator */}
        {/* {!hasMore && mediaItems.length > 0 && (
          <div className="flex justify-center items-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              🎉 You've seen all {mediaItems.length} amazing creations!
            </p>
          </div>
        )} */}
      </main>
      <Footer />
    </>
  );
}
