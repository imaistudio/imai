import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface MirrorMagicOptions {
  prompt?: string;
  workflow?: "remix" | "black_mirror" | "standard";
  size?: string;
  quality?: string;
  n?: number;
}

interface MirrorMagicResponse {
  status: string;
  output_image?: string;
  analysis?: string;
  enhanced_prompt?: string;
  workflow_used?: string;
  note?: string;
  error?: string;
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(
  buffer: Buffer,
  mimeType: string = "image/png"
): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function analyzeImageWithGPT4Vision(imageUrl: string): Promise<string> {
  try {
    console.log("[DEBUG] Analyzing image with GPT-4 Vision...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image in detail. Describe the subject, composition, style, colors, mood, and any notable elements. Be descriptive and creative in your analysis.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const analysis =
      response.choices[0]?.message?.content || "Unable to analyze image";
    console.log("[DEBUG] GPT-4 Vision analysis completed");
    return analysis;
  } catch (error) {
    console.error("[DEBUG] Error in GPT-4 Vision analysis:", error);
    throw new Error("Failed to analyze image with GPT-4 Vision");
  }
}

async function enhancePromptWithClaude(
  analysis: string,
  userPrompt?: string
): Promise<string> {
  try {
    console.log("[DEBUG] Enhancing prompt with Claude...");

    const promptText = userPrompt
      ? `Based on this image analysis: "${analysis}" and this user prompt: "${userPrompt}", create an enhanced, creative prompt for image generation that combines both elements.`
      : `Based on this image analysis: "${analysis}", create an enhanced, creative prompt for image generation that captures the essence and reimagines it in a unique way.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: promptText,
        },
      ],
    });

    const enhancedPrompt =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "Unable to enhance prompt";

    console.log("[DEBUG] Claude prompt enhancement completed");
    return enhancedPrompt;
  } catch (error) {
    console.error("[DEBUG] Error in Claude prompt enhancement:", error);
    throw new Error("Failed to enhance prompt with Claude");
  }
}

async function generateImageWithDALLE(
  prompt: string,
  options: { size?: string; quality?: string; n?: number } = {}
): Promise<string[]> {
  try {
    console.log("[DEBUG] Generating image with DALL-E...");
    console.log("[DEBUG] Prompt:", prompt);
    console.log("[DEBUG] Options:", options);

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      size: (options.size as any) || "1024x1024",
      quality: (options.quality as any) || "high",
      n: options.n || 1,
    });

    console.log(
      "[DEBUG] Raw OpenAI response:",
      JSON.stringify(response, null, 2)
    );

    if (!response.data) {
      throw new Error("No data received from DALL-E API");
    }

    console.log("[DEBUG] DALL-E response data length:", response.data.length);

    const imageUrls: string[] = [];
    for (const img of response.data) {
      console.log("[DEBUG] Processing image data:", img);
      if (img.url) {
        imageUrls.push(img.url);
      } else if (img.b64_json) {
        imageUrls.push(`data:image/png;base64,${img.b64_json}`);
      }
    }

    console.log("[DEBUG] Extracted image URLs count:", imageUrls.length);
    console.log("[DEBUG] DALL-E image generation completed");
    return imageUrls;
  } catch (error) {
    console.error("[DEBUG] Error in DALL-E image generation:", error);
    console.error(
      "[DEBUG] Full error details:",
      JSON.stringify(error, null, 2)
    );
    throw new Error("Failed to generate image with DALL-E");
  }
}

async function editImageWithDALLE(
  imageUrl: string,
  prompt: string,
  options: { size?: string; n?: number } = {}
): Promise<string[]> {
  try {
    console.log("[DEBUG] Editing image with DALL-E...");

    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    const imageFile = new File([imageBuffer], "input.png", {
      type: "image/png",
    });

    const editResponse = await openai.images.edit({
      image: imageFile,
      prompt: prompt,
      size: (options.size as any) || "1024x1024",
      n: options.n || 1,
    });

    if (!editResponse.data) {
      throw new Error("No data received from DALL-E edit API");
    }

    const imageUrls = editResponse.data
      .map((img) => img.url)
      .filter(Boolean) as string[];
    console.log("[DEBUG] DALL-E image editing completed");
    return imageUrls;
  } catch (error) {
    console.error("[DEBUG] Error in DALL-E image editing:", error);
    throw new Error("Failed to edit image with DALL-E");
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

    // Test mode for DALL-E
    const testMode = formData.get("test") as string;
    if (testMode === "dalle") {
      console.log("[DEBUG] Running DALL-E test mode...");
      try {
        const testPrompt = "A simple red apple on a white background";
        const testResult = await generateImageWithDALLE(testPrompt, {
          size: "1024x1024",
          quality: "high",
          n: 1,
        });
        return NextResponse.json({
          status: "test_success",
          message: "DALL-E test completed",
          imageCount: testResult.length,
          firstImagePreview: testResult[0]?.substring(0, 100) + "...",
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            status: "test_failed",
            error: error.message,
            details: error.toString(),
          },
          { status: 500 }
        );
      }
    }

    // 🎯 NEW: URL-first approach (from intentroute)
    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    if (!imageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error:
            'Missing "image_url" parameter. This endpoint expects to be called through intentroute.',
        },
        { status: 400 }
      );
    }

    const prompt = (formData.get("prompt") as string) || undefined;
    const workflow = (formData.get("workflow") as string) || "standard";
    const size = (formData.get("size") as string) || "1024x1024";
    const quality = (formData.get("quality") as string) || "high";
    const n = parseInt(formData.get("n") as string) || 1;

    console.log("[DEBUG] Starting Mirror Magic workflow...");
    console.log(
      `[DEBUG] Parameters: workflow=${workflow}, prompt=${prompt}, size=${size}, quality=${quality}, n=${n}`
    );
    console.log(`[DEBUG] Image URL: ${imageUrl}`);

    // Analyze the input image
    const analysis = await analyzeImageWithGPT4Vision(imageUrl);

    // Enhance the prompt with Claude
    const enhancedPrompt = await enhancePromptWithClaude(analysis, prompt);

    let outputImageUrls: string[] = [];
    let note = "";

    // Generate output based on workflow
    if (workflow === "black_mirror") {
      outputImageUrls = await editImageWithDALLE(imageUrl, enhancedPrompt, {
        size,
        n,
      });
      note =
        "Black Mirror workflow: GPT-4 Vision → Claude → DALL-E image editing";
    } else {
      try {
        outputImageUrls = await generateImageWithDALLE(enhancedPrompt, {
          size,
          quality,
          n,
        });
      } catch (error) {
        console.log("[DEBUG] Enhanced prompt failed, trying simple prompt...");
        const simplePrompt =
          "A modern luxury handbag with clean lines and elegant design";
        outputImageUrls = await generateImageWithDALLE(simplePrompt, {
          size,
          quality,
          n,
        });
      }
      note = "Mirror Magic workflow: GPT-4 Vision → Claude → DALL-E generation";
    }

    if (!outputImageUrls.length) {
      throw new Error("No images were generated");
    }

    // Convert the output image to base64 for intentroute to handle
    let outputBase64: string;
    const firstOutputUrl = outputImageUrls[0];

    if (firstOutputUrl.startsWith("data:image")) {
      // Already base64
      outputBase64 = firstOutputUrl;
    } else {
      // Download and convert URL to base64
      const response = await fetch(firstOutputUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch generated image: ${response.statusText}`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      outputBase64 = bufferToBase64DataUrl(buffer);
    }

    const response: MirrorMagicResponse = {
      status: "success",
      output_image: outputBase64, // Base64 data URL for intentroute to handle
      analysis: analysis,
      enhanced_prompt: enhancedPrompt,
      workflow_used: workflow,
      note: note,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[DEBUG] API Error:", error);

    const response: MirrorMagicResponse = {
      status: "error",
      error: error.message || "Unknown error occurred",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Mirror Magic API is running",
    note: "This API is designed to work through intentroute for file handling",
    endpoints: {
      POST: {
        description:
          "Apply Mirror Magic workflow: analyze image with GPT-4 Vision, enhance prompt with Claude, generate new image with DALL-E",
        parameters: {
          userid: "string (required) - User ID from intentroute",
          image_url:
            "string (required) - Image URL from intentroute (Cloudinary)",
          prompt:
            "string (optional) - Additional prompt to guide the transformation",
          workflow:
            "string (optional) - Workflow type: standard, remix, black_mirror (default: standard)",
          size: "string (optional) - Output image size: 1024x1024, 1024x1792, 1792x1024 (default: 1024x1024)",
          quality:
            "string (optional) - Image quality: low, medium, high, auto (default: high)",
          n: "number (optional) - Number of images to generate (default: 1)",
        },
      },
    },
  });
}
