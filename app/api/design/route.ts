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
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
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
      if (!hasProduct || !hasDesign || hasColor) {
        return {
          valid: false,
          error:
            "product_design requires product and design images (no color image)",
        };
      }
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
      if (!hasColor || !hasPrompt || hasProduct || hasDesign) {
        return {
          valid: false,
          error: "color_prompt requires only color image and prompt",
        };
      }
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
  // Common suffix to enforce product position and no text
  const commonSuffix = `
No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

  switch (workflowType) {
    case "full_composition": {
      const basePrompt = `Create a photorealistic version of the original product, drawing design inspiration only (not colors) from the design reference and applying colors solely from the color reference. Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette. Use the design reference to inspire creative visual elements, patterns, or stylistic approaches, but do NOT directly copy or imprint the design. Use the color reference only for the color palette and scheme.

BASE PRODUCT ANALYSIS: ${productAnalysis ?? "N/A"}
DESIGN INSPIRATION ANALYSIS: ${designAnalysis ?? "N/A"}
COLOR PALETTE ANALYSIS: ${colorAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}`
        : `${basePrompt}${commonSuffix}`;
    }

    case "product_color": {
      const basePrompt = `Apply only the color palette and color scheme from the color reference image to the product while maintaining its original design, structure, and details. Extract colors only — do NOT copy any design patterns, textures, or visual elements. Keep all product features intact and transform only the colors to match the reference palette. Photorealistic.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis ?? "N/A"}
COLOR PALETTE ANALYSIS: ${colorAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}`
        : `${basePrompt}${commonSuffix}`;
    }

    case "product_design": {
      const basePrompt = `Create a new version of the product drawing creative inspiration from the design reference. Use the design reference for visual style, creative direction, or artistic approach — but do NOT directly copy or imprint the design onto the product. Maintain the product's original form, structure, proportions, and geometry. Photorealistic.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis ?? "N/A"}
DESIGN INSPIRATION ANALYSIS: ${designAnalysis ?? "N/A"}`;

      return userPrompt
        ? `${basePrompt}

USER PROMPT: ${userPrompt}${commonSuffix}`
        : `${basePrompt}${commonSuffix}`;
    }

    case "color_design": {
      if (colorAnalysis && designAnalysis) {
        return `Create a new product design that thoughtfully incorporates color inspiration from the color reference and design inspiration from the design reference. Use the color reference strictly for the color palette and scheme, and the design reference strictly for creative inspiration and stylistic direction. Maintain the product's original shape, structure, and proportions. Photorealistic.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
COLOR PALETTE ANALYSIS: ${colorAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      } else if (colorAnalysis) {
        return `Create a product using this color palette for inspiration while preserving the original product's features.

COLOR PALETTE ANALYSIS: ${colorAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      } else {
        return `Create a product drawing inspiration from this design reference while strictly maintaining the original product's form and details.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
      }
    }

    case "color_prompt": {
      return `Create a new product design using this color palette as inspiration and following the user's description. Preserve the product's original shape and details.

COLOR PALETTE ANALYSIS: ${colorAnalysis ?? "N/A"}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "design_prompt": {
      return `Create a new product design drawing creative inspiration from this design reference and following the user's description. Use the design reference for inspiration and creative direction only — do NOT copy directly. Maintain the original product's form and structure.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis ?? "N/A"}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "prompt_only": {
      return `Create a new innovative photorealistic product design based on the provided description. Maintain product integrity in form and structure.

USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
    }

    case "product_prompt": {
      return `Create a new version or variation of the provided product based on the custom description. Maintain the core product identity, including shape, structure, and proportions, while incorporating the requested changes. Generate a photorealistic design.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis ?? "N/A"}
