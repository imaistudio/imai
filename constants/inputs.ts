// Types
export type ProductType = "tshirt" | "pillow" | "shoes" | "phonecase" | "wallart";

export interface ProductImages {
  [key: string]: string[];
}

export interface ProductSpecificDesigns {
  [key: string]: {
    [category: string]: string[];
  };
}

// Product Images
export const defaultProductImages: Record<ProductType, string[]> = {
  tshirt: ["/designs/tshirt/tshirt1.jpg", "/designs/tshirt/tshirt2.jpg", "/designs/tshirt/tshirt3.jpg"],
  pillow: ["/designs/tshirt/pillow1.jpg", "/designs/tshirt/pillow2.jpg", "/designs/tshirt/pillow3.jpg"],
  shoes: ["/designs/tshirt/mug1.jpg", "/designs/tshirt/mug2.jpg", "/designs/tshirt/mug3.jpg"],
  phonecase: ["/designs/tshirt/poster1.jpg", "/designs/tshirt/poster2.jpg", "/designs/tshirt/poster3.jpg"],
  wallart: ["/designs/tshirt/poster1.jpg", "/designs/tshirt/poster2.jpg", "/designs/tshirt/poster3.jpg"]
};

// Product Specific Designs
export const productSpecificDesigns: ProductSpecificDesigns = {
  tshirt: {
    graphic: ["/designs/tshirt/graphic1.jpg", "/designs/tshirt/graphic2.jpg"],
    typography: ["/designs/tshirt/typography1.jpg", "/designs/tshirt/typography2.jpg"],
    vintage: ["/designs/tshirt/vintage1.jpg", "/designs/tshirt/vintage2.jpg"],
    minimal: ["/designs/tshirt/minimal1.jpg", "/designs/tshirt/minimal2.jpg"],
  },
  pillow: {
    floral: ["/designs/pillow/floral1.jpg", "/designs/pillow/floral2.jpg"],
    geometric: ["/designs/pillow/geometric1.jpg", "/designs/pillow/geometric2.jpg"],
    abstract: ["/designs/pillow/abstract1.jpg", "/designs/pillow/abstract2.jpg"],
  },
  shoes: {
    quotes: ["/designs/mug/quotes1.jpg", "/designs/mug/quotes2.jpg"],
    patterns: ["/designs/mug/patterns1.jpg", "/designs/mug/patterns2.jpg"],
    illustrations: ["/designs/mug/illustrations1.jpg", "/designs/mug/illustrations2.jpg"],
  },
  phonecase: {
    motivational: ["/designs/poster/motivational1.jpg", "/designs/poster/motivational2.jpg"],
    artistic: ["/designs/poster/artistic1.jpg", "/designs/poster/artistic2.jpg"],
    photography: ["/designs/poster/photography1.jpg", "/designs/poster/photography2.jpg"],
  },
};

// Default Design Images
export const defaultDesignImages: ProductImages = {
  abstract: ["/defaults/abstract1.jpg", "/defaults/abstract2.jpg"],
  pattern: ["/defaults/pattern1.jpg", "/defaults/pattern2.jpg"],
  geometric: ["/defaults/geometric1.jpg", "/defaults/geometric2.jpg"],
};

// Default Color Images
export const defaultColorImages: ProductImages = {
  warm: ["/defaults/warm1.jpg", "/defaults/warm2.jpg"],
  cool: ["/defaults/cool1.jpg", "/defaults/cool2.jpg"],
  neutral: ["/defaults/neutral1.jpg", "/defaults/neutral2.jpg"],
};

// Placeholders
export const defaultPlaceholders: Record<ProductType, string> = {
  tshirt: "/placeholders/tshirt.jpg",
  pillow: "/placeholders/pillow.jpg",
  shoes: "/placeholders/mug.jpg",
  phonecase: "/placeholders/poster.jpg",
  wallart: "/placeholders/poster.jpg",
};

export const designPlaceholders: Record<string, string> = {
  graphic: "/placeholders/graphic.jpg",
  typography: "/placeholders/typography.jpg",
  vintage: "/placeholders/vintage.jpg",
  minimal: "/placeholders/minimal.jpg",
  abstract: "/placeholders/abstract.jpg",
  pattern: "/placeholders/pattern.jpg",
  geometric: "/placeholders/geometric.jpg",
  floral: "/placeholders/floral.jpg",
  quotes: "/placeholders/quotes.jpg",
  patterns: "/placeholders/patterns.jpg",
  illustrations: "/placeholders/illustrations.jpg",
  motivational: "/placeholders/motivational.jpg",
  artistic: "/placeholders/artistic.jpg",
  photography: "/placeholders/photography.jpg",
};

export const colorPlaceholders: Record<string, string> = {
  warm: "/placeholders/warm.jpg",
  cool: "/placeholders/cool.jpg",
  neutral: "/placeholders/neutral.jpg",
};