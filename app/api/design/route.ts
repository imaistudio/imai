import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import sharp from "sharp";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { openaiQueue, queuedAPICall } from "@/lib/request-queue";
import { openAILimiter } from "@/lib/rate-limiter";

// Add configuration for longer timeout
export const maxDuration = 300; // 5 minute in seconds
export const dynamic = "force-dynamic";

// Firebase disabled - intentroute handles all file operations
let firebaseInitialized = false;
console.log(
  "🔥 Firebase disabled in design route - using intentroute for file handling"
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface ComposeProductResponse {
  status: string;
  firebaseInputUrls?: {
    product?: string;
    design?: string;
    color?: string;
    color2?: string;
  };
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  revised_prompt?: string;
  response_id?: string;
  model_used?: string;
  generation_method?: "responses_api" | "image_api";
  streaming_supported?: boolean;
  error?: string;
}

/**
 * Uploads a Buffer to Firebase Storage under the given path, and returns a signed URL.
 */
async function uploadBufferToFirebase(
  buffer: Buffer,
  destinationPath: string
): Promise<string> {
  try {
    if (!firebaseInitialized) {
      throw new Error(
        "Firebase is not initialized - cannot upload to Firebase Storage"
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new Error("Invalid buffer: Buffer is empty or undefined");
    }

    if (!destinationPath) {
      throw new Error("Invalid destination path: Path is empty or undefined");
    }

    console.log(
      `Uploading to Firebase Storage: ${destinationPath}, size: ${buffer.length} bytes`
    );

    const bucket = getStorage().bucket();
    if (!bucket) {
      throw new Error("Failed to get Firebase Storage bucket");
    }

    const file = bucket.file(destinationPath);

    // Save the buffer as a JPEG with optimized settings
    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=3600",
      },
      resumable: false,
      validation: false, // Skip MD5 hash validation for faster uploads
    });

    console.log("File uploaded successfully, generating signed URL...");

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    if (!signedUrl) {
      throw new Error("Failed to generate signed URL");
    }

    console.log("Signed URL generated successfully");
    return signedUrl;
  } catch (error: any) {
    console.error("Error uploading to Firebase Storage:", error);
    throw new Error(`Failed to upload to Firebase Storage: ${error.message}`);
  }
}

/**
 * Converts an input File object (from FormData) to a JPEG Buffer.
 */
