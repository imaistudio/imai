import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

fal.config({
  credentials: process.env.FAL_KEY,
});

interface ChainOfZoomOptions {
  scale?: number;
  center_x?: number;
  center_y?: number;
  user_prompt?: string;
  sync_mode?: boolean;
}

interface ChainOfZoomResponse {
  status: string;
  imageUrl?: string; // Primary zoom result (FAL AI URL)
  images?: string[]; // All zoom steps as FAL AI URLs (following reframe pattern)
  scale?: number;
  zoom_center?: number[];
  error?: string;
}

// 🔧 REMOVED: bufferToBase64DataUrl function no longer needed
// Following reframe pattern - we return FAL AI URLs directly

async function performChainOfZoom(
  imageUrl: string,
  options: ChainOfZoomOptions,
): Promise<{ images: string[]; scale: number; zoom_center: number[] }> {
  try {
    const {
      scale = 5,
      center_x = 0.5,
      center_y = 0.5,
      user_prompt = "",
      sync_mode = false,
    } = options;

    console.log("Submitting request to FAL AI Chain of Zoom...");
    console.log(
      `Arguments: scale=${scale}, center_x=${center_x}, center_y=${center_y}, user_prompt="${user_prompt}"`,
    );

    // Check if image URL is accessible
    try {
      console.log("🔍 Testing image URL accessibility...");
      const testResponse = await fetch(imageUrl, { method: 'HEAD' });
      console.log(`📡 Image URL test: ${testResponse.status} ${testResponse.statusText}`);
      console.log(`📄 Content-Type: ${testResponse.headers.get('content-type')}`);
      console.log(`📏 Content-Length: ${testResponse.headers.get('content-length')}`);
    } catch (urlError) {
      console.error("⚠️ Image URL accessibility test failed:", urlError);
    }

    // Prepare FAL AI request parameters
    const falParams = {
      image_url: imageUrl,
      scale,
      center_x,
      center_y,
      user_prompt,
      sync_mode,
    };

    const result = await fal.subscribe("fal-ai/chain-of-zoom", {
      input: falParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Chain of zoom processing in progress...");
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Chain of zoom processing completed successfully!");
    console.log("Result summary:", {
      status: result.data ? "success" : "failed",
      imageCount: result.data?.images ? (Array.isArray(result.data.images) ? result.data.images.length : 1) : 0,
      scale: result.data?.scale,
      zoom_center: result.data?.zoom_center
    });

    // Check for proper response structure
    if (!result.data || !result.data.images) {
      throw new Error(
        `No images found in result. Expected result.data.images. Result structure: ${JSON.stringify(result)}`,
      );
    }

    // Extract image URLs from the result
    const imageUrls = (Array.isArray(result.data.images) ? result.data.images : [result.data.images])
      .map((image: any) => typeof image === 'string' ? image : image.url);

    return {
      images: imageUrls,
      scale: result.data.scale,
      zoom_center: result.data.zoom_center,
    };
  } catch (error) {
    console.error("Error in performChainOfZoom:", error);
    
    // Log detailed error information for debugging
    if (error && typeof error === 'object' && 'body' in error) {
      console.error("FAL AI Error Details:", JSON.stringify(error.body, null, 2));
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

    // URL-first approach (from intentroute)
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

    console.log("🔗 Using provided image URL for chain of zoom:", imageUrl);

    // Check FAL_KEY configuration
    console.log("🔑 FAL_KEY status:", process.env.FAL_KEY ? "Set" : "Not Set");
    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { status: "error", error: "FAL_KEY environment variable not set" },
        { status: 500 },
      );
    }

    // Extract optional parameters with defaults
    const options: ChainOfZoomOptions = {
      scale: formData.get("scale") ? parseFloat(formData.get("scale") as string) : 5,
      center_x: formData.get("center_x") ? parseFloat(formData.get("center_x") as string) : 0.5,
      center_y: formData.get("center_y") ? parseFloat(formData.get("center_y") as string) : 0.5,
      user_prompt: (formData.get("user_prompt") as string) || "",
      sync_mode: formData.get("sync_mode") === "true" || false,
    };

    console.log("Starting chain of zoom...");
    console.log(
      `Parameters: scale=${options.scale}, center_x=${options.center_x}, center_y=${options.center_y}, user_prompt="${options.user_prompt}"`,
    );
    console.log(`Image to process: ${imageUrl}`);

    const result = await performChainOfZoom(imageUrl, options);

    console.log("Chain of zoom completed!");
    console.log("Generated images:", result.images.length);

    // 🔧 REFRAME PATTERN: Return FAL AI URLs directly (no base64 conversion)
    // This prevents Firebase document size overflow and is much more efficient
    console.log("✅ Using FAL AI URLs directly (following reframe pattern)");
    
    const response: ChainOfZoomResponse = {
      status: "success",
      imageUrl: result.images[0], // Primary image for consistency with other APIs
      images: result.images, // All images as URLs (not base64)
      scale: result.scale,
      zoom_center: result.zoom_center,
    };

    return NextResponse.json(response);
  } catch (processingError) {
    console.error("Error processing chain of zoom request:", processingError);

    const response: ChainOfZoomResponse = {
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
    message: "Chain of Zoom API is running",
    note: "This API follows the reframe pattern - returns FAL AI URLs directly for optimal performance",
    endpoints: {
      POST: {
        description: "Perform extreme zoom into an image region using FAL AI",
        parameters: {
          userid: "string (required) - User ID from intentroute",
          image_url:
            "string (required) - Image URL from intentroute (accepts URLs or base64)",
          scale: "number (optional) - Zoom scale in powers of 2 (default: 5)",
          center_x: "number (optional) - X coordinate of zoom center 0-1 (default: 0.5)",
          center_y: "number (optional) - Y coordinate of zoom center 0-1 (default: 0.5)",
          user_prompt: "string (optional) - Additional prompt to guide zoom enhancement",
          sync_mode: "boolean (optional) - Wait for upload before response (default: false)",
        },
        returns: {
          imageUrl: "string - Primary zoom result (FAL AI URL)",
          images: "array - All zoom steps as FAL AI URLs (not base64)",
          scale: "number - Applied zoom scale",
          zoom_center: "array - Applied zoom center coordinates"
        }
      },
    },
  });
} 