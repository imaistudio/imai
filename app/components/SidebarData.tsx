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
  const { currentChatId, switchToChat } = useChat();
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error("Error fetching sidebar data:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleItemClick = (item: SidebarItem) => {
    console.log("Switching to chat:", item.chatId);
    switchToChat(item.chatId);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        Please log in to view chats
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (sidebarItems.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        No chats yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto hide-scrollbar">
      <div className="space-y-1 p-2">
        {sidebarItems.map((item) => (
          <div
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={`p-2 rounded-lg cursor-pointer transition-colors ${
              currentChatId === item.chatId 
                ? "bg-primary/10 border border-primary/20" 
                : "hover:bg-muted/50"
            }`}
          >
            <small className="w-3/4 text-sm text-foreground truncate whitespace-nowrap overflow-hidden">
              {item.chatSummary || "Untitled Chat"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
} 