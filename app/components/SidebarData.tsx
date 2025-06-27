"use client";
import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import {
  Archive,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/react";

interface SidebarItem {
  id: string;
  chatId: string;
  chatSummary: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  isPinned: boolean;
  pinnedAt: any;
}

interface SidebarDataProps {
  searchTerm: string;
}

export default function SidebarData({ searchTerm }: SidebarDataProps) {
  const { user: currentUser } = useAuth();
  const { currentChatId, switchToChat, isSwitching } = useChat();
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clickingItem, setClickingItem] = useState<string | null>(null);

  // Filter and separate pinned and unpinned items based on search term
  const { pinnedItems, unpinnedItems } = useMemo(() => {
    const filteredItems = searchTerm.trim()
      ? sidebarItems.filter((item) =>
          item.chatSummary?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : sidebarItems;

    const pinned = filteredItems.filter((item) => item.isPinned);
    const unpinned = filteredItems.filter((item) => !item.isPinned);

    return {
      pinnedItems: pinned,
      unpinnedItems: unpinned,
    };
  }, [sidebarItems, searchTerm]);

  useEffect(() => {
    if (!currentUser) {
      setSidebarItems([]);
      setLoading(false);
      return;
    }

    // Create a real-time listener for sidebar data
    const sidebarRef = collection(
      firestore,
      `users/${currentUser.uid}/sidebar`,
    );
    const q = query(sidebarRef, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: SidebarItem[] = [];
        snapshot.forEach((doc) => {
          items.push({
            id: doc.id,
            ...doc.data(),
          } as SidebarItem);
        });
        setSidebarItems(items);
        setLoading(false);
      },
      (error) => {
        console.error("❌ Error fetching sidebar data:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleItemClick = async (item: SidebarItem) => {
    // Prevent multiple clicks and clicking on already active chat
    if (clickingItem || isSwitching || currentChatId === item.chatId) {
      return;
    }

    try {
      setClickingItem(item.chatId);
      console.log("🔄 Sidebar: Switching to chat:", item.chatId);
      console.log("🔄 Current chat ID before switch:", currentChatId);

      switchToChat(item.chatId);
      console.log("🔄 Switch command sent for chat:", item.chatId);

      // Brief delay to show visual feedback
      setTimeout(() => {
        setClickingItem(null);
      }, 200);
    } catch (error) {
      console.error("❌ Error switching chat:", error);
      setClickingItem(null);
    }
  };

  const handlePin = async (item: SidebarItem) => {
    if (!currentUser) return;

    try {
      console.log("📌 Toggling pin for chat:", item.chatId);

      const sidebarDocRef = doc(
        firestore,
        `users/${currentUser.uid}/sidebar`,
        item.id,
      );

      if (item.isPinned) {
        // Unpin the item
        await updateDoc(sidebarDocRef, {
          isPinned: false,
          pinnedAt: null,
          updatedAt: serverTimestamp(),
        });
        console.log("📌 Unpinned chat:", item.chatId);
      } else {
        // Pin the item
        await updateDoc(sidebarDocRef, {
          isPinned: true,
          pinnedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log("📌 Pinned chat:", item.chatId);
      }
    } catch (error) {
      console.error("❌ Error toggling pin:", error);
    }
  };

  const handleDelete = async (item: SidebarItem) => {
    if (!currentUser) return;

    try {
      console.log("🗑️ Deleting chat:", item.chatId);

      // Delete the sidebar entry
      const sidebarDocRef = doc(
        firestore,
        `users/${currentUser.uid}/sidebar`,
        item.id,
      );
      await deleteDoc(sidebarDocRef);

      // Delete the actual chat document only if chatId exists
      if (item.chatId) {
        const chatDocRef = doc(
          firestore,
          `users/${currentUser.uid}/chats`,
          item.chatId,
        );
        await deleteDoc(chatDocRef);
      }

      // If the deleted chat was the current chat, clear the current chat
      if (currentChatId === item.chatId) {
        switchToChat("");
      }
    } catch (error) {
      console.error("❌ Error deleting chat:", error);
    }
  };

  const renderChatItem = (
    item: SidebarItem,
    isPinnedSection: boolean = false,
  ) => {
    const isClicking = clickingItem === item.chatId;
    const isDisabled = isSwitching || clickingItem !== null;
    const isSelected = currentChatId === item.chatId;

    const handleRename = () => console.log("✏️ Rename clicked:", item);
    const handleArchive = () => console.log("📦 Archive clicked:", item);

    return (
      <div
        key={item.id}
        onClick={() => handleItemClick(item)}
        className={`p-2 rounded-lg cursor-pointer transition-all duration-200 group/item ${
          isSelected
            ? "bg-white dark:bg-black"
            : isDisabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-muted/50"
        } ${isClicking ? "scale-95 bg-primary/5" : ""}`}
        style={{
          pointerEvents: isDisabled ? "none" : "auto",
        }}
      >
        <div className="flex items-center justify-between">
          <small className="capitalize text-sm text-foreground truncate whitespace-nowrap overflow-hidden flex-1">
            {(item.chatSummary?.length > 30
              ? item.chatSummary.slice(0, 30)
              : item.chatSummary) || "Untitled Chat"}
          </small>

          {isClicking ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0"></div>
          ) : (
            <div className="opacity-0 group-hover/item:opacity-100 transition-opacity duration-150">
              <Dropdown backdrop="blur" className="w-3/4 p-1" shadow="none">
                <DropdownTrigger>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-black dark:text-white rounded"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownTrigger>
                <DropdownMenu>
                  <DropdownSection showDivider>
                    <DropdownItem key="rename" onClick={handleRename}>
                      <div className="flex items-center gap-2">
                        <Pencil size={16} />
                        Rename
                      </div>
                    </DropdownItem>
                    <DropdownItem key="pin" onClick={() => handlePin(item)}>
                      <div className="flex items-center gap-2">
                        {item.isPinned ? (
                          <PinOff size={16} />
                        ) : (
                          <Pin size={16} />
                        )}
                        {item.isPinned ? "Unpin" : "Pin"}
                      </div>
                    </DropdownItem>
                  </DropdownSection>
                  <DropdownSection>
                    <DropdownItem key="archive" onClick={handleArchive}>
                      <div className="flex items-center gap-2">
                        <Archive size={16} />
                        Archive
                      </div>
                    </DropdownItem>
                    <DropdownItem
                      key="delete"
                      className="text-danger"
                      color="danger"
                      onClick={() => handleDelete(item)}
                    >
                      <div className="flex items-center gap-2">
                        <Trash2 size={16} />
                        Delete
                      </div>
                    </DropdownItem>
                  </DropdownSection>
                </DropdownMenu>
              </Dropdown>
            </div>
          )}
        </div>
      </div>
    );
  };

  // if (!currentUser) {
  //   return (
  //     <div className="flex items-center justify-center p-4 text-muted-foreground">
  //       Please log in to view chats
  //     </div>
  //   );
  // }

  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center p-4 text-muted-foreground">
  //       <div className="flex items-center gap-2">
  //         <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
  //         Loading chats...
  //       </div>
  //     </div>
  //   );
  // }

  // if (sidebarItems.length === 0) {
  //   return (
  //     <div className="flex items-center justify-center p-4 text-muted-foreground">
  //       No chats yet
  //     </div>
  //   );
  // }

  return (
    <div className="mt-2 md:mt-2 lg:mt-4 h-full overflow-y-auto hide-scrollbar">
      {/* Pinned Section */}
      {pinnedItems.length > 0 && (
        <>
          <p className="ml-4 p-0 opacity-50">Pins</p>
          <div className="space-y-1 p-2 mb-4">
            {pinnedItems.map((item) => renderChatItem(item, true))}
          </div>
        </>
      )}

      {/* Regular Chats Section */}
      <p className="ml-4 p-0 opacity-50">Chats</p>
      <div className="space-y-1 p-2">
        {unpinnedItems.map((item) => renderChatItem(item, false))}
      </div>
    </div>
  );
}
