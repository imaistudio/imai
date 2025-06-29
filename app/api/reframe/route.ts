import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin if not already initialized
let firebaseInitialized = false;
try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  firebaseInitialized = true;
  console.log("🔥 Firebase initialized for reframe route");
} catch (error) {
  console.warn(
    "⚠️ Firebase initialization failed, running in test mode:",
    error,
  );
  firebaseInitialized = false;
}

fal.config({
  credentials: process.env.FAL_KEY,
});

// Add configuration for longer timeout
export const maxDuration = 300;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for high-res compositions

async function processReframe(
  imageUrl: string,
  options: { imageSize: string; webhookUrl?: string },
) {
  try {
    console.log("🖼️ Processing reframe...");
    console.log("Image URL:", imageUrl);
    console.log("Target size:", options.imageSize);

    // Map imageSize to aspect ratios for FAL AI
    const aspectRatioMap: { [key: string]: string } = {
      square_hd: "1:1",
      square: "1:1",
      portrait: "3:4",
      landscape: "4:3",
    };

    const targetAspectRatio = aspectRatioMap[options.imageSize] || "1:1";
    console.log("🎯 Target aspect ratio:", targetAspectRatio);

    // Use FAL AI's image reframing service with high quality settings
    const result = await fal.subscribe("fal-ai/image-editing/reframe", {
      input: {
        image_url: imageUrl,
        aspect_ratio: targetAspectRatio,
        guidance_scale: 7.5, // Increased for better quality
        num_inference_steps: 50, // Increased for better quality
        output_format: "png", // Use PNG to avoid JPEG compression
        output_quality: 95, // High quality output
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

    // Extract and validate userid
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    // Validate Firebase user ID
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
        console.log("✅ Firebase user ID validated successfully for reframe");
      } catch (error) {
        console.log("❌ Invalid Firebase user ID for reframe:", error);
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid Firebase user ID - authentication required",
          },
          { status: 401 },
        );
      }
    } else {
      console.log("Skipping Firebase user validation - testing mode");
    }

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
          { status: 400 },
        );
      }

      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size too large. Maximum size is 10MB." },
          { status: 400 },
        );
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const base64 = buffer.toString("base64");
      finalImageUrl = `data:${imageFile.type};base64,${base64}`;
    } else {
      return NextResponse.json(
        { error: "Either image_url or image file must be provided" },
        { status: 400 },
      );
    }

    const validImageSizes = ["square_hd", "square", "portrait", "landscape"];
    if (!validImageSizes.includes(imageSize)) {
      return NextResponse.json(
        { error: "Invalid image size option." },
        { status: 400 },
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
      { status: 500 },
    );
  }
}
