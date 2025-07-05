import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { v4 as uuidv4 } from "uuid";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

fal.config({
  credentials: process.env.FAL_KEY,
});

interface UpscaleOptions {
  upscaling_factor?: 4;
  overlapping_tiles?: boolean;
  checkpoint?: "v1" | "v2";
}

interface UpscaleResponse {
  status: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(
  buffer: Buffer,
  mimeType: string = "image/jpeg",
): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function upscaleImage(
  imageUrl: string,
  options: UpscaleOptions,
): Promise<string> {
  try {
    const {
      upscaling_factor = 4,
      overlapping_tiles = false,
      checkpoint = "v1",
    } = options;

    console.log("Submitting request to FAL AI Aura SR...");
    console.log(
      `Arguments: upscaling_factor=${upscaling_factor}, overlapping_tiles=${overlapping_tiles}, checkpoint=${checkpoint}`,
    );

    // Check if image URL is accessible
    try {
      console.log("🔍 Testing image URL accessibility...");
      const testResponse = await fetch(imageUrl, { method: "HEAD" });
      console.log(
        `📡 Image URL test: ${testResponse.status} ${testResponse.statusText}`,
      );
      console.log(
        `📄 Content-Type: ${testResponse.headers.get("content-type")}`,
      );
      console.log(
        `📏 Content-Length: ${testResponse.headers.get("content-length")}`,
      );
    } catch (urlError) {
      console.error("⚠️ Image URL accessibility test failed:", urlError);
    }

    const result = await fal.subscribe("fal-ai/aura-sr", {
      input: {
        image_url: imageUrl,
        upscaling_factor: upscaling_factor as any,
        overlapping_tiles,
        checkpoint,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Processing in progress...");
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Processing completed successfully!");
    console.log("Raw result:", result);

    // According to FAL AI documentation, result structure is: result.data.image.url
    if (!result.data || !result.data.image || !result.data.image.url) {
      throw new Error(
        `No image URL found in result. Expected result.data.image.url. Result structure: ${JSON.stringify(result)}`,
      );
    }

    return result.data.image.url;
  } catch (error) {
    console.error("Error in upscaleImage:", error);

    // Log detailed error information for debugging
    if (error && typeof error === "object" && "body" in error) {
      console.error(
        "FAL AI Error Details:",
        JSON.stringify(error.body, null, 2),
      );
    }

    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // Extract userid (required parameter from intent route)
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    // 🎯 URL-first approach (from intentroute)
    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    if (!imageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error:
            'Missing "image_url" parameter. This endpoint expects to be called through intentroute.',
        },
        { status: 400 },
      );
    }

    console.log("🔗 Using provided image URL for upscaling:", imageUrl);

    // Check FAL_KEY configuration
    console.log("🔑 FAL_KEY status:", process.env.FAL_KEY ? "Set" : "Not Set");
    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { status: "error", error: "FAL_KEY environment variable not set" },
        { status: 500 },
      );
    }

    // Extract proper FAL AI parameters
    const upscaling_factor_param =
      (formData.get("upscaling_factor") as string) || "4";
    const upscaling_factor = parseInt(upscaling_factor_param, 10);
    const overlapping_tiles =
      (formData.get("overlapping_tiles") as string)?.toLowerCase() === "true";
    const checkpoint = (formData.get("checkpoint") as string) || "v1";

    // Validate upscaling_factor
    if (upscaling_factor !== 4) {
      return NextResponse.json(
        { status: "error", error: "upscaling_factor must be 4" },
        { status: 400 },
      );
    }

    // Validate checkpoint
    if (checkpoint !== "v1" && checkpoint !== "v2") {
      return NextResponse.json(
        { status: "error", error: 'checkpoint must be "v1" or "v2"' },
        { status: 400 },
      );
    }

    console.log("Starting image upscaling...");
    console.log(
      `Parameters: upscaling_factor=${upscaling_factor}, overlapping_tiles=${overlapping_tiles}, checkpoint=${checkpoint}`,
    );
    console.log(`Image to process: ${imageUrl}`);

    const upscaledImageUrl = await upscaleImage(imageUrl, {
      upscaling_factor: upscaling_factor as 4,
      overlapping_tiles,
      checkpoint: checkpoint as "v1" | "v2",
    });

    console.log("Upscaling completed!");
    console.log("Upscaled image URL:", upscaledImageUrl);

    // Convert the output image to base64 for intentroute to handle
    let outputBase64: string;

    if (upscaledImageUrl.startsWith("data:image")) {
      // Already base64
      outputBase64 = upscaledImageUrl;
    } else {
      // Download and convert URL to base64
      const response = await fetch(upscaledImageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch upscaled image: ${response.statusText}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      outputBase64 = bufferToBase64DataUrl(buffer);
    }

    const response: UpscaleResponse = {
      status: "success",
      imageUrl: outputBase64, // Base64 data URL for intentroute to handle
    };

    return NextResponse.json(response);
  } catch (processingError) {
    console.error("Error processing upscale request:", processingError);

    const response: UpscaleResponse = {
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
    message: "Upscale API is running",
    note: "This API is designed to work through intentroute for file handling",
    endpoints: {
      POST: {
        description: "Upscale an image using FAL AI AuraSR",
        parameters: {
          userid: "string (required) - User ID from intentroute",
          image_url:
            "string (required) - Image URL from intentroute (Firebase Storage)",
          upscaling_factor:
            "number (optional) - Upscaling factor, must be 4 (default: 4)",
          overlapping_tiles:
            "boolean (optional) - Use overlapping tiles, removes seams but doubles inference time (default: false)",
          checkpoint:
            'string (optional) - Checkpoint to use, "v1" or "v2" (default: "v1")',
        },
      },
    },
  });
}
