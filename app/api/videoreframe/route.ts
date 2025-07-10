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

console.log("🔥 Firebase initialized - using Firebase Storage for video handling");

fal.config({
  credentials: process.env.FAL_KEY,
});

interface VideoReframeOptions {
  prompt?: string;
  aspect_ratio?: "auto" | "16:9" | "1:1" | "9:16";
  resolution?: "480p" | "580p" | "720p";
  zoom_factor?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
}

interface VideoReframeResponse {
  status: string;
  videoUrl?: string; // Firebase Storage URL (permanent) with FAL AI URL fallback
  seed?: number;
  prompt?: string;
  error?: string;
  can_continue?: boolean;
  next_steps?: {
    further_reframe?: {
      endpoint: string;
      description: string;
      params: any;
    };
    upscale_video?: {
      endpoint: string;
      description: string;
      params: any;
    };
    generate_motion?: {
      endpoint: string;
      description: string;
      params: any;
    };
  };
}

/**
 * Downloads a video from FAL AI URL and uploads it to Firebase Storage
 */
async function saveOutputVideoToFirebase(
  videoUrl: string,
  userid: string,
  endpoint: string,
): Promise<string> {
  try {
    console.log(
      `💾 Saving output video to Firebase Storage for user ${userid}...`,
    );

    // Add timeout for large video files (10 minutes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

    try {
      // Fetch the video from the URL with timeout
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

      // Check content length before processing
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`📏 Video size: ${sizeInMB.toFixed(2)}MB`);

        // For very large files (>100MB), skip Firebase upload and use original URL
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

      // Upload to Firebase Storage
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Get Firebase Storage bucket
      const bucket = getStorage().bucket();

      // Create storage path: userid/output
      const timestamp = Date.now();
      const filePath = `${userid}/output/${timestamp}_${fileName}`;

      // Create file reference
      const fileRef = bucket.file(filePath);

      // Upload the file
      await fileRef.save(buffer, {
        metadata: {
          contentType: "video/mp4",
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalName: fileName,
            userId: userid,
            folder: "output",
          },
        },
      });

      // Make the file publicly accessible
      await fileRef.makePublic();

      // Get the public URL
      const firebaseUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

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
    // Return original URL as fallback
    console.log(`🔄 Using original URL as fallback: ${videoUrl}`);
    return videoUrl;
  }
}

/**
 * Tests if a video URL is accessible
 */
