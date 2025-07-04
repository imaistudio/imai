"use client";
import React from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenuToggle,
  NavbarMenu,
  NavbarMenuItem,
  Link,
  Button,
} from "@heroui/react";
import { IMAIIcon } from "@/app/components/imai";
import { ThemeSwitch } from "@/components/theme-switch";
import { useAuth } from "@/contexts/AuthContext";
import { InteractiveHoverButton } from "@/components/magicui/interactive-hover-button";
import { useRouter } from "next/navigation";

// Define the type for menu items
type MenuItem = {
  label: string;
  href: string;
  action?: string;
};

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  // Filter menu items based on authentication status
  const getMenuItems = (): MenuItem[] => {
    const baseItems: MenuItem[] = [
      { label: "Explore", href: "/explore" },
      { label: "About", href: "/about" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ];

    if (user) {
      // If user is logged in, add logout and remove login/signup
      return [...baseItems, { label: "Logout", href: "/", action: "logout" }];
    } else {
      // If user is not logged in, show login/signup
      return [
        { label: "Sign Up", href: "/signup" },
        { label: "Login", href: "/login" },
        ...baseItems,
      ];
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsMenuOpen(false); // Close mobile menu after logout
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.action === "logout") {
      handleLogout();
    } else {
      setIsMenuOpen(false); // Close mobile menu on navigation
    }
  };

  return (
    <>
    <Navbar
      className="hidden md:flex bg-white dark:bg-black"
      position="sticky"
      onMenuOpenChange={setIsMenuOpen}
    >
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand as={Link} href="/">
          <IMAIIcon className="text-black dark:text-white" size={32} />
          <p className="hidden md:flex pl-2 font-bold text-black dark:text-white">
            IMAI
          </p>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent
        className="hidden sm:flex gap-4 text-black dark:text-white"
        justify="center"
      >
        <NavbarItem>
          <Link
            className="text-black dark:text-white hover:scale-110 hover:font-semibold"
            href="/explore"
          >
            Explore
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link
            className="text-black dark:text-white hover:scale-110 hover:font-semibold"
            href="/about"
          >
            About
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link
            className="text-black dark:text-white hover:scale-110 hover:font-semibold"
            href="/pricing"
          >
            Pricing
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link
            className="text-black dark:text-white hover:scale-110 hover:font-semibold"
            href="/contact"
          >
            Contact
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link
            className="text-black dark:text-white hover:scale-110 hover:font-semibold"
            href="/terms"
          >
            Terms
          </Link>
        </NavbarItem>
      </NavbarContent>

      <NavbarContent justify="end">
        {!loading && (
          <>
            {user ? (
              // Show when user is authenticated
              <>
                <InteractiveHoverButton
                  onClick={() => router.push("/")}
                  className="hidden lg:flex"
                >
                  Start Generating
                </InteractiveHoverButton>
                <ThemeSwitch className="hidden lg:flex" />
              </>
            ) : (
              // Show when user is not authenticated
              <>
                {/* <NavbarItem className="hidden lg:flex text-black dark:text-white">
                  <Link
                    className="text-black dark:text-white hover:scale-110 hover:font-semibold"
                    href="/login"
                  >
                    Login
                  </Link>
                </NavbarItem> */}
                <NavbarItem>
                  <Button
                    as={Link}
                    href="/invite"
                    className="rounded-full bg-primary text-white"
                  >
                    Request Early Access
                  </Button>
                </NavbarItem>
                <ThemeSwitch className="hidden lg:flex" />
              </>
            )}
          </>
        )}
      </NavbarContent>
      <NavbarMenu className="bg-black text-white">
        {getMenuItems().map((item, index) => (
          <NavbarMenuItem key={`${item.label}-${index}`}>
            {item.action === "logout" ? (
              <button
                className="w-full text-left text-lg text-red-400 hover:text-red-300"
                onClick={() => handleMenuItemClick(item)}
              >
                {item.label}
              </button>
            ) : (
              <Link
                className="w-full"
                href={item.href}
                size="lg"
                onClick={() => handleMenuItemClick(item)}
              >
                {item.label}
              </Link>
            )}
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
    </>
  );
}
