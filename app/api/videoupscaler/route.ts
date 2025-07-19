import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { falQueue, queuedAPICall } from "@/lib/request-queue";
import { falAILimiter } from "@/lib/rate-limiter";

// Set maximum function duration to 300 seconds (5 minutes) for video processing
export const maxDuration = 300;

console.log(
  "🔥 Firebase initialized - using Firebase Storage for video handling",
);

fal.config({
  credentials: process.env.FAL_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Extract parameters
    const videoUrl = formData.get("video_url") as string;
    const scale = 4; // Fixed 4x upscaling

    console.log("🔑 FAL_KEY status:", process.env.FAL_KEY ? "Set" : "Missing");

    if (!process.env.FAL_KEY) {
      throw new Error("FAL_KEY environment variable is not set");
    }

    if (!videoUrl) {
      return NextResponse.json(
        { error: "video_url parameter is required" },
        { status: 400 },
      );
    }

    console.log("Starting video upscaling...");
    console.log(`Parameters: video_url="${videoUrl}", scale=${scale}`);
    console.log(`Video to process: ${videoUrl}`);

    // Test video URL accessibility
    console.log("🔍 Testing video URL accessibility...");
    try {
      const testResponse = await fetch(videoUrl, { method: "HEAD" });
      console.log(
        `📡 Video URL test: ${testResponse.status} ${testResponse.statusText}`,
      );
      if (testResponse.headers.get("content-type")) {
        console.log(
          `📄 Content-Type: ${testResponse.headers.get("content-type")}`,
        );
      }
      if (testResponse.headers.get("content-length")) {
        console.log(
          `📏 Content-Length: ${testResponse.headers.get("content-length")}`,
        );
      }
    } catch (testError) {
      console.error("❌ Video URL accessibility test failed:", testError);
      return NextResponse.json(
        { error: "Video URL is not accessible" },
        { status: 400 },
      );
    }

    console.log("Submitting request to FAL AI Video Upscaler...");
    console.log(`Arguments: video_url="${videoUrl}", scale=${scale}`);

    // Check rate limit before making API call
    const rateLimitCheck = await falAILimiter.checkLimit('videoupscaler');
    if (!rateLimitCheck.allowed) {
      console.log(`⚠️ Rate limit hit for videoupscaler. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`);
    }

    // Use queued API call to handle rate limits and retries
    const result = await queuedAPICall(
      falQueue,
      async () => {
        console.log("🚀 Executing FAL AI video upscaler request");
        return await fal.subscribe("fal-ai/video-upscaler", {
          input: {
            video_url: videoUrl,
            scale: scale,
          },
          logs: true,
          onQueueUpdate: (update: any) => {
            if (update.status === "IN_PROGRESS") {
              console.log("Video upscaling in progress...");
              if (update.logs) {
                update.logs.map((log: any) => log.message).forEach(console.log);
              }
            }
          },
        });
      },
      "Video upscaling is temporarily delayed due to high demand. Please wait..."
    );

    console.log("✅ Video upscaling completed successfully");
    console.log("📹 Upscaled video URL:", result.data.video?.url);

    return NextResponse.json({
      success: true,
      video_url: result.data.video?.url,
      video: result.data.video,
      request_id: result.requestId,
      scale_factor: scale,
      original_video_url: videoUrl,
      // Multi-step usage support
      can_continue: true,
      next_steps: {
        further_upscale: {
          endpoint: "/api/videoupscaler",
          description: "Apply additional 4x upscaling",
          params: { video_url: result.data.video?.url },
        },
        generate_motion: {
          endpoint: "/api/seedancevideo",
          description: "Add motion to upscaled video",
          params: { image_url: "Extract frame first", prompt: "motion prompt" },
        },
      },
    });
  } catch (error) {
    console.error("❌ Video upscaling failed:", error);

    let errorMessage = "Video upscaling failed";
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      // Handle specific fal.ai errors
      if (
        error.message.includes("Invalid video URL") ||
        error.message.includes("not accessible")
      ) {
        statusCode = 400;
      } else if (
        error.message.includes("quota") ||
        error.message.includes("limit")
      ) {
        statusCode = 429;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: statusCode },
    );
  }
}
