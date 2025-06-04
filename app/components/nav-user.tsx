"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Gem,
  LayoutDashboard,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  User,
  Headset,
  Info,
  Compass,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";

export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setEmail(user.email || "IMAI.STUDIO");
        setAvatarUrl(user.photoURL || "");

        try {
          const userRef = doc(firestore, "profiles", user.uid);
          const snapshot = await getDoc(userRef);
          if (snapshot.exists()) {
            const data = snapshot.data();
            setProfileName(data.name || "");
          } else {
            setProfileName("");
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
          setProfileName("");
        }
      } else {
        setCurrentUser(null);
        setProfileName("");
        setEmail("");
        setAvatarUrl("");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return null;
  }

  // If not logged in, show Login and Sign Up buttons
  if (!currentUser) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={() => router.push("/login")}
            className="text-sm"
          >
            Login
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={() => router.push("/signup")}
            className="text-sm"
          >
            Sign Up
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // If logged in, show avatar, name, email, and logout option
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={profileName || "User"} />
                ) : (
                  <AvatarFallback className="rounded-lg">
                    {profileName ? profileName.charAt(0) : "U"}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {profileName || "Unnamed User"}
                </span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
               <DropdownMenuItem onClick={() => router.push("/pricing")}>
                <Gem />
                Pricing
              </DropdownMenuItem>
               <DropdownMenuItem onClick={() => router.push("/explore")}>
                <Compass />
                Explore
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/billing")}>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/contact")}>
                <Headset />
                Support
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User />
              Profile
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
