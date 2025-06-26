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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [searchTerm, setSearchTerm] = React.useState("");

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SearchForm onSearchChange={setSearchTerm} />
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
