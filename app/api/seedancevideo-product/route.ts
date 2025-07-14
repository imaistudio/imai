import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Set maximum function duration to 600 seconds (10 minutes) for video processing
export const maxDuration = 600;

// Initialize Firebase Admin if not already initialized
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

console.log(
  "🔥 Firebase initialized - using Firebase Storage for video handling",
);

fal.config({
  credentials: process.env.FAL_KEY,
});

interface SeedanceVideoOptions {
  prompt?: string;
  resolution?: "1080p";
  duration?: "5";
  camera_fixed?: boolean;
  seed?: number;
}

interface SeedanceVideoResponse {
  status: string;
  videoUrl?: string;
  seed?: number;
  error?: string;
}

// Fashion/clothing preset prompts
const FASHION_PROMPTS = [
  "Create a cinematic product video from this image. The product should be the sole focus, showcased against a dark, minimal background. Use dramatic, moody lighting with soft shadows to highlight the product’s shape and texture. Include smooth camera movements — rotating 360° around the product, slow zoom-ins on surface details, and elegant panning shots from multiple angles. No text, no branding. Keep the visuals sleek, high-contrast, and premium. Final output should be resembling a high-end commercial for a tech, fashion, or lifestyle product",
];

// 🔧 VIDEO FIREBASE STORAGE FUNCTIONS
async function uploadVideoToFirebaseStorage(
  file: File,
  userid: string,
  isOutput: boolean = false,
): Promise<string> {
  try {
    console.log(
      `📤 Uploading ${file.name} (${file.size}b) to Firebase Storage...`,
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const bucket = getStorage().bucket();
    const folder = isOutput ? "output" : "input";
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name.replace(/\.[^/.]+$/, ".mp4")}`;
    const filePath = `${userid}/${folder}/${fileName}`;

    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: "video/mp4",
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: file.name,
          userId: userid,
          folder: folder,
        },
      },
    });

    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    console.log(`✅ Firebase Storage video upload successful: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error("❌ Firebase Storage video upload failed:", error);
    throw new Error(
      `Failed to upload ${file.name} to Firebase Storage: ${error}`,
    );
  }
}

async function saveOutputVideoToFirebase(
  videoUrl: string,
  userid: string,
  endpoint: string,
): Promise<string> {
  try {
    console.log(
      `💾 Saving output video to Firebase Storage for user ${userid}...`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);

    try {
      const response = await fetch(videoUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IMAI/1.0)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.statusText}`);
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`📏 Video size: ${sizeInMB.toFixed(2)}MB`);

        if (sizeInMB > 100) {
          console.log(
            `⚠️ Video too large (${sizeInMB.toFixed(2)}MB) - using original URL`,
          );
          return videoUrl;
        }
      }

      const blob = await response.blob();
      const fileName = `${endpoint.replace("/api/", "")}_output_${Date.now()}.mp4`;
      const file = new File([blob], fileName, { type: "video/mp4" });

      const firebaseUrl = await uploadVideoToFirebaseStorage(
        file,
        userid,
        true,
      );

      console.log(`✅ Output video saved to Firebase Storage: ${firebaseUrl}`);
      return firebaseUrl;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        console.log(`⏰ Download timeout for large video - using original URL`);
        return videoUrl;
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("❌ Failed to save output video to Firebase:", error);
    console.log(`🔄 Using original URL as fallback: ${videoUrl}`);
    return videoUrl;
  }
}

async function testImageUrl(imageUrl: string): Promise<boolean> {
  try {
    console.log("🔍 Testing image URL accessibility...");
    const response = await fetch(imageUrl, { method: "HEAD" });
    console.log(`📡 Image URL test: ${response.status} ${response.statusText}`);
    console.log(`📄 Content-Type: ${response.headers.get("content-type")}`);
    console.log(`📏 Content-Length: ${response.headers.get("content-length")}`);
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

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing image_url parameter" },
        { status: 400 },
      );
    }

    if (!userid) {
      return NextResponse.json(
        { error: "Missing userid parameter" },
        { status: 400 },
      );
    }

    if (!process.env.FAL_KEY) {
      console.error("❌ FAL_KEY not found in environment variables");
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 },
      );
    }

    console.log("🔑 FAL_KEY status: Set");

    // 🎯 FASHION PRESET: Select random fashion-optimized prompt
    const selectedPrompt =
      FASHION_PROMPTS[Math.floor(Math.random() * FASHION_PROMPTS.length)];

    const options: SeedanceVideoOptions = {
      prompt: selectedPrompt,
      resolution: "1080p",
      duration: "5",
      camera_fixed: formData.get("camera_fixed") === "true" || false,
      seed: formData.get("seed")
        ? parseInt(formData.get("seed") as string)
        : undefined,
    };

    console.log("Starting Fashion Showcase video generation...");
    console.log(`🎯 FASHION PRESET: "${options.prompt}"`);
    console.log(`Image to process: ${imageUrl}`);

    const isAccessible = await testImageUrl(imageUrl);
    if (!isAccessible) {
      console.error("❌ Image URL is not accessible");
      return NextResponse.json(
        { error: "Image URL is not accessible" },
        { status: 400 },
      );
    }

    console.log("Submitting request to FAL AI Seedance Video...");

    const falParams: any = {
      prompt: options.prompt,
      image_url: imageUrl,
      resolution: options.resolution,
      duration: options.duration,
      camera_fixed: options.camera_fixed,
    };

    if (options.seed !== undefined) {
      falParams.seed = options.seed;
    }

    console.log(
      `Arguments: prompt="${options.prompt}", resolution=${options.resolution}, duration=${options.duration}s, camera_fixed=${options.camera_fixed}`,
    );

    const result = await fal.subscribe(
      "fal-ai/bytedance/seedance/v1/pro/image-to-video",
      {
        input: falParams,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            console.log("Fashion showcase video generation in progress...");
            update.logs?.map((log) => log.message).forEach(console.log);
          }
        },
      },
    );

    console.log("Fashion showcase video generation completed successfully!");
    console.log("Raw result:", result);

    if (!result.data || !result.data.video || !result.data.video.url) {
      console.error("❌ No video returned from FAL AI");
      return NextResponse.json(
        { error: "No video returned from FAL AI" },
        { status: 500 },
      );
    }

    const outputVideoUrl = result.data.video.url;
    console.log(`Fashion showcase video generation completed!`);
    console.log(`Generated video URL: ${outputVideoUrl}`);

    console.log(
      "🔄 Uploading video to Firebase Storage for permanent storage...",
    );

    try {
      const firebaseVideoUrl = await saveOutputVideoToFirebase(
        outputVideoUrl,
        userid,
        "/api/seedancevideo-fashion",
      );

      console.log("✅ Video uploaded to Firebase Storage successfully!");

      const response: SeedanceVideoResponse = {
        status: "success",
        videoUrl: firebaseVideoUrl,
        seed: result.data.seed,
      };

      return NextResponse.json(response);
    } catch (uploadError) {
      console.error(
        "❌ Video upload to Firebase failed, using original URL:",
        uploadError,
      );

      const response: SeedanceVideoResponse = {
        status: "success",
        videoUrl: outputVideoUrl,
        seed: result.data.seed,
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error("❌ Fashion showcase video generation failed:", error);

    let errorMessage = "Internal server error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        status: "error",
      },
      { status: 500 },
    );
  }
}
