"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
import { SearchForm } from "./search-form";
import SidebarData from "./SidebarData";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onNewChatClick?: () => Promise<void>; // 🔧 NEW: Optional custom new chat handler
}

export function AppSidebar({ onNewChatClick, ...props }: AppSidebarProps) {
  const [searchTerm, setSearchTerm] = React.useState("");

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchForm
          onSearchChange={setSearchTerm}
          onNewChatClick={onNewChatClick}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarData searchTerm={searchTerm} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
