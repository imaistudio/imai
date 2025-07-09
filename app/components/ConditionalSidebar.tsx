"use client";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/app/components/app-sidebar";
import { useChat } from "@/contexts/ChatContext";

export default function ConditionalSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { createNewChat } = useChat();

  const isRoot = pathname === "/";

  // 🔧 NEW: Custom new chat handler for sidebar
  const handleNewChatClick = async () => {
    try {
      await createNewChat();
      console.log("✅ New chat created from sidebar");
    } catch (error) {
      console.error("❌ Error creating new chat from sidebar:", error);
    }
  };

  if (!isRoot) return <>{children}</>;

  return (
    <SidebarProvider>
      <AppSidebar onNewChatClick={handleNewChatClick} />
      <SidebarTrigger />
      {children}
    </SidebarProvider>
  );
}
