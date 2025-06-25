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

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const router = useRouter();
  const { user } = useAuth();
  const { createNewChatIfNeeded } = useChat();
  const [libraryCount, setLibraryCount] = useState<number>(0);
  const [latestImageUrl, setLatestImageUrl] = useState<string | null>(null);

  const handleNewChatClick = async () => {
    try {
      await createNewChatIfNeeded();
      console.log(
        "New chat created or switched to existing empty chat successfully",
      );
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
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

        console.log("Download URL:", url);

        const result = {
          count: items.items.length,
          url,
        };

        console.log("Final result:", result);
        sessionStorage.setItem("libraryCache", JSON.stringify(result));
        setLibraryCount(result.count);
        setLatestImageUrl(result.url);
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
              />
              <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
            </SidebarGroupContent>

            <button
              type="button"
              onClick={handleNewChatClick}
              className="w-[8%] flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="New Chat"
            >
              <SquarePen className="text-black dark:text-white" />
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

        {/* Library - only render if user ID exists and has images */}
        {user?.uid && libraryCount > 0 && latestImageUrl && (
          <button
            type="button"
            onClick={() => router.push("/library")}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white hover:font-semibold"
          >
            <span>
              <img
                src={latestImageUrl}
                alt="Library"
                className="p-0.5 h-8 w-8 object-cover rounded-md"
              />
            </span>
            Library
          </button>
        )}
      </div>
    </>
  );
}