async function fileToJpegBuffer(file: File): Promise<Buffer> {
  try {
    if (!file) {
      throw new Error("No file provided");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error(
        `Invalid file type: ${file.type}. Only image files are supported.`
      );
    }

    // Add file size limit check (10MB)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for high-res compositions
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      );
    }

    console.log(
      `Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`
    );

    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Failed to read file data");
    }

    const inputBuffer = Buffer.from(arrayBuffer);

    // Validate the input buffer
    if (!inputBuffer || inputBuffer.length === 0) {
      throw new Error("Failed to create buffer from file data");
    }

    // Use sharp to convert any input image format to JPEG with optimization
    const jpegBuffer = await sharp(inputBuffer)
      .resize(2048, 2048, {
        // Limit maximum dimensions
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85, // Slightly lower quality for better performance
        mozjpeg: true, // Use mozjpeg for better compression
      })
      .toBuffer();

    if (!jpegBuffer || jpegBuffer.length === 0) {
      throw new Error("Failed to convert image to JPEG format");
    }

    console.log(
      `Successfully converted image to JPEG, size: ${jpegBuffer.length} bytes`
    );
    return jpegBuffer;
  } catch (error: any) {
    console.error("Error in fileToJpegBuffer:", error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Validates the required inputs for each workflow type.
 */
function validateWorkflowInputs(
  workflowType: string,
  hasProduct: boolean,
  hasDesign: boolean,
  hasColor: boolean,
  hasPrompt: boolean
): { valid: boolean; error?: string } {
  switch (workflowType) {
    case "full_composition":
      if (!hasProduct || !hasDesign || !hasColor) {
        return {
          valid: false,
          error: "full_composition requires product, design, and color images",
        };
      }
      break;

    case "product_color":
      if (!hasProduct || !hasColor || hasDesign) {
        return {
          valid: false,
          error:
            "product_color requires product and color images (no design image)",
        };
      }
      break;

    case "product_design":
      if (!hasProduct || !hasDesign) {
        return {
          valid: false,
          error: "product_design requires product and design images",
        };
      }
      // Color is optional for product_design (can use color presets or no color)
      break;

    case "color_design":
      if ((!hasColor && !hasDesign) || !hasPrompt || hasProduct) {
        return {
          valid: false,
          error:
            "color_design requires color/design and prompt, but no product",
        };
      }
      break;

    case "color_prompt":
      // color_prompt supports: (color reference + prompt) OR (product/design + color in prompt)
      if (!hasPrompt) {
        return {
          valid: false,
          error: "color_prompt requires a prompt with color description",
        };
      }
      if (!hasColor && !hasProduct && !hasDesign) {
        return {
          valid: false,
          error:
            "color_prompt requires either a color reference image OR a product/design to modify",
        };
      }
      // Valid combinations: color only, product only, design only, or any combination with prompt
      break;

    case "design_prompt":
      if (!hasDesign || !hasPrompt || hasProduct || hasColor) {
        return {
          valid: false,
          error: "design_prompt requires only design image and prompt",
        };
      }
      break;

    case "product_prompt":
      if (!hasProduct || !hasPrompt || hasDesign || hasColor) {
        return {
          valid: false,
          error:
            "product_prompt requires only product and prompt (no design or color)",
        };
      }
      break;

    case "prompt_only":
      if (!hasPrompt || hasProduct || hasDesign || hasColor) {
        return {
          valid: false,
          error: "prompt_only requires only a prompt (no images)",
        };
      }
      break;

    case "preset_design":
      // preset_design workflow supports flexible combinations with presets
      if (!hasProduct) {
        return {
          valid: false,
          error: "preset_design requires at least a product image",
        };
      }
      // Allow: Product + Design preset, Product + Color preset, or Product + both presets
      // The presence of presets is validated separately in the preset detection logic
      break;

    default:
      return { valid: false, error: `Unknown workflow type: ${workflowType}` };
  }

  return { valid: true };
}

/**
 * Generates a workflow prompt based on type, optional analyses, and user prompt.
 */
function generateWorkflowPrompt(
  workflowType: string,
  userPrompt?: string,
  productAnalysis?: string,
  designAnalysis?: string,
  colorAnalysis?: string
): string {
  // Extract only essential information for OpenAI
  const essentialProductAnalysis = productAnalysis
    ? extractEssentialAnalysis(productAnalysis, "product")
    : undefined;
  const essentialDesignAnalysis = designAnalysis
    ? extractEssentialAnalysis(designAnalysis, "design reference")
    : undefined;
  const essentialColorAnalysis = colorAnalysis
    ? extractEssentialAnalysis(colorAnalysis, "color reference")
    : undefined;
  // Common suffix to enforce product position and no text
  const commonSuffix = `

🚨 CRITICAL LEGAL REQUIREMENTS 🚨:
- ABSOLUTELY NO BRAND LOGOS (Nike, Adidas, Puma, LV, Prada, etc.) - This is MANDATORY
- NO TEXT, FONTS, or WRITTEN CHARACTERS of any kind
- NO COPYRIGHTED DESIGNS or trademarked symbols
- Create GENERIC, UNBRANDED product designs only
- Remove any existing brand elements and replace with original designs
- DO NOT CHANGE THE PRODUCT'S ORIGINAL CAMERA ANGLE

PRODUCT REQUIREMENTS:
- ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- Use the design reference to inspire creative visual elements, patterns, or stylistic approaches, but do NOT directly copy or imprint the design
- Use the color reference only for the color palette and scheme

FINAL PHOTOREALISM REQUIREMENTS (MANDATORY):
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - absolutely no artwork, illustrations, paintings, or drawings
- Professional studio lighting with neutral white/gray background
- Must look like a real manufactured product you could buy in a store
- Realistic material textures, proper shadows, reflections, and lighting
- Sharp focus, high clarity, professional product photography quality`;

  switch (workflowType) {
    case "full_composition": {
      const basePrompt = `Create a HYPER-PHOTOREALISTIC product photograph with design-inspired surface patterns and precise color application. This must look like a real, professionally photographed product - NOT artwork, illustrations, or artistic rendering.

🚨 PHOTOREALISM REQUIREMENTS (CRITICAL - HIGHEST PRIORITY):'
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- Render as REALISTIC PRODUCT PHOTOGRAPHY with professional studio lighting
- Maintain actual product materials, textures, and physical properties
- NO artistic rendering, NO cartoon style, NO illustration style, NO anime style
- Must look like you could purchase this exact product from a high-end store
- Use proper lighting, shadows, reflections, and surface details
- HYPER-REALISTIC material textures (leather, fabric, rubber, metal, etc.)
- Professional product photography quality with sharp focus and clarity

🎨 DESIGN REFERENCE EXTRACTION (CRITICAL):
- **IF the design reference shows a product**: IGNORE the product shape/structure completely
- **EXTRACT ONLY**: Visual patterns, stitching styles, surface textures, material treatments, and decorative elements
- **PATTERN ADAPTATION**: If reference shows geometric patterns (grids, blocks, stripes), adapt the CONCEPT to fit the base product's surface areas intelligently
- **APPLY TO BASE PRODUCT**: Use extracted design elements as surface treatments on the base product
- **NEVER CHANGE**: Base product's shape, silhouette, or structural form to match design reference product

🎯 COLOR APPLICATION (CRITICAL):
- Apply color palette from color reference exclusively to the base product surfaces
- Colors should look like real fabric dyes, paints, or materials - not digital overlays
- Maintain realistic color saturation appropriate for the base product material
- Keep background neutral white/gray studio lighting

🔧 PRODUCT INTEGRITY (ABSOLUTE PRIORITY):
- **PRESERVE EXACTLY**: Base product's shape, structure, proportions, functionality, and materials
- **PRESERVE EXACTLY**: Base product's silhouette and recognizable form (sneaker, bag, etc.)
- **REPLACE ONLY**: Decorative elements, patterns, graphics, and surface designs
- **IGNORE COMPLETELY**: Any product structure or shape shown in design reference
- Apply design elements as surface treatments - do not preserve original decorations

BASE PRODUCT ANALYSIS: ${essentialProductAnalysis ?? "N/A"}
DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis ?? "N/A"}
COLOR PALETTE ANALYSIS: ${essentialColorAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors and patterns as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item
- Design elements as surface graphics, not artistic rendering transformations`
        : `${basePrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors and patterns as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item
- Design elements as surface graphics, not artistic rendering transformations`;
    }

    case "product_color": {
      const basePrompt = `🎯 TASK: Recolor the FIRST image (PRODUCT) using colors from the SECOND image (COLOR REFERENCE)

📸 IMAGE INSTRUCTIONS (CRITICAL):
- FIRST IMAGE = PRODUCT TO RECOLOR (main subject - preserve everything except colors)
- SECOND IMAGE = COLOR REFERENCE (extract color palette ONLY - ignore everything else)
- Your output must be the FIRST image with colors from the SECOND image applied

🚨 PRODUCT PRESERVATION REQUIREMENTS (ABSOLUTELY CRITICAL - HIGHEST PRIORITY):
- YOU MUST PRESERVE THE EXACT SAME PRODUCT STRUCTURE, SHAPE, AND DESIGN AS THE FIRST IMAGE
- DO NOT CHANGE the product's form, silhouette, proportions, or geometry AT ALL
- DO NOT CHANGE the product's materials, textures, or construction details
- DO NOT CHANGE the product's style, category, or design elements
- ONLY CHANGE THE COLORS - nothing else about the product should be different
- The output must be the SAME EXACT PRODUCT from the FIRST image with different colors applied
- This is a COLOR RECOLORING task, NOT a design modification task

🎯 CRITICAL COLOR APPLICATION RULES:
- Extract ONLY the color palette from the SECOND image (ignore any products, patterns, or designs it contains)
- Apply these extracted colors ONLY to the product from the FIRST image
- PRESERVE the original background completely unchanged from the FIRST image
- PRESERVE the original lighting and shadows from the FIRST image
- Apply new colors ONLY to product surfaces, materials, and components
- Do NOT change background color, lighting, or environmental elements
- Maintain the exact same photo composition and setting as the FIRST image
- Colors should look like real fabric dyes, paints, or materials - not digital overlays

🚨 PHOTOREALISM REQUIREMENTS (CRITICAL - HIGHEST PRIORITY):
- Render as REALISTIC PRODUCT PHOTOGRAPHY with professional studio lighting
- Maintain actual product materials, textures, and physical properties from the FIRST image
- NO artistic rendering, NO cartoon style, NO illustration style, NO anime style
- Must look like you could purchase this exact product from a high-end store
- Use proper lighting, shadows, reflections, and surface details
- HYPER-REALISTIC material textures (leather, fabric, rubber, metal, etc.)

🔧 SPECIFIC RECOLORING INSTRUCTIONS:
- Study the FIRST image and MEMORIZE its exact shape, structure, and design
- Study the SECOND image and EXTRACT ONLY its color palette (ignore any objects, products, or designs)
- Create the SAME EXACT PRODUCT from the FIRST image but with the color palette from the SECOND image
- Do NOT copy any visual elements from the SECOND image except colors
- If the SECOND image contains products, patterns, or designs - IGNORE them completely
- Think of this as digitally recoloring the FIRST image using a color palette extracted from the SECOND image

ORIGINAL PRODUCT ANALYSIS: ${essentialProductAnalysis ?? "N/A"}
COLOR PALETTE ANALYSIS: ${essentialColorAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors as realistic surface treatments (dyes, paints, materials)
- Product must look tangible and purchasable - like a real manufactured item`
        : `${basePrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors as realistic surface treatments (dyes, paints, materials)
- Product must look tangible and purchasable - like a real manufactured item`;
    }

    case "product_design": {
      const basePrompt = `Create a HYPER-PHOTOREALISTIC product photograph drawing creative inspiration from the design reference. Use the design reference for visual style, creative direction, or artistic approach — but do NOT directly copy or imprint the design onto the product. Maintain the product's original form, structure, proportions, and geometry.

🚨 PHOTOREALISM REQUIREMENTS (CRITICAL - HIGHEST PRIORITY):
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- Render as REALISTIC PRODUCT PHOTOGRAPHY with professional studio lighting
- Maintain actual product materials, textures, and physical properties
- NO artistic rendering, NO cartoon style, NO illustration style, NO anime style
- Must look like you could purchase this exact product from a high-end store
- Use proper lighting, shadows, reflections, and surface details
- HYPER-REALISTIC material textures (leather, fabric, rubber, metal, etc.)

ORIGINAL PRODUCT ANALYSIS: ${essentialProductAnalysis ?? "N/A"}
DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply design elements as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item`
        : `${basePrompt}${commonSuffix}

VISUAL REQUIREMENTS (ABSOLUTE PRIORITY):
- HYPER-PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply design elements as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item`;
    }

    case "color_design": {
      if (essentialColorAnalysis && essentialDesignAnalysis) {
        return `Create a new patten that thoughtfully incorporates and mixes color inspiration from the color reference and design inspiration from the design reference. Use the color reference strictly for the color palette and scheme, and the design reference strictly for creative inspiration and stylistic direction.

DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis}
COLOR PALETTE ANALYSIS: ${essentialColorAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      } else if (essentialColorAnalysis) {
        return `Create a product using this color palette for inspiration while preserving the original product's features.

COLOR PALETTE ANALYSIS: ${essentialColorAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      } else {
        return `Create a product drawing inspiration from this design reference while strictly maintaining the original product's form and details.

DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      }
    }

    case "color_prompt": {
      // Handle two cases: color reference image OR color described in prompt
      if (essentialColorAnalysis && essentialColorAnalysis !== "N/A") {
        // Case 1: Color reference image provided
        const basePrompt =
          essentialProductAnalysis && essentialProductAnalysis !== "N/A"
            ? `Modify the existing product using this color palette as inspiration. Preserve the product's original shape, structure, and details while applying the new color scheme.

ORIGINAL PRODUCT ANALYSIS: ${essentialProductAnalysis}
COLOR PALETTE ANALYSIS: ${essentialColorAnalysis}`
            : `Create a new product design using this color palette as inspiration and following the user's description.

COLOR PALETTE ANALYSIS: ${essentialColorAnalysis}`;

        return userPrompt
          ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}`
          : `${basePrompt}${commonSuffix}`;
      } else {
        // Case 2: Color described in prompt only
        const basePrompt =
          essentialProductAnalysis && essentialProductAnalysis !== "N/A"
            ? `Modify the existing product by applying the color scheme described in the user's prompt. Preserve the product's original shape, structure, and details while applying the new colors.

ORIGINAL PRODUCT ANALYSIS: ${essentialProductAnalysis}`
            : `Create a new product design using the color scheme described in the user's prompt.`;

        return `${basePrompt}

USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      }
    }

    case "design_prompt": {
      return `Create a new product design drawing creative inspiration from this design reference and following the user's description. Use the design reference for inspiration and creative direction only — do NOT copy directly. Maintain the original product's form and structure.

DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis ?? "N/A"}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "prompt_only": {
      return `Create a new innovative photorealistic product design based on the provided description. Maintain product integrity in form and structure.

USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "product_prompt": {
      return `Create a new version or variation of the provided product based on the custom description. Maintain the core product identity, including shape, structure, and proportions, while incorporating the requested changes. Generate a photorealistic design.

ORIGINAL PRODUCT ANALYSIS: ${essentialProductAnalysis ?? "N/A"}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "preset_design": {
      // Handle preset-based designs (product + design preset + color preset)
      const basePrompt = `Create a PHOTOREALISTIC product photograph with design-inspired surface patterns and color treatments. This must look like a real, professionally photographed product - NOT artwork or illustrations.

🚨 PHOTOREALISM REQUIREMENTS (CRITICAL):
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- Render as REALISTIC PRODUCT PHOTOGRAPHY with professional studio lighting
- Maintain actual product materials, textures, and physical properties
- NO artistic rendering, NO cartoon style, NO illustration style
- Must look like you could purchase this exact product from a store
- Use proper lighting, shadows, reflections, and surface details

🎨 DESIGN REFERENCE EXTRACTION (CRITICAL):
- **IF the design reference shows a product**: IGNORE the product shape/structure completely
- **EXTRACT ONLY**: Visual patterns, stitching styles, surface textures, material treatments, and decorative elements
- **APPLY TO BASE PRODUCT**: Use extracted design elements as surface treatments on the base product
- **NEVER CHANGE**: Base product's shape, silhouette, or structural form to match design reference product

🎨 SURFACE DESIGN APPLICATION (CRITICAL - REPLACE EXISTING DESIGNS):
- **COMPLETELY REPLACE** any existing decorative elements from the base product with new design elements
- **ADAPT GEOMETRIC PATTERNS**: If design reference shows grids, blocks, or geometric patterns, adapt them to the base product's surface areas (e.g., 4-quadrant grid on t-shirt becomes color-blocked panels on shoes)
- **MAINTAIN PATTERN LOGIC**: Preserve the core visual concept (color blocks, stripes, geometric divisions) but fit them to the product's shape
- Apply design reference elements as SURFACE PATTERNS, PRINTS, or TEXTURES only
- Use design elements as printed graphics, embossed patterns, or applied decorations
- Design motifs should appear as if they were manufactured onto the base product
- Keep all patterns realistic and physically possible on the base product material
- **DO NOT PRESERVE** original base product's design elements - use ONLY the design reference patterns

🎯 COLOR APPLICATION:
- Apply color palette from color reference exclusively to the base product surfaces
- Colors should look like real fabric dyes, paints, or materials - not digital overlays
- Maintain realistic color saturation appropriate for the base product material
- Keep background neutral white/gray studio lighting

🔧 PRODUCT INTEGRITY (ABSOLUTE PRIORITY):
- **PRESERVE EXACTLY**: Base product's shape, structure, proportions, functionality, and materials
- **PRESERVE EXACTLY**: Base product's silhouette and recognizable form (sneaker, bag, etc.)
- **REPLACE ONLY**: Decorative elements, patterns, graphics, and surface designs
- **IGNORE COMPLETELY**: Any product structure or shape shown in design reference
- Apply NEW design elements as surface treatments - do not preserve original decorations

BASE PRODUCT ANALYSIS: ${essentialProductAnalysis ?? "N/A"}
DESIGN INSPIRATION ANALYSIS: ${essentialDesignAnalysis ?? "N/A"}
COLOR PALETTE ANALYSIS: ${essentialColorAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}

🚨 CRITICAL LEGAL REQUIREMENTS 🚨:
- ABSOLUTELY NO BRAND LOGOS (Nike, Adidas, etc.) - This is MANDATORY
- NO TEXT, FONTS, or WRITTEN CHARACTERS of any kind
- NO COPYRIGHTED DESIGNS or trademarked symbols
- Create GENERIC, UNBRANDED product designs only
- Remove any existing brand elements and replace with original designs

VISUAL REQUIREMENTS:
- PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors and patterns as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item
- Design elements as surface graphics, not artistic rendering transformations`
        : `${basePrompt}

🚨 CRITICAL LEGAL REQUIREMENTS 🚨:
- ABSOLUTELY NO BRAND LOGOS (Nike, Adidas, etc.) - This is MANDATORY
- NO TEXT, FONTS, or WRITTEN CHARACTERS of any kind
- NO COPYRIGHTED DESIGNS or trademarked symbols
- Create GENERIC, UNBRANDED product designs only
- Remove any existing brand elements and replace with original designs

VISUAL REQUIREMENTS:
- PHOTOREALISTIC PRODUCT PHOTOGRAPHY ONLY - no artwork, illustrations, or drawings
- Professional studio lighting with neutral white/gray background
- Apply colors and patterns as realistic surface treatments (prints, dyes, textures)
- Product must look tangible and purchasable - like a real manufactured item
- Design elements as surface graphics, not artistic rendering transformations`;
    }

    default:
      return userPrompt ?? "";
  }
}

/**
 * Resize image if it's too large for OpenAI's vision API
 */
async function resizeImageIfNeeded(imageUrl: string): Promise<string> {
  try {
    // Fetch the image to check its size and format
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to fetch image for size check: ${response.statusText}`
      );
      return imageUrl; // Return original URL if we can't fetch
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if image is larger than 20MB (OpenAI's limit)
    const sizeMB = buffer.length / (1024 * 1024);
    console.log(`Image size: ${sizeMB.toFixed(2)}MB`);

    // Detect image format using sharp
    let needsConversion = false;
    let formatInfo = "";

    try {
      const metadata = await sharp(buffer).metadata();
      formatInfo = metadata.format || "unknown";
      console.log(`Detected image format: ${formatInfo}`);

      // Check if format is supported by OpenAI (jpg, png, webp)
      const supportedFormats = ["jpeg", "jpg", "png", "webp"];
      const unsupportedFormats = ["mpo", "heic", "heif", "tiff", "bmp", "gif"];

      if (unsupportedFormats.includes(formatInfo.toLowerCase())) {
        console.log(
          `🔄 Unsupported format detected: ${formatInfo} - converting to JPEG`
        );
        needsConversion = true;
      } else if (!supportedFormats.includes(formatInfo.toLowerCase())) {
        console.log(
          `⚠️ Unknown format: ${formatInfo} - attempting conversion to JPEG`
        );
        needsConversion = true;
      }
    } catch (metadataError) {
      console.log(
        `⚠️ Could not detect format, attempting conversion: ${metadataError}`
      );
      needsConversion = true;
    }

    // Convert if needed or if image is too large
    if (needsConversion || sizeMB > 20) {
      const reason = needsConversion
        ? `unsupported format (${formatInfo})`
        : `large size (${sizeMB.toFixed(2)}MB)`;
      console.log(`🔄 Converting image due to ${reason}...`);

      try {
        // Convert to JPEG with size optimization
        const convertedBuffer = await sharp(buffer)
          .resize(2048, 2048, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 85,
            mozjpeg: true, // Better compression for MPO and other formats
          })
          .toBuffer();

        // Convert to base64 data URL
        const base64 = convertedBuffer.toString("base64");
        const convertedUrl = `data:image/jpeg;base64,${base64}`;

        const newSizeMB = convertedBuffer.length / (1024 * 1024);
        console.log(
          `✅ Image converted from ${formatInfo} (${sizeMB.toFixed(2)}MB) to JPEG (${newSizeMB.toFixed(2)}MB)`
        );
        return convertedUrl;
      } catch (conversionError) {
        console.warn(
          `❌ Sharp conversion failed for ${formatInfo} format:`,
          conversionError
        );
        return imageUrl; // Return original URL if conversion fails
      }
    }

    // Image is fine as-is
    console.log(
      `✅ Image format ${formatInfo} is supported, no conversion needed`
    );
    return imageUrl;
  } catch (error) {
    console.error("Error checking/processing image:", error);
    return imageUrl; // Return original URL on error
  }
}

/**
 * Extract only the essential sections from analysis for OpenAI prompt
 */
function extractEssentialAnalysis(
  fullAnalysis: string,
  analysisType: string
): string {
  try {
    console.log(`🔍 Extracting essential analysis for type: ${analysisType}`);

    // Check if this is a simple preset-generated analysis (should be passed through as-is)
    if (
      analysisType === "product" &&
      fullAnalysis.includes("product ready for design application")
    ) {
      console.log(`✅ Product preset analysis detected - using as-is`);
      console.log(
        `🔍 PRESET ANALYSIS PASSTHROUGH (${fullAnalysis.length} chars):`
      );
      console.log(`${fullAnalysis}`);
      return fullAnalysis;
    }

    if (analysisType === "color reference") {
      const colorSections: string[] = [];

      // Look for "Specific Color Values" section
      let colorValuesMatch = fullAnalysis.match(
        /\*\*Specific Color Values:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n\n\*\*|\n\n[A-Z]|$)/
      );
      if (colorValuesMatch) {
        colorSections.push(
          "**Specific Color Values:**\n" + colorValuesMatch[1].trim()
        );
      }

      // Look for "Color Palette" section
      let paletteMatch = fullAnalysis.match(
        /\*\*Color Palette:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n\n\*\*|\n\n[A-Z]|$)/
      );
      if (paletteMatch) {
        colorSections.push("**Color Palette:**\n" + paletteMatch[1].trim());
      }

      // Look for bullet-point color lists (like the failing case)
      const bulletColorMatches = fullAnalysis.match(
        /(?:^|\n)- \*\*[^*]*(?:Background|Color|HEX|RGB)[^*]*\*\*[^:\n]*:[\s\S]*?(?=\n- \*\*|\n\n|\*\*[A-Z]|$)/gm
      );
      if (bulletColorMatches && bulletColorMatches.length >= 3) {
        colorSections.push("**Color List:**\n" + bulletColorMatches.join("\n"));
      }

      // Look for hex color codes and RGB values anywhere in the text
      const hexColorPattern = /#[0-9a-fA-F]{6}/g;
      const hexColors = fullAnalysis.match(hexColorPattern);
      const rgbPattern = /RGB[:\s]*\(?(\d+),?\s*(\d+),?\s*(\d+)\)?/g;
      const rgbColors = fullAnalysis.match(rgbPattern);

      if (hexColors || rgbColors) {
        let colorInfo = "**Extracted Colors:**\n";
        if (hexColors) {
          colorInfo += `Hex codes: ${hexColors.join(", ")}\n`;
        }
        if (rgbColors) {
          colorInfo += `RGB values: ${rgbColors.join(", ")}\n`;
        }
        colorSections.push(colorInfo);
      }

      // Look for any section with "Color" in the title
      const colorSectionMatches = fullAnalysis.match(
        /(?:###?\s*)?\*\*[^*]*[Cc]olor[^*]*\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/g
      );
      if (colorSectionMatches) {
        colorSectionMatches.forEach((section) => {
          if (
            !colorSections.some((existing) =>
              existing.includes(section.substring(0, 50))
            )
          ) {
            colorSections.push(section.trim());
          }
        });
      }

      // If still no sections found, look for any content that contains color information
      if (colorSections.length === 0) {
        // Look for lines that mention specific colors
        const colorLines = fullAnalysis.split("\n").filter((line) => {
          const lowerLine = line.toLowerCase();
          return (
            (lowerLine.includes("color") ||
              lowerLine.includes("#") ||
              lowerLine.includes("rgb") ||
              lowerLine.includes("hex") ||
              lowerLine.includes("beige") ||
              lowerLine.includes("brown") ||
              lowerLine.includes("cream") ||
              lowerLine.includes("pink") ||
              lowerLine.includes("yellow") ||
              lowerLine.includes("blue") ||
              lowerLine.includes("green") ||
              lowerLine.includes("red") ||
              lowerLine.includes("purple") ||
              lowerLine.includes("gray") ||
              lowerLine.includes("white") ||
              lowerLine.includes("black")) &&
            line.length > 10
          );
        });

        if (colorLines.length > 0) {
          colorSections.push(
            "**Color Information:**\n" + colorLines.slice(0, 10).join("\n")
          );
        }
      }

      if (colorSections.length > 0) {
        const extracted = colorSections.join("\n\n");
        console.log(
          `✅ Color extraction successful: ${colorSections.length} sections found`
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`
        );
        console.log(`${extracted}`);
        return extracted;
      }
    } else if (analysisType === "design reference") {
      // For design analysis, let's look for any sections with specific keywords
      // Extract any sections that mention key design elements
      const keywordSections: string[] = [];

      // Try to find sections with ### or ## headers
      const sectionMatches = fullAnalysis.match(
        /(?:###?\s*)?\*\*[^*]*\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/g
      );

      if (sectionMatches) {
        console.log(
          `🔍 Found ${sectionMatches.length} sections in design analysis`
        );

        sectionMatches.forEach((section, index) => {
          const sectionLower = section.toLowerCase();
          if (
            sectionLower.includes("pattern") ||
            sectionLower.includes("texture") ||
            sectionLower.includes("material") ||
            sectionLower.includes("style") ||
            sectionLower.includes("distinctive") ||
            sectionLower.includes("feature") ||
            sectionLower.includes("visual") ||
            sectionLower.includes("artistic") ||
            sectionLower.includes("application") ||
            sectionLower.includes("summary for ai") ||
            sectionLower.includes("ai generation")
          ) {
            console.log(
              `✅ Including design section ${index + 1}: ${section.substring(0, 50)}...`
            );
            keywordSections.push(section.trim());
          }
        });
      }

      if (keywordSections.length > 0) {
        const extracted = keywordSections.join("\n\n");
        console.log(
          `✅ Design extraction successful: ${keywordSections.length} relevant sections found`
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`
        );
        console.log(`${extracted}`);
        return extracted;
      }

      // If no sections found, try to get the main descriptive content
      // Look for content after the introduction
      const mainContentMatch = fullAnalysis.match(
        /---\s*([\s\S]*?)(?=\n---|\n\n---|\n\n\n|$)/
      );
      if (mainContentMatch && mainContentMatch[1].length > 200) {
        const mainContent = mainContentMatch[1].trim();
        console.log(
          `✅ Design extraction using main content: ${mainContent.length} chars`
        );
        console.log(
          `🔍 MAIN CONTENT EXTRACTED ANALYSIS (${mainContent.length} chars):`
        );
        console.log(`${mainContent}`);
        return mainContent;
      }
    } else if (analysisType === "product") {
      const sections = [];

      // Look for "Materials & Textures" section (with &)
      let materialsTexturesMatch = fullAnalysis.match(
        /\*\*Materials & Textures\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
      );
      if (materialsTexturesMatch) {
        sections.push(
          "**Materials & Textures:**\n" + materialsTexturesMatch[1].trim()
        );
      }

      // Look for "Materials" section (without &)
      if (!materialsTexturesMatch) {
        let materialsMatch = fullAnalysis.match(
          /\*\*Materials\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
        );
        if (materialsMatch) {
          sections.push("**Materials:**\n" + materialsMatch[1].trim());
        }
      }

      // Look for "Structural Details" section
      let structuralMatch = fullAnalysis.match(
        /\*\*Structural Details\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
      );
      if (structuralMatch) {
        sections.push("**Structural Details:**\n" + structuralMatch[1].trim());
      }

      // Look for "Style & Aesthetics" section
      let styleMatch = fullAnalysis.match(
        /\*\*Style & Aesthetics\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
      );
      if (styleMatch) {
        sections.push("**Style & Aesthetics:**\n" + styleMatch[1].trim());
      }

      // Look for "Design Features" section
      let featuresMatch = fullAnalysis.match(
        /\*\*Design Features\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
      );
      if (featuresMatch) {
        sections.push("**Design Features:**\n" + featuresMatch[1].trim());
      }

      // Look for "Technical Specs" section
      let specsMatch = fullAnalysis.match(
        /\*\*Technical Specs\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/
      );
      if (specsMatch) {
        sections.push("**Technical Specs:**\n" + specsMatch[1].trim());
      }

      // If we didn't find the expected sections, try to find any product-related content
      if (sections.length === 0) {
        // Look for any content that describes the product
        const productContentMatch = fullAnalysis.match(
          /- \*\*[^*]*\*\*:\s*[\s\S]*?(?=\n- \*\*|\n\n|$)/g
        );
        if (productContentMatch) {
          productContentMatch.forEach((content) => {
            const contentLower = content.toLowerCase();
            if (
              contentLower.includes("material") ||
              contentLower.includes("texture") ||
              contentLower.includes("finish") ||
              contentLower.includes("upper") ||
              contentLower.includes("sole") ||
              contentLower.includes("structure") ||
              contentLower.includes("shape") ||
              contentLower.includes("style")
            ) {
              sections.push(content.trim());
            }
          });
        }
      }

      if (sections.length > 0) {
        const extracted = sections.join("\n\n");
        console.log(
          `✅ Product extraction successful: ${sections.length} sections found`
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`
        );
        console.log(`${extracted}`);
        return extracted;
      }
    }

    // If extraction fails, create a more targeted fallback based on analysis type
    console.log(
      `⚠️ Extraction failed for ${analysisType}, using improved fallback`
    );

    if (analysisType === "color reference") {
      // For color, try to extract just color-related information
      const colorContent = fullAnalysis
        .split("\n")
        .filter(
          (line) =>
            line.toLowerCase().includes("color") ||
            line.includes("#") ||
            line.toLowerCase().includes("rgb") ||
            line.toLowerCase().includes("hex") ||
            line.toLowerCase().includes("palette")
        )
        .slice(0, 10)
        .join("\n");

      if (colorContent.length > 50) {
        const fallback = colorContent + "...";
        console.log(
          `🔍 FALLBACK EXTRACTED ANALYSIS (${fallback.length} chars):`
        );
        console.log(`${fallback}`);
        return fallback;
      }
    } else if (analysisType === "product") {
      // For product, extract ONLY structural/material info - EXCLUDE decorative elements
      const productContent = fullAnalysis
        .split("\n")
        .filter((line) => {
          const lower = line.toLowerCase();

          // EXCLUDE lines with decorative elements (these should come from design reference)
          const hasDecorative =
            lower.includes("embroidery") ||
            lower.includes("embroidered") ||
            lower.includes("design features") ||
            lower.includes("decorative") ||
            lower.includes("pattern") ||
            lower.includes("motif") ||
            lower.includes("artwork") ||
            lower.includes("graphics") ||
            lower.includes("print") ||
            lower.includes("logo") ||
            lower.includes("branding") ||
            lower.includes("visual") ||
            lower.includes("fox") ||
            lower.includes("floral") ||
            lower.includes("animal") ||
            lower.includes("character") ||
            lower.includes("illustration") ||
            lower.includes("art style");

          // INCLUDE lines with structural/material info
          const hasStructural =
            lower.includes("material") ||
            lower.includes("texture") ||
            lower.includes("structure") ||
            lower.includes("shape") ||
            lower.includes("construction") ||
            lower.includes("sole") ||
            lower.includes("fabric") ||
            lower.includes("hardware") ||
            lower.includes("component") ||
            lower.includes("build") ||
            lower.includes("silhouette") ||
            lower.includes("dimensions") ||
            lower.includes("technical") ||
            lower.includes("specs");

          return hasStructural && !hasDecorative;
        })
        .slice(0, 15)
        .join("\n");

      if (productContent.length > 50) {
        const fallback = productContent + "...";
        console.log(
          `🔍 FALLBACK EXTRACTED ANALYSIS (${fallback.length} chars):`
        );
        console.log(`${fallback}`);
        return fallback;
      }
    }

    const truncated = fullAnalysis.substring(0, 500) + "...";
    console.log(`🔍 TRUNCATED FALLBACK ANALYSIS (${truncated.length} chars):`);
    console.log(`${truncated}`);
    return truncated;
  } catch (error) {
    console.log(
      "Error extracting essential analysis, using truncated version:",
      error
    );
    const errorTruncated = fullAnalysis.substring(0, 500) + "...";
    console.log(`🔍 ERROR FALLBACK ANALYSIS (${errorTruncated.length} chars):`);
    console.log(`${errorTruncated}`);
    return errorTruncated;
  }
}

/**
 * Global persistent cache for color preset analyses (shared across all users)
 */
const CACHE_FILE_PATH = path.join(process.cwd(), "color_preset_cache.json");

/**
 * Check if a URL is a preset color URL
 */
function isPresetColorUrl(url: string): boolean {
  if (!url) return false;
  return url.includes("/inputs/placeholders/colors/") && url.endsWith(".webp");
}

interface ColorPresetCache {
  [presetName: string]: {
    analysis: string;
    timestamp: number;
    version: string;
  };
}

/**
 * Loads the global color preset cache from file
 */
async function loadColorPresetCache(): Promise<ColorPresetCache> {
  try {
    const cacheData = await fs.readFile(CACHE_FILE_PATH, "utf8");
    return JSON.parse(cacheData);
  } catch (error) {
    // Cache file doesn't exist or is invalid - return empty cache
    console.log("📦 No existing color preset cache found, creating new one");
    return {};
  }
}

/**
 * Saves the global color preset cache to file
 */
async function saveColorPresetCache(cache: ColorPresetCache): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
    console.log("💾 Color preset cache saved successfully");
  } catch (error) {
    console.error("❌ Failed to save color preset cache:", error);
  }
}

/**
 * Gets cached color preset analysis (global across all users) or analyzes if not cached
 */
async function getCachedColorPresetAnalysis(
  presetName: string,
  imageUrl: string
): Promise<string> {
  const cacheKey = presetName.toLowerCase(); // Normalize case

  // Load global cache
  const globalCache = await loadColorPresetCache();

  // Check if we have cached analysis
  if (globalCache[cacheKey]) {
    console.log(
      `📦 Using GLOBAL cached analysis for color preset: ${presetName}`
    );
    console.log(
      `📦 Analysis was cached on: ${new Date(globalCache[cacheKey].timestamp).toISOString()}`
    );
    return globalCache[cacheKey].analysis;
  }

  // Not cached globally, analyze with GPT-4 Vision
  console.log(
    `🔄 Analyzing color preset with GPT-4 Vision (FIRST TIME EVER): ${presetName}`
  );
  console.log(`🔄 Converting to base64 for analysis: ${imageUrl}`);

  const analysis = await analyzeImageWithGPT4Vision(
    imageUrl,
    "color reference"
  );

  // Cache the result globally for ALL users
  globalCache[cacheKey] = {
    analysis: analysis,
    timestamp: Date.now(),
    version: "1.0",
  };

  await saveColorPresetCache(globalCache);
  console.log(
    `💾 GLOBALLY cached analysis for color preset: ${presetName} (available to ALL users)`
  );

  return analysis;
}

/**
 * Sends an image URL to GPT-4 Vision to get a textual analysis.
 */
async function analyzeImageWithGPT4Vision(
  imageUrl: string,
  analysisType: string,
  customInstructions?: string
): Promise<string> {
  try {
    let processedImageUrl = imageUrl;

    // Check if it's a localhost URL and convert to base64
    if (imageUrl.includes("localhost:3000")) {
      console.log(
        `🔄 Localhost URL detected, converting to base64 for analysis: ${imageUrl}`
      );
      try {
        processedImageUrl = await urlToBase64DataUrl(imageUrl);
        console.log(
          `✅ Successfully converted localhost URL to base64 for analysis`
        );
      } catch (conversionError) {
        console.error(
          `❌ Failed to convert localhost URL to base64:`,
          conversionError
        );
        return ""; // Return empty analysis if conversion fails
      }
    } else {
      // Resize image if needed before sending to OpenAI (for non-localhost URLs)
      processedImageUrl = await resizeImageIfNeeded(imageUrl);
    }

    // Get analysis instructions based on type
    let analysisPrompt = customInstructions;

    if (!analysisPrompt) {
      switch (analysisType.toLowerCase()) {
        case "product":
          analysisPrompt = `Analyze this PRODUCT image for AI image generation. Focus on:
- **Materials & Textures**: Specific surface materials, finishes, fabric types
- **Structural Details**: Shape, form, construction elements, hardware
- **Design Features**: Unique characteristics, branding elements, functional details
- **Style & Aesthetics**: Overall design language, style category
- **Technical Specs**: Dimensions, proportions, component parts
Be specific about what makes this product unique and how these qualities could be preserved while applying new designs.`;
          break;

        case "design reference":
        case "design":
          analysisPrompt = `Analyze this DESIGN REFERENCE image for AI image generation. Focus on:
- **Visual Patterns**: Specific patterns, motifs, graphic elements that could be applied to products
- **Artistic Style**: Art style, technique, aesthetic approach
- **Color Harmony**: How colors work together (ignore specific colors, focus on relationships)
- **Compositional Elements**: Layout, balance, focal points
- **Distinctive Features**: Unique design elements that could be adapted/transferred to products
Be specific about HOW these design elements could be applied to transform a product's appearance.`;
          break;

        case "color reference":
        case "color":
          analysisPrompt = `Analyze this COLOR REFERENCE image for AI image generation. Focus EXCLUSIVELY on:
- **Specific Color Values**: Exact colors, hex codes if possible, RGB descriptions
- **Color Palette**: Primary, secondary, accent colors
- **Color Relationships**: How colors complement each other
- **Tone & Saturation**: Brightness, vibrancy, muted vs bold
- **Color Temperature**: Warm vs cool tones
- **Color Distribution**: Which colors dominate vs accent
Ignore all other visual elements - focus ONLY on the color information that should be applied to products.`;
          break;

        default:
          analysisPrompt = `Analyze this ${analysisType} image in detail for AI image generation. Describe the visual elements, colors, patterns, textures, materials, style, and any distinctive features that would be useful for recreating or referencing these qualities in a new design. Be specific and technical.`;
      }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: analysisPrompt,
            },
            {
              type: "image_url",
              image_url: { url: processedImageUrl },
            },
          ],
        },
      ],
      max_tokens: 800,
    });

    return response.choices[0].message.content || "";
  } catch (err) {
    console.error(`Error analyzing ${analysisType} image:`, err);
    return "";
  }
}

