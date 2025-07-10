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

interface VideoOutpaintingOptions {
  prompt?: string;
  negative_prompt?: string;
  video_url: string;
  expand_left?: boolean;
  expand_right?: boolean;
  expand_top?: boolean;
  expand_bottom?: boolean;
  expand_ratio: number;
  resolution: "480p" | "580p" | "720p";
  aspect_ratio: "auto" | "16:9" | "1:1" | "9:16";
  num_frames: number;
  frames_per_second: number;
  match_input_num_frames?: boolean;
  match_input_frames_per_second?: boolean;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number;
  enable_safety_checker?: boolean;
  enable_prompt_expansion?: boolean;
  acceleration?: "none" | "regular";
}

interface VideoOutpaintingResponse {
  status: string;
  videoUrl?: string; // Firebase Storage URL (permanent) with FAL AI URL fallback
  prompt?: string;
  seed?: number;
  error?: string;
  next_steps?: string[];
}

// 🔧 VIDEO FIREBASE STORAGE FUNCTIONS
/**
 * Uploads a video file to Firebase Storage
 */
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

    // Get Firebase Storage bucket
    const bucket = getStorage().bucket();

    // Create storage path: userid/output
    const folder = isOutput ? "output" : "input";
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name.replace(/\.[^/.]+$/, ".mp4")}`;
    const filePath = `${userid}/${folder}/${fileName}`;

    // Create file reference
    const fileRef = bucket.file(filePath);

    // Upload the file
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

    // Make the file publicly accessible
    await fileRef.makePublic();

    // Get the public URL
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

      // Upload to Firebase Storage in the output folder
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

    // Extract and validate numeric parameters
    const expandRatioStr = formData.get("expand_ratio") as string;
    let expandRatio = expandRatioStr ? parseFloat(expandRatioStr) : 0.25;
    if (isNaN(expandRatio)) expandRatio = 0.25;

    const numFramesStr = formData.get("num_frames") as string;
    let numFrames = numFramesStr ? parseInt(numFramesStr) : 81;
    if (isNaN(numFrames)) numFrames = 81;

    const fpsStr = formData.get("frames_per_second") as string;
    let framesPerSecond = fpsStr ? parseInt(fpsStr) : 16;
    if (isNaN(framesPerSecond)) framesPerSecond = 16;

    const inferenceStepsStr = formData.get("num_inference_steps") as string;
    let inferenceSteps = inferenceStepsStr ? parseInt(inferenceStepsStr) : 30;
    if (isNaN(inferenceSteps)) inferenceSteps = 30;

    const guidanceScaleStr = formData.get("guidance_scale") as string;
    let guidanceScale = guidanceScaleStr ? parseFloat(guidanceScaleStr) : 5.0;
    if (isNaN(guidanceScale)) guidanceScale = 5.0;

    // Extract optional parameters with defaults
    const options: VideoOutpaintingOptions = {
      prompt:
        (formData.get("prompt") as string) ||
        "Extend the scene beyond the current video frame while preserving the visual style, perspective, lighting, motion consistency, and semantic context. Seamlessly continue the environment, objects, and background elements in a natural and coherent way as if the frame were wider or taller. Do not add new elements that are inconsistent with the original content.",
      negative_prompt:
        (formData.get("negative_prompt") as string) ||
        "letterboxing, borders, black bars, bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
      video_url: videoUrl,
      expand_left: formData.get("expand_left") === "true" || false,
      expand_right: formData.get("expand_right") === "true" || false,
      expand_top: formData.get("expand_top") === "true" || false,
      expand_bottom: formData.get("expand_bottom") === "true" || false,
      expand_ratio: expandRatio,
      resolution:
        (formData.get("resolution") as "480p" | "580p" | "720p") || "720p",
      aspect_ratio:
        (formData.get("aspect_ratio") as "auto" | "16:9" | "1:1" | "9:16") ||
        "auto",
      num_frames: numFrames,
      frames_per_second: framesPerSecond,
      match_input_num_frames:
        formData.get("match_input_num_frames") === "true" || false,
      match_input_frames_per_second:
        formData.get("match_input_frames_per_second") === "true" || false,
      num_inference_steps: inferenceSteps,
      guidance_scale: guidanceScale,
      seed: formData.get("seed")
        ? parseInt(formData.get("seed") as string)
        : undefined,
      enable_safety_checker:
        formData.get("enable_safety_checker") === "true" || false,
      enable_prompt_expansion:
        formData.get("enable_prompt_expansion") === "true" || false,
      acceleration:
        (formData.get("acceleration") as "none" | "regular") || undefined,
    };

    // Validate expand_ratio
    if (options.expand_ratio < 0 || options.expand_ratio > 1) {
      return NextResponse.json(
        { error: "expand_ratio must be between 0 and 1" },
        { status: 400 },
      );
    }

    // Validate num_frames
    if (options.num_frames < 81 || options.num_frames > 241) {
      return NextResponse.json(
        { error: "num_frames must be between 81 and 241" },
        { status: 400 },
      );
    }

    // Validate frames_per_second
    if (options.frames_per_second < 5 || options.frames_per_second > 30) {
      return NextResponse.json(
        { error: "frames_per_second must be between 5 and 30" },
        { status: 400 },
      );
    }

    // Check if at least one expansion direction is enabled
    if (
      !options.expand_left &&
      !options.expand_right &&
      !options.expand_top &&
      !options.expand_bottom
    ) {
      // Default to expanding all directions if none specified
      options.expand_left = true;
      options.expand_right = true;
      options.expand_top = true;
      options.expand_bottom = true;
    }

    console.log("Starting video outpainting...");
    console.log(
      `Parameters: prompt="${options.prompt}", expand_ratio=${options.expand_ratio}, resolution=${options.resolution}, aspect_ratio=${options.aspect_ratio}`,
    );
    console.log(
      `Expansion: left=${options.expand_left}, right=${options.expand_right}, top=${options.expand_top}, bottom=${options.expand_bottom}`,
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

    console.log("Submitting request to FAL AI Video Outpainting...");

    // Prepare FAL AI request parameters
    const falParams: any = {
      prompt: options.prompt,
      negative_prompt: options.negative_prompt,
      video_url: options.video_url,
      expand_left: options.expand_left,
      expand_right: options.expand_right,
      expand_top: options.expand_top,
      expand_bottom: options.expand_bottom,
      expand_ratio: options.expand_ratio,
      resolution: options.resolution,
      aspect_ratio: options.aspect_ratio,
      num_frames: options.num_frames,
      frames_per_second: options.frames_per_second,
      match_input_num_frames: options.match_input_num_frames,
      match_input_frames_per_second: options.match_input_frames_per_second,
      num_inference_steps: options.num_inference_steps,
      guidance_scale: options.guidance_scale,
      enable_safety_checker: options.enable_safety_checker,
      enable_prompt_expansion: options.enable_prompt_expansion,
    };

    // Only add optional parameters if provided
    if (options.seed !== undefined) {
      falParams.seed = options.seed;
    }
    if (options.acceleration !== undefined) {
      falParams.acceleration = options.acceleration;
    }

    console.log(
      `Arguments: expand_ratio=${options.expand_ratio}, resolution=${options.resolution}, aspect_ratio=${options.aspect_ratio}, num_frames=${options.num_frames}`,
    );

    const result = await fal.subscribe("fal-ai/wan-vace-14b/outpainting", {
      input: falParams,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Video outpainting in progress...");
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Video outpainting completed successfully!");
    console.log("Raw result:", result);

    if (!result.data || !result.data.video || !result.data.video.url) {
      console.error("❌ No video returned from FAL AI");
      return NextResponse.json(
        { error: "No video returned from FAL AI" },
        { status: 500 },
      );
    }

    const outputVideoUrl = result.data.video.url;
    console.log(`Video outpainting completed!`);
    console.log(`Generated video URL: ${outputVideoUrl}`);

    // 🔧 NEW: Upload video to Firebase Storage for permanent storage
    console.log(
      "🔄 Uploading video to Firebase Storage for permanent storage...",
    );

    try {
      const firebaseVideoUrl = await saveOutputVideoToFirebase(
        outputVideoUrl,
        userid,
        "/api/videooutpainting",
      );

      console.log("✅ Video uploaded to Firebase Storage successfully!");

      // Generate next steps suggestions
      const nextSteps = [
        "Use '/api/upscale' to enhance video quality",
        "Apply '/api/videoreframe' to change aspect ratio",
        "Try '/api/timeofday' for lighting adjustments",
        "Use '/api/scenecomposition' for scene modifications",
      ];

      const response: VideoOutpaintingResponse = {
        status: "success",
        videoUrl: firebaseVideoUrl, // Firebase Storage URL (permanent)
        prompt: result.data.prompt,
        seed: result.data.seed,
        next_steps: nextSteps,
      };

      return NextResponse.json(response);
    } catch (uploadError) {
      console.error(
        "❌ Video upload to Firebase failed, using original URL:",
        uploadError,
      );

      // Fallback to original FAL AI URL if Firebase upload fails
      const response: VideoOutpaintingResponse = {
        status: "success",
        videoUrl: outputVideoUrl, // Fallback to FAL AI URL
        prompt: result.data.prompt,
        seed: result.data.seed,
        next_steps: [
          "Use '/api/upscale' to enhance video quality",
          "Apply '/api/videoreframe' to change aspect ratio",
          "Try '/api/timeofday' for lighting adjustments",
          "Use '/api/scenecomposition' for scene modifications",
        ],
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error("❌ Video outpainting failed:", error);

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
