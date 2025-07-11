"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDownloadURL, listAll, ref } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { storage } from "@/lib/firebase";
import { Search, LayoutGrid, SquarePen } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar";

interface SearchFormProps extends React.ComponentProps<"form"> {
  onSearchChange: (searchTerm: string) => void;
  onNewChatClick?: () => Promise<void>; // 🔧 NEW: Optional custom new chat handler
}

export function SearchForm({
  onSearchChange,
  onNewChatClick,
  ...props
}: SearchFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { createNewChat } = useChat();
  const [libraryCount, setLibraryCount] = useState<number>(0);
  const [latestImageUrl, setLatestImageUrl] = useState<string | null>(null);
  const [latestFileType, setLatestFileType] = useState<"image" | "video" | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

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

  const handleNewChatClick = async () => {
    if (isCreatingChat) return; // Prevent multiple clicks

    try {
      setIsCreatingChat(true);

      // 🔧 NEW: Use custom handler if provided, otherwise use default
      if (onNewChatClick) {
        await onNewChatClick();
      } else {
        await createNewChat();
      }

      console.log("New chat created successfully");
    } catch (error) {
      console.error("Error creating new chat:", error);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  useEffect(() => {
    const fetchLibraryImage = async () => {
      if (!user) {
        console.log("No user found");
        return;
      }

      console.log("User UID:", user.uid);
      console.log("Fetching from path:", `${user.uid}/output`);

      const cached = sessionStorage.getItem("libraryCache");
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log("Using cached data:", parsed);
        setLibraryCount(parsed.count);
        setLatestImageUrl(parsed.url);
        setLatestFileType(parsed.type || "image");
        return;
      }

      try {
        const outputRef = ref(storage, `${user.uid}/output`);
        console.log("Created storage reference");

        const items = await listAll(outputRef);
        console.log("Found items:", items.items.length);
        console.log(
          "Item names:",
          items.items.map((item) => item.name),
        );

        const sortedItems = items.items.sort((a, b) =>
          b.name.localeCompare(a.name),
        );

        const url =
          sortedItems.length > 0 ? await getDownloadURL(sortedItems[0]) : null;
        const fileType = sortedItems.length > 0 ? getFileType(sortedItems[0].name) : "image";

        console.log("Download URL:", url);
        console.log("File type:", fileType);

        const result = {
          count: items.items.length,
          url,
          type: fileType,
        };

        console.log("Final result:", result);
        sessionStorage.setItem("libraryCache", JSON.stringify(result));
        setLibraryCount(result.count);
        setLatestImageUrl(result.url);
        setLatestFileType(fileType);
      } catch (error) {
        console.error("Error fetching latest library image:", error);
        console.error(
          "Error details:",
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    fetchLibraryImage();
  }, [user]);

  return (
    <>
      <form autoComplete="off" {...props}>
        <SidebarGroup className="py-1">
          <div className="flex items-center gap-2 w-full">
            <SidebarGroupContent className="relative w-[92%]">
              <Label htmlFor="search" className="sr-only">
                Search
              </Label>
              <SidebarInput
                id="search"
                placeholder="Search"
                className="pl-8 w-full"
                onChange={handleSearchChange}
              />
              <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
            </SidebarGroupContent>

            <button
              type="button"
              onClick={handleNewChatClick}
              disabled={isCreatingChat}
              className={`w-[8%] flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors ${
                isCreatingChat
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
              aria-label="New Chat"
            >
              {isCreatingChat ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <SquarePen className="text-black dark:text-white" />
              )}
            </button>
          </div>
        </SidebarGroup>
      </form>
      {/* Below Form Buttons */}
      <div className="flex flex-col gap-1 px-2">
        {/* Explore */}
        <button
          type="button"
          onClick={() => router.push("/explore")}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white hover:font-semibold"
        >
          <span>
            <LayoutGrid className="p-1.5 h-8 w-8 object-cover rounded-md" />
          </span>
          Explore
        </button>

        {/* Library - only render if user ID exists and has media files */}
        {user?.uid && libraryCount > 0 && latestImageUrl && (
          <button
            type="button"
            onClick={() => router.push("/library")}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white hover:font-semibold"
          >
            <span>
              {latestFileType === "video" ? (
                <video
                  src={latestImageUrl}
                  className="p-0.5 h-8 w-8 object-cover rounded-md"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => e.currentTarget.play()}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                />
              ) : (
                <img
                  src={latestImageUrl}
                  alt="Library"
                  className="p-0.5 h-8 w-8 object-cover rounded-md"
                />
              )}
            </span>
            Library
          </button>
        )}
      </div>
    </>
  );
}