/**
 * Converts an image URL to a base64 data URL
 */
async function urlToBase64DataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    // Determine MIME type from response headers or assume JPEG
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error("Error converting URL to base64:", err);
    throw err;
  }
}

/**
 * Upload image to OpenAI Files API and return file ID
 */
async function uploadImageToFiles(
  imageUrl: string,
  filename: string
): Promise<string> {
  try {
    // First resize image if needed
    const processedImageUrl = await resizeImageIfNeeded(imageUrl);

    let buffer: Buffer;

    if (processedImageUrl.startsWith("data:image/")) {
      // Handle base64 data URL from resizing
      const base64Data = processedImageUrl.split(",")[1];
      buffer = Buffer.from(base64Data, "base64");
    } else {
      // Handle regular URL
      const response = await fetch(processedImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Format conversion for OpenAI Files API compatibility
    let finalBuffer = buffer;
    let finalMimeType = "image/jpeg";
    let finalFilename = filename;

    try {
      // Import Sharp dynamically for format detection and conversion
      const sharp = (await import("sharp")).default;

      // Get metadata to detect actual format
      const metadata = await sharp(buffer).metadata();
      const sharpFormat = metadata.format || "unknown";
      let actualFormat: string = sharpFormat;

      // Enhanced MPO detection - Sharp often misdetects MPO as JPEG
      if (sharpFormat === "jpeg" || sharpFormat === "jpg") {
        // Check for MPO signature in the buffer
        const uint8Array = new Uint8Array(buffer);
        let isMPO = false;

        // Look for "MPF" marker in the first 2KB (Multi Picture Format)
        for (let i = 0; i < Math.min(uint8Array.length, 2048); i++) {
          if (
            uint8Array[i] === 0x4d &&
            uint8Array[i + 1] === 0x50 &&
            uint8Array[i + 2] === 0x46
          ) {
            // "MPF"
            console.log(
              "🔍 Files API - MPO format detected via signature scan"
            );
            actualFormat = "mpo";
            isMPO = true;
            break;
          }
        }

        // Additional MPO detection - look for MPO-specific EXIF data
        if (!isMPO) {
          // Look for MP Individual Image markers
          for (let i = 0; i < Math.min(uint8Array.length, 5000); i++) {
            if (uint8Array[i] === 0xb0 && uint8Array[i + 1] === 0x00) {
              // MP Individual Image
              console.log(
                "🔍 Files API - MPO format detected via MP Individual Image marker"
              );
              actualFormat = "mpo";
              isMPO = true;
              break;
            }
          }
        }
      }

      console.log(`🔍 Files API - Detected image format: ${actualFormat}`);

      // Define supported and unsupported formats for OpenAI Files API
      const supportedFormats = ["jpeg", "jpg", "png", "webp"];
      const unsupportedFormats = ["mpo", "heic", "heif", "tiff", "bmp", "gif"];

      // Check if format conversion is needed
      if (unsupportedFormats.includes(actualFormat.toLowerCase())) {
        console.log(
          `🔄 Files API - Unsupported format detected: ${actualFormat} - converting to JPEG`
        );

        // Convert to JPEG using Sharp
        finalBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

        finalMimeType = "image/jpeg";
        finalFilename = filename.replace(/\.[^/.]+$/, "") + ".jpg";

        console.log(
          `✅ Files API - Successfully converted ${actualFormat} to JPEG`
        );
        console.log(
          `📊 Files API - Size change: ${Math.round(buffer.length / 1024)}KB → ${Math.round(finalBuffer.length / 1024)}KB`
        );
      } else if (!supportedFormats.includes(actualFormat.toLowerCase())) {
        console.log(
          `⚠️ Files API - Unknown format detected: ${actualFormat} - attempting conversion to JPEG`
        );

        // Convert unknown formats to JPEG as well
        finalBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

        finalMimeType = "image/jpeg";
        finalFilename = filename.replace(/\.[^/.]+$/, "") + ".jpg";

        console.log(
          `✅ Files API - Successfully converted unknown format to JPEG`
        );
      } else {
        console.log(
          `✅ Files API - Image format ${actualFormat} is supported, no conversion needed`
        );
      }
    } catch (sharpError) {
      console.warn(
        `⚠️ Files API - Sharp format detection failed: ${sharpError}`
      );
      console.log(`📤 Files API - Using original buffer without conversion`);
      // Continue with original buffer if Sharp fails
    }

    // Create a File-like object for OpenAI with converted format
    const file = new File([finalBuffer], finalFilename, {
      type: finalMimeType,
    });

    const uploadResponse = await openai.files.create({
      file: file,
      purpose: "vision",
    });

    console.log(
      `✅ Files API - Successfully uploaded ${finalFilename} (${finalMimeType}) with ID: ${uploadResponse.id}`
    );
    return uploadResponse.id;
  } catch (err) {
    console.error("Error uploading to OpenAI Files:", err);
    throw err;
  }
}

/**
 * Generate images using the Responses API with GPT Image
 */
async function generateWithResponsesAPI(
  prompt: string,
  options: {
    size?: string;
    quality?: string;
    n?: number;
    background?: string;
    output_format?: string;
    output_compression?: number;
    stream?: boolean;
    partial_images?: number;
  },
  imageUrls?: {
    product?: string;
    design?: string;
    color?: string;
    color2?: string;
  },
  mainlineModel: string = "gpt-4.1"
): Promise<{
  images: Array<{ type: "url" | "base64"; data: string }>;
  response_id?: string;
  revised_prompt?: string;
}> {
  try {
    console.log("Using Responses API with GPT Image...");

    // Prepare input content
    const inputContent: any[] = [
      {
        type: "input_text",
        text: `You must generate an image using the image_generation tool. Here is the design prompt: ${prompt}

IMPORTANT: You MUST call the image_generation tool to create the image. Do not respond with text only - you must generate an image.`,
      },
    ];

    // Add image inputs if provided
    if (imageUrls) {
      if (imageUrls.product) {
        try {
          // Log which product URL we're processing
          console.log(
            `📤 Processing product image URL: ${imageUrls.product.substring(0, 100)}...`
          );

          const fileId = await uploadImageToFiles(
            imageUrls.product,
            "product.jpg"
          );
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload product image to Files API, skipping:",
            err
          );
        }
      }
      if (imageUrls.design) {
        try {
          const fileId = await uploadImageToFiles(
            imageUrls.design,
            "design.jpg"
          );
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload design image to Files API, skipping:",
            err
          );
        }
      }
      if (imageUrls.color2) {
        try {
          const fileId = await uploadImageToFiles(
            imageUrls.color2,
            "color2.jpg"
          );
          // ❌ ALSO REMOVE: Same issue with secondary color images
          // inputContent.push({
          //   type: "input_image",
          //   file_id: fileId,
          // });
        } catch (err) {
          console.warn(
            "Failed to upload color2 image to Files API, skipping:",
            err
          );
        }
      }
    }

    // Prepare image generation tool options
    const imageGenTool: any = {
      type: "image_generation",
    };

    // Add partial images for streaming if enabled
    if (options.stream && options.partial_images) {
      imageGenTool.partial_images = Math.min(
        Math.max(options.partial_images, 1),
        3
      );
    }

    // Additional options for image generation
    if (options.size) imageGenTool.size = options.size;
    if (options.quality) imageGenTool.quality = options.quality;
    if (options.background) imageGenTool.background = options.background;
    if (options.output_format)
      imageGenTool.output_format = options.output_format;
    if (options.output_compression)
      imageGenTool.output_compression = options.output_compression;

    const responseParams: any = {
      model: mainlineModel,
      input: [
        {
          role: "user",
          content: inputContent,
        },
      ],
      tools: [imageGenTool],
    };

    if (options.stream) {
      responseParams.stream = true;

      // For streaming, we would need to handle the stream properly
      // For now, we'll fall back to non-streaming
      console.log(
        "Streaming requested but not implemented in this version, using non-streaming..."
      );
      responseParams.stream = false;
    }

    // Debug: Log the exact request being sent to Responses API
    console.log("🔍 Responses API Request Debug:");
    console.log(`Model: ${responseParams.model}`);
    console.log(
      `Input content items: ${responseParams.input[0].content.length}`
    );
    responseParams.input[0].content.forEach((item: any, index: number) => {
      if (item.type === "input_image") {
        console.log(`  [${index}] input_image - file_id: ${item.file_id}`);
      } else if (item.type === "input_text") {
        console.log(
          `  [${index}] input_text - ${item.text.substring(0, 50)}...`
        );
      } else {
        console.log(`  [${index}] ${item.type}`);
      }
    });
    console.log(`Tools: ${JSON.stringify(responseParams.tools)}`);

    const response = await openai.responses.create(responseParams);

    // Extract image generation results - using any type to handle potential API changes
    const imageGenerationCalls = (response.output as any[]).filter(
      (output: any) => output.type === "image_generation_call"
    );

    if (imageGenerationCalls.length === 0) {
      throw new Error("No image generation calls found in response");
    }

    const firstCall = imageGenerationCalls[0];

    // Handle different possible property names for the image data
    const imageData = firstCall.result || firstCall.b64_json || firstCall.data;
    if (!imageData) {
      throw new Error("No image data found in response");
    }

    const images = [
      {
        type: "base64" as const,
        data: imageData,
      },
    ];

    return {
      images,
      response_id: response.id,
      revised_prompt: firstCall.revised_prompt || undefined,
    };
  } catch (err) {
    console.error("Error with Responses API:", err);
    throw err;
  }
}