USER PROMPT: ${userPrompt ?? "N/A"}${commonSuffix}`;
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
    // Fetch the image to check its size
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

    if (sizeMB <= 20) {
      return imageUrl; // Image is fine as-is
    }

    console.log(`Image too large (${sizeMB.toFixed(2)}MB), resizing...`);

    // Use sharp to resize the image if available, otherwise return original
    try {
      // Resize to max 2048x2048 while maintaining aspect ratio
      const resizedBuffer = await sharp(buffer)
        .resize(2048, 2048, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Convert to base64 data URL
      const base64 = resizedBuffer.toString("base64");
      const resizedUrl = `data:image/jpeg;base64,${base64}`;

      console.log(
        `Image resized from ${sizeMB.toFixed(2)}MB to ${(resizedBuffer.length / (1024 * 1024)).toFixed(2)}MB`,
      );
      return resizedUrl;
    } catch (sharpError) {
      console.warn(
        "Sharp not available or failed, using original image:",
        sharpError,
      );
      return imageUrl;
    }
  } catch (error) {
    console.error("Error checking/resizing image:", error);
    return imageUrl; // Return original URL on error
  }
}

/**
 * Sends an image URL to GPT-4 Vision to get a textual analysis.
 */
async function analyzeImageWithGPT4Vision(
  imageUrl: string,
  analysisType: string,
): Promise<string> {
  try {
    // Resize image if needed before sending to OpenAI
    const processedImageUrl = await resizeImageIfNeeded(imageUrl);

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${analysisType} image in detail for AI image generation. Describe the visual elements, colors, patterns, textures, materials, style, and any distinctive features that would be useful for recreating or referencing these qualities in a new design. Be specific and technical.`,
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

    // Create a File-like object for OpenAI
    const file = new File([buffer], filename, { type: "image/jpeg" });

    const uploadResponse = await openai.files.create({
      file: file,
      purpose: "vision",
    });

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

    let gptImageQuality = options.quality;
    if (gptImageQuality === "standard") gptImageQuality = "medium";
    if (!["low", "medium", "high", "auto"].includes(gptImageQuality)) {
      gptImageQuality = "medium";
    }

    const imageParams: any = {
      model: "gpt-image-1",
      prompt: prompt,
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
  // Product-based workflows (when we have a product image)
  if (hasProduct) {
    // 1) All three images → full_composition (prompt optional)
    if (hasDesign && hasColor) {
      return "full_composition";
    }

    // 2) Product + Design only → product_design (prompt optional)
    if (hasDesign && !hasColor) {
      return "product_design";
    }

    // 3) Product + Color only → product_color (prompt optional)
    if (!hasDesign && hasColor) {
      return "product_color";
    }

    // 4) Product + Prompt only → product_prompt
    if (!hasDesign && !hasColor && hasPrompt) {
      return "product_prompt";
    }

    // 5) Product only (no other inputs) → not supported
    if (!hasDesign && !hasColor && !hasPrompt) {
      throw new Error(
        "Product image alone is not sufficient. Please provide either: design image, color image, or a text prompt along with the product image.",
      );
    }
  }

  // Non-product workflows (when we don't have a product image)
  if (!hasProduct) {
    // 6) Design + Color + prompt → color_design
    if (hasDesign && hasColor && hasPrompt) {
      return "color_design";
    }

    // 7) Design + prompt (no color) → design_prompt
    if (hasDesign && !hasColor && hasPrompt) {
      return "design_prompt";
    }

    // 8) Color + prompt (no design) → color_prompt
    if (!hasDesign && hasColor && hasPrompt) {
      return "color_prompt";
    }

    // 9) Prompt only → prompt_only
    if (!hasDesign && !hasColor && hasPrompt) {
      return "prompt_only";
    }

    // 10) No valid combination
    if (hasDesign || hasColor) {
      throw new Error(
        "Design or color images require a text prompt when no product image is provided.",
      );
    }
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
  try {
    const formData = await request.formData();

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

    // 3) Infer workflow_type based on which inputs are present
    let workflow_type: string;
    const hasProduct =
      !!productImage || !!productImageUrl || !!presetProductType;
    const hasDesign = !!designImage || !!designImageUrl || !!presetDesignStyle;
    const hasColor = !!colorImage || !!colorImageUrl || !!presetColorPalette;

    try {
      workflow_type = determineWorkflowType(
        hasProduct,
        hasDesign,
        hasColor,
        !!prompt,
      );
    } catch (e: any) {
      return NextResponse.json(
        { status: "error", error: e.message },
        { status: 400 },
      );
    }

    // 4) Retrieve enhanced generation parameters
    // Support aspect ratios: square, portrait, landscape
    const sizeParam = (formData.get("size") as string) || "1024x1024";
    const aspectRatio = (formData.get("aspect_ratio") as string) || "";

    // Map aspect ratio to size if specified (using OpenAI supported sizes)
    let size = sizeParam;
    if (aspectRatio) {
      switch (aspectRatio.toLowerCase()) {
        case "portrait":
          size = "1024x1536"; // OpenAI supported portrait
          break;
        case "landscape":
          size = "1536x1024"; // OpenAI supported landscape
          break;
        case "square":
        default:
          size = "1024x1024"; // 1:1 aspect ratio
          break;
      }
    }

    console.log(
      `🎯 Using size: ${size} (aspect_ratio: ${aspectRatio || "square"})`,
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

    // 5) Validate that this inferred workflow is valid
    const validation = validateWorkflowInputs(
      workflow_type,
      hasProduct,
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
      } else if (productImageUrl) {
        console.log("Using product image URL:", productImageUrl);
        inputUrls.product = productImageUrl;
        analyses.product = await analyzeImageWithGPT4Vision(
          productImageUrl,
          "product",
        );
        console.log("Product image URL processed successfully");
      } else if (presetProductType) {
        console.log("Using preset product type:", presetProductType);
        analyses.product = `A ${presetProductType} product ready for design application. This is a ${presetProductType} that will serve as the base for the design composition.`;
        console.log("Preset product type processed successfully");
      }

      // Handle design image (file, URL, or preset)
      if (designImage && firebaseInitialized) {
        console.log("Processing design image file...");
        const designBuffer = await fileToJpegBuffer(designImage);
        const designPath = `${userid}/input/${uuidv4()}.jpg`;
        const designUrl = await uploadBufferToFirebase(
          designBuffer,
          designPath,
        );
        inputUrls.design = designUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designUrl,
          "design reference",
        );
        console.log("Design image file processed successfully");
      } else if (designImageUrl) {
        console.log("Using design image URL:", designImageUrl);
        inputUrls.design = designImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          designImageUrl,
          "design reference",
        );
        console.log("Design image URL processed successfully");
      } else if (presetDesignStyle) {
        console.log("Using preset design style:", presetDesignStyle);
        // Convert preset name to actual image URL using proper category detection

        // Import designs data for category lookup
        const designsData = await import(
          "../../../constants/data/designs.json"
        );

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
              presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}${matchingPath}`;
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
          presetImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}${presetImagePath}`;
        }

        inputUrls.design = presetImageUrl;
        analyses.design = await analyzeImageWithGPT4Vision(
          presetImageUrl,
          "design reference",
        );
        console.log("Preset design style processed successfully");
      }

      // Handle color image (file, URL, and/or preset) - support multiple color inputs
      let colorAnalysisParts = [];

      // First, handle uploaded color image/URL
      if (colorImage && firebaseInitialized) {
        console.log("Processing color image file...");
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
      } else if (colorImageUrl) {
        console.log("Using color image URL:", colorImageUrl);
        inputUrls.color = colorImageUrl;
        const uploadedColorAnalysis = await analyzeImageWithGPT4Vision(
          colorImageUrl,
          "color reference",
        );
        colorAnalysisParts.push(uploadedColorAnalysis);
        console.log("Color image URL processed successfully");
      }

      // Then, handle preset color palette (can be in addition to uploaded)
      if (presetColorPalette) {
        console.log("Using preset color palette:", presetColorPalette);
        // Handle multiple color palettes (comma-separated)
        const colorPalettes = presetColorPalette.includes(",")
          ? presetColorPalette.split(",").map((p) => p.trim())
          : [presetColorPalette];

        // Convert color preset names to text descriptions instead of images
        const colorDescriptions = colorPalettes.map((palette) => {
          // Create descriptive text for the color palette
          const formattedName = palette
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .toLowerCase();
          return `${formattedName} color palette with its characteristic tones and harmonies`;
        });

        // Add color preset as text analysis
        const presetColorAnalysis = `Apply ${colorDescriptions.join(" combined with ")} to create a cohesive color scheme in the design.`;
        colorAnalysisParts.push(presetColorAnalysis);

        // Add additional palette instructions if multiple palettes
        if (colorPalettes.length > 1) {
          const additionalInstruction = `Blend and harmonize ${colorPalettes.join(", ")} color characteristics to create a unified and balanced color composition.`;
          colorAnalysisParts.push(additionalInstruction);
        }

        console.log(
          "Preset color palette processed successfully as text description",
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

    // 7) Build the enhanced prompt
    const workflowPrompt = generateWorkflowPrompt(
      workflow_type,
      prompt || undefined,
      analyses.product,
      analyses.design,
      analyses.color,
    );

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

    const generationResult = await composeProductWithGPTImage(
      workflowPrompt,
      generationOptions,
      inputUrls,
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
