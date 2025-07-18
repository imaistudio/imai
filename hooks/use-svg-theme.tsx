"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function useSVGTheme() {
  const { theme } = useTheme();

  useEffect(() => {
    // Detect if it's Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // Function to update SVG colors based on theme
    const updateSVGColors = () => {
      // More specific selector - only SVG files directly in placeholders folder
      const productPlaceholderImages = document.querySelectorAll(
        'img[src*="/inputs/placeholders/"][src$=".svg"]',
      );

      productPlaceholderImages.forEach((img) => {
        const imgElement = img as HTMLImageElement;
        const src = imgElement.src;

        // Skip if it's a design or color preset
        if (src.includes("/designs/") || src.includes("/colors/")) {
          return;
        }

        // Only apply JavaScript filter for Safari
        if (isSafari) {
          if (theme === "dark") {
            // Apply white color for dark mode in Safari
            imgElement.style.filter = "invert(1)";
          } else {
            // Remove filter for light mode in Safari
            imgElement.style.filter = "none";
          }
        } else {
          // For other browsers, remove any filter (let SVG media queries handle it)
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
              const images = element.querySelectorAll?.(
                'img[src*="/inputs/placeholders/"][src$=".svg"]',
              );
              if (images && images.length > 0) {
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
