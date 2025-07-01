"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
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
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Auto-focus the input when editing starts
  useEffect(() => {
    if (editingItem && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingItem]);

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

  const handleArchive = async (item: SidebarItem) => {
    if (!currentUser) return;

    try {
      console.log("📦 Archiving chat:", item.chatId);

      // Create archive document with exact same schema as sidebar, filtering out undefined values
      const archiveData = {
        ...(item.chatId !== undefined && { chatId: item.chatId }),
        ...(item.chatSummary !== undefined && { chatSummary: item.chatSummary }),
        ...(item.userId !== undefined && { userId: item.userId }),
        ...(item.createdAt !== undefined && { createdAt: item.createdAt }),
        ...(item.updatedAt !== undefined && { updatedAt: item.updatedAt }),
        ...(item.isPinned !== undefined && { isPinned: item.isPinned }),
        ...(item.pinnedAt !== undefined && { pinnedAt: item.pinnedAt }),
      };

      const archiveRef = collection(firestore, `users/${currentUser.uid}/archive`);
      await addDoc(archiveRef, archiveData);

      // Delete the sidebar entry
      const sidebarDocRef = doc(
        firestore,
        `users/${currentUser.uid}/sidebar`,
        item.id,
      );
      await deleteDoc(sidebarDocRef);

      // If the archived chat was the current chat, clear the current chat
      if (currentChatId === item.chatId) {
        switchToChat("");
      }

      console.log("📦 Successfully archived chat:", item.chatId);
    } catch (error) {
      console.error("❌ Error archiving chat:", error);
    }
  };

  const handleRename = async (item: SidebarItem, newSummary: string) => {
    if (!currentUser || !newSummary.trim()) return;

    try {
      console.log("✏️ Renaming chat:", item.chatId, "to:", newSummary);

      const sidebarDocRef = doc(
        firestore,
        `users/${currentUser.uid}/sidebar`,
        item.id,
      );

      await updateDoc(sidebarDocRef, {
        chatSummary: newSummary.trim(),
        updatedAt: serverTimestamp(),
      });

      console.log("✏️ Successfully renamed chat:", item.chatId);
    } catch (error) {
      console.error("❌ Error renaming chat:", error);
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

  const startRename = (item: SidebarItem) => {
    console.log("🔍 Starting rename for:", item.chatId, item.chatSummary);
    setEditingItem(item.chatId);
    setEditingValue(item.chatSummary || "");
  };

  const saveRename = async (item: SidebarItem) => {
    console.log("💾 Saving rename:", editingValue);
    if (editingValue.trim() && editingValue.trim() !== item.chatSummary) {
      await handleRename(item, editingValue.trim());
    }
    setEditingItem(null);
    setEditingValue("");
  };

  const cancelRename = () => {
    console.log("❌ Canceling rename");
    setEditingItem(null);
    setEditingValue("");
  };

  const renderChatItem = (
    item: SidebarItem,
    isPinnedSection: boolean = false,
  ) => {
    const isClicking = clickingItem === item.chatId;
    const isDisabled = isSwitching || clickingItem !== null;
    const isSelected = currentChatId === item.chatId;
    const isEditing = editingItem === item.chatId;

    return (
      <div
        key={item.id}
        onClick={() => !isEditing && handleItemClick(item)}
        className={`p-2 rounded-lg transition-all duration-200 group/item ${
          isSelected
            ? "bg-white dark:bg-black"
            : isDisabled || isEditing
              ? "opacity-50"
              : "hover:bg-muted/50 cursor-pointer"
        } ${isClicking ? "scale-95 bg-primary/5" : ""}`}
        style={{
          pointerEvents: isDisabled ? "none" : "auto",
          cursor: isEditing ? "default" : "pointer",
        }}
      >
        <div className="flex items-center justify-between">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => saveRename(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveRename(item);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <small className="capitalize text-sm text-foreground truncate whitespace-nowrap overflow-hidden flex-1">
              {(item.chatSummary?.length > 30
                ? item.chatSummary.slice(0, 30)
                : item.chatSummary) || "Untitled Chat"}
            </small>
          )}

          {isClicking ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0"></div>
          ) : !isEditing ? (
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
                    <DropdownItem key="rename" onClick={() => startRename(item)}>
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
                    <DropdownItem key="archive" onClick={() => handleArchive(item)}>
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
          ) : null}
        </div>
      </div>
    );
  };

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
      {unpinnedItems.length > 0 && (
        <>
          <p className="ml-4 p-0 opacity-50">Chats</p>
          <div className="space-y-1 p-2">
            {unpinnedItems.map((item) => renderChatItem(item, false))}
          </div>
        </>
      )}
    </div>
  );
}
