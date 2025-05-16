"use client";
import type {NavbarProps} from "@heroui/react";
import React from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Link,
  Button,
  Divider,
} from "@heroui/react";
import {Icon} from "@iconify/react";
import {cn} from "@heroui/react";
import {IMAIIcon} from "@/app/components/imai";
const menuItems = [
  "About",
  "Blog",
  "Customers",
  "Pricing",
  "Enterprise",
  "Changelog",
  "Documentation",
  "Contact Us",
];

export default function Header(props: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <Navbar
      {...props}
      classNames={{
        base: cn("border-default-100", {
          "bg-default-200/50 dark:bg-default-100/50": isMenuOpen,
        }),
        wrapper: "w-3/4 justify-center",
        item: "hidden md:flex",
      }}
      height="60px"
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
    >
      {/* Left Content */}
    <NavbarBrand as={Link} href="/" className="cursor-pointer">
    <div className="rounded-full bg-foreground text-background">
        <IMAIIcon size={32} />
    </div>
    <span className="ml-2 text-small font-medium text-white">IMAI</span>
    </NavbarBrand>

      {/* Center Content */}
      <NavbarContent justify="center" className="ml-2 lg:ml-8 mr-2 lg:mr-8">
        <NavbarItem>
          <Link className="text-default-500" href="/pricing" size="sm">
            Pricing
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link className="text-default-500" href="/explore" size="sm">
            Explore
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link className="text-default-500" href="/contact" size="sm">
            Contact
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link className="text-default-500" href="/about" size="sm">
            About
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link className="text-default-500" href="/terms" size="sm">
            Terms
          </Link>
        </NavbarItem>
      </NavbarContent>

      {/* Right Content */}
      <NavbarContent className="hidden md:flex" justify="end">
        <NavbarItem className="ml-2 !flex gap-2">
          <Button className="text-default-500" radius="full" variant="light">
            Login
          </Button>
          <Button
            className="bg-white font-medium text-black hover:cursor-pointer"
            color="secondary"
            endContent={<Icon icon="solar:alt-arrow-right-linear" />}
            radius="full"
            variant="flat"
          >
            Get Started
          </Button>
        </NavbarItem>
      </NavbarContent>

      <NavbarMenuToggle className="text-default-400 md:hidden" />

      <NavbarMenu className="top-[calc(var(--navbar-height)_-_1px)] max-h-fit bg-default-200/50 pb-6 pt-6 shadow-medium backdrop-blur-md backdrop-saturate-150 dark:bg-default-100/50">
        <NavbarMenuItem>
          <Button fullWidth as={Link} href="/#" variant="faded">
            Sign In
          </Button>
        </NavbarMenuItem>
        <NavbarMenuItem className="mb-4">
          <Button fullWidth as={Link} className="bg-foreground text-background" href="/#">
            Get Started
          </Button>
        </NavbarMenuItem>
        {menuItems.map((item, index) => (
          <NavbarMenuItem key={`${item}-${index}`}>
            <Link className="mb-2 w-full text-default-500" href="#" size="md">
              {item}
            </Link>
            {index < menuItems.length - 1 && <Divider className="opacity-50" />}
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}