/**
 * Get image dimensions from URL
 */
async function getImageDimensions(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Simple PNG dimension detection
    if (
      uint8Array[0] === 0x89 &&
      uint8Array[1] === 0x50 &&
      uint8Array[2] === 0x4e &&
      uint8Array[3] === 0x47
    ) {
      const width =
        (uint8Array[16] << 24) |
        (uint8Array[17] << 16) |
        (uint8Array[18] << 8) |
        uint8Array[19];
      const height =
        (uint8Array[20] << 24) |
        (uint8Array[21] << 16) |
        (uint8Array[22] << 8) |
        uint8Array[23];
      return { width, height };
    }

    // Simple JPEG/MPO dimension detection (basic implementation)
    if (uint8Array[0] === 0xff && uint8Array[1] === 0xd8) {
      // Check if it's MPO format (Multi Picture Object)
      let isMPO = false;
      for (let i = 0; i < Math.min(uint8Array.length, 1000); i++) {
        if (
          uint8Array[i] === 0x4d &&
          uint8Array[i + 1] === 0x50 &&
          uint8Array[i + 2] === 0x46
        ) {
          // "MPF"
          console.log("🔍 MPO format detected in getImageDimensions");
          isMPO = true;
          break;
        }
      }

      // For JPEG/MPO, we'll use a more complex parser or fallback to default
      // This is a simplified approach - for production, consider using a proper image library
      for (let i = 0; i < uint8Array.length - 8; i++) {
        if (
          uint8Array[i] === 0xff &&
          (uint8Array[i + 1] === 0xc0 || uint8Array[i + 1] === 0xc2)
        ) {
          const height = (uint8Array[i + 5] << 8) | uint8Array[i + 6];
          const width = (uint8Array[i + 7] << 8) | uint8Array[i + 8];
          if (isMPO) {
            console.log(`🔍 MPO dimensions detected: ${width}x${height}`);
          } else {
            console.log(`🔍 JPEG dimensions detected: ${width}x${height}`);
          }
          return { width, height };
        }
      }
    }

    // WebP dimension detection
    if (
      uint8Array[0] === 0x52 && // 'R'
      uint8Array[1] === 0x49 && // 'I'
      uint8Array[2] === 0x46 && // 'F'
      uint8Array[3] === 0x46 && // 'F'
      uint8Array[8] === 0x57 && // 'W'
      uint8Array[9] === 0x45 && // 'E'
      uint8Array[10] === 0x42 && // 'B'
      uint8Array[11] === 0x50 // 'P'
    ) {
      // WebP format detected
      console.log("🔍 WebP format detected in getImageDimensions");

      // Look for VP8 or VP8L chunk
      for (let i = 12; i < uint8Array.length - 10; i++) {
        // VP8 chunk
        if (
          uint8Array[i] === 0x56 && // 'V'
          uint8Array[i + 1] === 0x50 && // 'P'
          uint8Array[i + 2] === 0x38 && // '8'
          uint8Array[i + 3] === 0x20 // ' '
        ) {
          // VP8 lossy format
          const width = uint8Array[i + 14] | (uint8Array[i + 15] << 8);
          const height = uint8Array[i + 16] | (uint8Array[i + 17] << 8);
          console.log(`🔍 WebP VP8 dimensions detected: ${width}x${height}`);
          return { width, height };
        }
        // VP8L chunk
        else if (
          uint8Array[i] === 0x56 && // 'V'
          uint8Array[i + 1] === 0x50 && // 'P'
          uint8Array[i + 2] === 0x38 && // '8'
          uint8Array[i + 3] === 0x4c // 'L'
        ) {
          // VP8L lossless format
          const width =
            1 + (((uint8Array[i + 9] & 0x3f) << 8) | uint8Array[i + 8]);
          const height =
            1 +
            (((uint8Array[i + 11] & 0x0f) << 10) |
              (uint8Array[i + 10] << 2) |
              ((uint8Array[i + 9] & 0xc0) >> 6));
          console.log(`🔍 WebP VP8L dimensions detected: ${width}x${height}`);
          return { width, height };
        }
      }
    }

    // Default fallback
    console.log(
      "⚠️ Could not detect image dimensions, falling back to 1024x1024"
    );
    return { width: 1024, height: 1024 };
  } catch (error) {
    console.log(
      "Could not determine image dimensions, using default 1024x1024"
    );
    return { width: 1024, height: 1024 };
  }
}

/**
 * Convert dimensions to appropriate generation size
 */
function dimensionsToGenerationSize(width: number, height: number): string {
  const aspectRatio = width / height;

  // Determine if it's landscape, portrait, or square based on aspect ratio
  if (aspectRatio > 1.2) {
    // Landscape
    return "1536x1024";
  } else if (aspectRatio < 0.8) {
    // Portrait
    return "1024x1536";
  } else {
    // Square (or close to square)
    return "1024x1024";
  }
}

/**
 * Composes product images with GPT Image, using Responses API first, then fallback to Image API
 */
async function composeProductWithGPTImage(
  prompt: string,
  options: {
    size: any;
    quality: string;
    n: number;
    background?: string;
    output_format?: string;
    output_compression?: number;
    stream?: boolean;
    partial_images?: number;
  },
  imageUrls?: {
    product?: string;
    design?: string;
    color?: string;
    color2?: string;
  }
): Promise<{
  results: Array<{ type: "url" | "base64"; data: string }>;
  response_id?: string;
  revised_prompt?: string;
  method: "responses_api" | "image_api";
}> {
  try {
    // Try Responses API first if we have image inputs or streaming is requested
    if (
      (imageUrls &&
        (imageUrls.product ||
          imageUrls.design ||
          imageUrls.color ||
          imageUrls.color2)) ||
      options.stream
    ) {
      try {
        const responsesResult = await generateWithResponsesAPI(
          prompt,
          options,
          imageUrls
        );
        return {
          results: responsesResult.images,
          response_id: responsesResult.response_id,
          revised_prompt: responsesResult.revised_prompt,
          method: "responses_api",
        };
      } catch (responsesError) {
        console.log(
          "Responses API failed, falling back to Image API:",
          responsesError
        );
      }
    }

    // Fallback to Image API
    console.log("Using Image API...");

    // Enhance prompt for Image API since it can't see the actual images
    let enhancedPrompt = prompt;
    if (
      imageUrls &&
      (imageUrls.product || imageUrls.design || imageUrls.color)
    ) {
      console.log(
        "🔄 Enhancing prompt for Image API - adding visual context descriptions"
      );

      // Add explicit product description context
      enhancedPrompt = enhancedPrompt.replace(
        "Create a new product design",
        "Create a new product design (based on uploaded product analysis)"
      );

      // Add emphasis for Image API that it needs to generate the specific product
      enhancedPrompt = `${enhancedPrompt}

🎯 IMAGE API CONTEXT: Since this is generating from text only, use the detailed product analysis above to recreate the SPECIFIC product described, then apply the design and color transformations to that exact product. The product analysis contains the exact materials, shape, and features that must be recreated accurately.`;

      console.log(
        `📝 Enhanced prompt for Image API (${enhancedPrompt.length} chars)`
      );
    }

    let gptImageQuality = options.quality;
    if (gptImageQuality === "standard") gptImageQuality = "medium";
    if (!["low", "medium", "high", "auto"].includes(gptImageQuality)) {
      gptImageQuality = "medium";
    }

    const imageParams: any = {
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: options.size,
      quality: gptImageQuality,
      n: options.n,
    };

    // Add additional options
    if (options.background) imageParams.background = options.background;
    if (options.output_format)
      imageParams.output_format = options.output_format;
    if (options.output_compression)
      imageParams.output_compression = options.output_compression;

    // Check rate limit before making API call
    const rateLimitCheck = await openAILimiter.checkLimit("imagegeneration");
    if (!rateLimitCheck.allowed) {
      console.log(
        `⚠️ Rate limit hit for image generation. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`
      );
    }

    // Use queued API call to handle rate limits and retries
    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing OpenAI image generation request");
        return await openai.images.generate(imageParams);
      },
      "Image generation is temporarily delayed due to high demand. Please wait..."
    );

    if (!response.data || response.data.length === 0) {
      throw new Error("No images returned from GPT Image");
    }

    const results = response.data.map((img) => {
      if (img.b64_json) {
        return { type: "base64" as const, data: img.b64_json };
      } else if (img.url) {
        return { type: "url" as const, data: img.url };
      } else {
        throw new Error("Unexpected image format from GPT Image");
      }
    });

    return {
      results,
      method: "image_api",
    };
  } catch (err) {
    console.error("Error composing with GPT Image:", err);
    throw err;
  }
}

/**
 * Determines which workflow to run based on presence of product/design/color images and a prompt.
 */
