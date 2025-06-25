import type { IconSvgProps } from "@/types/icon";
import React from "react";

export const IMAIIcon: React.FC<IconSvgProps> = ({
  size = 32,
  width,
  height,
  ...props
}) => (
  <svg
    fill="none"
    height={size || height}
    width={size || width}
    viewBox="0 0 199 148.82"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M74.54 31.19c1.47,-3.44 3.86,-4.97 7.36,-4.97 3.44,0 5.84,1.53 7.13,4.97l44.39 117.63 28.36 0 -49.36 -129.97c-5.22,-13.63 -15.17,-18.85 -30.33,-18.85 -15.35,0 -25.36,5.22 -30.76,18.85l-51.33 129.97 28.18 0 46.36 -117.63z"
      fill="currentColor"
      fillRule="nonzero"
      clipRule="evenodd"
    />
    <path
      d="M111.76 31.19c1.47,-3.44 3.86,-4.97 7.36,-4.97 3.44,0 5.84,1.53 7.12,4.97l44.39 117.63 28.37 0 -49.36 -129.97c-5.22,-13.63 -15.17,-18.85 -30.33,-18.85 -15.35,0 -25.36,5.22 -30.76,18.85l-51.33 129.97 28.18 0 46.36 -117.63z"
      fill="currentColor"
      fillRule="nonzero"
      clipRule="evenodd"
    />
  </svg>
);
