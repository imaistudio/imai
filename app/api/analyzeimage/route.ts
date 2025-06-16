import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

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
      // URL-based approach - use the provided Cloudinary URL directly
      console.log("🔗 Using provided image URL for analysis:", imageUrl);
      imageInput = {
        type: "image_url",
        image_url: {
          url: imageUrl,
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
