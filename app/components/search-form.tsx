import { Search, ListPlus } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar";

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const handleNewChatClick = () => {
    console.log("New Chat");
  };

  return (
    <form autoComplete="off" {...props}>
      <SidebarGroup className="py-2">
        {/* Horizontal flex layout */}
        <div className="flex items-center gap-2 w-full">
          {/* Search input (90%) */}
          <SidebarGroupContent className="relative w-[92%]">
            <Label htmlFor="search" className="sr-only">
              Search
            </Label>
            <SidebarInput
              id="search"
              placeholder="Search Chats"
              className="pl-8 w-full"
            />
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
          </SidebarGroupContent>

          {/* New Chat icon (10%) */}
          <button
            type="button"
            onClick={handleNewChatClick}
            className="w-[8%] flex items-center justify-center rounded-md pointer-events-none"
            aria-label="New Chat"
          >
            <ListPlus className="text-black dark:text-white"  />
          </button>
        </div>
      </SidebarGroup>
    </form>
  );
}