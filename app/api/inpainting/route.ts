import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

// Configure OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface InpaintingOptions {
  size?: "256x256" | "512x512" | "1024x1024";
  response_format?: "url" | "b64_json";
}

interface InpaintingResponse {
  status: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(
  buffer: Buffer,
  mimeType: string = "image/png",
): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Download image from URL and convert to buffer
 */
async function downloadImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Create a mask with alpha channel from base64 data
 */
async function processMask(
  maskDataUrl: string,
  targetWidth?: number,
  targetHeight?: number,
): Promise<Buffer> {
  // Extract base64 data from data URL
  const base64Data = maskDataUrl.split(",")[1];
  const maskBuffer = Buffer.from(base64Data, "base64");

  // If target dimensions are provided, resize the mask to match
  if (targetWidth && targetHeight) {
    const sharp = (await import("sharp")).default;
    const resizedMaskBuffer = await sharp(maskBuffer)
      .resize(targetWidth, targetHeight, {
        fit: "contain", // Maintain aspect ratio with padding to match image processing
        background: { r: 0, g: 0, b: 0, alpha: 1 }, // Black background for padding (unchanged areas)
      })
      .png()
      .toBuffer();

    console.log(
      `🎭 Resized mask to ${targetWidth}x${targetHeight} (aspect ratio preserved)`,
    );
    return resizedMaskBuffer;
  }

  // Return the buffer as-is if no target dimensions
  return maskBuffer;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // Extract required parameters
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    if (!imageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: 'Missing "image_url" parameter',
        },
        { status: 400 },
      );
    }

    const maskDataUrl = (formData.get("mask") as string | null)?.trim();
    if (!maskDataUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: 'Missing "mask" parameter',
        },
        { status: 400 },
      );
    }

    const prompt = (formData.get("prompt") as string | null)?.trim();
    if (!prompt) {
      return NextResponse.json(
        {
          status: "error",
          error: 'Missing "prompt" parameter',
        },
        { status: 400 },
      );
    }

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY not found in environment variables");
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    console.log("🎨 Starting inpainting with OpenAI GPT Image...");
    console.log("Image URL:", imageUrl);
    console.log("Prompt:", prompt);

    // Extract optional parameters
    const options: InpaintingOptions = {
      size:
        (formData.get("size") as "256x256" | "512x512" | "1024x1024") ||
        "1024x1024",
      response_format: "b64_json", // Always return base64 for consistency
    };

    // Download the original image
    console.log("📥 Downloading original image...");
    const imageBuffer = await downloadImage(imageUrl);

    // Get image dimensions to determine best size
    const sharp = (await import("sharp")).default;
    const imageMetadata = await sharp(imageBuffer).metadata();
    const { width = 1024, height = 1024 } = imageMetadata;

    // Determine the best OpenAI size based on aspect ratio
    const aspectRatio = width / height;
    let targetSize: "256x256" | "512x512" | "1024x1024";

    // Choose size that maintains quality while fitting OpenAI constraints
    const maxDimension = Math.max(width, height);
    if (maxDimension <= 256) {
      targetSize = "256x256";
    } else if (maxDimension <= 512) {
      targetSize = "512x512";
    } else {
      targetSize = "1024x1024";
    }

    // Override with explicit size if provided
    const requestedSize = formData.get("size") as
      | "256x256"
      | "512x512"
      | "1024x1024";
    if (requestedSize) {
      targetSize = requestedSize;
    }

    console.log(
      `🎯 Original size: ${width}x${height}, aspect ratio: ${aspectRatio.toFixed(2)}, using: ${targetSize}`,
    );

    // Resize original image to match target size while preserving aspect ratio
    const targetDimension = parseInt(targetSize.split("x")[0]);
    const resizedImageBuffer = await sharp(imageBuffer)
      .resize(targetDimension, targetDimension, {
        fit: "contain", // Maintain aspect ratio with padding
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background for padding
      })
      .png()
      .toBuffer();

    console.log(
      `🖼️ Resized image to ${targetDimension}x${targetDimension} (aspect ratio preserved)`,
    );

    // Process the mask - ensure it matches the target size
    console.log("🎭 Processing mask...");
    const maskBuffer = await processMask(
      maskDataUrl,
      targetDimension,
      targetDimension,
    );

    // Debug: Check mask validity
    const maskStats = await sharp(maskBuffer).stats();
    const hasWhitePixels = maskStats.channels.some(
      (channel) => channel.max > 200,
    );
    console.log(
      `🔍 Mask validation: ${hasWhitePixels ? "Valid (has white pixels)" : "INVALID (no white pixels found)"}`,
    );

    // Perform inpainting using OpenAI
    console.log("🚀 Submitting inpainting request to OpenAI...");
    const response = await client.images.edit({
      model: "dall-e-2", // Note: GPT Image might not be available yet, using DALL-E 2
      image: await toFile(resizedImageBuffer, "image.png", {
        type: "image/png",
      }),
      mask: await toFile(maskBuffer, "mask.png", { type: "image/png" }),
      prompt: prompt,
      n: 1,
      size: targetSize,
      response_format: options.response_format,
    });

    console.log("✅ Inpainting completed successfully!");

    // Get the result
    if (!response.data || response.data.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }

    const result = response.data[0];
    let outputImageUrl: string;

    if (result.b64_json) {
      outputImageUrl = `data:image/png;base64,${result.b64_json}`;
    } else if (result.url) {
      // Download and convert to base64
      const processedBuffer = await downloadImage(result.url);
      outputImageUrl = bufferToBase64DataUrl(processedBuffer);
    } else {
      throw new Error("No image data returned from OpenAI");
    }

    console.log("Inpainting completed!");

    const apiResponse: InpaintingResponse = {
      status: "success",
      imageUrl: outputImageUrl, // Base64 data URL
    };

    return NextResponse.json(apiResponse);
  } catch (processingError) {
    console.error("Error processing inpainting request:", processingError);

    const response: InpaintingResponse = {
      status: "error",
      error:
        processingError instanceof Error
          ? processingError.message
          : "Unknown error occurred",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Inpainting API is running",
    note: "This API handles image inpainting with mask-guided editing",
    endpoints: {
      POST: {
        description:
          "Edit an image using a mask to guide the inpainting process",
        parameters: {
          userid: "string (required) - User ID",
          image_url: "string (required) - URL of the image to edit",
          mask: "string (required) - Base64 data URL of the mask image",
          prompt:
            "string (required) - Description of what to paint in the masked area",
          size: "string (optional) - Output size (default: 1024x1024)",
          quality:
            "string (optional) - Output quality: standard/hd (default: standard)",
          style: "string (optional) - Style: vivid/natural (default: natural)",
        },
      },
    },
    features: {
      inpainting: "AI-powered image editing with mask guidance",
      mask_support: "Alpha channel mask support",
      prompt_guided: "Natural language prompt-based editing",
    },
  });
}
