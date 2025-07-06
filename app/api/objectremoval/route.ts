import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

fal.config({
  credentials: process.env.FAL_KEY,
});

interface ObjectRemovalOptions {
  guidance_scale?: number;
  num_inference_steps?: number;
  safety_tolerance?: "1" | "2" | "3" | "4" | "5" | "6";
  output_format?: "jpeg" | "png";
  aspect_ratio?: "21:9" | "16:9" | "4:3" | "3:2" | "1:1" | "2:3" | "3:4" | "9:16" | "9:21";
  seed?: number;
  sync_mode?: boolean;
  prompt?: string;
}

interface ObjectRemovalResponse {
  status: string;
  imageUrl?: string; // FAL AI URL (following reframe pattern)
  seed?: number;
  error?: string;
}

// 🔧 REMOVED: convertToBase64 function no longer needed
// Following reframe pattern - we return FAL AI URLs directly

/**
 * Tests if an image URL is accessible
 */
async function testImageUrl(imageUrl: string): Promise<boolean> {
  try {
    console.log("🔍 Testing image URL accessibility...");
    const response = await fetch(imageUrl, { method: 'HEAD' });
    console.log(`📡 Image URL test: ${response.status} ${response.statusText}`);
    console.log(`📄 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📏 Content-Length: ${response.headers.get('content-length')}`);
    return response.ok;
  } catch (error) {
    console.error("❌ Image URL test failed:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageUrl = formData.get("image_url") as string;
    const userid = formData.get("userid") as string;

    // Validate required parameters
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing image_url parameter" },
        { status: 400 }
      );
    }

    if (!userid) {
      return NextResponse.json(
        { error: "Missing userid parameter" },
        { status: 400 }
      );
    }

    // Check if FAL_KEY is available
    if (!process.env.FAL_KEY) {
      console.error("❌ FAL_KEY not found in environment variables");
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 }
      );
    }

    console.log("🔑 FAL_KEY status: Set");

    // Extract optional parameters with defaults
    const options: ObjectRemovalOptions = {
      guidance_scale: parseFloat(formData.get("guidance_scale") as string) || 3.5,
      num_inference_steps: parseInt(formData.get("num_inference_steps") as string) || 30,
      safety_tolerance: (formData.get("safety_tolerance") as "1" | "2" | "3" | "4" | "5" | "6") || "2",
      output_format: (formData.get("output_format") as "jpeg" | "png") || "jpeg",
      aspect_ratio: formData.get("aspect_ratio") as "21:9" | "16:9" | "4:3" | "3:2" | "1:1" | "2:3" | "3:4" | "9:16" | "9:21" || undefined,
      seed: formData.get("seed") ? parseInt(formData.get("seed") as string) : undefined,
      sync_mode: formData.get("sync_mode") === "true" || false,
      prompt: formData.get("prompt") as string || "background people",
    };

    console.log("Starting object removal...");
    console.log(`Parameters: guidance_scale=${options.guidance_scale}, num_inference_steps=${options.num_inference_steps}, safety_tolerance=${options.safety_tolerance}, output_format=${options.output_format}, prompt="${options.prompt}"`);
    console.log(`Image to process: ${imageUrl}`);

    // Test image URL accessibility
    const isAccessible = await testImageUrl(imageUrl);
    if (!isAccessible) {
      console.error("❌ Image URL is not accessible");
      return NextResponse.json(
        { error: "Image URL is not accessible" },
        { status: 400 }
      );
    }

    console.log("Submitting request to FAL AI Object Removal...");
    
    // Prepare FAL AI request parameters
    const falParams: any = {
      image_url: imageUrl,
      guidance_scale: options.guidance_scale,
      num_inference_steps: options.num_inference_steps,
      safety_tolerance: options.safety_tolerance,
      output_format: options.output_format,
      sync_mode: options.sync_mode,
      prompt: options.prompt,
    };

    // Only add optional parameters if they are provided
    if (options.aspect_ratio) {
      falParams.aspect_ratio = options.aspect_ratio;
    }
    if (options.seed !== undefined) {
      falParams.seed = options.seed;
    }

    console.log(`Arguments: guidance_scale=${options.guidance_scale}, num_inference_steps=${options.num_inference_steps}, safety_tolerance=${options.safety_tolerance}, output_format=${options.output_format}, prompt="${options.prompt}"`);

    const result = await fal.subscribe("fal-ai/image-editing/object-removal", {
      input: falParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Processing in progress...");
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Processing completed successfully!");
    console.log("Raw result:", result);

    if (!result.data || !result.data.images || result.data.images.length === 0) {
      console.error("❌ No images returned from FAL AI");
      return NextResponse.json(
        { error: "No images returned from FAL AI" },
        { status: 500 }
      );
    }

    const outputImageUrl = result.data.images[0].url;
    console.log(`Object removal completed!`);
    console.log(`Processed image URL: ${outputImageUrl}`);

    // 🔧 REFRAME PATTERN: Return FAL AI URL directly (no base64 conversion)
    // This prevents Firebase document size overflow and is much more efficient
    console.log("✅ Using FAL AI URL directly (following reframe pattern)");

    const response: ObjectRemovalResponse = {
      status: "success",
      imageUrl: outputImageUrl, // Direct FAL AI URL (not base64)
      seed: result.data.seed,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("❌ Object removal failed:", error);
    
    let errorMessage = "Internal server error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        status: "error" 
      },
      { status: 500 }
    );
  }
} 