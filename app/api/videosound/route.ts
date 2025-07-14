import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

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
    const prompt = (formData.get("prompt") as string) || "";
    const originalSoundSwitch =
      formData.get("original_sound_switch") === "true";

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

    console.log("Starting video sound effects generation...");
    console.log(
      `Parameters: video_url="${videoUrl}", prompt="${prompt}", original_sound_switch=${originalSoundSwitch}`,
    );
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

    console.log("Submitting request to FAL AI Pixverse Sound Effects...");
    console.log(
      `Arguments: video_url="${videoUrl}", prompt="${prompt}", original_sound_switch=${originalSoundSwitch}`,
    );

    // Submit to fal.ai pixverse sound effects
    const result = await fal.subscribe("fal-ai/pixverse/sound-effects", {
      input: {
        video_url: videoUrl,
        prompt: prompt,
        original_sound_switch: originalSoundSwitch,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Video sound effects generation in progress...");
          if (update.logs) {
            update.logs.map((log: any) => log.message).forEach(console.log);
          }
        }
      },
    });

    console.log("✅ Video sound effects generation completed successfully");
    console.log("📹 Video with sound effects URL:", result.data.video?.url);

    return NextResponse.json({
      success: true,
      video_url: result.data.video?.url,
      video: result.data.video,
      request_id: result.requestId,
      prompt: prompt,
      original_sound_switch: originalSoundSwitch,
      original_video_url: videoUrl,
      // Multi-step usage support
      can_continue: true,
      next_steps: {
        upscale_video: {
          endpoint: "/api/videoupscaler",
          description: "Upscale the video with sound effects",
          params: { video_url: result.data.video?.url },
        },
        reframe_video: {
          endpoint: "/api/videoreframe",
          description: "Reframe the video with sound effects",
          params: { video_url: result.data.video?.url },
        },
        outpaint_video: {
          endpoint: "/api/videooutpainting",
          description: "Extend the video with sound effects",
          params: { video_url: result.data.video?.url },
        },
      },
    });
  } catch (error) {
    console.error("❌ Video sound effects generation failed:", error);

    let errorMessage = "Video sound effects generation failed";
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