function determineWorkflowType(
  hasProduct: boolean,
  hasDesign: boolean,
  hasColor: boolean,
  hasPrompt: boolean
): string {
  // 1. Product-based workflows (product image, preset, or reference)
  if (hasProduct) {
    // All three images → full_composition
    if (hasDesign && hasColor) {
      console.log("[determineWorkflowType] Chose: full_composition", {
        hasProduct,
        hasDesign,
        hasColor,
        hasPrompt,
      });
      return "full_composition";
    }
    // Product + Design only → product_design
    if (hasDesign && !hasColor) {
      console.log("[determineWorkflowType] Chose: product_design", {
        hasProduct,
        hasDesign,
        hasColor,
        hasPrompt,
      });
      return "product_design";
    }
    // Product + Color only → product_color
    if (!hasDesign && hasColor) {
      console.log("[determineWorkflowType] Chose: product_color", {
        hasProduct,
        hasDesign,
        hasColor,
        hasPrompt,
      });
      return "product_color";
    }
    // Product + Prompt only → product_prompt
    if (!hasDesign && !hasColor && hasPrompt) {
      console.log("[determineWorkflowType] Chose: product_prompt", {
        hasProduct,
        hasDesign,
        hasColor,
        hasPrompt,
      });
      return "product_prompt";
    }
    // Product only (no other inputs) → not supported
    if (!hasDesign && !hasColor && !hasPrompt) {
      throw new Error(
        "Product image alone is not sufficient. Please provide either: design image, color image, or a text prompt along with the product image."
      );
    }
  }

  // 2. Color-based workflows (color image or preset, and prompt, but no product or design)
  if (!hasProduct && hasColor && !hasDesign && hasPrompt) {
    console.log("[determineWorkflowType] Chose: color_prompt", {
      hasProduct,
      hasDesign,
      hasColor,
      hasPrompt,
    });
    return "color_prompt";
  }

  // 3. Design-based workflows (design image or preset, and prompt, but no product or color)
  if (!hasProduct && !hasColor && hasDesign && hasPrompt) {
    console.log("[determineWorkflowType] Chose: design_prompt", {
      hasProduct,
      hasDesign,
      hasColor,
      hasPrompt,
    });
    return "design_prompt";
  }

  // 4. Design + Color + prompt (no product) → color_design
  if (!hasProduct && hasDesign && hasColor && hasPrompt) {
    console.log("[determineWorkflowType] Chose: color_design", {
      hasProduct,
      hasDesign,
      hasColor,
      hasPrompt,
    });
    return "color_design";
  }

  // 5. Prompt only (no images)
  if (!hasProduct && !hasDesign && !hasColor && hasPrompt) {
    console.log("[determineWorkflowType] Chose: prompt_only", {
      hasProduct,
      hasDesign,
      hasColor,
      hasPrompt,
    });
    return "prompt_only";
  }

  // 6. If a reference image (previously generated product image) is present and a prompt is given, but no new design or color is provided, trigger product_prompt
  // This is a fallback for referencing a generated image as product context, even if the workflow_type is set explicitly or auto-inferred
  if (hasPrompt) {
    console.log("[determineWorkflowType] Fallback: product_prompt", {
      hasProduct,
      hasDesign,
      hasColor,
      hasPrompt,
    });
    return "product_prompt";
  }

  // 7. No valid combination
  if (hasDesign || hasColor) {
    throw new Error(
      "Design or color images require a text prompt when no product image is provided."
    );
  }

  // Fallback error for any other invalid combinations
  throw new Error(
    `Invalid input combination. Please provide one of the following:
     • Product + Design + Color (± prompt)
     • Product + Design (± prompt) 
     • Product + Color (± prompt)
     • Product + Prompt
     • Design + Color + Prompt
     • Design + Prompt
     • Color + Prompt
     • Prompt only
     
     Current inputs: product=${hasProduct}, design=${hasDesign}, color=${hasColor}, prompt=${hasPrompt}`
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("🎯 DESIGN ROUTE START: Beginning design route processing");
  try {
    const formData = await request.formData();
    console.log("🎯 DESIGN ROUTE: FormData extracted successfully");

    // 1) Extract and validate userid
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 }
      );
    }
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
      } catch {
        return NextResponse.json(
          { status: "error", error: "Invalid Firebase user ID" },
          { status: 400 }
        );
      }
    } else {
      console.log("Skipping Firebase user validation - testing mode");
    }

    // 2) Retrieve files/URLs (if any) and prompt
    const productImage = formData.get("product_image") as File | null;
    const designImage = formData.get("design_image") as File | null;
    const colorImage = formData.get("color_image") as File | null;
    const productImageUrl = formData.get("product_image_url") as string | null;
    const designImageUrl = formData.get("design_image_url") as string | null;
    const colorImageUrl = formData.get("color_image_url") as string | null;
    const prompt = (formData.get("prompt") as string)?.trim() || "";

    // Extract preset selections
    const presetProductType = formData.get("preset_product_type") as
      | string
      | null;
    const presetDesignStyle = formData.get("preset_design_style") as
      | string
      | null;
    const presetColorPalette = formData.get("preset_color_palette") as
      | string
      | null;

    console.log("Input detection:", {
      hasProductFile: !!productImage,
      hasDesignFile: !!designImage,
      hasColorFile: !!colorImage,
      hasProductUrl: !!productImageUrl,
      hasDesignUrl: !!designImageUrl,
      hasColorUrl: !!colorImageUrl,
      hasPresetProduct: !!presetProductType,
      hasPresetDesign: !!presetDesignStyle,
      hasPresetColor: !!presetColorPalette,
    });

    // 3) Get explicit workflow_type or infer based on inputs
    let workflow_type: string;
    const hasProduct =
      !!productImage || !!productImageUrl || !!presetProductType;
    const hasDesign = !!designImage || !!designImageUrl || !!presetDesignStyle;
    const hasColor = !!colorImage || !!colorImageUrl || !!presetColorPalette;

    // Check if workflow_type is explicitly provided (from intentroute)
    const explicitWorkflowType = formData.get("workflow_type") as string | null;

    if (explicitWorkflowType) {
      console.log(`🎯 Using explicit workflow type: ${explicitWorkflowType}`);
      workflow_type = explicitWorkflowType;
    } else {
      console.log("🔄 No explicit workflow type, determining from inputs...");
      try {
        workflow_type = determineWorkflowType(
          hasProduct,
          hasDesign,
          hasColor,
          !!prompt
        );
        console.log(`🔄 Determined workflow type: ${workflow_type}`);
      } catch (e: any) {
        return NextResponse.json(
          { status: "error", error: e.message },
          { status: 400 }
        );
      }
    }

    // 4) Retrieve enhanced generation parameters with dynamic aspect ratio detection
    const sizeParam = (formData.get("size") as string) || "";
    const aspectRatio = (formData.get("aspect_ratio") as string) || "";

    // 🎯 DYNAMIC ASPECT RATIO DETECTION - Match Product Image Dimensions
    let size = sizeParam;
    let detectedAspectRatio = aspectRatio;

    // 🎯 Smart aspect ratio detection based on input type
    const hasActualProductImage = !!(productImage || productImageUrl);
    const hasOnlyPresets = !!presetProductType && !hasActualProductImage;

    if (hasActualProductImage && !aspectRatio) {
      // User provided actual image (uploaded or referenced) - always auto-detect aspect ratio
      try {
        console.log(
          "📏 Detecting product image dimensions for aspect ratio matching..."
        );
        const dimensions = await getImageDimensions(productImageUrl!);
        size = dimensionsToGenerationSize(dimensions.width, dimensions.height);

        const aspectRatio = dimensions.width / dimensions.height;
        if (aspectRatio > 1.2) {
          detectedAspectRatio = "landscape";
        } else if (aspectRatio < 0.8) {
          detectedAspectRatio = "portrait";
        } else {
          detectedAspectRatio = "square";
        }

        console.log(
          `📏 Product image: ${dimensions.width}x${dimensions.height} → Output: ${size} (${detectedAspectRatio}) [AUTO-DETECTED from ${productImage ? "UPLOADED" : "REFERENCED"} image]`
        );
      } catch (error) {
        console.log(
          "⚠️ Could not detect product image dimensions, using Claude's decision or default"
        );
        if (!sizeParam) {
          size = "1024x1024";
          detectedAspectRatio = "square";
        }
      }
    } else if (hasOnlyPresets && sizeParam) {
      // User selected preset only - use Claude's aspect ratio decision
      console.log(
        `📏 Using Claude's aspect ratio decision for preset: ${presetProductType} → ${size} (Claude-decided)`
      );
    } else if (!aspectRatio && !sizeParam) {
      // No product info at all - use square default
      size = "1024x1024";
      detectedAspectRatio = "square";
      console.log(
        "📏 No product image or preset, using default square aspect ratio"
      );
    } else if (aspectRatio) {
      // Manual override provided
      switch (aspectRatio.toLowerCase()) {
        case "portrait":
          size = "1024x1536";
          break;
        case "landscape":
          size = "1536x1024";
          break;
        case "square":
        default:
          size = "1024x1024";
          break;
      }
      detectedAspectRatio = aspectRatio;
    } else {
      // Size explicitly provided, extract aspect ratio
      if (sizeParam.includes("1536x1024")) {
        detectedAspectRatio = "landscape";
      } else if (sizeParam.includes("1024x1536")) {
        detectedAspectRatio = "portrait";
      } else {
        detectedAspectRatio = "square";
      }
      size = sizeParam;
    }

    console.log(
      `🎯 Using size: ${size} (${detectedAspectRatio}) ${hasActualProductImage && !aspectRatio ? "[AUTO-DETECTED]" : hasOnlyPresets && sizeParam ? "[CLAUDE-DECIDED]" : "[EXPLICIT]"}`
    );
    const quality = (formData.get("quality") as string) || "auto";
    const n = parseInt((formData.get("n") as string) || "1", 10);
    const background = (formData.get("background") as string) || "opaque";
    const outputFormat = (formData.get("output_format") as string) || "png";
    const outputCompression = parseInt(
      (formData.get("output_compression") as string) || "0",
      10
    );
    const stream = (formData.get("stream") as string) === "true";
    const partialImages = parseInt(
      (formData.get("partial_images") as string) || "2",
      10
    );
    const mainlineModel =
      (formData.get("mainline_model") as string) || "gpt-4.1";

    // 🧠 Extract Claude's semantic analysis for intelligent input role assignment
    const semanticAnalysisParam = formData.get("semantic_analysis") as
      | string
      | null;
    let semanticAnalysis: any = null;

    if (semanticAnalysisParam) {
      try {
        semanticAnalysis = JSON.parse(semanticAnalysisParam);
        console.log("🧠 Claude's semantic analysis:", semanticAnalysis);
      } catch (e) {
        console.log("⚠️ Could not parse semantic analysis:", e);
      }
    }

    // 🔧 NEW: Extract explicit reference flag to distinguish auto vs manual referencing
    const explicitReferenceStr = formData.get("explicit_reference") as string;
    // 🔧 NEW: Extract reference mode for contextual processing
    const referenceMode = formData.get("referencemode") as string;
    // 🔧 CRITICAL: Extract actual reference image URL (separate from product image)
    const referenceImageUrl = formData.get("reference_image_url") as string;
    // 🔧 FALLBACK: Also check design_image_url (used by intentroute for references)
    const designImageUrlFromReference = formData.get(
      "design_image_url"
    ) as string;

    // 🔍 DEBUG: Log exactly what reference URLs we received
    console.log("🔍 REFERENCE URL DEBUG:");
    console.log(
      `  - reference_image_url: ${referenceImageUrl || "NOT PROVIDED"}`
    );
    console.log(
      `  - design_image_url: ${designImageUrlFromReference || "NOT PROVIDED"}`
    );
    console.log(`  - product_image_url: ${productImageUrl || "NOT PROVIDED"}`);
    console.log(
      `  - All form data keys: ${Array.from(formData.keys())
        .filter((k) => k.includes("image"))
        .join(", ")}`
    );

    // 🔧 IMPROVED DETECTION: Multiple ways to detect manual vs auto references
    const isExplicitManualReference = explicitReferenceStr === "true";
    const hasSpecificReferenceMode =
      referenceMode && ["product", "design", "color"].includes(referenceMode);

    // 🔧 SMART FALLBACK: Multiple ways to detect manual reference
    const claudeDetectedDesignOrColor =
      semanticAnalysis?.input_roles?.design_sources === "reference" ||
      semanticAnalysis?.input_roles?.color_sources === "reference";
    const hasExplicitPresets =
      !!presetProductType || !!presetDesignStyle || !!presetColorPalette;

    // 🔧 CRITICAL FIX: Determine actual reference URL (manual reference takes priority over auto reference)
    // ⚠️ IMPORTANT: Only use productImageUrl as reference when there's NO separate product input
    // In "product image + design reference" scenarios, we need the actual reference URL, not the product URL
    const hasActualProductInput = !!productImage || !!productImageUrl;
    const actualReferenceUrl =
      referenceImageUrl ||
      designImageUrlFromReference ||
      (!hasActualProductInput ? productImageUrl : null);

    console.log("🔍 REFERENCE URL DETERMINATION:");
    console.log(`  - Has actual product input: ${hasActualProductInput}`);
    console.log(`  - Final reference URL: ${actualReferenceUrl || "NONE"}`);
    if (actualReferenceUrl) {
      console.log(
        `  - Reference URL source: ${referenceImageUrl ? "reference_image_url" : designImageUrlFromReference ? "design_image_url" : "product_image_url (fallback)"}`
      );
    }

    // 🔧 ENHANCED DETECTION: Reference + multiple presets = likely manual reference
    const hasMultiplePresets =
      [presetProductType, presetDesignStyle, presetColorPalette].filter(Boolean)
        .length >= 2;

    // 🔧 CRITICAL FIX: If all 3 slots are filled with actual uploads, SKIP all reference processing
    const hasUploadedDesignImage = !!designImageUrl;
    const hasUploadedColorImage = !!colorImageUrl;
    const hasUploadedProductImage = !!productImageUrl;
    const hasAllThreeUploads =
      hasUploadedProductImage &&
      hasUploadedDesignImage &&
      hasUploadedColorImage;

    // 🔧 CRITICAL AUTO-REFERENCE RULE: Auto-referenced images can ONLY be used as PRODUCT
    // NEVER as design or color - this violates user preferences
    const claudeViolatesAutoReferenceRules = claudeDetectedDesignOrColor;

    // 🔧 CRITICAL: Check if Claude explicitly says to ignore reference completely
    const claudeWantsNoReference =
      semanticAnalysis?.input_roles?.design_sources === "none" ||
      (semanticAnalysis?.input_roles?.product_sources === "upload" &&
        semanticAnalysis?.input_roles?.design_sources !== "reference" &&
        semanticAnalysis?.input_roles?.color_sources === "upload");

    // 🔧 CRITICAL FIX: Detect smart fallback auto-reference scenario
    // When smart fallback handles auto-reference, product_image_url and reference_image_url are the same
    const isSmartFallbackAutoReference =
      !!actualReferenceUrl &&
      !!productImageUrl &&
      productImageUrl === referenceImageUrl &&
      !semanticAnalysis; // Smart fallback was used (no Claude analysis)
    // 🔧 REMOVED: !hasMultiplePresets condition - auto-reference can have multiple presets

    // 🔧 CRITICAL FIX: Only consider multiple presets as manual reference if it's NOT auto-reference
    // Auto-reference + multiple presets is still auto-reference (just use reference as product)
    const referenceWithMultiplePresets =
      !!actualReferenceUrl &&
      hasMultiplePresets &&
      !isSmartFallbackAutoReference;

    // 🔧 NEW: Detect manual reference when user uploads product + reference (common manual reference scenario)
    // BUT NOT when all 3 slots are filled with uploads (that's just 3 direct uploads, not reference scenario)
    // AND NOT when Claude violates auto-reference rules (should be fresh generation instead)
    // AND NOT when Claude explicitly says to ignore reference completely
    // AND NOT when it's smart fallback auto-reference (same URL for product and reference)
    const manualReferenceWithUploads =
      !!actualReferenceUrl &&
      hasUploadedProductImage &&
      !hasAllThreeUploads &&
      !claudeViolatesAutoReferenceRules &&
      !claudeWantsNoReference &&
      !isSmartFallbackAutoReference;

    const isLikelyManualReference =
      (claudeDetectedDesignOrColor && hasExplicitPresets) ||
      referenceWithMultiplePresets ||
      manualReferenceWithUploads;

    const isManualReference =
      isExplicitManualReference ||
      hasSpecificReferenceMode ||
      isLikelyManualReference;

    // 🔧 AUTO-REFERENCE STRICT RULES: Only valid if Claude wants it for product role OR smart fallback detected it
    const isValidAutoReference =
      !!actualReferenceUrl &&
      !isManualReference &&
      !hasAllThreeUploads &&
      !claudeViolatesAutoReferenceRules &&
      (semanticAnalysis?.input_roles?.product_sources === "reference" ||
        isSmartFallbackAutoReference);

    const isAutoReference = isValidAutoReference;

    console.log(`🔍 REFERENCE TYPE DETECTION:`);
    console.log(`  - Has product image URL: ${!!productImageUrl}`);
    console.log(`  - Has design image URL: ${!!designImageUrl}`);
    console.log(`  - Has color image URL: ${!!colorImageUrl}`);
    console.log(`  - Has ALL THREE uploads: ${hasAllThreeUploads}`);
    console.log(`  - Has reference image URL: ${!!referenceImageUrl}`);
    console.log(
      `  - Has design image URL (from reference): ${!!designImageUrlFromReference}`
    );
    console.log(`  - Explicit reference flag: ${explicitReferenceStr}`);
    console.log(`  - Reference mode: ${referenceMode || "not specified"}`);
    console.log(`  - Explicit manual reference: ${isExplicitManualReference}`);
    console.log(`  - Has specific reference mode: ${hasSpecificReferenceMode}`);
    console.log(
      `  - Claude detected design/color reference: ${claudeDetectedDesignOrColor}`
    );
    console.log(
      `  - 🚫 Claude violates auto-reference rules: ${claudeViolatesAutoReferenceRules}`
    );
    console.log(`  - 🚫 Claude wants no reference: ${claudeWantsNoReference}`);
    console.log(`  - Has explicit presets: ${hasExplicitPresets}`);
    console.log(`  - Has multiple presets: ${hasMultiplePresets}`);
    console.log(
      `  - Reference with multiple presets: ${referenceWithMultiplePresets}`
    );
    console.log(`  - Has uploaded color image: ${hasUploadedColorImage}`);
    console.log(`  - Has uploaded product image: ${hasUploadedProductImage}`);
    console.log(
      `  - Manual reference with uploads: ${manualReferenceWithUploads}`
    );
    console.log(`  - Smart fallback triggered: ${isLikelyManualReference}`);
    console.log(
      `  - 🔧 Smart fallback auto-reference: ${isSmartFallbackAutoReference}`
    );
    console.log(`  - 🔧 Valid auto-reference: ${isValidAutoReference}`);
    console.log(`  - FINAL: Is manual reference: ${isManualReference}`);
    console.log(`  - FINAL: Is auto reference: ${isAutoReference}`);

    // 🔧 EXPLAIN AUTO-REFERENCE VIOLATIONS
    if (claudeViolatesAutoReferenceRules) {
      console.log(
        `🚫 AUTO-REFERENCE VIOLATION: Claude wants to use reference for design/color role`
      );
      console.log(`   - Auto-reference is ONLY allowed for product role`);
      console.log(
        `   - This will be processed as fresh generation with uploaded images only`
      );
    }

    // 🔧 EXPLAIN WHEN CLAUDE WANTS NO REFERENCE
    if (claudeWantsNoReference) {
      console.log(
        `🚫 CLAUDE WANTS NO REFERENCE: Claude explicitly said to ignore reference completely`
      );
      console.log(
        `   - design_sources: ${semanticAnalysis?.input_roles?.design_sources}`
      );
      console.log(
        `   - product_sources: ${semanticAnalysis?.input_roles?.product_sources}`
      );
      console.log(
        `   - color_sources: ${semanticAnalysis?.input_roles?.color_sources}`
      );
      console.log(
        `   - This will be processed as fresh generation with uploaded images only`
      );
    }

    // 🧠 INTELLIGENT REFERENCE LOGIC: Claude's semantic analysis + explicit rules as fallback
    // Prioritize Claude's intelligent understanding, fallback to explicit preset logic

    const overrideInputs = {
      useReferenceAsDesign: false,
      useReferenceAsColor: false,
      useReferenceAsProduct: false,
      skipProductPreset: false,
      skipDesignPreset: false,
      skipColorPreset: false,
      skipProductImageProcessing: false,
    };

    // 🔧 CRITICAL FIX: Skip ALL reference processing when user uploads all 3 images directly
    if (hasAllThreeUploads) {
      console.log(
        "🎯 ALL THREE UPLOADS DETECTED - Skipping reference processing completely"
      );
      console.log("  - Using uploaded product image directly");
      console.log("  - Using uploaded design image directly");
      console.log("  - Using uploaded color image directly");
      console.log("  - NO reference processing needed");
    }
    // 🔧 CLEAN SEPARATION: Handle reference logic based on type
    else if (actualReferenceUrl) {
      const hasProductPreset = !!presetProductType;
      const hasDesignPreset = !!presetDesignStyle;
      const hasColorPreset = !!presetColorPalette;

      console.log(`🔍 REFERENCE PROCESSING:`);
      console.log(
        `  - Reference type: ${isAutoReference ? "AUTO" : isManualReference ? "MANUAL" : "UNKNOWN"}`
      );
      console.log(`  - Has product preset: ${hasProductPreset}`);
      console.log(`  - Has design preset: ${hasDesignPreset}`);
      console.log(`  - Has color preset: ${hasColorPreset}`);
      console.log(`  - Product image URL: ${productImageUrl?.slice(0, 50)}...`);
      console.log(
        `  - Reference image URL: ${referenceImageUrl?.slice(0, 50)}...`
      );
      console.log(
        `  - Design image URL (from reference): ${designImageUrlFromReference?.slice(0, 50)}...`
      );
      console.log(
        `  - Using reference URL: ${actualReferenceUrl.slice(0, 50)}...`
      );

      // ========================================
      // 🤖 AUTO-REFERENCE LOGIC (Reply to previous generation)
      // ========================================
      if (isAutoReference) {
        console.log("🤖 AUTO-REFERENCE PROCESSING:");

        // 🚫 CRITICAL RULE: AUTO-REFERENCE IS ONLY FOR PRODUCT ROLE
        console.log("  🚫 AUTO-REFERENCE STRICT RULE: ONLY for product role");
        console.log("     - NEVER use auto-reference for design role");
        console.log("     - NEVER use auto-reference for color role");
        console.log("     - Manual reference can be used for any role");

        // Explicitly ensure auto-reference is NEVER used for design or color
        overrideInputs.useReferenceAsDesign = false;
        overrideInputs.useReferenceAsColor = false;

        if (!hasProductPreset) {
          // No product preset = use reference as product (default auto-reference behavior)
          overrideInputs.useReferenceAsProduct = true;
          console.log(
            "  🎯 Using reference as PRODUCT (no explicit product choice)"
          );
        } else {
          // Has product preset = ignore reference completely (auto-reference can't help)
          overrideInputs.skipProductImageProcessing = true;
          overrideInputs.useReferenceAsProduct = false;
          console.log(
            "  🎯 Using preset as PRODUCT, ignoring auto-reference completely"
          );
          console.log(`    - Preset: ${presetProductType}`);

          // 🚫 AUTO-REFERENCE RULE: NEVER use for design/color (only for product)
          console.log(
            "  🚫 AUTO-REFERENCE: NOT using for design/color (by design)"
          );
          console.log("     - Auto-reference is ONLY for product role");
          console.log("     - Manual reference can be used for any role");
        }
      }
      // ========================================
      // 👤 MANUAL REFERENCE LOGIC (User deliberately uploaded reference)
      // ========================================
      else if (isManualReference) {
        console.log("👤 MANUAL REFERENCE PROCESSING:");

        if (!semanticAnalysis || !semanticAnalysis.input_roles) {
          console.log(
            "  ⚠️ No Claude analysis available, using smart fallback"
          );

          // 🔧 SMART FALLBACK: When user uploads product + reference + color, likely want reference for design
          if (manualReferenceWithUploads) {
            console.log(
              "  🎯 Smart Fallback: Product + Reference + Color uploads detected"
            );
            console.log("    - Using uploaded product as PRODUCT");
            console.log("    - Using reference as DESIGN");
            console.log("    - Using uploaded color as COLOR");
            overrideInputs.useReferenceAsDesign = true;
            overrideInputs.useReferenceAsProduct = false; // CRITICAL: Don't use reference as product
            overrideInputs.skipDesignPreset = true;
          } else {
            overrideInputs.useReferenceAsProduct = true;
            console.log("  🎯 Default Fallback: Using reference as PRODUCT");
          }
        } else {
          console.log(
            "  🧠 Using Claude's semantic analysis to determine roles"
          );

          // 🔧 Explicit reference mode override
          if (
            referenceMode &&
            ["product", "design", "color"].includes(referenceMode)
          ) {
            console.log(`  🎯 Reference mode override: "${referenceMode}"`);

            if (referenceMode === "design") {
              overrideInputs.useReferenceAsDesign = true;
              overrideInputs.skipDesignPreset = true;
              console.log(
                "    ✅ Using reference as DESIGN (explicit user choice)"
              );
            } else if (referenceMode === "color") {
              overrideInputs.useReferenceAsColor = true;
              overrideInputs.skipColorPreset = true;
              console.log(
                "    ✅ Using reference as COLOR (explicit user choice)"
              );
            } else if (referenceMode === "product") {
              overrideInputs.useReferenceAsProduct = true;
              console.log(
                "    ✅ Using reference as PRODUCT (explicit user choice)"
              );
            }
          } else {
            // 🧠 Use Claude's detailed input_roles analysis
            const inputRoles = semanticAnalysis.input_roles;
            console.log(`  📋 Claude's role assignments:`, inputRoles);

            // 🔧 SMART OVERRIDE: If user has product preset + reference, don't use reference as product
            const hasProductPreset = !!presetProductType;
            const claudeWantsReferenceAsProduct =
              inputRoles.product_sources === "reference";

            if (claudeWantsReferenceAsProduct && hasProductPreset) {
              console.log(
                "    🔧 OVERRIDE: User has product preset - using reference as DESIGN instead of product"
              );
              overrideInputs.useReferenceAsDesign = true;
              overrideInputs.skipDesignPreset = true;
              console.log(
                "    ✅ OVERRIDE: Using reference as DESIGN (Claude wanted product)"
              );
            } else if (inputRoles.product_sources === "reference") {
              overrideInputs.useReferenceAsProduct = true;
              console.log("    ✅ Claude: Using reference as PRODUCT");
            }

            if (inputRoles.design_sources === "reference") {
              overrideInputs.useReferenceAsDesign = true;
              overrideInputs.skipDesignPreset = true;
              console.log("    ✅ Claude: Using reference as DESIGN");
            }

            if (inputRoles.color_sources === "reference") {
              overrideInputs.useReferenceAsColor = true;
              overrideInputs.skipColorPreset = true;
              console.log("    ✅ Claude: Using reference as COLOR");
            }

            // 🔧 Fallback to reference_role if input_roles is empty
            if (
              !inputRoles.product_sources &&
              !inputRoles.design_sources &&
              !inputRoles.color_sources
            ) {
              const referenceRole = semanticAnalysis.reference_role;
              console.log(
                `  🔄 Fallback to reference_role: "${referenceRole}"`
              );

              if (referenceRole === "design") {
                overrideInputs.useReferenceAsDesign = true;
                overrideInputs.skipDesignPreset = true;
                console.log("    ✅ Fallback: Using reference as DESIGN");
              } else if (referenceRole === "color") {
                overrideInputs.useReferenceAsColor = true;
                overrideInputs.skipColorPreset = true;
                console.log("    ✅ Fallback: Using reference as COLOR");
              } else {
                overrideInputs.useReferenceAsProduct = true;
                console.log("    ✅ Fallback: Using reference as PRODUCT");
              }
            }
          }
        }
      }
      // ========================================
      // ❓ UNKNOWN REFERENCE TYPE
      // ========================================
      else {
        console.log(
          "❓ UNKNOWN REFERENCE TYPE - using default product reference"
        );
        overrideInputs.useReferenceAsProduct = true;
      }

      // 📊 LOG FINAL REFERENCE DECISIONS
      console.log("🎯 FINAL REFERENCE DECISIONS:");
      console.log(
        `  - Use as Product: ${overrideInputs.useReferenceAsProduct}`
      );
      console.log(`  - Use as Design: ${overrideInputs.useReferenceAsDesign}`);
      console.log(`  - Use as Color: ${overrideInputs.useReferenceAsColor}`);
      console.log(
        `  - Skip product processing: ${overrideInputs.skipProductImageProcessing}`
      );
    }

    // 5) Validate that this inferred workflow is valid
    // For modification workflows, separate actual inputs from inherited presets
    const hasActualColor = !!colorImage || !!colorImageUrl; // Only actual color inputs, not presets
    const hasActualDesign = !!designImage || !!designImageUrl; // Only actual design inputs, not presets
    const hasActualProduct = !!productImage || !!productImageUrl; // Only actual product inputs, not presets

    // 🔧 CRITICAL FIX: Handle direct product uploads without reference for product_color workflow
    if (
      !actualReferenceUrl &&
      productImageUrl &&
      workflow_type === "product_color"
    ) {
      console.log(
        "🔧 PRODUCT_COLOR FIX: Setting product image for direct upload without reference"
      );
      overrideInputs.useReferenceAsProduct = true;
      overrideInputs.skipProductImageProcessing = false;
    }

    // Use different validation logic for modification workflows vs fresh creation
    const isModificationWorkflow = [
      "product_design",
      "product_color",
      "full_composition",
    ].includes(workflow_type);

    // 🔧 CRITICAL FIX: Account for reference-as-design scenarios in validation
    const hasDesignFromReference =
      overrideInputs.useReferenceAsDesign && !!actualReferenceUrl;
    const hasColorFromReference =
      overrideInputs.useReferenceAsColor && !!actualReferenceUrl;

    // 🔧 WORKFLOW CORRECTION: If reference is being used as design, upgrade workflow appropriately
    if (hasDesignFromReference && workflow_type === "product_color") {
      console.log(
        "🔧 WORKFLOW CORRECTION: Reference used as design - upgrading product_color to full_composition"
      );
      workflow_type = "full_composition";
    }

    // 🔧 WORKFLOW CORRECTION: If reference is being used as color, upgrade workflow appropriately
    if (hasColorFromReference && workflow_type === "product_design") {
      console.log(
        "🔧 WORKFLOW CORRECTION: Reference used as color - upgrading product_design to full_composition"
      );
      workflow_type = "full_composition";
    }

    const validation = isModificationWorkflow
      ? validateWorkflowInputs(
          workflow_type,
          hasActualProduct || !!presetProductType, // Product: actual input OR preset OK
          hasActualDesign || hasDesignFromReference, // Design: actual input OR reference OR preset OK
          hasActualColor || hasColorFromReference || !!presetColorPalette, // Color: actual input OR reference OR preset OK
          !!prompt
        )
      : validateWorkflowInputs(
          workflow_type,
          hasProduct, // Use original logic for non-modification workflows
          hasDesign,
          hasColor,
          !!prompt
        );
    if (!validation.valid) {
      return NextResponse.json(
        { status: "error", error: validation.error },
        { status: 400 }
      );
    }

    // 6) Process input images (files or URLs) and run analyses
    const inputUrls: {
      product?: string;
      design?: string;
      color?: string;
      color2?: string;
    } = {};

    // 🔧 PRESET OPTIMIZATION: Track Firebase input URLs separately from OpenAI generation URLs
    const firebaseInputUrls: {
      product?: string;
      design?: string;
      color?: string;
      color2?: string;
    } = {};

    const analyses: { product?: string; design?: string; color?: string } = {};

    try {
      // Handle product image (file, URL, or preset)
      // 🎯 PRIORITY: When all 3 uploads are present, process them directly without reference logic
      if (hasAllThreeUploads && productImageUrl) {
        console.log("🎯 ALL THREE UPLOADS: Processing product image directly");
        inputUrls.product = productImageUrl;
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product"
        );
        console.log("✅ Product image processed successfully (direct upload)");
      } else if (productImage && firebaseInitialized) {
        console.log("Processing product image file...");
        const productBuffer = await fileToJpegBuffer(productImage);
        const productPath = `${userid}/input/${uuidv4()}.jpg`;
        const productUrl = await uploadBufferToFirebase(
          productBuffer,
          productPath
        );
        inputUrls.product = productUrl;
        analyses.product = await analyzeImageWithGPT4Vision(
          productUrl,
          "product"
        );
        console.log("Product image file processed successfully");
      } else if (
        productImageUrl &&
        !overrideInputs.useReferenceAsDesign &&
        !overrideInputs.useReferenceAsColor &&
        overrideInputs.useReferenceAsProduct &&
        !overrideInputs.skipProductImageProcessing
      ) {
        // Only use productImageUrl as product if it's not being used as design/color source AND we're using it as product AND not explicitly skipped
        console.log("Using product image URL:", productImageUrl);
        inputUrls.product = productImageUrl;
        console.log("🔍 Starting product image analysis...");
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product"
        );
        console.log(
          "🔍 Product analysis result length:",
          analyses.product?.length || 0
        );
        if (!analyses.product || analyses.product.length === 0) {
          console.log("⚠️ Product analysis returned empty result!");
        }
        console.log("Product image URL processed successfully");
      } else if (
        productImageUrl &&
        semanticAnalysis?.input_roles?.product_sources === "upload"
      ) {
        // 🔧 CRITICAL FIX: When Claude says to use upload for product, process the uploaded product image
        console.log(
          "🧠 CLAUDE OVERRIDE: Using uploaded product image (Claude said product_sources: upload)"
        );
        console.log("Using product image URL:", productImageUrl);
        inputUrls.product = productImageUrl;
        console.log("🔍 Starting uploaded product image analysis...");
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product"
        );
        console.log("✅ Uploaded product image processed successfully");
      } else if (
        productImageUrl &&
        !overrideInputs.useReferenceAsProduct &&
        overrideInputs.useReferenceAsDesign &&
        !overrideInputs.skipProductImageProcessing &&
        !presetProductType
      ) {
        // 🎯 SMART FALLBACK: Process uploaded product when reference is used as design (manual reference scenario)
        // BUT ONLY when there's no product preset (preset takes priority)
        console.log(
          "🎯 SMART FALLBACK: Using uploaded product image (reference used as design)"
        );
        console.log("Using product image URL:", productImageUrl);
        inputUrls.product = productImageUrl;
        console.log("🔍 Starting uploaded product image analysis...");
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product"
        );
        console.log(
          "✅ Uploaded product image processed successfully (smart fallback)"
        );
      } else if (
        presetProductType &&
        (semanticAnalysis?.input_roles?.product_sources !== "upload" ||
          overrideInputs.useReferenceAsDesign ||
          overrideInputs.useReferenceAsColor)
      ) {
        // 🎯 SEMANTIC OVERRIDE: Use preset when Claude didn't say to use upload OR when reference is used for design/color
        if (
          overrideInputs.useReferenceAsDesign ||
          overrideInputs.useReferenceAsColor
        ) {
          console.log(
            "🧠 SEMANTIC OVERRIDE: Using preset product type as base (reference used for design/color)"
          );
        }
        console.log("Using preset product type:", presetProductType);

        // 🔧 CRITICAL FIX: Process the preset product type into analysis
        // Extract actual product name from path (e.g., "inputs/placeholders/t-shirt.svg" -> "tshirt")
        let productName = presetProductType;
        if (presetProductType.includes("/")) {
          // Extract filename and remove extension
          const filename =
            presetProductType.split("/").pop() || presetProductType;
          productName = filename.replace(/\.(svg|png|jpg|jpeg|webp)$/i, "");
          // Convert "t-shirt" to "tshirt" for lookup
          productName = productName.replace(/[-\s]/g, "");
        }

        console.log(
          `Extracted product name: "${productName}" from "${presetProductType}"`
        );

        // Create detailed product specification based on type
        const productSpecs: Record<string, string> = {
          tshirt:
            "T-shirt - Cotton/cotton blend fabric garment with short sleeves, crew or V-neck, standard fit. Key features: front chest area for designs, back panel for large graphics, sleeve space for accent designs. Maintain classic t-shirt silhouette and proportions.",
          totebag:
            "Tote bag - Large rectangular canvas or fabric bag with two parallel handles. Key features: spacious main compartment, flat front and back panels ideal for designs, sturdy construction. Maintain practical tote bag structure and proportions.",
          hoodie:
            "Hoodie - Pullover sweatshirt with attached hood and front pocket. Key features: hood area, front chest space, sleeve areas, back panel for large designs. Maintain casual hoodie silhouette and proportions.",
          shoes:
            "Shoes - Footwear with sole, upper, and closure system. Key features: toe box, side panels, heel area, tongue, and sole. Maintain functional shoe structure while allowing surface design application.",
          pillow:
            "Decorative pillow - Square or rectangular cushion with removable cover. Key features: flat front surface ideal for patterns/designs, maintain standard pillow dimensions and soft fabric appearance.",
          backpack:
            "Backpack - Multi-compartment bag with shoulder straps. Key features: main body panel, front pocket areas, side panels, adjustable straps. Maintain functional backpack structure and proportions.",
          phonecase:
            "Phone case - Protective cover for smartphone. Key features: camera cutout area, port access, flat back surface for designs. Maintain precise fit and protective functionality.",
          coffecup:
            "Coffee mug - Cylindrical ceramic drinking vessel with handle. Key features: wrap-around surface area for designs, handle attachment, maintain standard mug proportions and functionality.",
          blanket:
            "Throw blanket - Rectangular textile covering. Key features: large flat surface ideal for patterns, soft fabric texture, maintain cozy blanket appearance and drape.",
          dress:
            "Dress - One-piece garment for upper and lower body. Key features: bodice area, skirt section, sleeve/shoulder areas. Maintain feminine dress silhouette and flowing fabric characteristics.",
        };

        const productSpec =
          productSpecs[productName] ||
          `${productName} - Product type to be generated with characteristic shape, structure, and design surfaces appropriate for the product category.`;

        analyses.product = `TARGET PRODUCT: ${productSpec} This product ready for design application will serve as the base for the design composition. IMPORTANT: Generate specifically a ${productName}, not any other product type.`;
        console.log("Preset product type processed successfully");
      } else if (
        presetProductType &&
        semanticAnalysis?.input_roles?.product_sources === "upload"
      ) {
        console.log(
          "🔧 SKIPPING preset product type - Claude said to use uploaded product instead:",
          {
            claudeProductSources:
              semanticAnalysis?.input_roles?.product_sources,
            hasProductImageUrl: !!productImageUrl,
            presetProductType,
          }
        );

        // Extract actual product name from path (e.g., "inputs/placeholders/t-shirt.svg" -> "tshirt")
        let productName = presetProductType;
        if (presetProductType.includes("/")) {
          // Extract filename and remove extension
          const filename =
            presetProductType.split("/").pop() || presetProductType;
          productName = filename.replace(/\.(svg|png|jpg|jpeg|webp)$/i, "");
          // Convert "t-shirt" to "tshirt" for lookup
          productName = productName.replace(/[-\s]/g, "");
        }

        console.log(
          `Extracted product name: "${productName}" from "${presetProductType}"`
        );

        // 🎯 CORRECT FIX: Don't set product image URL for presets - rely on text analysis only
        // This allows the AI to generate the product from text description while using reference for design
        console.log(
          `🎯 Using text-only product specification (no image URL) for: ${productName}`
        );

        // Create detailed product specification based on type
        const productSpecs: Record<string, string> = {
          tshirt:
            "T-shirt - Cotton/cotton blend fabric garment with short sleeves, crew or V-neck, standard fit. Key features: front chest area for designs, back panel for large graphics, sleeve space for accent designs. Maintain classic t-shirt silhouette and proportions.",
          totebag:
            "Tote bag - Large rectangular canvas or fabric bag with two parallel handles. Key features: spacious main compartment, flat front and back panels ideal for designs, sturdy construction. Maintain practical tote bag structure and proportions.",
          hoodie:
            "Hoodie - Pullover sweatshirt with attached hood and front pocket. Key features: hood area, front chest space, sleeve areas, back panel for large designs. Maintain casual hoodie silhouette and proportions.",
          shoes:
            "Shoes - Footwear with sole, upper, and closure system. Key features: toe box, side panels, heel area, tongue, and sole. Maintain functional shoe structure while allowing surface design application.",
          pillow:
            "Decorative pillow - Square or rectangular cushion with removable cover. Key features: flat front surface ideal for patterns/designs, maintain standard pillow dimensions and soft fabric appearance.",
          backpack:
            "Backpack - Multi-compartment bag with shoulder straps. Key features: main body panel, front pocket areas, side panels, adjustable straps. Maintain functional backpack structure and proportions.",
          phonecase:
            "Phone case - Protective cover for smartphone. Key features: camera cutout area, port access, flat back surface for designs. Maintain precise fit and protective functionality.",
          coffecup:
            "Coffee mug - Cylindrical ceramic drinking vessel with handle. Key features: wrap-around surface area for designs, handle attachment, maintain standard mug proportions and functionality.",
          blanket:
            "Throw blanket - Rectangular textile covering. Key features: large flat surface ideal for patterns, soft fabric texture, maintain cozy blanket appearance and drape.",
          dress:
            "Dress - One-piece garment for upper and lower body. Key features: bodice area, skirt section, sleeve/shoulder areas. Maintain feminine dress silhouette and flowing fabric characteristics.",
        };

        const productSpec =
          productSpecs[productName] ||
          `${productName} - Product type to be generated with characteristic shape, structure, and design surfaces appropriate for the product category.`;

        analyses.product = `TARGET PRODUCT: ${productSpec} This product ready for design application will serve as the base for the design composition. IMPORTANT: Generate specifically a ${productName}, not any other product type.`;
        console.log("Preset product type processed successfully");
      } else if (productImageUrl && workflow_type.includes("preset")) {
        // 🔧 PRESET WORKFLOW FIX: Handle preset workflows with product images
        // This catches cases where we have a product image URL in preset workflows that weren't handled above
        console.log(
          "🔧 PRESET WORKFLOW: Using product image URL for preset workflow:",
          productImageUrl
        );
        inputUrls.product = productImageUrl;
        console.log(
          "🔍 Starting product image analysis for preset workflow..."
        );
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product"
        );
        console.log(
          "✅ Product image processed successfully for preset workflow"
        );
      }

      // Handle design image (file, URL, or preset) with semantic override
      // 🧠 CRITICAL FIX: Prioritize uploaded design images over reference overrides
      // 🎯 PRIORITY: When all 3 uploads are present, process them directly without reference logic
      if (hasAllThreeUploads && designImageUrl) {
        console.log("🎯 ALL THREE UPLOADS: Processing design image directly");
        inputUrls.design = designImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference"
        );
        console.log("✅ Design image processed successfully (direct upload)");
      } else if (designImage && firebaseInitialized) {
        console.log("Processing uploaded design image file...");
        const designBuffer = await fileToJpegBuffer(designImage);
        const designPath = `${userid}/input/${uuidv4()}.jpg`;
        const designUrl = await uploadBufferToFirebase(
          designBuffer,
          designPath
        );
        inputUrls.design = designUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designUrl,
          "design reference"
        );
        console.log("✅ Uploaded design image file processed successfully");
      } else if (designImageUrl && !overrideInputs.useReferenceAsDesign) {
        // Use uploaded design image URL (only if not overridden by reference)
        console.log("Using uploaded design image URL:", designImageUrl);
        inputUrls.design = designImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference"
        );
        console.log("✅ Uploaded design image URL processed successfully");
      } else if (overrideInputs.useReferenceAsDesign && actualReferenceUrl) {
        // 🎯 CLAUDE'S SEMANTIC OVERRIDE: Use reference image as design source
        console.log(
          "🧠 SEMANTIC OVERRIDE: Using reference image as DESIGN source instead of uploads/presets"
        );
        inputUrls.design = actualReferenceUrl;
        console.log("🔍 Starting reference-as-design analysis...");
        analyses.design = await analyzeImageWithGPT4Vision(
          actualReferenceUrl,
          "design reference"
        );
        console.log("✅ Reference image processed as DESIGN source");
      } else if (overrideInputs.useReferenceAsDesign && designImageUrl) {
        // 🎯 CLAUDE'S SEMANTIC OVERRIDE: Use reference image as design source
        console.log(
          "🧠 SEMANTIC OVERRIDE: Using reference image as DESIGN source instead of presets"
        );
        inputUrls.design = designImageUrl;
        console.log("🔍 Starting reference-as-design analysis...");
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference"
        );
        console.log("✅ Reference image processed as DESIGN source");
      } else if (presetDesignStyle && !overrideInputs.skipDesignPreset) {
        console.log("Using preset design style:", presetDesignStyle);
        // Convert preset name to actual image URL using proper category detection

        // Import designs data for category lookup
        let designsData: any;
        try {
          const designsModule = await import(
            "../../../constants/data/designs.json"
          );
          designsData = designsModule.default || designsModule;
        } catch (importError) {
          console.log("Could not import designs.json, using fallback logic");
          designsData = { defaultImages: {} };
        }

        // Find the preset in the designs data to determine correct category and path
        let presetImageUrl = null;

        // Search through all categories in defaultImages
        for (const [presetKey, imagePaths] of Object.entries(
          designsData.defaultImages
        )) {
          if (Array.isArray(imagePaths)) {
            // Find matching image path for this preset
            const matchingPath = imagePaths.find((path) =>
              path.includes(`/${presetDesignStyle}.webp`)
            );
            if (matchingPath) {
              presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imai.studio")}${matchingPath}`;
              console.log(
                `✅ Found preset ${presetDesignStyle} in category: ${matchingPath}`
              );
              break;
            }
          }
        }

        // Fallback to old logic if not found in designs.json
        if (!presetImageUrl) {
          console.log(
            `⚠️ Preset ${presetDesignStyle} not found in designs.json, using fallback logic`
          );
          
          // Map design styles to their correct folders (matching WelcomeScreen.tsx)
          const designStyleFolders: Record<string, string> = {
            minimalist: "fashions",
            luxury: "fashions",
            artistic: "general",
            futuristic: "general",
            minimalsleek: "general",
            vintagefeel: "fashions",
            bold: "general",
            sportysleek: "general",
            funcoolquriky: "general",
            elegantandsophisticated: "bags",
            mystical: "general",
            vintage: "Jewelry",
            bohemian: "Jewelry",
            industrial: "Jewelry",
            animeinspired: "general",
          };
          
          const baseStyle = presetDesignStyle.replace(/\d+$/, "");
          const folder = designStyleFolders[presetDesignStyle] || designStyleFolders[baseStyle] || "general";
          
          // For styles that don't have numbered variants, use the style name as is
          // For styles that do have numbered variants, use the first one (style1.webp)
          let fileName = presetDesignStyle;
          if (presetDesignStyle === baseStyle) {
            // No number suffix, try adding "1" for styles that use numbered variants
            const numberedStyles = ["industrial", "vintage", "bohemian"];
            if (numberedStyles.includes(baseStyle)) {
              fileName = `${baseStyle}1`;
            }
          }
          
          const presetImagePath = `/inputs/designs/${folder}/${baseStyle}/${fileName}.webp`;
          presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imai.studio")}${presetImagePath}`;
          console.log(`🔧 Using folder: ${folder}, fileName: ${fileName} for style: ${presetDesignStyle}`);
        }

        inputUrls.design = presetImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          presetImageUrl,
          "design reference"
        );
        console.log("Preset design style processed successfully");
      }

      // Handle color image (file, URL, and/or preset) with semantic override - support multiple color inputs
      let colorAnalysisParts = [];

      // 🎯 CRITICAL FIX: When design image is uploaded but no color input, extract colors from design image
      // 🚨 IMPORTANT: Only do this if there's NO existing color source (including from references)
      const hasAnyColorInput =
        colorImage ||
        colorImageUrl ||
        presetColorPalette ||
        overrideInputs.useReferenceAsColor ||
        inputUrls.color;

      if (
        (designImage ||
          (designImageUrl && !overrideInputs.useReferenceAsDesign)) &&
        !hasAnyColorInput
      ) {
        console.log(
          "🧠 DESIGN IMAGE COLOR EXTRACTION: Extracting COLOR palette from uploaded design image (since no color input provided)"
        );
        const designColorUrl = designImageUrl || inputUrls.design;
        if (designColorUrl && !isPresetColorUrl(designColorUrl)) {
          if (!inputUrls.color) {
            inputUrls.color = designColorUrl;
          }
          const designColorAnalysis = await analyzeImageWithGPT4Vision(
            designColorUrl,
            "color reference"
          );
          colorAnalysisParts.push(designColorAnalysis);
          console.log(
            "✅ Design image processed as COLOR source (in addition to design patterns)"
          );
        }
      } else if (hasAnyColorInput) {
        console.log(
          "🚫 SKIPPING design image color extraction - color source already provided:",
          {
            colorImage: !!colorImage,
            colorImageUrl: !!colorImageUrl,
            presetColorPalette: !!presetColorPalette,
            inputUrlsColor: !!inputUrls.color,
            useReferenceAsColor: !!overrideInputs.useReferenceAsColor,
          }
        );
        console.log(
          "🎯 Will process the provided color source in the main color processing section below..."
        );
      }

      // 🎯 MAIN COLOR PROCESSING: Always process actual color inputs (moved outside else chain)
      // 🔧 CRITICAL FIX: This was trapped in unreachable else block - now runs independently

      // 🔍 DEBUG: Check what color inputs we have
      console.log("🔍 COLOR PROCESSING DEBUG:", {
        colorImage: !!colorImage,
        colorImageUrl: !!colorImageUrl,
        presetColorPalette: !!presetColorPalette,
        useReferenceAsDesign: !!overrideInputs.useReferenceAsDesign,
        useReferenceAsColor: !!overrideInputs.useReferenceAsColor,
        productImageUrl: !!productImageUrl,
        colorImageUrlValue: colorImageUrl?.substring(0, 80) + "...",
      });

      // 🔧 CRITICAL FIX: Determine if we should use preset for color instead of reference
      const shouldUsePresetForColor =
        semanticAnalysis?.input_roles?.color_sources === "preset" &&
        !!presetColorPalette &&
        !overrideInputs.useReferenceAsColor;

      console.log("🔧 COLOR SOURCE DECISION:", {
        claudeColorSources: semanticAnalysis?.input_roles?.color_sources,
        hasPreset: !!presetColorPalette,
        useReferenceAsColor: !!overrideInputs.useReferenceAsColor,
        shouldUsePresetForColor,
      });

      // 🧠 SEMANTIC OVERRIDES: Handle reference image color extraction based on Claude's analysis
      // CRITICAL: Reference can serve DUAL PURPOSE (both design + color from same image)
      // 🎯 PRIORITY: When all 3 uploads are present, process them directly without reference logic
      if (
        hasAllThreeUploads &&
        colorImageUrl &&
        !isPresetColorUrl(colorImageUrl)
      ) {
        console.log("🎯 ALL THREE UPLOADS: Processing color image directly");
        inputUrls.color = colorImageUrl;
        const uploadedColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference"
        );
        colorAnalysisParts.push(uploadedColorAnalysis);
        console.log("✅ Color image processed successfully (direct upload)");
      } else if (
        hasAllThreeUploads &&
        colorImageUrl &&
        isPresetColorUrl(colorImageUrl)
      ) {
        console.log(
          "🔧 PRESET OPTIMIZATION: Skipping preset color URL in all three uploads - will handle in preset section:",
          colorImageUrl.substring(0, 80) + "..."
        );
      } else if (overrideInputs.useReferenceAsColor && actualReferenceUrl) {
        // When Claude explicitly says reference should be color source
        console.log(
          "🧠 SEMANTIC OVERRIDE 2: Using reference image as COLOR source"
        );
        inputUrls.color = actualReferenceUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          actualReferenceUrl,
          "color reference"
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference image processed as COLOR source");
      } else if (
        overrideInputs.useReferenceAsColor &&
        colorImageUrl &&
        !isPresetColorUrl(colorImageUrl)
      ) {
        // When Claude explicitly says reference should be color source
        console.log(
          "🧠 SEMANTIC OVERRIDE 2: Using reference image as COLOR source instead of presets"
        );
        inputUrls.color = colorImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference"
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference image processed as COLOR source");
      } else if (
        overrideInputs.useReferenceAsColor &&
        colorImageUrl &&
        isPresetColorUrl(colorImageUrl)
      ) {
        // When Claude says reference should be color source but it's a preset URL
        console.log(
          "🔧 PRESET OPTIMIZATION: Skipping preset color URL for reference processing - will handle in preset section:",
          colorImageUrl.substring(0, 80) + "..."
        );
      }
      // Handle standard color inputs (colorImageUrl from references, color files)
      // 🔧 CRITICAL FIX: Don't process colorImageUrl when Claude said to use preset instead
      else if (
        colorImageUrl &&
        !shouldUsePresetForColor &&
        !isPresetColorUrl(colorImageUrl)
      ) {
        console.log(
          "🎯 MAIN COLOR PROCESSING: Using color image URL (likely from reference):",
          colorImageUrl.substring(0, 80) + "..."
        );
        inputUrls.color = colorImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference"
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference color image processed successfully");
      } else if (colorImageUrl && isPresetColorUrl(colorImageUrl)) {
        console.log(
          "🔧 PRESET OPTIMIZATION: Skipping preset color URL in earlier processing - will handle in preset section:",
          colorImageUrl.substring(0, 80) + "..."
        );
      } else if (colorImageUrl && shouldUsePresetForColor) {
        console.log(
          "🔧 SKIPPING color image URL processing - Claude said to use preset instead:",
          {
            colorImageUrl: colorImageUrl.substring(0, 50) + "...",
            claudeColorSources: semanticAnalysis?.input_roles?.color_sources,
            hasPreset: !!presetColorPalette,
          }
        );
      } else if (colorImage && firebaseInitialized) {
        console.log("🎯 MAIN COLOR PROCESSING: Processing color image file...");
        const colorBuffer = await fileToJpegBuffer(colorImage);
        const colorPath = `${userid}/input/${uuidv4()}.jpg`;
        const colorUrl = await uploadBufferToFirebase(colorBuffer, colorPath);
        inputUrls.color = colorUrl;
        const uploadedColorAnalysis = await analyzeImageWithGPT4Vision(
          colorUrl,
          "color reference"
        );
        colorAnalysisParts.push(uploadedColorAnalysis);
        console.log("Color image file processed successfully");
      }
      // 🧠 CRITICAL FIX: DUAL-PURPOSE REFERENCE (design + color from same image)
      // When Claude says reference should be used for BOTH design AND color extraction
      else if (
        overrideInputs.useReferenceAsDesign &&
        actualReferenceUrl &&
        semanticAnalysis?.input_roles?.design_sources === "reference" &&
        semanticAnalysis?.input_roles?.color_sources === "reference"
      ) {
        console.log(
          "🧠 DUAL-PURPOSE REFERENCE: Analyzing same reference for COLOR extraction (already processed for design)"
        );
        inputUrls.color = actualReferenceUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          actualReferenceUrl,
          "color reference"
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log(
          "✅ Reference image processed as COLOR source (dual-purpose analysis complete)"
        );
      } else {
        console.log("🔍 NO COLOR PROCESSING: No color inputs found to process");
      }

      // Then, handle preset color palette (can be in addition to uploaded) - unless overridden
      if (presetColorPalette && !overrideInputs.skipColorPreset) {
        console.log("Using preset color palette:", presetColorPalette);

        // Handle multiple color palettes (comma-separated)
        const colorPalettes = presetColorPalette.includes(",")
          ? presetColorPalette.split(",").map((p) => p.trim())
          : [presetColorPalette];

        // 🎨 ENHANCED: Analyze ALL color presets as actual images for true blending
        const allColorAnalyses: string[] = [];

        for (let i = 0; i < colorPalettes.length; i++) {
          const palette = colorPalettes[i];
          const presetColorImagePath = `/inputs/placeholders/colors/${palette}.webp`;
          const presetColorImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imai.studio")}${presetColorImagePath}`;

          console.log(
            `🎨 Analyzing color preset ${i + 1}/${colorPalettes.length}: ${palette}`
          );
          console.log(`🎨 Using color preset URL: ${presetColorImageUrl}`);

          // 🔧 PRESET OPTIMIZATION: Skip sending color images to OpenAI - use extracted hex codes instead
          // Set color URLs for Firebase tracking only (not for OpenAI generation)
          if (i === 0 && !firebaseInputUrls.color) {
            firebaseInputUrls.color = presetColorImageUrl; // ✅ Track for Firebase response
            console.log(
              `🎨 Cached preset color analysis (not sending image to OpenAI): ${palette}`
            );
          } else if (i === 1 && !firebaseInputUrls.color2) {
            firebaseInputUrls.color2 = presetColorImageUrl; // ✅ Track for Firebase response
            console.log(
              `🎨 Cached secondary preset color analysis (not sending image to OpenAI): ${palette}`
            );
          }

          // 🚀 CACHED ANALYSIS: Use cached premium GPT-4 Vision analysis or analyze if not cached
          try {
            const presetColorAnalysis = await getCachedColorPresetAnalysis(
              palette,
              presetColorImageUrl
            );
            allColorAnalyses.push(presetColorAnalysis);
            console.log(`✅ Color preset ${palette} analysis retrieved`);
          } catch (error) {
            console.log(
              `⚠️ Error getting color preset analysis for ${palette}:`,
              error
            );
            // Fallback to text description if analysis fails
            const formattedName = palette
              .replace(/([a-z])([A-Z])/g, "$1 $2")
              .toLowerCase();
            const fallbackAnalysis = `${formattedName} color palette with its characteristic tones and harmonies`;
            allColorAnalyses.push(fallbackAnalysis);
          }
        }

        // 🎨 BLEND: Combine all color analyses into a unified color analysis
        if (allColorAnalyses.length === 1) {
          // Single palette - use as is
          colorAnalysisParts.push(allColorAnalyses[0]);
        } else if (allColorAnalyses.length > 1) {
          // Multiple palettes - create blended analysis
          const blendedColorAnalysis = `
**BLENDED COLOR PALETTE ANALYSIS:**
This design combines and harmonizes colors from ${colorPalettes.join(" + ")} palettes.

${allColorAnalyses
  .map(
    (analysis, index) => `
**Palette ${index + 1} (${colorPalettes[index]}):**
${analysis}
`
  )
  .join("\n")}

**BLENDING INSTRUCTIONS:**
- Extract key colors from each palette above
- Create smooth color transitions between ${colorPalettes.join(", ")} themes
- Maintain color harmony while incorporating elements from all palettes
- Use ${colorPalettes[0]} as the primary base, enhanced with accents from ${colorPalettes.slice(1).join(" and ")}
- Ensure the final result feels cohesive, not chaotic - blend the palettes thoughtfully
          `.trim();

          colorAnalysisParts.push(blendedColorAnalysis);
        }

        console.log(
          "Preset color palette processed:",
          colorPalettes.length,
          "palette(s) analyzed and blended"
        );
      }

      // Combine all color analyses
      if (colorAnalysisParts.length > 0) {
        if (colorAnalysisParts.length === 1) {
          analyses.color = colorAnalysisParts[0];
        } else {
          analyses.color = `Combine and harmonize the following color references: ${colorAnalysisParts.join(" AND ")} Ensure all color elements work together cohesively in the overall composition.`;
        }
      }
    } catch (error: any) {
      console.error("Error processing images:", error);
      const errorMessage =
        error?.message || "Unknown error occurred while processing images";
      return NextResponse.json(
        { status: "error", error: errorMessage },
        { status: 500 }
      );
    }

    // 🧠 SEMANTIC ANALYSIS SUMMARY
    if (semanticAnalysis) {
      console.log("\n🧠 === CLAUDE'S SEMANTIC ANALYSIS SUMMARY ===");
      console.log(`🎯 User Intent: ${semanticAnalysis.user_intent}`);
      console.log(`🔗 Reference Role: ${semanticAnalysis.reference_role}`);
      console.log("📋 Input Role Assignments:");
      if (semanticAnalysis.input_roles) {
        console.log(
          `  • Product sources: ${semanticAnalysis.input_roles.product_sources}`
        );
        console.log(
          `  • Design sources: ${semanticAnalysis.input_roles.design_sources}`
        );
        console.log(
          `  • Color sources: ${semanticAnalysis.input_roles.color_sources}`
        );
      }
      console.log("\n🎯 === FINAL INPUT MAPPING AFTER SEMANTIC ANALYSIS ===");
      console.log(
        `📦 Product: ${inputUrls.product || analyses.product ? "SET" : "NOT SET"} ${inputUrls.product ? "(from " + (overrideInputs.useReferenceAsDesign || overrideInputs.useReferenceAsColor ? "preset" : "reference/upload") + ")" : analyses.product ? "(from preset specification)" : ""}`
      );
      console.log(
        `🎨 Design: ${inputUrls.design || analyses.design ? "SET" : "NOT SET"} ${inputUrls.design ? "(from " + (overrideInputs.useReferenceAsDesign ? "reference image" : "preset/upload") + ")" : analyses.design ? "(from preset specification)" : ""}`
      );
      console.log(
        `🌈 Color: ${inputUrls.color || analyses.color ? "SET" : "NOT SET"} ${inputUrls.color ? "(from " + (overrideInputs.useReferenceAsColor || (overrideInputs.useReferenceAsDesign && !presetColorPalette) ? "reference image" : "preset/upload") + ")" : analyses.color ? "(from preset specification)" : ""}`
      );
      console.log("🧠 === END SEMANTIC ANALYSIS === ��\n");
    }

    // 7) Build the enhanced prompt
    const workflowPrompt = generateWorkflowPrompt(
      workflow_type,
      prompt || undefined,
      analyses.product,
      analyses.design,
      analyses.color
    );

    // 🔍 DEBUG: Log what's being sent to OpenAI
    console.log("🚀🚀🚀 === FINAL OPENAI REQUEST DEBUG === 🚀🚀🚀");
    console.log(`📋 Workflow Type: ${workflow_type}`);
    console.log(`📋 User Prompt: ${prompt || "N/A"}`);
    console.log("\n📊 === ANALYSIS DATA USED ===");

    // Extract essential analyses for debugging
    const debugEssentialProductAnalysis = analyses.product
      ? extractEssentialAnalysis(analyses.product, "product")
      : undefined;
    const debugEssentialDesignAnalysis = analyses.design
      ? extractEssentialAnalysis(analyses.design, "design reference")
      : undefined;
    const debugEssentialColorAnalysis = analyses.color
      ? extractEssentialAnalysis(analyses.color, "color reference")
      : undefined;

    console.log(
      `🔍 Product Analysis Length: ${analyses.product?.length || 0} chars → Essential: ${debugEssentialProductAnalysis?.length || 0} chars`
    );
    if (debugEssentialProductAnalysis) {
      console.log(
        `🔍 Essential Product Analysis: ${debugEssentialProductAnalysis.substring(0, 200)}...`
      );
    }
    console.log(
      `🔍 Design Analysis Length: ${analyses.design?.length || 0} chars → Essential: ${debugEssentialDesignAnalysis?.length || 0} chars`
    );
    if (debugEssentialDesignAnalysis) {
      console.log(
        `🔍 Essential Design Analysis: ${debugEssentialDesignAnalysis.substring(0, 200)}...`
      );
    }
    console.log(
      `🔍 Color Analysis Length: ${analyses.color?.length || 0} chars → Essential: ${debugEssentialColorAnalysis?.length || 0} chars`
    );
    if (debugEssentialColorAnalysis) {
      console.log(
        `🔍 Essential Color Analysis: ${debugEssentialColorAnalysis.substring(0, 200)}...`
      );
    }
    console.log("\n🎯 === COMPLETE FINAL PROMPT ===");
    console.log(`📝 Final Prompt Length: ${workflowPrompt.length} chars`);
    console.log("📝 Complete Final Prompt:");
    console.log("=" + "=".repeat(80));
    console.log(workflowPrompt);
    console.log("=" + "=".repeat(80));
    console.log("🚀🚀🚀 === END DEBUG === 🚀🚀🚀\n");

    // 8) Generate the product with enhanced options
    const generationOptions = {
      size,
      quality,
      n,
      background: background !== "opaque" ? background : undefined,
      output_format: outputFormat !== "png" ? outputFormat : undefined,
      output_compression: outputCompression > 0 ? outputCompression : undefined,
      stream,
      partial_images: partialImages,
    };

    console.log("🎯 DESIGN ROUTE: About to call OpenAI generation");
    console.log("  - Workflow prompt length:", workflowPrompt.length);
    console.log("  - Generation options:", generationOptions);
    console.log("  - Input URLs:", inputUrls);

    const generationResult = await composeProductWithGPTImage(
      workflowPrompt,
      generationOptions,
      inputUrls
    );

    console.log("🎯 DESIGN ROUTE: OpenAI generation completed");
    console.log("  - Result status:", generationResult ? "success" : "failed");
    console.log(
      "  - Result keys:",
      generationResult ? Object.keys(generationResult) : "none"
    );

    if (generationResult.results.length === 0) {
      throw new Error("GPT Image returned no images");
    }

    const firstResult = generationResult.results[0];
    let finalOutputUrl: string;

    if (firebaseInitialized) {
      // Firebase mode: upload to Firebase Storage
      let outputJpegBuffer: Buffer;

      if (firstResult.type === "base64") {
        // Convert base64 directly to JPEG buffer
        const rawBuffer = Buffer.from(firstResult.data, "base64");
        outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
      } else {
        // Fetch the URL, then convert to JPEG buffer
        const response = await fetch(firstResult.data);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch GPT Image URL: ${response.statusText}`
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        const rawBuffer = Buffer.from(arrayBuffer);
        outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
      }

      // Upload the composed output to Firebase Storage
      const outputPath = `${userid}/output/${uuidv4()}.jpg`;
      finalOutputUrl = await uploadBufferToFirebase(
        outputJpegBuffer,
        outputPath
      );
    } else {
      // Non-Firebase mode: use the generated URL directly
      if (firstResult.type === "base64") {
        // Convert base64 to data URL
        finalOutputUrl = `data:image/jpeg;base64,${firstResult.data}`;
      } else {
        // Use the URL directly
        finalOutputUrl = firstResult.data;
      }
    }

    // 10) Return enhanced success response
    // 🔧 PRESET OPTIMIZATION: Combine actual URLs (sent to OpenAI) with preset URLs (tracked for Firebase)
    const combinedFirebaseInputUrls = {
      ...inputUrls,
      ...firebaseInputUrls, // Preset URLs override actual URLs in response
    };

    const responsePayload: ComposeProductResponse = {
      status: "success",
      firebaseInputUrls: combinedFirebaseInputUrls,
      firebaseOutputUrl: finalOutputUrl,
      workflow_type,
      generated_prompt: workflowPrompt,
      revised_prompt: generationResult.revised_prompt,
      response_id: generationResult.response_id,
      model_used: "gpt-image-1",
      generation_method: generationResult.method,
      streaming_supported:
        stream && generationResult.method === "responses_api",
    };
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("API Error:", err);
    const errorResponse: ComposeProductResponse = {
      status: "error",
      error: err.message || "Unknown error occurred",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
