"use client"
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
import {IMAIIcon} from "@/app/components/imai";


export default function App() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const menuItems = [
    "Sign Up",
    "Login",
    "Explore",
    "About",
    "Pricing",
    "Contact",
    "Deployments",
    "Privacy",
    "Terms",
  ];

  return (
    <Navbar className="bg-black" position="static" onMenuOpenChange={setIsMenuOpen}>
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand>
          <IMAIIcon size={32} />
          <p className="pl-2 font-bold text-inherit">IMAI</p>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        <NavbarItem>
          <Link aria-current="page" href="#">
            Explore
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link aria-current="page" href="#">
            About
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link aria-current="page" href="#">
            Pricing
          </Link>
        </NavbarItem>
        <NavbarItem>
          <Link aria-current="page" href="#">
            Contact
          </Link>
        </NavbarItem>
       <NavbarItem>
          <Link aria-current="page" href="#">
            Terms
          </Link>
        </NavbarItem>


      </NavbarContent>
      <NavbarContent justify="end">
        <NavbarItem className="hidden lg:flex">
          <Link href="/login">Login</Link>
        </NavbarItem>
        <NavbarItem>
          <Button as={Link}  href="/signup" className="rounded-full bg-white text-black">
            Gettting Started
          </Button>
        </NavbarItem>
      </NavbarContent>
      <NavbarMenu>
        {menuItems.map((item, index) => (
          <NavbarMenuItem key={`${item}-${index}`}>
            <Link
              className="w-full"
              href="#"
              size="lg"
            >
              {item}
            </Link>
          </NavbarMenuItem>
        ))}
      </NavbarMenu>
    </Navbar>
  );
}

