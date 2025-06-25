"use client";
import type { IconProps } from "@iconify/react";
import React from "react";
import { Link, Spacer } from "@heroui/react";
import { Icon } from "@iconify/react";
import { IMAIIcon } from "@/app/components/imai";
type SocialIconProps = Omit<IconProps, "icon">;

const navLinks = [
  {
    name: "Home",
    href: "/",
  },
  {
    name: "About",
    href: "/about",
  },
  {
    name: "Explore",
    href: "/explore",
  },
  {
    name: "Pricing",
    href: "/pricing",
  },
  {
    name: "Contact",
    href: "/contact",
  },
  {
    name: "Privacy",
    href: "/privacy",
  },
  {
    name: "Terms",
    href: "/terms",
  },
];

const socialItems = [
  {
    name: "Facebook",
    href: "#",
    icon: (props: SocialIconProps) => (
      <Icon {...props} icon="fontisto:facebook" />
    ),
  },
  {
    name: "Instagram",
    href: "#",
    icon: (props: SocialIconProps) => (
      <Icon {...props} icon="fontisto:instagram" />
    ),
  },
  {
    name: "Twitter",
    href: "#",
    icon: (props: SocialIconProps) => (
      <Icon {...props} icon="fontisto:twitter" />
    ),
  },
  {
    name: "linkedIn",
    href: "#",
    icon: (props: SocialIconProps) => (
      <Icon {...props} icon="fontisto:linkedin" />
    ),
  },
  {
    name: "YouTube",
    href: "#",
    icon: (props: SocialIconProps) => (
      <Icon {...props} icon="fontisto:youtube-play" />
    ),
  },
];

export default function Footer() {
  return (
    <footer className="flex w-full flex-col bg-white text-black dark:bg-black dark:text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-6 py-12 lg:px-8">
        <div className="flex items-center justify-center">
          <IMAIIcon size={32} />
          <span className="m-2 text-medium font-medium">IMAI</span>
        </div>
        <Spacer y={4} />
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {navLinks.map((item) => (
            <Link
              key={item.name}
              className="text-black dark:text-white hover:scale-110 hover:font-semibold"
              href={item.href}
              size="sm"
            >
              {item.name}
            </Link>
          ))}
        </div>
        <Spacer y={6} />
        <div className="flex justify-center gap-x-4">
          {socialItems.map((item) => (
            <Link
              key={item.name}
              isExternal
              className="text-black dark:text-white hover:scale-110 hover:font-semibold"
              href={item.href}
            >
              <span className="sr-only text-black dark:text-white hover:scale-110 hover:font-semibold">
                {item.name}
              </span>
              <item.icon aria-hidden="true" className="w-5" />
            </Link>
          ))}
        </div>
        <Spacer y={4} />
        <p className="mt-1 text-center text-small text-default-400">
          &copy; 2025 IMAI.Studio Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
