import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

/**
 * Resize image if it's too large for OpenAI's vision API
 * (Borrowed from design API)
 */
async function resizeImageIfNeeded(imageUrl: string): Promise<string> {
  try {
    // Fetch the image to check its size
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to fetch image for size check: ${response.statusText}`
      );
      return imageUrl; // Return original URL if we can't fetch
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if image is larger than 20MB (OpenAI's limit)
    const sizeMB = buffer.length / (1024 * 1024);
    console.log(`📏 Image size: ${sizeMB.toFixed(2)}MB`);

    if (sizeMB <= 20) {
      return imageUrl; // Image is fine as-is
    }

    console.log(`🔧 Image too large (${sizeMB.toFixed(2)}MB), resizing...`);

    // Use sharp to resize the image if available, otherwise return original
    try {
      const sharp = require("sharp");

      // Resize to max 2048x2048 while maintaining aspect ratio
      const resizedBuffer = await sharp(buffer)
        .resize(2048, 2048, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Convert to base64 data URL
      const base64 = resizedBuffer.toString("base64");
      const resizedUrl = `data:image/jpeg;base64,${base64}`;

      console.log(
        `✅ Image resized from ${sizeMB.toFixed(2)}MB to ${(resizedBuffer.length / (1024 * 1024)).toFixed(2)}MB`
      );
      return resizedUrl;
    } catch (sharpError) {
      console.warn(
        "Sharp not available or failed, using original image:",
        sharpError
      );
      return imageUrl;
    }
  } catch (error) {
    console.error("Error checking/resizing image:", error);
    return imageUrl; // Return original URL on error
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
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

    // 🎯 NEW: Check for image_url parameter first (URL-based approach)
    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    let imageInput: any;

    if (imageUrl) {
      // URL-based approach - resize large images for OpenAI limits
      console.log("🔗 Using provided image URL for analysis:", imageUrl);
      const resizedUrl = await resizeImageIfNeeded(imageUrl);
      console.log("🔧 Processed image URL:", resizedUrl);
      imageInput = {
        type: "image_url",
        image_url: {
          url: resizedUrl,
        },
      };
    } else {
      // Fallback: base64 approach (backward compatibility)
      const base64Image = formData.get("base64Image") as string | null;
      if (!base64Image) {
        return NextResponse.json(
          {
            status: "error",
            error: 'Either "image_url" or "base64Image" is required',
          },
          { status: 400 }
        );
      }

      console.log("📁 Using base64 approach for analysis");
      imageInput = {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
        },
      };
    }

    console.log("🔍 Starting image analysis with OpenAI GPT-4 Vision...");

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze the design elements in this image. Focus on: colors, shapes, patterns, textures, and composition. Do not mention specific objects or types. Format the response as a JSON object with these categories.",
            },
            imageInput,
          ],
        },
      ],
      max_tokens: 500,
    });

    const analysis = response.choices[0]?.message?.content || "{}";
    console.log("✅ Image analysis completed");

    try {
      const result = JSON.parse(analysis);
      return NextResponse.json({ status: "success", result });
    } catch (err) {
      return NextResponse.json({
        status: "success",
        result: { raw_analysis: analysis },
      });
    }
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { status: "error", error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
