import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function processReframe(
  imageUrl: string,
  options: { imageSize: string; webhookUrl?: string }
) {
  try {
    console.log("🖼️ Processing reframe...");
    console.log("Image URL:", imageUrl);
    console.log("Target size:", options.imageSize);

    // Map imageSize to aspect ratios for FAL AI
    const aspectRatioMap: { [key: string]: string } = {
      "square_hd": "1:1",
      "square": "1:1", 
      "portrait": "3:4",
      "landscape": "4:3"
    };

    const targetAspectRatio = aspectRatioMap[options.imageSize] || "1:1";
    console.log("🎯 Target aspect ratio:", targetAspectRatio);

    // Use FAL AI's image reframing service
    const result = await fal.subscribe("fal-ai/image-editing/reframe", {
      input: {
        image_url: imageUrl,
        aspect_ratio: targetAspectRatio,
        guidance_scale: 3.5,
        num_inference_steps: 30,
        output_format: "jpeg"
      },
    });

    console.log("✅ Reframe processing completed");
    console.log("Reframed image URL:", result.data.images[0].url);

    return {
      requestId: "reframe_" + Date.now(),
      images: [
        {
          url: result.data.images[0].url,
        },
      ],
      downloadedPath: null,
    };
  } catch (error) {
    console.error("❌ Error in processReframe:", error);
    throw new Error(`Failed to process reframe: ${error}`);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    const imageFile = formData.get("image") as File;
    const imageSize = (formData.get("imageSize") as string) || "square_hd";

    let finalImageUrl: string;

    if (imageUrl) {
      console.log("🔗 Using provided image URL for reframing:", imageUrl);
      finalImageUrl = imageUrl;
    } else if (imageFile) {
      console.log("📁 Using file-based approach for reframing...");

      if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
        return NextResponse.json(
          {
            error:
              "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
          },
          { status: 400 }
        );
      }

      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size too large. Maximum size is 10MB." },
          { status: 400 }
        );
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const base64 = buffer.toString("base64");
      finalImageUrl = `data:${imageFile.type};base64,${base64}`;
    } else {
      return NextResponse.json(
        { error: "Either image_url or image file must be provided" },
        { status: 400 }
      );
    }

    const validImageSizes = ["square_hd", "square", "portrait", "landscape"];
    if (!validImageSizes.includes(imageSize)) {
      return NextResponse.json(
        { error: "Invalid image size option." },
        { status: 400 }
      );
    }

    console.log("🖼️ Starting reframe processing with image size:", imageSize);

    const result = await processReframe(finalImageUrl, {
      imageSize,
      webhookUrl: undefined,
    });

    console.log("✅ Reframe processing completed");

    return NextResponse.json({
      status: "success",
      result: {
        requestId: result.requestId,
        imageUrl: result.images[0].url,
        downloadedPath: result.downloadedPath,
      },
    });
  } catch (error: any) {
    console.error("Error in reframe route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process image" },
      { status: 500 }
    );
  }
}
