"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "../components/header";
import Footer from "../components/footer";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ImageZoomModal } from "@/app/components/ImageZoomModal";
import { VideoZoomModal } from "@/app/components/VideoZoomModal";
import MobileNavRest from "@/app/components/MobileNavRest";

const ITEMS_PER_PAGE = 50;

interface MediaFile {
  url: string;
  name: string;
  type: "image" | "video";
  createdAt: number;
}

interface ApiResponse {
  items: MediaFile[];
  pagination: {
    page: number;
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

export default function Library() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // When user logs out, redirect to login
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const fetchMediaFiles = useCallback(
    async (page: number = 1, isLoadMore: boolean = false) => {
      if (!user?.uid) return;

      try {
        if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setIsLoading(true);
        }

        console.log(`🔄 Fetching library page ${page} from server-side API...`);
        
        const response = await fetch(
          `/api/library?page=${page}&limit=${ITEMS_PER_PAGE}&userId=${user.uid}`,
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
          setMediaFiles((prev) => [...prev, ...data.items]);
        } else {
          setMediaFiles(data.items);
        }

        setHasMore(data.pagination.hasMore);
        setCurrentPage(data.pagination.page);
        setError(null);

      } catch (err) {
        console.error("❌ Error fetching library items:", err);
        setError("Failed to load library items. Please try again.");
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.uid]
  );

  const loadMoreItems = useCallback(() => {
    if (!loadingMore && hasMore) {
      console.log(`📄 Loading more items - next page: ${currentPage + 1}`);
      fetchMediaFiles(currentPage + 1, true);
    }
  }, [loadingMore, hasMore, currentPage, fetchMediaFiles]);

  // Initial load when user is available
  useEffect(() => {
    if (user?.uid) {
      console.log("🚀 Initial load - fetching first page for user:", user.uid);
      fetchMediaFiles(1, false);
    }
  }, [user?.uid, fetchMediaFiles]);

  // Infinite scroll effect
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

  const handleDownload = async (url: string, fileName: string) => {
    console.log("🔄 Starting download for:", fileName);

    try {
      // Use server-side proxy for download
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
      // Fallback: direct window.open
      console.log("🔄 Fallback: Opening in new tab");
      window.open(url, "_blank");
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <MobileNavRest />
        <main className="p-4 min-h-screen">
          <div className="flex justify-center items-center h-[50vh]">
            <Spinner size="md" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (isLoading && mediaFiles.length === 0) {
    return (
      <>
        <Header />
        <MobileNavRest />
        <main className="p-4 min-h-screen">
          <div className="flex justify-center items-center h-[50vh]">
          <Spinner size="md" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error && mediaFiles.length === 0) {
    return (
      <>
        <Header />
        <MobileNavRest />
        <main className="p-4 min-h-screen">
          <div className="flex justify-center items-center h-[50vh]">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => fetchMediaFiles(1, false)}
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
      <main className="p-4 min-h-screen">
        {mediaFiles.length === 0 && !isLoading ? (
          <div className="flex justify-center items-center h-[50vh]">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Your library is empty. Start creating to see your work here!
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {mediaFiles.map((media, index) => (
                <div
                  key={`${media.url}-${index}`}
                  className="w-full aspect-square rounded overflow-hidden"
                >
                  {media.type === "image" ? (
                    <ImageZoomModal
                      src={media.url}
                      alt={`User output ${index}`}
                      className="w-full h-full object-cover"
                      onDownload={() => handleDownload(media.url, media.name)}
                      onShare={(platform, content) => {}}
                    />
                  ) : (
                    <VideoZoomModal
                      src={media.url}
                      className="w-full h-full object-cover"
                      onDownload={() => handleDownload(media.url, media.name)}
                      onShare={(platform, content) => {}}
                    />
                  )}
                </div>
              ))}
            </div>
            
            {/* Loading indicator for infinite scroll */}
            {loadingMore && (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading more...</span>
              </div>
            )}
            
            {/* End of content indicator */}
            {/* {!hasMore && mediaFiles.length > 0 && (
              <div className="flex justify-center items-center py-8">
                <p className="text-gray-500 dark:text-gray-400">
                  🎉 You've seen all {mediaFiles.length} of your creations!
                </p>
              </div>
            )} */}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