async function testVideoUrl(videoUrl: string): Promise<boolean> {
  try {
    console.log("🔍 Testing video URL accessibility...");
    const response = await fetch(videoUrl, { method: "HEAD" });
    console.log(`📡 Video URL test: ${response.status} ${response.statusText}`);
    console.log(`📄 Content-Type: ${response.headers.get("content-type")}`);
    console.log(`📏 Content-Length: ${response.headers.get("content-length")}`);
    return response.ok;
  } catch (error) {
    console.error("❌ Video URL test failed:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoUrl = formData.get("video_url") as string;
    const userid = formData.get("userid") as string;

    // Validate required parameters
    if (!videoUrl) {
      return NextResponse.json(
        { error: "Missing video_url parameter" },
        { status: 400 },
      );
    }

    if (!userid) {
      return NextResponse.json(
        { error: "Missing userid parameter" },
        { status: 400 },
      );
    }

    // Check if FAL_KEY is available
    if (!process.env.FAL_KEY) {
      console.error("❌ FAL_KEY not found in environment variables");
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 },
      );
    }

    console.log("🔑 FAL_KEY status: Set");

    // Extract optional parameters with optimized defaults
    const options: VideoReframeOptions = {
      prompt: (formData.get("prompt") as string) || "",
      aspect_ratio: (formData.get("aspect_ratio") as "auto" | "16:9" | "1:1" | "9:16") || "auto",
      resolution: (formData.get("resolution") as "480p" | "580p" | "720p") || "720p", // Highest quality
      zoom_factor: formData.get("zoom_factor") ? parseFloat(formData.get("zoom_factor") as string) : 0,
      num_inference_steps: formData.get("num_inference_steps") ? parseInt(formData.get("num_inference_steps") as string) : 30,
      guidance_scale: formData.get("guidance_scale") ? parseFloat(formData.get("guidance_scale") as string) : 5,
      seed: formData.get("seed") ? parseInt(formData.get("seed") as string) : undefined,
    };

    console.log("Starting video reframing...");
    console.log(
      `Parameters: prompt="${options.prompt}", aspect_ratio=${options.aspect_ratio}, resolution=${options.resolution}, zoom_factor=${options.zoom_factor}`,
    );
    console.log(`Video to process: ${videoUrl}`);

    // Test video URL accessibility
    const isAccessible = await testVideoUrl(videoUrl);
    if (!isAccessible) {
      console.error("❌ Video URL is not accessible");
      return NextResponse.json(
        { error: "Video URL is not accessible" },
        { status: 400 },
      );
    }

    console.log("Submitting request to FAL AI Video Reframe...");

    // Prepare FAL AI request parameters with optimal defaults
    const falParams: any = {
      video_url: videoUrl,
      prompt: options.prompt,
      aspect_ratio: options.aspect_ratio,
      resolution: options.resolution,
      zoom_factor: options.zoom_factor,
      num_inference_steps: options.num_inference_steps,
      guidance_scale: options.guidance_scale,
      // Optimized defaults for best quality
      match_input_num_frames: true,
      match_input_frames_per_second: true,
      enable_safety_checker: false,
      enable_prompt_expansion: false,
      acceleration: "regular", // Faster processing
      temporal_downsample_factor: 0,
      interpolator_model: "film",
    };

    // Only add seed if provided
    if (options.seed !== undefined) {
      falParams.seed = options.seed;
    }

    console.log(
      `Arguments: aspect_ratio=${options.aspect_ratio}, resolution=${options.resolution}, zoom_factor=${options.zoom_factor}`,
    );

    const result = await fal.subscribe("fal-ai/wan-vace-14b/reframe", {
      input: falParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Video reframing in progress...");
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Video reframing completed successfully!");
    console.log("Raw result:", result);

    if (!result.data || !result.data.video || !result.data.video.url) {
      console.error("❌ No video returned from FAL AI");
      return NextResponse.json(
        { error: "No video returned from FAL AI" },
        { status: 500 },
      );
    }

    const outputVideoUrl = result.data.video.url;
    console.log(`Video reframing completed!`);
    console.log(`Reframed video URL: ${outputVideoUrl}`);

    // 🔧 NEW: Upload video to Firebase Storage for permanent storage
    console.log(
      "🔄 Uploading video to Firebase Storage for permanent storage...",
    );

    try {
      const firebaseVideoUrl = await saveOutputVideoToFirebase(
        outputVideoUrl,
        userid,
        "/api/videoreframe",
      );

      console.log("✅ Video uploaded to Firebase Storage successfully!");

      const response: VideoReframeResponse = {
        status: "success",
        videoUrl: firebaseVideoUrl, // Firebase Storage URL (permanent)
        seed: result.data.seed,
        prompt: result.data.prompt,
        // Multi-step usage support
        can_continue: true,
        next_steps: {
          further_reframe: {
            endpoint: "/api/videoreframe",
            description: "Apply additional reframing",
            params: { video_url: firebaseVideoUrl, aspect_ratio: "16:9 | 1:1 | 9:16" }
          },
          upscale_video: {
            endpoint: "/api/videoupscaler",
            description: "Upscale reframed video quality",
            params: { video_url: firebaseVideoUrl }
          },
          generate_motion: {
            endpoint: "/api/seedancevideo",
            description: "Add motion to reframed video frames",
            params: { image_url: "Extract frame first", prompt: "motion prompt" }
          }
        }
      };

      return NextResponse.json(response);
    } catch (uploadError) {
      console.error(
        "❌ Video upload to Firebase failed, using original URL:",
        uploadError,
      );

      // Fallback to original FAL AI URL if Firebase upload fails
      const response: VideoReframeResponse = {
        status: "success",
        videoUrl: outputVideoUrl, // Fallback to FAL AI URL
        seed: result.data.seed,
        prompt: result.data.prompt,
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error("❌ Video reframing failed:", error);

    let errorMessage = "Video reframing failed";
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      // Handle specific fal.ai errors
      if (error.message.includes("Invalid video URL") || error.message.includes("not accessible")) {
        statusCode = 400;
      } else if (error.message.includes("quota") || error.message.includes("limit")) {
        statusCode = 429;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
        status: "error",
      },
      { status: statusCode },
    );
  }
} 