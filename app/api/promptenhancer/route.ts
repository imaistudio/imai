import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface PromptEnhancerResponse {
  status: string;
  original_prompt?: string;
  enhanced_prompt?: string;
  enhancement_type?: string;
  model_used?: string;
  tokens_used?: number;
  error?: string;
}
const enhancementCache = new Map<
  string,
  {
    enhanced_prompt: string;
    enhancement_type: string;
    tokens_used: number;
    timestamp: number;
  }
>();

setInterval(
  () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    Array.from(enhancementCache.entries()).forEach(([key, value]) => {
      if (value.timestamp < oneHourAgo) {
        enhancementCache.delete(key);
      }
    });
  },
  10 * 60 * 1000
);

async function enhancePromptWithClaude(
  originalPrompt: string,
  enhancementType: string = "design"
): Promise<{
  enhanced_prompt: string;
  tokens_used: number;
  detected_type: string;
}> {
  try {
    const inputWordCount = originalPrompt.trim().split(/\s+/).length;
    const targetWordCount = inputWordCount * 4;

    const systemPrompt = getSystemPromptForType(enhancementType);

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 512,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Enhance this ${inputWordCount}-word prompt to exactly ${targetWordCount} words (4x longer): "${originalPrompt}"`,
        },
      ],
    });

    const enhancedPrompt =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return {
      enhanced_prompt: enhancedPrompt,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      detected_type: enhancementType,
    };
  } catch (err) {
    console.error("Error enhancing prompt with Claude:", err);
    throw err;
  }
}

function getSystemPromptForType(enhancementType: string): string {
  switch (enhancementType) {
    case "design":
      return `Transform this into a detailed design prompt with EXACTLY the target word count specified. Include: materials, textures, colors, lighting setup, camera angles, composition, background, style, and professional photography details. Use specific technical terms but stay within the exact word limit.

Example: "modern chair" (2 words) → 8 words: "Sleek contemporary ergonomic chair with molded walnut wood construction, natural grain patterns, matte finish"`;

    case "product":
      return `Transform this into a detailed commercial product photography prompt with EXACTLY the target word count specified. Include: studio setup, lighting arrangement, camera specs, product positioning, background, materials, textures. Stay within the exact word limit.

Example: "phone case" (2 words) → 8 words: "Premium smartphone case in professional studio with seamless white background"`;

    case "artistic":
      return `Transform this into a detailed artistic prompt with EXACTLY the target word count specified. Include: art movement/style, brushwork technique, color palette, composition, lighting mood, emotional tone. Stay within the exact word limit.

Example: "sunset" (1 word) → 4 words: "Dramatic impressionistic sunset with warm colors"`;

    case "technical":
      return `Transform this into a detailed technical visualization prompt with EXACTLY the target word count specified. Include: CAD standards, line weights, dimensioning, materials, construction details, precision elements. Stay within the exact word limit.

Example: "blueprint" (1 word) → 4 words: "Architectural blueprint with precise CAD standards"`;

    default:
      return `Transform this prompt with EXACTLY the target word count specified. Include: materials, textures, colors, lighting, composition, camera settings, background, style. Stay within the exact word limit.`;
  }
}

function detectEnhancementType(
  prompt: string,
  hasProductImage?: boolean,
  hasDesignImage?: boolean,
  hasColorImage?: boolean
): string {
  if (hasProductImage) return "product";
  if (hasDesignImage) return "design";
  const lowerPrompt = prompt.toLowerCase();
  if (
    /\b(blueprint|technical|engineering|architectural|cad|schematic|diagram)\b/.test(
      lowerPrompt
    )
  ) {
    return "technical";
  }

  if (
    /\b(product|commercial|e-commerce|catalog|marketing|brand|retail)\b/.test(
      lowerPrompt
    )
  ) {
    return "product";
  }

  if (
    /\b(artistic|creative|abstract|painting|art|gallery|mood|dramatic|painterly)\b/.test(
      lowerPrompt
    )
  ) {
    return "artistic";
  }
  return "design";
}
function validateEnhancementType(type: string): boolean {
  const validTypes = ["design", "product", "artistic", "technical", "general"];
  return validTypes.includes(type);
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 }
      );
    }
    const originalPrompt = (formData.get("prompt") as string | null)?.trim();
    if (!originalPrompt) {
      return NextResponse.json(
        { status: "error", error: 'Missing "prompt" parameter' },
        { status: 400 }
      );
    }
    if (originalPrompt.length > 2000) {
      return NextResponse.json(
        {
          status: "error",
          error: "Prompt too long. Maximum 2000 characters allowed.",
        },
        { status: 400 }
      );
    }
    const hasProductImage =
      (formData.get("has_product_image") as string) === "true";
    const hasDesignImage =
      (formData.get("has_design_image") as string) === "true";
    const hasColorImage =
      (formData.get("has_color_image") as string) === "true";

    let enhancementType = formData.get("enhancement_type") as string | null;
    if (!enhancementType || !validateEnhancementType(enhancementType)) {
      enhancementType = detectEnhancementType(
        originalPrompt,
        hasProductImage,
        hasDesignImage,
        hasColorImage
      );
    }
    console.log(
      "🤖 Auto-detected enhancement type:",
      enhancementType,
      "for prompt:",
      originalPrompt.substring(0, 50) + "..."
    );

    const inputWordCount = originalPrompt.trim().split(/\s+/).length;
    const targetWordCount = inputWordCount * 4;
    console.log(`📊 Word count: ${inputWordCount} → ${targetWordCount} (4x)`);

    const cacheKey = `${enhancementType}:${inputWordCount}:${originalPrompt.trim()}`;
    const cachedResult = enhancementCache.get(cacheKey);

    if (cachedResult) {
      console.log("🚀 Returning cached enhancement result");
      const responsePayload: PromptEnhancerResponse = {
        status: "success",
        original_prompt: originalPrompt,
        enhanced_prompt: cachedResult.enhanced_prompt,
        enhancement_type: cachedResult.enhancement_type,
        model_used: "claude-3-5-sonnet-20241022",
        tokens_used: cachedResult.tokens_used,
      };
      return NextResponse.json(responsePayload);
    }

    const enhancementResult = await enhancePromptWithClaude(
      originalPrompt,
      enhancementType
    );

    enhancementCache.set(cacheKey, {
      enhanced_prompt: enhancementResult.enhanced_prompt,
      enhancement_type: enhancementResult.detected_type,
      tokens_used: enhancementResult.tokens_used,
      timestamp: Date.now(),
    });

    const responsePayload: PromptEnhancerResponse = {
      status: "success",
      original_prompt: originalPrompt,
      enhanced_prompt: enhancementResult.enhanced_prompt,
      enhancement_type: enhancementResult.detected_type,
      model_used: "claude-3-5-sonnet-20241022",
      tokens_used: enhancementResult.tokens_used,
    };

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("Prompt Enhancer API Error:", err);

    const errorResponse: PromptEnhancerResponse = {
      status: "error",
      error: err.message || "Unknown error occurred during prompt enhancement",
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const apiInfo = {
      status: "active",
      description:
        "Prompt Enhancer API using Claude 3.5 Sonnet with automatic enhancement type detection",
      model: "claude-3-5-sonnet-20241022",
      features: [
        "Automatic enhancement type detection based on prompt content",
        "Image context awareness for better enhancement decisions",
        "Keyword analysis for optimal enhancement strategy",
        "Fallback enhancement type selection",
      ],
      supported_enhancement_types: [
        {
          type: "design",
          description: "General design and product visualization enhancement",
          keywords:
            "design, modern, contemporary, sleek, elegant, sophisticated",
        },
        {
          type: "product",
          description: "Commercial product photography enhancement",
          keywords:
            "product, commercial, e-commerce, catalog, marketing, brand",
        },
        {
          type: "artistic",
          description: "Artistic and creative expression enhancement",
          keywords:
            "artistic, creative, abstract, expressive, painterly, stylized",
        },
        {
          type: "technical",
          description: "Technical and architectural visualization enhancement",
          keywords:
            "blueprint, technical, engineering, architectural, CAD, schematic",
        },
        {
          type: "general",
          description: "General purpose prompt enhancement (fallback)",
        },
      ],
      usage: {
        method: "POST",
        endpoint: "/api/prompt_enhancer",
        required_fields: ["userid", "prompt"],
        optional_fields: [
          "enhancement_type",
          "has_product_image",
          "has_design_image",
          "has_color_image",
        ],
        max_prompt_length: 2000,
        auto_detection: true,
        input_format: "FormData (sent from intent route)",
      },
      example_request: {
        userid: "user_id_from_intent_route",
        prompt: "a modern coffee mug",
        has_product_image: "false",
        has_design_image: "false",
        has_color_image: "false",
      },
      example_response: {
        status: "success",
        original_prompt: "a modern coffee mug",
        enhanced_prompt:
          "A sleek, contemporary ceramic coffee mug with clean geometric lines...",
        enhancement_type: "design",
        model_used: "claude-3-5-sonnet-20241022",
        tokens_used: 245,
      },
    };
    return NextResponse.json(apiInfo);
  } catch (err: any) {
    console.error("Prompt Enhancer GET API Error:", err);
    return NextResponse.json(
      { status: "error", error: "Failed to retrieve API information" },
      { status: 500 }
    );
  }
}
