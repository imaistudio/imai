import { NextResponse } from "next/server";
import { falQueue, queuedAPICall } from "@/lib/request-queue";
import { falAILimiter } from "@/lib/rate-limiter";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    // Log the API key status (without exposing the actual key)
    console.log("FAL_API_KEY:", process.env.FAL_API_KEY ? "Set" : "Not Set");

    const body = await request.json();
    const {
      imageUrl,
      prompt,
      upscaleFactor,
      negativePrompt,
      creativity,
      resemblance,
      guidanceScale,
      numInferenceSteps,
      enableSafetyChecker,
    } = body;

    if (!imageUrl) {
      throw new Error("No image URL provided");
    }

    // Check rate limit before making API call
    const rateLimitCheck = await falAILimiter.checkLimit("clarityupscaler");
    if (!rateLimitCheck.allowed) {
      console.log(
        `⚠️ Rate limit hit for clarityupscaler. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`,
      );
    }

    // Use queued API call to handle rate limits and retries
    const result = await queuedAPICall(
      falQueue,
      async () => {
        console.log("🚀 Executing FAL AI clarity upscaler request");

        // Submit the request to FAL AI
        const response = await fetch(
          "https://110602490-clarity-upscaler.gateway.alpha.fal.ai",
          {
            method: "POST",
            headers: {
              Authorization: `Key ${process.env.FAL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image_url: imageUrl,
              prompt: prompt || "masterpiece, best quality, highres",
              upscale_factor: upscaleFactor || 2,
              negative_prompt:
                negativePrompt ||
                "(worst quality, low quality, normal quality:2)",
              creativity: creativity || 0.35,
              resemblance: resemblance || 0.6,
              guidance_scale: guidanceScale || 4,
              num_inference_steps: numInferenceSteps || 18,
              enable_safety_checker:
                enableSafetyChecker !== undefined ? enableSafetyChecker : true,
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.error("FAL AI API error response:", errorData);
          throw new Error(
            errorData?.error || `FAL AI API error: ${response.statusText}`,
          );
        }

        return await response.json();
      },
      "Image clarity enhancement is temporarily delayed due to high demand. Please wait...",
    );
    console.log("FAL AI API response:", result);

    if (!result || !result.image || !result.image.url) {
      throw new Error("No image URL in result");
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.image.url,
    });
  } catch (error: any) {
    console.error("Error in clarity upscaler:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to upscale image",
      },
      { status: 500 },
    );
  }
}
