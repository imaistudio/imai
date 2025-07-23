"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function useSVGTheme() {
  const { theme } = useTheme();

  useEffect(() => {
    // Function to update SVG colors based on theme
    const updateSVGColors = () => {
      // More specific selector - only SVG files directly in placeholders folder
      const productPlaceholderImages = document.querySelectorAll(
        'img[src*="/inputs/placeholders/"][src$=".svg"]',
      );
      
      // Also target the design icon specifically
      const designIcons = document.querySelectorAll(
        'img[src*="/logos/input/asterisk.svg"]',
      );

      // Combine both selectors
      const allTargetImages = [
        ...Array.from(productPlaceholderImages),
        ...Array.from(designIcons),
      ];

      allTargetImages.forEach((img) => {
        const imgElement = img as HTMLImageElement;
        const src = imgElement.src;

        // Skip if it's a design or color preset (but not the design icon itself)
        if (
          (src.includes("/designs/") || src.includes("/colors/")) &&
          !src.includes("/logos/input/asterisk.svg")
        ) {
          return;
        }

        // Apply CSS filter for all browsers since SVG media queries don't work reliably for external SVGs
        if (theme === "dark") {
          // Apply white color for dark mode
          imgElement.style.filter = "invert(1)";
        } else {
          // Remove filter for light mode
          imgElement.style.filter = "none";
        }
      });
    };

    // Update immediately
    updateSVGColors();

    // Also update when images are loaded dynamically
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const placeholderImages = element.querySelectorAll?.(
                'img[src*="/inputs/placeholders/"][src$=".svg"]',
              );
              const designIcons = element.querySelectorAll?.(
                'img[src*="/logos/input/asterisk.svg"]',
              );
              
              if ((placeholderImages && placeholderImages.length > 0) || 
                  (designIcons && designIcons.length > 0)) {
                updateSVGColors();
              }
            }
          });
        }
      });
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Cleanup
    return () => {
      observer.disconnect();
    };
  }, [theme]);
}
