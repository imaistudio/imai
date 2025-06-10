import { NextRequest, NextResponse } from "next/server";
import * as fal from "@fal-ai/serverless-client";
import { v4 as uuidv4 } from "uuid";

fal.config({
  credentials: process.env.FAL_KEY,
});

interface UpscaleOptions {
  scale?: number;
  enhance_face?: boolean;
  enhance_details?: boolean;
}

interface UpscaleResponse {
  status: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(buffer: Buffer, mimeType: string = 'image/jpeg'): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function upscaleImage(
  imageUrl: string,
  options: UpscaleOptions
): Promise<string> {
  try {
    const { scale = 2, enhance_face = true, enhance_details = true } = options;

    console.log("Submitting request to FAL AI...");
    console.log(
      `Arguments: scale=${scale}, enhance_face=${enhance_face}, enhance_details=${enhance_details}`
    );

    const result = await fal.subscribe("fal-ai/aura-sr", {
      input: {
        image_url: imageUrl,
        scale,
        enhance_face,
        enhance_details,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Processing in progress...");
        }
      },
    });

    console.log("Processing completed successfully!");
    console.log("Raw result:", result);

    let outputImageUrl = null;
    const resultData = result as any;

    if (
      resultData.image &&
      typeof resultData.image === "object" &&
      "url" in resultData.image
    ) {
      outputImageUrl = resultData.image.url;
    } else if (resultData.data && typeof resultData.data === "object") {
      if (
        "image" in resultData.data &&
        resultData.data.image &&
        typeof resultData.data.image === "object" &&
        "url" in resultData.data.image
      ) {
        outputImageUrl = resultData.data.image.url;
      } else if ("url" in resultData.data) {
        outputImageUrl = resultData.data.url;
      }
    }

    if (!outputImageUrl) {
      throw new Error(
        `No image URL found in result. Result structure: ${JSON.stringify(result)}`
      );
    }

    return outputImageUrl;
  } catch (error) {
    console.error("Error in upscaleImage:", error);
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
        { status: 400 }
      );
    }

    // 🎯 URL-first approach (from intentroute)
    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    if (!imageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: 'Missing "image_url" parameter. This endpoint expects to be called through intentroute.',
        },
        { status: 400 }
      );
    }

    console.log("🔗 Using provided image URL for upscaling:", imageUrl);

    const scale = parseInt(formData.get("scale") as string) || 2;
    const enhance_face =
      (formData.get("enhance_face") as string)?.toLowerCase() !== "false";
    const enhance_details =
      (formData.get("enhance_details") as string)?.toLowerCase() !== "false";

    console.log("Starting image upscaling...");
    console.log(
      `Parameters: scale=${scale}, enhance_face=${enhance_face}, enhance_details=${enhance_details}`
    );
    console.log(`Image to process: ${imageUrl}`);

    const upscaledImageUrl = await upscaleImage(imageUrl, {
      scale,
      enhance_face,
      enhance_details,
    });

    console.log("Upscaling completed!");
    console.log("Upscaled image URL:", upscaledImageUrl);

    // Convert the output image to base64 for intentroute to handle
    let outputBase64: string;

    if (upscaledImageUrl.startsWith('data:image')) {
      // Already base64
      outputBase64 = upscaledImageUrl;
    } else {
      // Download and convert URL to base64
      const response = await fetch(upscaledImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch upscaled image: ${response.statusText}`);
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
          image_url: "string (required) - Image URL from intentroute (Cloudinary)",
          scale: "number (optional) - Upscale factor (default: 2)",
          enhance_face: "boolean (optional) - Enhance faces (default: true)",
          enhance_details:
            "boolean (optional) - Enhance details (default: true)",
        },
      },
    },
  });
}
