import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { getNextFalKey } from "@/lib/falKeyManager";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

// Configure FAL AI
fal.config({
  credentials: getNextFalKey(),
});

// Initialize Firebase Admin (for server-side operations)
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}",
    );
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log("🔥 Firebase Admin initialized for removebg tool");
  } catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error);
  }
}

/**
 * Upload buffer to Firebase Storage and return permanent URL
 */
async function uploadBufferToFirebase(
  buffer: Buffer,
  userid: string,
  filename: string,
): Promise<string> {
  try {
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const filePath = `${userid}/output/${filename}`;
    const file = bucket.file(filePath);

    console.log(`📤 Uploading to Firebase Storage: ${filePath}`);

    // Upload the buffer
    await file.save(buffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          source: "removebg_tool",
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log(`✅ File uploaded successfully: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error("❌ Firebase upload failed:", error);
    throw error;
  }
}

interface RemBGOptions {
  syncMode?: boolean;
}

interface RemBGResponse {
  status: string;
  imageUrl?: string;
  firebaseOutputUrl?: string;
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

async function removeBackground(
  imageUrl: string,
  options: RemBGOptions = {},
): Promise<string> {
  try {
    const { syncMode = false } = options;

    console.log("🎨 Starting background removal with FAL AI...");
    console.log("Image URL:", imageUrl);
    console.log("Sync mode:", syncMode);

    const result = await fal.subscribe("fal-ai/bria/background/remove", {
      input: {
        image_url: imageUrl,
        sync_mode: syncMode,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("✅ Background removal completed successfully!");
    console.log("Raw result:", result);

    // Extract the processed image URL from the result
    let outputImageUrl = null;
    const resultData = result as any;

    if (
      resultData.data &&
      resultData.data.image &&
      typeof resultData.data.image === "object" &&
      "url" in resultData.data.image
    ) {
      outputImageUrl = resultData.data.image.url;
    } else if (
      resultData.image &&
      typeof resultData.image === "object" &&
      "url" in resultData.image
    ) {
      outputImageUrl = resultData.image.url;
    }

    if (!outputImageUrl) {
      throw new Error(
        `No image URL found in result. Result structure: ${JSON.stringify(result)}`,
      );
    }

    return outputImageUrl;
  } catch (error) {
    console.error("Error in removeBackground:", error);
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
      "🔗 Using provided image URL for background removal:",
      imageUrl,
    );

    // Extract optional parameters
    const syncMode =
      (formData.get("sync_mode") as string)?.toLowerCase() === "true";

    console.log("Starting background removal...");
    console.log(`Parameters: sync_mode=${syncMode}`);
    console.log(`Image to process: ${imageUrl}`);

    const processedImageUrl = await removeBackground(imageUrl, {
      syncMode,
    });

    console.log("Background removal completed!");
    console.log("Processed image URL:", processedImageUrl);

    // 🔥 NEW: Upload to Firebase Storage for permanent URL
    let finalImageUrl: string;

    if (processedImageUrl.startsWith("data:image")) {
      // Already base64 - extract buffer and upload
      const base64Data = processedImageUrl.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const filename = `removebg_${Date.now()}.png`;
      finalImageUrl = await uploadBufferToFirebase(buffer, userid, filename);
    } else {
      // Download from temporary URL and upload to Firebase
      console.log("📥 Downloading from temporary FAL AI URL...");
      const response = await fetch(processedImageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch processed image: ${response.statusText}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = `removebg_${Date.now()}.png`;

      console.log("📤 Uploading to Firebase Storage...");
      finalImageUrl = await uploadBufferToFirebase(buffer, userid, filename);
    }

    const response: RemBGResponse = {
      status: "success",
      imageUrl: finalImageUrl, // Firebase Storage URL (permanent)
      firebaseOutputUrl: finalImageUrl, // For consistency with other tools
    };

    return NextResponse.json(response);
  } catch (processingError) {
    console.error(
      "Error processing background removal request:",
      processingError,
    );

    const response: RemBGResponse = {
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
    message: "RemBG API is running",
    note: "This API is designed to work through intentroute for file handling",
    endpoints: {
      POST: {
        description: "Remove background from an image using FAL AI Bria",
        parameters: {
          userid: "string (required) - User ID from intentroute",
          image_url:
            "string (required) - Image URL from intentroute (Cloudinary)",
          sync_mode:
            "boolean (optional) - Wait for processing to complete (default: false)",
        },
      },
    },
    features: {
      background_removal: "AI-powered background removal",
      high_quality: "Professional-grade results",
      transparent_output: "PNG format with transparency",
      batch_processing: "Supports multiple images",
    },
    examples: {
      basic: "Remove background from product photos",
      portraits: "Create transparent profile pictures",
      objects: "Isolate objects for design work",
      ecommerce: "Create product mockups",
    },
  });
}
