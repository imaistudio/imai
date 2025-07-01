// Import JSON data
import productsData from "./data/products.json";
import designsData from "./data/designs.json";
import colorsData from "./data/colors.json";
import labelsData from "./data/labels.json";

// Types
export type ProductType =
  | "tshirt"
  | "pillow"
  | "shoes"
  | "phonecase"
  | "wallart"
  | "hoodie"
  | "coffecup"
  | "totebag"
  | "blanket"
  | "earrings"
  | "sofa"
  | "scarf"
  | "backpack"
  | "lamp"
  | "dress"
  | "jean"
  | "plate"
  | "notebook"
  | "shoulderbag"
  | "vase"
  | "toys"
  | "vehicles"
  | "glasses"
  | "watches";

export interface ProductImages {
  [key: string]: string[];
}

export interface ProductSpecificDesigns {
  [key: string]: {
    [category: string]: string[];
  };
}

// Default Product Images
export const defaultProductImages: Record<ProductType, string[]> =
  productsData.defaultImages as Record<ProductType, string[]>;

// Default Design Images
export const defaultDesignImages: ProductImages = designsData.defaultImages;

// General Design Images (only designs with /general/ path - for when no product is selected)
export const generalDesignImages: ProductImages = Object.fromEntries(
  Object.entries(designsData.defaultImages).filter(([key, urls]) =>
    urls.some((url: string) => url.includes('/general/'))
  )
);

// Default Color Images
export const defaultColorImages: ProductImages = colorsData.defaultImages;

// Default Product Placeholders
export const defaultPlaceholders: Record<ProductType, string> =
  productsData.placeholders as Record<ProductType, string>;

// Design Placeholder
export const designPlaceholders: Record<string, string> =
  designsData.placeholders;

// Color Placeholder
export const colorPlaceholders: Record<string, string> =
  colorsData.placeholders;

// Product Specific Designs
export const productSpecificDesigns: ProductSpecificDesigns =
  productsData.specificDesigns;

// Product Labels (supports HTML tags like <br>)
export const productLabels: Record<ProductType, string> =
  labelsData.products as Record<ProductType, string>;

// Design Labels (supports HTML tags like <br>)
export const designLabels: Record<string, string> = labelsData.designs;

// Color Labels (supports HTML tags like <br>)
export const colorLabels: Record<string, string> = labelsData.colors;
