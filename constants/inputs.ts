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

// 🔧 Tool types organized by category
export type ToolType =
  // Image to Image Tools
  | "analyzeimage"
  | "chainofzoom"
  | "clarityupscaler"
  | "elementaldesign"
  | "flowdesign"
  | "mirrormagic"
  | "pairing"
  | "reframe"
  | "removebg"
  | "scenecomposition"
  | "timeofday"
  | "upscale"
  // Image to Video Tools
  | "seedancevideo-floating"
  | "seedancevideo-liquid"
  | "seedancevideo-misty"
  | "seedancevideo-noir"
  | "seedancevideo-premium"
  | "seedancevideo-turntable"
  // Video to Video Tools
  | "videooutpainting"
  | "videoreframe"
  | "videosound"
  | "videoupscaler";

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

// 🔧 Tools data structure organized by category
export const defaultToolImages: Record<ToolType, string[]> = {
  // Image to Image Tools
  analyzeimage: ["lucide:eye"],
  chainofzoom: ["lucide:search"],
  clarityupscaler: ["lucide:focus"],
  elementaldesign: ["lucide:layers"],
  flowdesign: ["lucide:git-branch"],
  mirrormagic: ["lucide:copy"],
  pairing: ["lucide:link"],
  reframe: ["lucide:crop"],
  removebg: ["lucide:scissors"],
  scenecomposition: ["lucide:layout"],
  timeofday: ["lucide:clock"],
  upscale: ["lucide:zoom-in"],
  // Image to Video Tools
  "seedancevideo-floating": ["lucide:video"],
  "seedancevideo-liquid": ["lucide:video"],
  "seedancevideo-misty": ["lucide:video"],
  "seedancevideo-noir": ["lucide:video"],
  "seedancevideo-premium": ["lucide:video"],
  "seedancevideo-turntable": ["lucide:video"],
  // Video to Video Tools
  videooutpainting: ["lucide:expand"],
  videoreframe: ["lucide:crop"],
  videosound: ["lucide:volume-2"],
  videoupscaler: ["lucide:zoom-in"],
};

// 🔧 Tool placeholders (icon names for lucide icons)
export const toolPlaceholders: Record<ToolType, string> = {
  // Image to Image Tools
  analyzeimage: "lucide:eye",
  chainofzoom: "lucide:search",
  clarityupscaler: "lucide:focus",
  elementaldesign: "lucide:layers",
  flowdesign: "lucide:git-branch",
  mirrormagic: "lucide:copy",
  pairing: "lucide:link",
  reframe: "lucide:crop",
  removebg: "lucide:scissors",
  scenecomposition: "lucide:layout",
  timeofday: "lucide:clock",
  upscale: "lucide:zoom-in",
  // Image to Video Tools
  "seedancevideo-floating": "lucide:video",
  "seedancevideo-liquid": "lucide:video",
  "seedancevideo-misty": "lucide:video",
  "seedancevideo-noir": "lucide:video",
  "seedancevideo-premium": "lucide:video",
  "seedancevideo-turntable": "lucide:video",
  // Video to Video Tools
  videooutpainting: "lucide:expand",
  videoreframe: "lucide:crop",
  videosound: "lucide:volume-2",
  videoupscaler: "lucide:zoom-in",
};

// 🔧 Tool labels for display
export const toolLabels: Record<ToolType, string> = {
  // Image to Image Tools
  analyzeimage: "Analyze<br>Image",
  chainofzoom: "Chain of<br>Zoom",
  clarityupscaler: "Clarity<br>Upscaler",
  elementaldesign: "Elemental<br>Design",
  flowdesign: "Flow<br>Design",
  mirrormagic: "Mirror<br>Magic",
  pairing: "AI<br>Pairing",
  reframe: "ReFrame",
  removebg: "Remove<br>Background",
  scenecomposition: "Scene<br>Changer",
  timeofday: "Time of<br>Day",
  upscale: "Upscale<br>Image",
  // Image to Video Tools
  "seedancevideo-floating": "Floating<br>Video",
  "seedancevideo-liquid": "Liquid<br>Video",
  "seedancevideo-misty": "Misty<br>Video",
  "seedancevideo-noir": "Noir<br>Video",
  "seedancevideo-premium": "Premium<br>Video",
  "seedancevideo-turntable": "Turntable<br>Video",
  // Video to Video Tools
  videooutpainting: "Video<br>Outpainting",
  videoreframe: "Video<br>Reframe",
  videosound: "Video<br>Sound",
  videoupscaler: "Video<br>Upscaler",
};
