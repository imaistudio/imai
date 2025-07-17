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

// 🔧 NEW: Tool types
export type ToolType =
  | "analyzeimage"
  | "upscale"
  | "removebg"
  | "inpainting"
  | "clarityupscaler"
  | "objectremoval"
  | "mirrormagic"
  | "reframe"
  | "timeofday"
  | "promptenhancer"
  | "elementaldesign"
  | "scenecomposition"
  | "flowdesign"
  | "chainofzoom"
  | "pairing";

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
    urls.some((url: string) => url.includes("/general/")),
  ),
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

// 🔧 NEW: Tools data structure
export const defaultToolImages: Record<ToolType, string[]> = {
  analyzeimage: ["lucide:eye"],
  upscale: ["lucide:zoom-in"],
  removebg: ["lucide:scissors"],
  inpainting: ["lucide:paintbrush"],
  clarityupscaler: ["lucide:focus"],
  objectremoval: ["lucide:eraser"],
  mirrormagic: ["lucide:copy"],
  reframe: ["lucide:crop"],
  timeofday: ["lucide:clock"],
  promptenhancer: ["lucide:wand"],
  elementaldesign: ["lucide:layers"],
  scenecomposition: ["lucide:layout"],
  flowdesign: ["lucide:git-branch"],
  chainofzoom: ["lucide:search"],
  pairing: ["lucide:link"],
};

// 🔧 NEW: Tool placeholders (icon names for lucide icons)
export const toolPlaceholders: Record<ToolType, string> = {
  analyzeimage: "lucide:eye",
  upscale: "lucide:zoom-in", 
  removebg: "lucide:scissors",
  inpainting: "lucide:paintbrush",
  clarityupscaler: "lucide:focus",
  objectremoval: "lucide:eraser",
  mirrormagic: "lucide:copy",
  reframe: "lucide:crop",
  timeofday: "lucide:clock",
  promptenhancer: "lucide:wand",
  elementaldesign: "lucide:layers",
  scenecomposition: "lucide:layout",
  flowdesign: "lucide:git-branch",
  chainofzoom: "lucide:search",
  pairing: "lucide:link",
};

// 🔧 NEW: Tool labels for display
export const toolLabels: Record<ToolType, string> = {
  analyzeimage: "Analyze<br>Image",
  upscale: "Upscale<br>Image",
  removebg: "Remove<br>Background", 
  inpainting: "InPainting",
  clarityupscaler: "Clarity<br>Upscaler",
  objectremoval: "Object<br>Removal",
  mirrormagic: "Mirror<br>Magic",
  reframe: "ReFrame",
  timeofday: "Time of<br>Day",
  promptenhancer: "Prompt<br>Enhancer",
  elementaldesign: "Elemental<br>Design",
  scenecomposition: "Scene<br>Composition",
  flowdesign: "Flow<br>Design",
  chainofzoom: "Chain of<br>Zoom",
  pairing: "AI<br>Pairing",
};
