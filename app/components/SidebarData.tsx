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
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Move,
  MessageCircle,
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

interface FolderItem {
  id: string;
  folderid: string;
  foldername: string;
  chatsid: string[];
  chatssummary: string[];
  createdAt: any;
  updatedAt: any;
}

interface SidebarDataProps {
  searchTerm: string;
}

export default function SidebarData({ searchTerm }: SidebarDataProps) {
  const { user: currentUser } = useAuth();
  const { currentChatId, switchToChat, isSwitching } = useChat();
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clickingItem, setClickingItem] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [movingChat, setMovingChat] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Filter and separate pinned and unpinned items based on search term
  const { pinnedItems, unpinnedItems, foldersFiltered } = useMemo(() => {
    const filteredItems = searchTerm.trim()
      ? sidebarItems.filter((item) =>
          item.chatSummary?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      : sidebarItems;

    const filteredFolders = searchTerm.trim()
      ? folders.filter(
          (folder) =>
            folder.foldername?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            folder.chatssummary?.some((summary) =>
              summary.toLowerCase().includes(searchTerm.toLowerCase()),
            ),
        )
      : folders;

    // Get chat IDs that are in folders
    const chatsInFolders = new Set(
      filteredFolders.flatMap((folder) => folder.chatsid || []),
    );

    // Filter out chats that are in folders
    const itemsNotInFolders = filteredItems.filter(
      (item) => !chatsInFolders.has(item.chatId),
    );

    const pinned = itemsNotInFolders.filter((item) => item.isPinned);
    const unpinned = itemsNotInFolders.filter((item) => !item.isPinned);

    return {
      pinnedItems: pinned,
      unpinnedItems: unpinned,
      foldersFiltered: filteredFolders,
    };
  }, [sidebarItems, folders, searchTerm]);

  useEffect(() => {
    if (!currentUser) {
      setSidebarItems([]);
      setFolders([]);
      setLoading(false);
      return;
    }

    // Create a real-time listener for sidebar data
    const sidebarRef = collection(
      firestore,
      `users/${currentUser.uid}/sidebar`,
    );
    const q = query(sidebarRef, orderBy("updatedAt", "desc"));

    const unsubscribeSidebar = onSnapshot(
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

    // Create a real-time listener for folders
    const foldersRef = collection(
      firestore,
      `users/${currentUser.uid}/folders`,
    );
    const foldersQuery = query(foldersRef, orderBy("updatedAt", "desc"));

    const unsubscribeFolders = onSnapshot(
      foldersQuery,
      (snapshot) => {
        const folderItems: FolderItem[] = [];
        snapshot.forEach((doc) => {
          folderItems.push({
            id: doc.id,
            ...doc.data(),
          } as FolderItem);
        });
        setFolders(folderItems);
      },
      (error) => {
        console.error("❌ Error fetching folders:", error);
      },
    );

    return () => {
      unsubscribeSidebar();
      unsubscribeFolders();
    };
  }, [currentUser]);

  // Auto-focus the input when editing starts
  useEffect(() => {
    if (editingItem && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingItem]);

  useEffect(() => {
    if (editingFolder && folderInputRef.current) {
      folderInputRef.current.focus();
      folderInputRef.current.select();
    }
  }, [editingFolder]);

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creatingFolder]);

  // Folder operations
  const createFolder = async () => {
    if (!currentUser || !newFolderName.trim()) return;

    try {
      const foldersRef = collection(firestore, `users/${currentUser.uid}/folders`);
      await addDoc(foldersRef, {
        folderid: `folder_${Date.now()}`,
        foldername: newFolderName.trim(),
        chatsid: [],
        chatssummary: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCreatingFolder(false);
      setNewFolderName("");
      console.log("📁 Created folder:", newFolderName.trim());
    } catch (error) {
      console.error("❌ Error creating folder:", error);
    }
  };

  const deleteFolder = async (folder: FolderItem) => {
    if (!currentUser) return;

    try {
      const folderDocRef = doc(
        firestore,
        `users/${currentUser.uid}/folders`,
        folder.id,
      );
      await deleteDoc(folderDocRef);
      console.log("🗑️ Deleted folder:", folder.foldername);
    } catch (error) {
      console.error("❌ Error deleting folder:", error);
    }
  };

  const renameFolder = async (folder: FolderItem, newName: string) => {
    if (!currentUser || !newName.trim()) return;

    try {
      const folderDocRef = doc(
        firestore,
        `users/${currentUser.uid}/folders`,
        folder.id,
      );
      await updateDoc(folderDocRef, {
        foldername: newName.trim(),
        updatedAt: serverTimestamp(),
      });
      console.log("✏️ Renamed folder:", folder.foldername, "to:", newName.trim());
    } catch (error) {
      console.error("❌ Error renaming folder:", error);
    }
  };

  const moveChatsToFolder = async (folder: FolderItem, chatIds: string[]) => {
    if (!currentUser) return;

    try {
      const chatSummaries = chatIds.map((chatId) => {
        const chat = sidebarItems.find((item) => item.chatId === chatId);
        return chat?.chatSummary || "";
      });

      const folderDocRef = doc(
        firestore,
        `users/${currentUser.uid}/folders`,
        folder.id,
      );
      await updateDoc(folderDocRef, {
        chatsid: [...(folder.chatsid || []), ...chatIds],
        chatssummary: [...(folder.chatssummary || []), ...chatSummaries],
        updatedAt: serverTimestamp(),
      });
      console.log("📁 Moved chats to folder:", folder.foldername);
    } catch (error) {
      console.error("❌ Error moving chats to folder:", error);
    }
  };

  const removeChatFromFolder = async (folder: FolderItem, chatId: string) => {
    if (!currentUser) return;

    try {
      const chatIndex = folder.chatsid.indexOf(chatId);
      if (chatIndex === -1) return;

      const newChatIds = folder.chatsid.filter((id) => id !== chatId);
      const newChatSummaries = folder.chatssummary.filter(
        (_, index) => index !== chatIndex,
      );

      const folderDocRef = doc(
        firestore,
        `users/${currentUser.uid}/folders`,
        folder.id,
      );
      await updateDoc(folderDocRef, {
        chatsid: newChatIds,
        chatssummary: newChatSummaries,
        updatedAt: serverTimestamp(),
      });
      console.log("📤 Removed chat from folder:", folder.foldername);
    } catch (error) {
      console.error("❌ Error removing chat from folder:", error);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const startFolderRename = (folder: FolderItem) => {
    setEditingFolder(folder.id);
    setEditingFolderValue(folder.foldername || "");
  };

  const saveFolderRename = async (folder: FolderItem) => {
    if (editingFolderValue.trim() && editingFolderValue.trim() !== folder.foldername) {
      await renameFolder(folder, editingFolderValue.trim());
    }
    setEditingFolder(null);
    setEditingFolderValue("");
  };

  const cancelFolderRename = () => {
    setEditingFolder(null);
    setEditingFolderValue("");
  };

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
        ...(item.chatSummary !== undefined && {
          chatSummary: item.chatSummary,
        }),
        ...(item.userId !== undefined && { userId: item.userId }),
        ...(item.createdAt !== undefined && { createdAt: item.createdAt }),
        ...(item.updatedAt !== undefined && { updatedAt: item.updatedAt }),
        ...(item.isPinned !== undefined && { isPinned: item.isPinned }),
        ...(item.pinnedAt !== undefined && { pinnedAt: item.pinnedAt }),
      };

      const archiveRef = collection(
        firestore,
        `users/${currentUser.uid}/archive`,
      );
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
    inFolder: boolean = false,
    folder?: FolderItem,
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
                    <DropdownItem
                      key="rename"
                      onClick={() => startRename(item)}
                    >
                      <div className="flex items-center gap-2">
                        <Pencil size={16} />
                        Rename
                      </div>
                    </DropdownItem>
                    {!inFolder ? (
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
                    ) : null}
                    {foldersFiltered.length > 0 && !inFolder ? (
                      <>
                        {foldersFiltered.map((folderItem) => (
                          <DropdownItem 
                            key={`move-${folderItem.id}`}
                            onClick={() => moveChatsToFolder(folderItem, [item.chatId])}
                          >
                            <div className="flex items-center gap-2">
                              <Move size={16} />
                              Move to {folderItem.foldername}
                            </div>
                          </DropdownItem>
                        ))}
                      </>
                    ) : null}
                    {inFolder && folder ? (
                      <DropdownItem
                        key="remove-from-folder"
                        onClick={() => removeChatFromFolder(folder, item.chatId)}
                      >
                        <div className="flex items-center gap-2">
                          <Move size={16} />
                          Remove from Folder
                        </div>
                      </DropdownItem>
                    ) : null}
                  </DropdownSection>
                  <DropdownSection>
                    <DropdownItem
                      key="archive"
                      onClick={() => handleArchive(item)}
                    >
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

  const renderFolderItem = (folder: FolderItem) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isEditing = editingFolder === folder.id;
    const folderChats = folder.chatsid
      .map((chatId) => sidebarItems.find((item) => item.chatId === chatId))
      .filter(Boolean) as SidebarItem[];

    return (
      <div key={folder.id} className="mb-2">
        <div
          onClick={() => !isEditing && toggleFolder(folder.id)}
          className="p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-all duration-200 group/folder"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              {isExpanded ? (
                <ChevronDown size={16} className="text-muted-foreground" />
              ) : (
                <ChevronRight size={16} className="text-muted-foreground" />
              )}
              <Folder size={16} className="text-muted-foreground" />
              {isEditing ? (
                <input
                  ref={folderInputRef}
                  type="text"
                  value={editingFolderValue}
                  onChange={(e) => setEditingFolderValue(e.target.value)}
                  onBlur={() => saveFolderRename(folder)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveFolderRename(folder);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelFolderRename();
                    }
                  }}
                  className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  maxLength={50}
                  autoComplete="off"
                  spellCheck={false}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <small className="text-sm text-foreground truncate whitespace-nowrap overflow-hidden flex-1">
                  {folder.foldername || "Untitled Folder"}
                </small>
              )}
            </div>

            {!isEditing && (
              <div className="opacity-0 group-hover/folder:opacity-100 transition-opacity duration-150">
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
                      <DropdownItem
                        key="rename"
                        onClick={() => startFolderRename(folder)}
                      >
                        <div className="flex items-center gap-2">
                          <Pencil size={16} />
                          Rename
                        </div>
                      </DropdownItem>
                    </DropdownSection>
                    <DropdownSection>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        color="danger"
                        onClick={() => deleteFolder(folder)}
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

        {isExpanded && folderChats.length > 0 && (
          <div className="space-y-1 p-2">
            {folderChats.map((chat) =>
              renderChatItem(chat, false, true, folder)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-2 md:mt-2 lg:mt-4 h-full overflow-y-auto hide-scrollbar">
      {/* Create Folder Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between p-2">
          <p className="ml-2 p-0 opacity-50">Folders</p>
          <button
            onClick={() => setCreatingFolder(true)}
            className="p-1 text-black dark:text-white rounded hover:bg-muted/50 transition-colors"
            title="Create Folder"
          >
            <FolderPlus size={16} />
          </button>
        </div>
        
        {/* Create Folder Input */}
        {creatingFolder && (
          <div className="p-2">
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={() => {
                if (newFolderName.trim()) {
                  createFolder();
                } else {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newFolderName.trim()) {
                    createFolder();
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
              placeholder="Enter folder name..."
              className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        
        {/* Folders List */}
        {foldersFiltered.length > 0 && (
          <div className="space-y-1 p-2">
            {foldersFiltered.map((folder) => renderFolderItem(folder))}
          </div>
        )}
      </div>

      {/* Pinned Section */}
      {pinnedItems.length > 0 && (
        <>
          <div className="flex items-center justify-between p-2">
            <p className="ml-2 p-0 opacity-50">Pins</p>
            <button
              className="p-1 text-black dark:text-white rounded hover:bg-muted/50 transition-colors"
              title="Pin"
            >
              <Pin size={16} />
            </button>
          </div>
          <div className="space-y-1 p-2 mb-4">
            {pinnedItems.map((item) => renderChatItem(item, true))}
          </div>
        </>
      )}

      {/* Regular Chats Section */}
      {unpinnedItems.length > 0 && (
        <>
          <div className="flex items-center justify-between p-2">
            <p className="ml-2 p-0 opacity-50">Chats</p>
            <button
              className="p-1 text-black dark:text-white rounded hover:bg-muted/50 transition-colors"
              title="Chat"
            >
              <MessageCircle size={16} />
            </button>
          </div>
          <div className="space-y-1 p-2">
            {unpinnedItems.map((item) => renderChatItem(item, false))}
          </div>
        </>
      )}
    </div>
  );
}
