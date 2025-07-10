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
  type: 'image' | 'video';
  name: string;
}

export default function Masonry() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 20;

  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  const isVideoFile = (filename: string): boolean => {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  const fetchMediaItems = useCallback(async (isLoadMore: boolean = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const exploreRef = ref(storage, 'explore');
      const result = await listAll(exploreRef);
      
      // Get all files and their download URLs
      const allFiles = await Promise.all(
        result.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const filename = itemRef.name;
          let type: 'image' | 'video' = 'image';
          
          if (isImageFile(filename)) {
            type = 'image';
          } else if (isVideoFile(filename)) {
            type = 'video';
          }
          
          return {
            url,
            type,
            name: filename
          };
        })
      );

      // Filter out unsupported file types
      const supportedFiles = allFiles.filter(file => 
        isImageFile(file.name) || isVideoFile(file.name)
      );

      if (isLoadMore) {
        // Calculate pagination
        const currentLength = mediaItems.length;
        const newItems = supportedFiles.slice(currentLength, currentLength + ITEMS_PER_PAGE);
        
        if (newItems.length > 0) {
          setMediaItems(prev => [...prev, ...newItems]);
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
      console.error('Error fetching media items:', err);
      setError('Failed to load media items');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mediaItems.length]);

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
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        loadMoreItems();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreItems]);

  const renderMediaItem = (item: MediaItem, index: number) => {
    const key = `${item.name}-${index}`;
    
    if (item.type === 'video') {
      return (
        <div
          key={key}
          className="w-full break-inside-avoid overflow-hidden rounded-lg lg:rounded-2xl"
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
          className="w-full break-inside-avoid overflow-hidden rounded-lg lg:rounded-2xl"
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

  if (loading) {
    return (
      <>
        <Header />
        <main className="dark:bg-black bg-white min-h-screen px-2 py-2 sm:p-2">
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

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
        <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 gap-2 space-y-4">
          {mediaItems.map((item, index) => renderMediaItem(item, index))}
        </div>
        
        {loadingMore && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        )}
        
        {!hasMore && mediaItems.length > 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No more items to load</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
