import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

fal.config({
  credentials: process.env.FAL_KEY,
});

interface TimeOfDayOptions {
  guidance_scale?: number;
  num_inference_steps?: number;
  safety_tolerance?: "1" | "2" | "3" | "4" | "5" | "6";
  output_format?: "jpeg" | "png";
  aspect_ratio?:
    | "21:9"
    | "16:9"
    | "4:3"
    | "3:2"
    | "1:1"
    | "2:3"
    | "3:4"
    | "9:16"
    | "9:21";
  seed?: number;
  sync_mode?: boolean;
  prompt?: string;
}

interface TimeOfDayResponse {
  status: string;
  imageUrl?: string; // FAL AI URL (following reframe pattern)
  seed?: number;
  error?: string;
}

// 🔧 REMOVED: bufferToBase64DataUrl function no longer needed
// Following reframe pattern - we return FAL AI URLs directly

async function changeTimeOfDay(
  imageUrl: string,
  options: TimeOfDayOptions,
): Promise<{ imageUrl: string; seed?: number }> {
  try {
    const {
      guidance_scale = 3.5,
      num_inference_steps = 30,
      safety_tolerance = "2",
      output_format = "jpeg",
      aspect_ratio,
      seed,
      sync_mode = false,
      prompt = "golden hour",
    } = options;

    console.log("Submitting request to FAL AI Time of Day...");
    console.log(
      `Arguments: guidance_scale=${guidance_scale}, num_inference_steps=${num_inference_steps}, safety_tolerance=${safety_tolerance}, output_format=${output_format}, prompt="${prompt}"`,
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

    const input: any = {
      image_url: imageUrl,
      guidance_scale,
      num_inference_steps,
      safety_tolerance,
      output_format,
      sync_mode,
      prompt,
    };

    // Add optional parameters if provided
    if (aspect_ratio) input.aspect_ratio = aspect_ratio;
    if (seed !== undefined) input.seed = seed;

    const result = await fal.subscribe("fal-ai/image-editing/time-of-day", {
      input,
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

    // According to FAL AI documentation, result structure is: result.data.images[0].url
    if (
      !result.data ||
      !result.data.images ||
      !Array.isArray(result.data.images) ||
      result.data.images.length === 0
    ) {
      throw new Error(
        `No images found in result. Expected result.data.images array. Result structure: ${JSON.stringify(result)}`,
      );
    }

    const firstImage = result.data.images[0];
    if (!firstImage.url) {
      throw new Error(
        `No image URL found in first image. Expected result.data.images[0].url. Result structure: ${JSON.stringify(result)}`,
      );
    }

    return {
      imageUrl: firstImage.url,
      seed: result.data.seed,
    };
  } catch (error) {
    console.error("Error in changeTimeOfDay:", error);

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

    console.log(
      "🔗 Using provided image URL for time of day change:",
      imageUrl,
    );

    // Check FAL_KEY configuration
    console.log("🔑 FAL_KEY status:", process.env.FAL_KEY ? "Set" : "Not Set");
    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { status: "error", error: "FAL_KEY environment variable not set" },
        { status: 500 },
      );
    }

    // Extract time of day parameters
    const guidance_scale_param = formData.get("guidance_scale") as string;
    const guidance_scale = guidance_scale_param
      ? parseFloat(guidance_scale_param)
      : 3.5;

    const num_inference_steps_param = formData.get(
      "num_inference_steps",
    ) as string;
    const num_inference_steps = num_inference_steps_param
      ? parseInt(num_inference_steps_param, 10)
      : 30;

    const safety_tolerance =
      (formData.get("safety_tolerance") as string) || "2";
    const output_format = (formData.get("output_format") as string) || "jpeg";
    const aspect_ratio = (formData.get("aspect_ratio") as string) || undefined;

    const seed_param = formData.get("seed") as string;
    const seed = seed_param ? parseInt(seed_param, 10) : undefined;

    const sync_mode_param = formData.get("sync_mode") as string;
    const sync_mode = sync_mode_param?.toLowerCase() === "true";

    const prompt = (formData.get("prompt") as string) || "golden hour";

    // Validate safety_tolerance
    const validSafetyLevels = ["1", "2", "3", "4", "5", "6"];
    if (!validSafetyLevels.includes(safety_tolerance)) {
      return NextResponse.json(
        {
          status: "error",
          error: "safety_tolerance must be one of: 1, 2, 3, 4, 5, 6",
        },
        { status: 400 },
      );
    }

    // Validate output_format
    if (output_format !== "jpeg" && output_format !== "png") {
      return NextResponse.json(
        { status: "error", error: 'output_format must be "jpeg" or "png"' },
        { status: 400 },
      );
    }

    // Validate aspect_ratio if provided
    const validAspectRatios = [
      "21:9",
      "16:9",
      "4:3",
      "3:2",
      "1:1",
      "2:3",
      "3:4",
      "9:16",
      "9:21",
    ];
    if (aspect_ratio && !validAspectRatios.includes(aspect_ratio)) {
      return NextResponse.json(
        {
          status: "error",
          error: `aspect_ratio must be one of: ${validAspectRatios.join(", ")}`,
        },
        { status: 400 },
      );
    }

    console.log("Starting time of day change...");
    console.log(
      `Parameters: guidance_scale=${guidance_scale}, num_inference_steps=${num_inference_steps}, safety_tolerance=${safety_tolerance}, output_format=${output_format}, prompt="${prompt}"`,
    );
    console.log(`Image to process: ${imageUrl}`);

    const result = await changeTimeOfDay(imageUrl, {
      guidance_scale,
      num_inference_steps,
      safety_tolerance: safety_tolerance as any,
      output_format: output_format as any,
      aspect_ratio: aspect_ratio as any,
      seed,
      sync_mode,
      prompt,
    });

    console.log("Time of day change completed!");
    console.log("Transformed image URL:", result.imageUrl);

    // 🔧 REFRAME PATTERN: Return FAL AI URL directly (no base64 conversion)
    // This prevents Firebase document size overflow and is much more efficient
    console.log("✅ Using FAL AI URL directly (following reframe pattern)");

    const apiResponse: TimeOfDayResponse = {
      status: "success",
      imageUrl: result.imageUrl, // Direct FAL AI URL (not base64)
      seed: result.seed,
    };

    return NextResponse.json(apiResponse);
  } catch (processingError) {
    console.error("Error processing time of day request:", processingError);

    let errorMessage = "Failed to process time of day change";
    if (processingError instanceof Error) {
      errorMessage = processingError.message;
    }

    const response: TimeOfDayResponse = {
      status: "error",
      error: errorMessage,
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      message: "Time of Day API",
      model: "fal-ai/image-editing/time-of-day",
      description: "Change the time of day in the image",
      parameters: {
        image_url: "Image URL to process (required)",
        guidance_scale: "CFG scale (default: 3.5)",
        num_inference_steps: "Number of inference steps (default: 30)",
        safety_tolerance: "Safety level 1-6 (default: 2)",
        output_format: "jpeg or png (default: jpeg)",
        aspect_ratio: "Optional aspect ratio (e.g., 16:9, 1:1)",
        seed: "Optional seed for reproducibility",
        sync_mode: "Wait for completion (default: false)",
        prompt: "Time of day description (default: 'golden hour')",
      },
    },
    { status: 200 },
  );
}
