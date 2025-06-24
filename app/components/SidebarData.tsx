"use client";
import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";

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

export default function SidebarData() {
  const { user: currentUser } = useAuth();
  const { currentChatId, switchToChat, isSwitching } = useChat();
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clickingItem, setClickingItem] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setSidebarItems([]);
      setLoading(false);
      return;
    }

    // Create a real-time listener for sidebar data
    const sidebarRef = collection(firestore, `users/${currentUser.uid}/sidebar`);
    const q = query(sidebarRef, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: SidebarItem[] = [];
      snapshot.forEach((doc) => {
        items.push({
          id: doc.id,
          ...doc.data()
        } as SidebarItem);
      });
      setSidebarItems(items);
      setLoading(false);
    }, (error) => {
      console.error("❌ Error fetching sidebar data:", error);
      setLoading(false);
    });

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
    <div className="h-full overflow-y-auto hide-scrollbar">
      <div className="space-y-1 p-2">
        {sidebarItems.map((item) => {
          const isClicking = clickingItem === item.chatId;
          const isDisabled = isSwitching || clickingItem !== null;
          
          return (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                isDisabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-muted/50"
              } ${
                isClicking ? "scale-95 bg-primary/5" : ""
              }`}
              style={{
                pointerEvents: isDisabled ? 'none' : 'auto'
              }}
            >
              <div className="flex items-center justify-between">
                <small className="text-sm text-foreground truncate whitespace-nowrap overflow-hidden flex-1">
                  {(item.chatSummary?.length > 30
                    ? item.chatSummary.slice(0, 30) + "..."
                    : item.chatSummary) || "Untitled Chat"}
                </small>
                {isClicking && (
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0"></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 