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

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuItems = [
    { label: "Sign Up", href: "/signup" },
    { label: "Login", href: "/login" },
    { label: "Explore", href: "/explore" },
    { label: "About", href: "/about" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];

  return (
    <Navbar className="bg-white dark:bg-black" position="sticky" onMenuOpenChange={setIsMenuOpen}>
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand as={Link} href="/">
          <IMAIIcon size={32} />
          <p className="hidden md:flex pl-2 font-bold text-inherit">IMAI</p>
          
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        <NavbarItem>
          <Link href="/explore">Explore</Link>
        </NavbarItem>
        <NavbarItem>
          <Link href="/about">About</Link>
        </NavbarItem>
        <NavbarItem>
          <Link href="/pricing">Pricing</Link>
        </NavbarItem>
        <NavbarItem>
          <Link href="/contact">Contact</Link>
        </NavbarItem>
        <NavbarItem>
          <Link href="/terms">Terms</Link>
        </NavbarItem>
      </NavbarContent>

  
      <NavbarContent justify="end">
        <NavbarItem className="hidden lg:flex">
          <Link href="/login">Login</Link>
        </NavbarItem>
        <NavbarItem>
          <Button as={Link} href="/signup" className="rounded-full bg-black text-white dark:bg-white dark:text-black">
            Getting Started
          </Button>
        </NavbarItem>
        <ThemeSwitch className="hidden lg:flex" />
      </NavbarContent>

      <NavbarMenu className="bg-black text-white">
        {menuItems.map((item, index) => (
          <NavbarMenuItem key={`${item.label}-${index}`}>
            <Link className="w-full" href={item.href} size="lg">
              {item.label}
            </Link>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}
