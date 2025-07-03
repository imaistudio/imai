import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import sharp from "sharp";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Add configuration for longer timeout
export const maxDuration = 300; // 5 minute in seconds
export const dynamic = "force-dynamic";

// Firebase disabled - intentroute handles all file operations
let firebaseInitialized = false;
console.log(
  "🔥 Firebase disabled in design route - using intentroute for file handling",
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
  destinationPath: string,
): Promise<string> {
  try {
    if (!firebaseInitialized) {
      throw new Error(
        "Firebase is not initialized - cannot upload to Firebase Storage",
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new Error("Invalid buffer: Buffer is empty or undefined");
    }

    if (!destinationPath) {
      throw new Error("Invalid destination path: Path is empty or undefined");
    }

    console.log(
      `Uploading to Firebase Storage: ${destinationPath}, size: ${buffer.length} bytes`,
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
        `Invalid file type: ${file.type}. Only image files are supported.`,
      );
    }

    // Add file size limit check (10MB)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for high-res compositions
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }

    console.log(
      `Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`,
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
      `Successfully converted image to JPEG, size: ${jpegBuffer.length} bytes`,
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
  hasPrompt: boolean,
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
          error:
            "product_design requires product and design images",
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
  colorAnalysis?: string,
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
      const basePrompt = `Apply only the color palette and color scheme from the color reference image to the PRODUCT ONLY while maintaining its original design, structure, and details. Extract colors only — do NOT copy any design patterns, textures, or visual elements. Keep all product features intact and transform only the colors to match the reference palette.

🚨 PHOTOREALISM REQUIREMENTS (CRITICAL - HIGHEST PRIORITY):
- Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette
- Render as REALISTIC PRODUCT PHOTOGRAPHY with professional studio lighting
- Maintain actual product materials, textures, and physical properties
- NO artistic rendering, NO cartoon style, NO illustration style, NO anime style
- Must look like you could purchase this exact product from a high-end store
- Use proper lighting, shadows, reflections, and surface details
- HYPER-REALISTIC material textures (leather, fabric, rubber, metal, etc.)

🎯 CRITICAL COLOR APPLICATION RULES:
- ONLY change colors on the PRODUCT itself (shoes, clothing, bag, etc.)
- PRESERVE the original background completely unchanged
- PRESERVE the original lighting and shadows
- Apply new colors ONLY to product surfaces, materials, and components
- Do NOT change background color, lighting, or environmental elements
- Maintain the exact same photo composition and setting
- Colors should look like real fabric dyes, paints, or materials - not digital overlays

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
        `Failed to fetch image for size check: ${response.statusText}`,
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
          `🔄 Unsupported format detected: ${formatInfo} - converting to JPEG`,
        );
        needsConversion = true;
      } else if (!supportedFormats.includes(formatInfo.toLowerCase())) {
        console.log(
          `⚠️ Unknown format: ${formatInfo} - attempting conversion to JPEG`,
        );
        needsConversion = true;
      }
    } catch (metadataError) {
      console.log(
        `⚠️ Could not detect format, attempting conversion: ${metadataError}`,
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
          `✅ Image converted from ${formatInfo} (${sizeMB.toFixed(2)}MB) to JPEG (${newSizeMB.toFixed(2)}MB)`,
        );
        return convertedUrl;
      } catch (conversionError) {
        console.warn(
          `❌ Sharp conversion failed for ${formatInfo} format:`,
          conversionError,
        );
        return imageUrl; // Return original URL if conversion fails
      }
    }

    // Image is fine as-is
    console.log(
      `✅ Image format ${formatInfo} is supported, no conversion needed`,
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
  analysisType: string,
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
        `🔍 PRESET ANALYSIS PASSTHROUGH (${fullAnalysis.length} chars):`,
      );
      console.log(`${fullAnalysis}`);
      return fullAnalysis;
    }

    if (analysisType === "color reference") {
      const colorSections: string[] = [];

      // Look for "Specific Color Values" section
      let colorValuesMatch = fullAnalysis.match(
        /\*\*Specific Color Values:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n\n\*\*|\n\n[A-Z]|$)/,
      );
      if (colorValuesMatch) {
        colorSections.push(
          "**Specific Color Values:**\n" + colorValuesMatch[1].trim(),
        );
      }

      // Look for "Color Palette" section
      let paletteMatch = fullAnalysis.match(
        /\*\*Color Palette:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n\n\*\*|\n\n[A-Z]|$)/,
      );
      if (paletteMatch) {
        colorSections.push("**Color Palette:**\n" + paletteMatch[1].trim());
      }

      // Look for bullet-point color lists (like the failing case)
      const bulletColorMatches = fullAnalysis.match(
        /(?:^|\n)- \*\*[^*]*(?:Background|Color|HEX|RGB)[^*]*\*\*[^:\n]*:[\s\S]*?(?=\n- \*\*|\n\n|\*\*[A-Z]|$)/gm,
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
        /(?:###?\s*)?\*\*[^*]*[Cc]olor[^*]*\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/g,
      );
      if (colorSectionMatches) {
        colorSectionMatches.forEach((section) => {
          if (
            !colorSections.some((existing) =>
              existing.includes(section.substring(0, 50)),
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
            "**Color Information:**\n" + colorLines.slice(0, 10).join("\n"),
          );
        }
      }

      if (colorSections.length > 0) {
        const extracted = colorSections.join("\n\n");
        console.log(
          `✅ Color extraction successful: ${colorSections.length} sections found`,
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`,
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
        /(?:###?\s*)?\*\*[^*]*\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/g,
      );

      if (sectionMatches) {
        console.log(
          `🔍 Found ${sectionMatches.length} sections in design analysis`,
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
              `✅ Including design section ${index + 1}: ${section.substring(0, 50)}...`,
            );
            keywordSections.push(section.trim());
          }
        });
      }

      if (keywordSections.length > 0) {
        const extracted = keywordSections.join("\n\n");
        console.log(
          `✅ Design extraction successful: ${keywordSections.length} relevant sections found`,
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`,
        );
        console.log(`${extracted}`);
        return extracted;
      }

      // If no sections found, try to get the main descriptive content
      // Look for content after the introduction
      const mainContentMatch = fullAnalysis.match(
        /---\s*([\s\S]*?)(?=\n---|\n\n---|\n\n\n|$)/,
      );
      if (mainContentMatch && mainContentMatch[1].length > 200) {
        const mainContent = mainContentMatch[1].trim();
        console.log(
          `✅ Design extraction using main content: ${mainContent.length} chars`,
        );
        console.log(
          `🔍 MAIN CONTENT EXTRACTED ANALYSIS (${mainContent.length} chars):`,
        );
        console.log(`${mainContent}`);
        return mainContent;
      }
    } else if (analysisType === "product") {
      const sections = [];

      // Look for "Materials & Textures" section (with &)
      let materialsTexturesMatch = fullAnalysis.match(
        /\*\*Materials & Textures\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
      );
      if (materialsTexturesMatch) {
        sections.push(
          "**Materials & Textures:**\n" + materialsTexturesMatch[1].trim(),
        );
      }

      // Look for "Materials" section (without &)
      if (!materialsTexturesMatch) {
        let materialsMatch = fullAnalysis.match(
          /\*\*Materials\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
        );
        if (materialsMatch) {
          sections.push("**Materials:**\n" + materialsMatch[1].trim());
        }
      }

      // Look for "Structural Details" section
      let structuralMatch = fullAnalysis.match(
        /\*\*Structural Details\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
      );
      if (structuralMatch) {
        sections.push("**Structural Details:**\n" + structuralMatch[1].trim());
      }

      // Look for "Style & Aesthetics" section
      let styleMatch = fullAnalysis.match(
        /\*\*Style & Aesthetics\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
      );
      if (styleMatch) {
        sections.push("**Style & Aesthetics:**\n" + styleMatch[1].trim());
      }

      // Look for "Design Features" section
      let featuresMatch = fullAnalysis.match(
        /\*\*Design Features\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
      );
      if (featuresMatch) {
        sections.push("**Design Features:**\n" + featuresMatch[1].trim());
      }

      // Look for "Technical Specs" section
      let specsMatch = fullAnalysis.match(
        /\*\*Technical Specs\*\*\s*([\s\S]*?)(?=\n(?:###?\s*)?\*\*|\n\n|$)/,
      );
      if (specsMatch) {
        sections.push("**Technical Specs:**\n" + specsMatch[1].trim());
      }

      // If we didn't find the expected sections, try to find any product-related content
      if (sections.length === 0) {
        // Look for any content that describes the product
        const productContentMatch = fullAnalysis.match(
          /- \*\*[^*]*\*\*:\s*[\s\S]*?(?=\n- \*\*|\n\n|$)/g,
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
          `✅ Product extraction successful: ${sections.length} sections found`,
        );
        console.log(
          `🔍 EXTRACTED ESSENTIAL ANALYSIS (${extracted.length} chars):`,
        );
        console.log(`${extracted}`);
        return extracted;
      }
    }

    // If extraction fails, create a more targeted fallback based on analysis type
    console.log(
      `⚠️ Extraction failed for ${analysisType}, using improved fallback`,
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
            line.toLowerCase().includes("palette"),
        )
        .slice(0, 10)
        .join("\n");

      if (colorContent.length > 50) {
        const fallback = colorContent + "...";
        console.log(
          `🔍 FALLBACK EXTRACTED ANALYSIS (${fallback.length} chars):`,
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
          `🔍 FALLBACK EXTRACTED ANALYSIS (${fallback.length} chars):`,
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
      error,
    );
    const errorTruncated = fullAnalysis.substring(0, 500) + "...";
    console.log(`🔍 ERROR FALLBACK ANALYSIS (${errorTruncated.length} chars):`);
    console.log(`${errorTruncated}`);
    return errorTruncated;
  }
}

/**
 * Sends an image URL to GPT-4 Vision to get a textual analysis.
 */
async function analyzeImageWithGPT4Vision(
  imageUrl: string,
  analysisType: string,
  customInstructions?: string,
): Promise<string> {
  try {
    let processedImageUrl = imageUrl;

    // Check if it's a localhost URL and convert to base64
    if (imageUrl.includes("localhost:3000")) {
      console.log(
        `🔄 Localhost URL detected, converting to base64 for analysis: ${imageUrl}`,
      );
      try {
        processedImageUrl = await urlToBase64DataUrl(imageUrl);
        console.log(
          `✅ Successfully converted localhost URL to base64 for analysis`,
        );
      } catch (conversionError) {
        console.error(
          `❌ Failed to convert localhost URL to base64:`,
          conversionError,
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
  filename: string,
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
      const formatInfo = metadata.format || "unknown";
      console.log(`🔍 Files API - Detected image format: ${formatInfo}`);

      // Define supported and unsupported formats for OpenAI Files API
      const supportedFormats = ["jpeg", "jpg", "png", "webp"];
      const unsupportedFormats = ["mpo", "heic", "heif", "tiff", "bmp", "gif"];

      // Check if format conversion is needed
      if (unsupportedFormats.includes(formatInfo.toLowerCase())) {
        console.log(
          `🔄 Files API - Unsupported format detected: ${formatInfo} - converting to JPEG`,
        );

        // Convert to JPEG using Sharp
        finalBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

        finalMimeType = "image/jpeg";
        finalFilename = filename.replace(/\.[^/.]+$/, "") + ".jpg";

        console.log(
          `✅ Files API - Successfully converted ${formatInfo} to JPEG`,
        );
        console.log(
          `📊 Files API - Size change: ${Math.round(buffer.length / 1024)}KB → ${Math.round(finalBuffer.length / 1024)}KB`,
        );
      } else if (!supportedFormats.includes(formatInfo.toLowerCase())) {
        console.log(
          `⚠️ Files API - Unknown format detected: ${formatInfo} - attempting conversion to JPEG`,
        );

        // Convert unknown formats to JPEG as well
        finalBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

        finalMimeType = "image/jpeg";
        finalFilename = filename.replace(/\.[^/.]+$/, "") + ".jpg";

        console.log(
          `✅ Files API - Successfully converted unknown format to JPEG`,
        );
      } else {
        console.log(
          `✅ Files API - Image format ${formatInfo} is supported, no conversion needed`,
        );
      }
    } catch (sharpError) {
      console.warn(
        `⚠️ Files API - Sharp format detection failed: ${sharpError}`,
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
      `✅ Files API - Successfully uploaded ${finalFilename} (${finalMimeType}) with ID: ${uploadResponse.id}`,
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
  mainlineModel: string = "gpt-4.1",
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
        text: `Generate an image based on this prompt: ${prompt}`,
      },
    ];

    // Add image inputs if provided
    if (imageUrls) {
      if (imageUrls.product) {
        try {
          // Log which product URL we're processing
          console.log(
            `📤 Processing product image URL: ${imageUrls.product.substring(0, 100)}...`,
          );

          const fileId = await uploadImageToFiles(
            imageUrls.product,
            "product.jpg",
          );
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload product image to Files API, skipping:",
            err,
          );
        }
      }
      if (imageUrls.design) {
        try {
          const fileId = await uploadImageToFiles(
            imageUrls.design,
            "design.jpg",
          );
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload design image to Files API, skipping:",
            err,
          );
        }
      }
      if (imageUrls.color) {
        try {
          const fileId = await uploadImageToFiles(imageUrls.color, "color.jpg");
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload color image to Files API, skipping:",
            err,
          );
        }
      }
      if (imageUrls.color2) {
        try {
          const fileId = await uploadImageToFiles(
            imageUrls.color2,
            "color2.jpg",
          );
          inputContent.push({
            type: "input_image",
            file_id: fileId,
          });
        } catch (err) {
          console.warn(
            "Failed to upload color2 image to Files API, skipping:",
            err,
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
        3,
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
        "Streaming requested but not implemented in this version, using non-streaming...",
      );
      responseParams.stream = false;
    }

    // Debug: Log the exact request being sent to Responses API
    console.log("🔍 Responses API Request Debug:");
    console.log(`Model: ${responseParams.model}`);
    console.log(
      `Input content items: ${responseParams.input[0].content.length}`,
    );
    responseParams.input[0].content.forEach((item: any, index: number) => {
      if (item.type === "input_image") {
        console.log(`  [${index}] input_image - file_id: ${item.file_id}`);
      } else if (item.type === "input_text") {
        console.log(
          `  [${index}] input_text - ${item.text.substring(0, 50)}...`,
        );
      } else {
        console.log(`  [${index}] ${item.type}`);
      }
    });
    console.log(`Tools: ${JSON.stringify(responseParams.tools)}`);

    const response = await openai.responses.create(responseParams);

    // Extract image generation results - using any type to handle potential API changes
    const imageGenerationCalls = (response.output as any[]).filter(
      (output: any) => output.type === "image_generation_call",
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
  imageUrl: string,
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

    // Simple JPEG dimension detection (basic implementation)
    if (uint8Array[0] === 0xff && uint8Array[1] === 0xd8) {
      // For JPEG, we'll use a more complex parser or fallback to default
      // This is a simplified approach - for production, consider using a proper image library
      for (let i = 0; i < uint8Array.length - 8; i++) {
        if (
          uint8Array[i] === 0xff &&
          (uint8Array[i + 1] === 0xc0 || uint8Array[i + 1] === 0xc2)
        ) {
          const height = (uint8Array[i + 5] << 8) | uint8Array[i + 6];
          const width = (uint8Array[i + 7] << 8) | uint8Array[i + 8];
          return { width, height };
        }
      }
    }

    // Default fallback
    return { width: 1024, height: 1024 };
  } catch (error) {
    console.log(
      "Could not determine image dimensions, using default 1024x1024",
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
  },
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
          imageUrls,
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
          responsesError,
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
        "🔄 Enhancing prompt for Image API - adding visual context descriptions",
      );

      // Add explicit product description context
      enhancedPrompt = enhancedPrompt.replace(
        "Create a new product design",
        "Create a new product design (based on uploaded product analysis)",
      );

      // Add emphasis for Image API that it needs to generate the specific product
      enhancedPrompt = `${enhancedPrompt}

🎯 IMAGE API CONTEXT: Since this is generating from text only, use the detailed product analysis above to recreate the SPECIFIC product described, then apply the design and color transformations to that exact product. The product analysis contains the exact materials, shape, and features that must be recreated accurately.`;

      console.log(
        `📝 Enhanced prompt for Image API (${enhancedPrompt.length} chars)`,
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

    const response = await openai.images.generate(imageParams);

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
  hasPrompt: boolean,
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
        "Product image alone is not sufficient. Please provide either: design image, color image, or a text prompt along with the product image.",
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
      "Design or color images require a text prompt when no product image is provided.",
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
     
     Current inputs: product=${hasProduct}, design=${hasDesign}, color=${hasColor}, prompt=${hasPrompt}`,
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
        { status: 400 },
      );
    }
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
      } catch {
        return NextResponse.json(
          { status: "error", error: "Invalid Firebase user ID" },
          { status: 400 },
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
          !!prompt,
        );
        console.log(`🔄 Determined workflow type: ${workflow_type}`);
      } catch (e: any) {
        return NextResponse.json(
          { status: "error", error: e.message },
          { status: 400 },
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
          "📏 Detecting product image dimensions for aspect ratio matching...",
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
          `📏 Product image: ${dimensions.width}x${dimensions.height} → Output: ${size} (${detectedAspectRatio}) [AUTO-DETECTED from ${productImage ? "UPLOADED" : "REFERENCED"} image]`,
        );
      } catch (error) {
        console.log(
          "⚠️ Could not detect product image dimensions, using Claude's decision or default",
        );
        if (!sizeParam) {
          size = "1024x1024";
          detectedAspectRatio = "square";
        }
      }
    } else if (hasOnlyPresets && sizeParam) {
      // User selected preset only - use Claude's aspect ratio decision
      console.log(
        `📏 Using Claude's aspect ratio decision for preset: ${presetProductType} → ${size} (Claude-decided)`,
      );
    } else if (!aspectRatio && !sizeParam) {
      // No product info at all - use square default
      size = "1024x1024";
      detectedAspectRatio = "square";
      console.log(
        "📏 No product image or preset, using default square aspect ratio",
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
      `🎯 Using size: ${size} (${detectedAspectRatio}) ${hasActualProductImage && !aspectRatio ? "[AUTO-DETECTED]" : hasOnlyPresets && sizeParam ? "[CLAUDE-DECIDED]" : "[EXPLICIT]"}`,
    );
    const quality = (formData.get("quality") as string) || "auto";
    const n = parseInt((formData.get("n") as string) || "1", 10);
    const background = (formData.get("background") as string) || "opaque";
    const outputFormat = (formData.get("output_format") as string) || "png";
    const outputCompression = parseInt(
      (formData.get("output_compression") as string) || "0",
      10,
    );
    const stream = (formData.get("stream") as string) === "true";
    const partialImages = parseInt(
      (formData.get("partial_images") as string) || "2",
      10,
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
    const isManualReference = explicitReferenceStr === "true";
    const isAutoReference = !!productImageUrl && !isManualReference;

    console.log(`🔍 REFERENCE TYPE DETECTION:`);
    console.log(`  - Has product image URL: ${!!productImageUrl}`);
    console.log(`  - Explicit reference flag: ${explicitReferenceStr}`);
    console.log(`  - Is manual reference: ${isManualReference}`);
    console.log(`  - Is auto reference: ${isAutoReference}`);

    // 🧠 INTELLIGENT REFERENCE LOGIC: Claude's semantic analysis + explicit rules as fallback
    // Prioritize Claude's intelligent understanding, fallback to explicit preset logic

    const overrideInputs = {
      useReferenceAsDesign: false,
      useReferenceAsColor: false,
      useReferenceAsProduct: false,
      skipProductPreset: false,
      skipDesignPreset: false,
      skipColorPreset: false,
    };

    if (productImageUrl) {
      const hasProductPreset = !!presetProductType;
      const hasDesignPreset = !!presetDesignStyle;
      const hasColorPreset = !!presetColorPalette;

      console.log(`🧠 INTELLIGENT REFERENCE ANALYSIS:`);
      console.log(`  - Has product preset: ${hasProductPreset}`);
      console.log(`  - Has design preset: ${hasDesignPreset}`);
      console.log(`  - Has color preset: ${hasColorPreset}`);
      console.log(
        `  - Reference type: ${isAutoReference ? "AUTO" : isManualReference ? "MANUAL" : "UNKNOWN"}`,
      );
      console.log(`  - Reference image: ${productImageUrl.slice(0, 50)}...`);

      // 🔧 SMART AUTO-REFERENCING: Let Claude's analysis override when there are explicit preset conflicts
      if (isAutoReference && semanticAnalysis) {
        const referenceRole = semanticAnalysis.reference_role;
        const userIntent = semanticAnalysis.user_intent;

        // 🧠 CONFLICT DETECTION: When user selects product preset but auto-references image
        if (hasProductPreset && referenceRole === "product") {
          // User explicitly selected a product type BUT auto-referenced an image
          // Trust Claude's understanding and user's explicit preset selection
          console.log("🤔 SMART AUTO-REFERENCE CONFLICT DETECTED:");
          console.log(
            `  - User selected: ${presetProductType} (explicit product choice)`,
          );
          console.log(`  - Claude suggests: reference as "${referenceRole}"`);
          console.log(`  - User intent: ${userIntent}`);

          // 🧠 CRITICAL FIX: Respect Claude's detailed input_roles analysis instead of overriding
          const inputRoles = semanticAnalysis.input_roles || {};
          const designSources = inputRoles.design_sources;
          const colorSources = inputRoles.color_sources;

          if (designSources === 'upload' && designImageUrl) {
            // Claude says use uploaded image for design - RESPECT THIS!
            console.log("🎯 RESPECTING CLAUDE'S ANALYSIS: Using uploaded image for DESIGN (Claude's detailed analysis)");
            // Don't set useReferenceAsDesign - let uploaded image be used for design
          } else if (designSources === 'reference') {
            // Claude says use reference for design
            overrideInputs.useReferenceAsDesign = true;
            overrideInputs.skipDesignPreset = true;
            console.log("🎯 CLAUDE'S SMART RESOLUTION: Using reference as DESIGN (Claude's detailed analysis)");
          }

          if (colorSources === 'reference') {
            overrideInputs.useReferenceAsColor = true;
            overrideInputs.skipColorPreset = true;
            console.log("🎯 CLAUDE'S SMART RESOLUTION: Using reference as COLOR (Claude's detailed analysis)");
          }
          
          // Always use preset for product when there's a conflict
          console.log("🎯 USING PRESET PRODUCT: Preserving user's explicit product choice");
        }
        // 🔧 CRITICAL FIX: Only set overrides for auto-reference when there's no separate uploaded product
        // If we have both productImageUrl (uploaded) AND designImageUrl (reference), 
        // don't override - let each be processed in their respective slots
        else if (!designImageUrl) {
          // 🧠 ENHANCED: Check input_roles for dual-purpose scenarios
          const inputRoles = semanticAnalysis.input_roles || {};
          const useRefForDesign = inputRoles.design_sources === 'reference';
          const useRefForColor = inputRoles.color_sources === 'reference';
          
          // Handle dual-purpose reference (both design + color from same image)
          if (useRefForDesign && useRefForColor) {
            overrideInputs.useReferenceAsDesign = true;
            overrideInputs.useReferenceAsColor = true;
            overrideInputs.skipDesignPreset = true;
            overrideInputs.skipColorPreset = true;
            console.log(
              "🎯 CLAUDE'S DUAL-PURPOSE AUTO-REFERENCE: Using reference as DESIGN + COLOR (Claude's intelligent choice)",
            );
          }
          // Handle single-purpose reference based on primary role
          else if (referenceRole === "design" || useRefForDesign) {
            overrideInputs.useReferenceAsDesign = true;
            overrideInputs.skipDesignPreset = true; // Don't use design preset, use reference as design
            console.log(
              "🎯 CLAUDE'S AUTO-REFERENCE: Using reference as DESIGN (Claude's intelligent choice)",
            );
          } else if (referenceRole === "color" || useRefForColor) {
            overrideInputs.useReferenceAsColor = true;
            overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
            console.log(
              "🎯 CLAUDE'S AUTO-REFERENCE: Using reference as COLOR (Claude's intelligent choice)",
            );
          } else {
            overrideInputs.useReferenceAsProduct = true;
            console.log(
              "🎯 CLAUDE'S AUTO-REFERENCE: Using reference as PRODUCT (Claude's intelligent choice)",
            );
          }
        } else {
          // 🎯 COMPLEX SCENARIO: We have both uploaded product AND separate reference
          // In this case, productImageUrl should ALWAYS be analyzed as product
          // The reference is already handled separately via designImageUrl
          console.log(
            "🎯 CLAUDE'S COMPLEX SCENARIO: Uploaded product + separate reference detected - analyzing both independently"
          );
          console.log(
            `  - Product image (will be analyzed): ${productImageUrl.slice(0, 50)}...`
          );
          console.log(
            `  - Reference image (handled separately): ${designImageUrl.slice(0, 50)}...`
          );
          // Don't set any overrides - let both images be processed in their respective roles
        }
      }
      // 🔧 FALLBACK AUTO-REFERENCE: When no Claude analysis available
      else if (isAutoReference) {
        overrideInputs.useReferenceAsProduct = true;
        console.log(
          "🔄 FALLBACK AUTO-REFERENCE: Using reference as PRODUCT (no Claude analysis available)",
        );
      }
      // 🧠 CLAUDE'S SEMANTIC ANALYSIS: Use Claude's intelligent interpretation for manual references
      else if (semanticAnalysis && isManualReference) {
        const referenceRole = semanticAnalysis.reference_role;
        const userIntent = semanticAnalysis.user_intent;

        console.log(
          `🧠 CLAUDE'S SEMANTIC ANALYSIS: intent="${userIntent}", reference_role="${referenceRole}"`,
        );

        // 🔧 ENHANCED LOGIC: Respect explicit preset selections while using Claude's semantic understanding
        if (hasProductPreset && referenceRole === "design") {
          // User has product preset + Claude says reference is design → Perfect match!
          overrideInputs.useReferenceAsDesign = true;
          overrideInputs.skipDesignPreset = true; // Don't use design preset, use reference as design
          console.log(
            "🎯 CLAUDE + PRESET HARMONY: Product preset + Reference as DESIGN (Claude's intelligent choice)",
          );
        } else if (hasProductPreset && referenceRole === "color") {
          // User has product preset + Claude says reference is color → Perfect match!
          overrideInputs.useReferenceAsColor = true;
          overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
          console.log(
            "🎯 CLAUDE + PRESET HARMONY: Product preset + Reference as COLOR (Claude's intelligent choice)",
          );
        } else if (referenceRole === "product") {
          // Claude says reference should be the product
          overrideInputs.useReferenceAsProduct = true;
          console.log(
            "🎯 CLAUDE'S CHOICE: Using reference as PRODUCT (Claude's semantic understanding)",
          );
        }
        // 🔧 FALLBACK: When Claude's analysis doesn't align perfectly, use explicit preset logic
        else {
          console.log(
            "🤔 Claude's analysis unclear, falling back to explicit preset logic...",
          );
          // Apply explicit rules as fallback
          if (hasProductPreset && !hasDesignPreset && !hasColorPreset) {
            overrideInputs.useReferenceAsDesign = true;
            overrideInputs.useReferenceAsColor = true;
            overrideInputs.skipDesignPreset = true; // Don't use design preset, use reference as design
            overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
            console.log(
              "🎯 FALLBACK RULE 1: Product preset only → Reference as DESIGN + COLOR",
            );
          } else if (hasProductPreset && hasDesignPreset && !hasColorPreset) {
            overrideInputs.useReferenceAsColor = true;
            overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
            console.log(
              "🎯 FALLBACK RULE 2: Product + Design presets → Reference as COLOR",
            );
          } else if (hasProductPreset && !hasDesignPreset && hasColorPreset) {
            overrideInputs.useReferenceAsDesign = true;
            // Keep color preset, only skip design preset
            console.log(
              "🎯 FALLBACK RULE 3: Product + Color presets → Reference as DESIGN",
            );
          } else if (hasProductPreset && hasDesignPreset && hasColorPreset) {
            overrideInputs.useReferenceAsProduct = true;
            console.log(
              "🎯 FALLBACK RULE 4: All presets → Reference as PRODUCT (override preset)",
            );
          } else {
            overrideInputs.useReferenceAsProduct = true;
            console.log("🎯 FALLBACK: Default → Reference as PRODUCT");
          }
        }
      }
      // 🔧 EXPLICIT PRESET LOGIC: When no Claude analysis available (legacy support)
      else {
        console.log(
          "🔧 No Claude semantic analysis available, using explicit preset logic...",
        );

        if (hasProductPreset && !hasDesignPreset && !hasColorPreset) {
          overrideInputs.useReferenceAsDesign = true;
          overrideInputs.useReferenceAsColor = true;
          overrideInputs.skipDesignPreset = true; // Don't use design preset, use reference as design
          overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
          console.log(
            "🎯 EXPLICIT RULE 1: Product preset only → Reference as DESIGN + COLOR",
          );
        } else if (hasProductPreset && hasDesignPreset && !hasColorPreset) {
          overrideInputs.useReferenceAsColor = true;
          overrideInputs.skipColorPreset = true; // Don't use color preset, use reference as color
          console.log(
            "🎯 EXPLICIT RULE 2: Product + Design presets → Reference as COLOR",
          );
        } else if (hasProductPreset && !hasDesignPreset && hasColorPreset) {
          overrideInputs.useReferenceAsDesign = true;
          // Keep color preset, only skip design preset
          console.log(
            "🎯 EXPLICIT RULE 3: Product + Color presets → Reference as DESIGN",
          );
        } else if (hasProductPreset && hasDesignPreset && hasColorPreset) {
          overrideInputs.useReferenceAsProduct = true;
          console.log(
            "🎯 EXPLICIT RULE 4: All presets → Reference as PRODUCT (override preset)",
          );
        } else {
          overrideInputs.useReferenceAsProduct = true;
          console.log("🎯 EXPLICIT DEFAULT: Reference as PRODUCT");
        }
      }
    }

    // 5) Validate that this inferred workflow is valid
    // For modification workflows, separate actual inputs from inherited presets
    const hasActualColor = !!colorImage || !!colorImageUrl; // Only actual color inputs, not presets
    const hasActualDesign = !!designImage || !!designImageUrl; // Only actual design inputs, not presets
    const hasActualProduct = !!productImage || !!productImageUrl; // Only actual product inputs, not presets

    // Use different validation logic for modification workflows vs fresh creation
    const isModificationWorkflow = [
      "product_design",
      "product_color",
      "full_composition",
    ].includes(workflow_type);

    const validation = isModificationWorkflow
      ? validateWorkflowInputs(
          workflow_type,
          hasActualProduct || !!presetProductType, // Product: actual input OR preset OK
          hasActualDesign, // Design: only actual input for validation
          hasActualColor || !!presetColorPalette, // Color: actual input OR preset OK
          !!prompt,
        )
      : validateWorkflowInputs(
          workflow_type,
          hasProduct, // Use original logic for non-modification workflows
          hasDesign,
          hasColor,
          !!prompt,
        );
    if (!validation.valid) {
      return NextResponse.json(
        { status: "error", error: validation.error },
        { status: 400 },
      );
    }

    // 6) Process input images (files or URLs) and run analyses
    const inputUrls: {
      product?: string;
      design?: string;
      color?: string;
      color2?: string;
    } = {};
    const analyses: { product?: string; design?: string; color?: string } = {};

    try {
      // Handle product image (file, URL, or preset)
      if (productImage && firebaseInitialized) {
        console.log("Processing product image file...");
        const productBuffer = await fileToJpegBuffer(productImage);
        const productPath = `${userid}/input/${uuidv4()}.jpg`;
        const productUrl = await uploadBufferToFirebase(
          productBuffer,
          productPath,
        );
        inputUrls.product = productUrl;
        analyses.product = await analyzeImageWithGPT4Vision(
          productUrl,
          "product",
        );
        console.log("Product image file processed successfully");
      } else if (
        productImageUrl &&
        !overrideInputs.useReferenceAsDesign &&
        !overrideInputs.useReferenceAsColor
      ) {
        // Only use productImageUrl as product if it's not being used as design/color source
        console.log("Using product image URL:", productImageUrl);
        inputUrls.product = productImageUrl;
        console.log("🔍 Starting product image analysis...");
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product",
        );
        console.log(
          "🔍 Product analysis result length:",
          analyses.product?.length || 0,
        );
        if (!analyses.product || analyses.product.length === 0) {
          console.log("⚠️ Product analysis returned empty result!");
        }
        console.log("Product image URL processed successfully");
      } else if (presetProductType) {
        // 🎯 SEMANTIC OVERRIDE: When reference is used as design/color, use preset for product
        if (
          overrideInputs.useReferenceAsDesign ||
          overrideInputs.useReferenceAsColor
        ) {
          console.log(
            "🧠 SEMANTIC OVERRIDE: Using preset product type as base (reference used for design/color)",
          );
        }
        console.log("Using preset product type:", presetProductType);

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
          `Extracted product name: "${productName}" from "${presetProductType}"`,
        );

        // 🎯 CORRECT FIX: Don't set product image URL for presets - rely on text analysis only
        // This allows the AI to generate the product from text description while using reference for design
        console.log(
          `🎯 Using text-only product specification (no image URL) for: ${productName}`,
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
      }

      // Handle design image (file, URL, or preset) with semantic override
      // 🧠 CRITICAL FIX: Prioritize uploaded design images over reference overrides
      if (designImage && firebaseInitialized) {
        console.log("Processing uploaded design image file...");
        const designBuffer = await fileToJpegBuffer(designImage);
        const designPath = `${userid}/input/${uuidv4()}.jpg`;
        const designUrl = await uploadBufferToFirebase(designBuffer, designPath);
        inputUrls.design = designUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designUrl,
          "design reference",
        );
        console.log("✅ Uploaded design image file processed successfully");
      } else if (designImageUrl && !overrideInputs.useReferenceAsDesign) {
        // Use uploaded design image URL (only if not overridden by reference)
        console.log("Using uploaded design image URL:", designImageUrl);
        inputUrls.design = designImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference",
        );
        console.log("✅ Uploaded design image URL processed successfully");
      } else if (overrideInputs.useReferenceAsDesign && productImageUrl) {
        // 🎯 CLAUDE'S SEMANTIC OVERRIDE: Use reference image as design source
        console.log(
          "🧠 SEMANTIC OVERRIDE: Using reference image (from productImageUrl) as DESIGN source instead of uploads/presets",
        );
        inputUrls.design = productImageUrl;
        console.log("🔍 Starting reference-as-design analysis...");
        analyses.design = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "design reference",
        );
        console.log("✅ Reference image processed as DESIGN source");
      } else if (overrideInputs.useReferenceAsDesign && designImageUrl) {
        // 🎯 CLAUDE'S SEMANTIC OVERRIDE: Use reference image as design source
        console.log(
          "🧠 SEMANTIC OVERRIDE: Using reference image as DESIGN source instead of presets",
        );
        inputUrls.design = designImageUrl;
        console.log("🔍 Starting reference-as-design analysis...");
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference",
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
          designsData.defaultImages,
        )) {
          if (Array.isArray(imagePaths)) {
            // Find matching image path for this preset
            const matchingPath = imagePaths.find((path) =>
              path.includes(`/${presetDesignStyle}.webp`),
            );
            if (matchingPath) {
              presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imai.studio")}${matchingPath}`;
              console.log(
                `✅ Found preset ${presetDesignStyle} in category: ${matchingPath}`,
              );
              break;
            }
          }
        }

        // Fallback to old logic if not found in designs.json
        if (!presetImageUrl) {
          console.log(
            `⚠️ Preset ${presetDesignStyle} not found in designs.json, using fallback logic`,
          );
          const baseStyle = presetDesignStyle.replace(/\d+$/, "");
          const presetImagePath = `/inputs/designs/general/${baseStyle}/${presetDesignStyle}.webp`;
          presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://imai.studio")}${presetImagePath}`;
        }

        inputUrls.design = presetImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          presetImageUrl,
          "design reference",
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

      if ((designImage || (designImageUrl && !overrideInputs.useReferenceAsDesign)) && !hasAnyColorInput) {
        console.log("🧠 DESIGN IMAGE COLOR EXTRACTION: Extracting COLOR palette from uploaded design image (since no color input provided)");
        const designColorUrl = designImageUrl || inputUrls.design;
        if (designColorUrl) {
          if (!inputUrls.color) {
            inputUrls.color = designColorUrl;
          }
          const designColorAnalysis = await analyzeImageWithGPT4Vision(
            designColorUrl,
            "color reference",
          );
          colorAnalysisParts.push(designColorAnalysis);
          console.log(
            "✅ Design image processed as COLOR source (in addition to design patterns)",
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
          },
        );
        console.log(
          "🎯 Will process the provided color source in the main color processing section below...",
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
      
      // 🧠 SEMANTIC OVERRIDES: Handle reference image color extraction based on Claude's analysis
      // CRITICAL: Reference can serve DUAL PURPOSE (both design + color from same image)
      if (overrideInputs.useReferenceAsColor && productImageUrl) {
        // When Claude explicitly says reference should be color source
        console.log("🧠 SEMANTIC OVERRIDE 2: Using reference image (from productImageUrl) as COLOR source");
        inputUrls.color = productImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "color reference",
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference image processed as COLOR source");
      } else if (overrideInputs.useReferenceAsColor && colorImageUrl) {
        // When Claude explicitly says reference should be color source
        console.log("🧠 SEMANTIC OVERRIDE 2: Using reference image as COLOR source instead of presets");
        inputUrls.color = colorImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference",
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference image processed as COLOR source");
      }
      // Handle standard color inputs (colorImageUrl from references, color files)
      else if (colorImageUrl) {
        console.log(
          "🎯 MAIN COLOR PROCESSING: Using color image URL (likely from reference):",
          colorImageUrl.substring(0, 80) + "...",
        );
        inputUrls.color = colorImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference",
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference color image processed successfully");
      } else if (colorImage && firebaseInitialized) {
        console.log("🎯 MAIN COLOR PROCESSING: Processing color image file...");
        const colorBuffer = await fileToJpegBuffer(colorImage);
        const colorPath = `${userid}/input/${uuidv4()}.jpg`;
        const colorUrl = await uploadBufferToFirebase(colorBuffer, colorPath);
        inputUrls.color = colorUrl;
        const uploadedColorAnalysis = await analyzeImageWithGPT4Vision(
          colorUrl,
          "color reference",
        );
        colorAnalysisParts.push(uploadedColorAnalysis);
        console.log("Color image file processed successfully");
      } 
      // 🧠 CRITICAL FIX: DUAL-PURPOSE REFERENCE (design + color from same image)
      // When Claude says reference should be used for BOTH design AND color extraction
      else if (overrideInputs.useReferenceAsDesign && productImageUrl && 
               semanticAnalysis?.input_roles?.design_sources === 'reference' && 
               semanticAnalysis?.input_roles?.color_sources === 'reference') {
        console.log("🧠 DUAL-PURPOSE REFERENCE: Analyzing same reference for COLOR extraction (already processed for design)");
        inputUrls.color = productImageUrl;
        const referenceColorAnalysis = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "color reference",
        );
        colorAnalysisParts.push(referenceColorAnalysis);
        console.log("✅ Reference image processed as COLOR source (dual-purpose analysis complete)");
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
            `🎨 Analyzing color preset ${i + 1}/${colorPalettes.length}: ${palette}`,
          );
          console.log(`🎨 Using color preset URL: ${presetColorImageUrl}`);

          // Set color URLs for generation - support multiple presets
          if (i === 0 && !inputUrls.color) {
            inputUrls.color = presetColorImageUrl;
            console.log(`🎨 Set primary color URL: ${presetColorImageUrl}`);
          } else if (i === 1 && !inputUrls.color2) {
            inputUrls.color2 = presetColorImageUrl;
            console.log(`🎨 Set secondary color URL: ${presetColorImageUrl}`);
          }

          // Analyze each color preset as an actual image
          try {
            console.log(
              `🔄 Localhost URL detected, converting to base64 for analysis: ${presetColorImageUrl}`,
            );
            const presetColorAnalysis = await analyzeImageWithGPT4Vision(
              presetColorImageUrl,
              "color reference",
            );
            allColorAnalyses.push(presetColorAnalysis);
            console.log(`✅ Color preset ${palette} analyzed successfully`);
          } catch (error) {
            console.log(`⚠️ Error analyzing color preset ${palette}:`, error);
            // Fallback to text description if image analysis fails
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
`,
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
          "palette(s) analyzed and blended",
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
        { status: 500 },
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
          `  • Product sources: ${semanticAnalysis.input_roles.product_sources}`,
        );
        console.log(
          `  • Design sources: ${semanticAnalysis.input_roles.design_sources}`,
        );
        console.log(
          `  • Color sources: ${semanticAnalysis.input_roles.color_sources}`,
        );
      }
      console.log("\n🎯 === FINAL INPUT MAPPING AFTER SEMANTIC ANALYSIS ===");
      console.log(
        `📦 Product: ${inputUrls.product || analyses.product ? "SET" : "NOT SET"} ${inputUrls.product ? "(from " + (overrideInputs.useReferenceAsDesign || overrideInputs.useReferenceAsColor ? "preset" : "reference/upload") + ")" : analyses.product ? "(from preset specification)" : ""}`,
      );
      console.log(
        `🎨 Design: ${inputUrls.design || analyses.design ? "SET" : "NOT SET"} ${inputUrls.design ? "(from " + (overrideInputs.useReferenceAsDesign ? "reference image" : "preset/upload") + ")" : analyses.design ? "(from preset specification)" : ""}`,
      );
      console.log(
        `🌈 Color: ${inputUrls.color || analyses.color ? "SET" : "NOT SET"} ${inputUrls.color ? "(from " + (overrideInputs.useReferenceAsColor || (overrideInputs.useReferenceAsDesign && !presetColorPalette) ? "reference image" : "preset/upload") + ")" : analyses.color ? "(from preset specification)" : ""}`,
      );
      console.log("🧠 === END SEMANTIC ANALYSIS === ��\n");
    }

    // 7) Build the enhanced prompt
    const workflowPrompt = generateWorkflowPrompt(
      workflow_type,
      prompt || undefined,
      analyses.product,
      analyses.design,
      analyses.color,
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
      `🔍 Product Analysis Length: ${analyses.product?.length || 0} chars → Essential: ${debugEssentialProductAnalysis?.length || 0} chars`,
    );
    if (debugEssentialProductAnalysis) {
      console.log(
        `🔍 Essential Product Analysis: ${debugEssentialProductAnalysis.substring(0, 200)}...`,
      );
    }
    console.log(
      `🔍 Design Analysis Length: ${analyses.design?.length || 0} chars → Essential: ${debugEssentialDesignAnalysis?.length || 0} chars`,
    );
    if (debugEssentialDesignAnalysis) {
      console.log(
        `🔍 Essential Design Analysis: ${debugEssentialDesignAnalysis.substring(0, 200)}...`,
      );
    }
    console.log(
      `🔍 Color Analysis Length: ${analyses.color?.length || 0} chars → Essential: ${debugEssentialColorAnalysis?.length || 0} chars`,
    );
    if (debugEssentialColorAnalysis) {
      console.log(
        `🔍 Essential Color Analysis: ${debugEssentialColorAnalysis.substring(0, 200)}...`,
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
      inputUrls,
    );

    console.log("🎯 DESIGN ROUTE: OpenAI generation completed");
    console.log("  - Result status:", generationResult ? "success" : "failed");
    console.log(
      "  - Result keys:",
      generationResult ? Object.keys(generationResult) : "none",
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
            `Failed to fetch GPT Image URL: ${response.statusText}`,
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
        outputPath,
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
    const responsePayload: ComposeProductResponse = {
      status: "success",
      firebaseInputUrls: inputUrls,
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
