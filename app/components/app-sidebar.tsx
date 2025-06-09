"use client"

import * as React from "react"
import {
  AudioWaveform,
  Bot,
  Command,
  GalleryVerticalEnd,
  Settings2,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavUser } from "./nav-user"
import { IMAIIcon } from "./imai"
import { SearchForm } from "./search-form"



export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar  {...props}>
      <SidebarHeader>
        <IMAIIcon size={30} />  
        <SearchForm></SearchForm>    
      </SidebarHeader>

      <SidebarContent>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
