import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Supported image formats for processing
const SUPPORTED_IMAGE_FORMATS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

async function validateAndProcessImage(file: File): Promise<File> {
  console.log(
    `🔍 Validating image: ${file.name} (${file.type}, ${file.size}b)`
  );

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error(
      `Image ${file.name} is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 10MB.`
    );
  }

  // Check if it's a supported format
  const isValidMimeType = SUPPORTED_IMAGE_FORMATS.includes(
    file.type.toLowerCase()
  );
  const hasValidExtension = SUPPORTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!isValidMimeType && !hasValidExtension) {
    throw new Error(
      `Unsupported image format: ${file.type || "unknown"}. Supported formats: JPG, JPEG, PNG, WebP`
    );
  }

  // If it's already PNG, return as-is
  if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
    console.log(`✅ Image ${file.name} is already PNG format`);
    return file;
  }

  // Convert to PNG for compatibility
  console.log(`🔄 Converting ${file.name} to PNG format...`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create a new File object with PNG extension
    const pngFileName = file.name.replace(/\.[^/.]+$/, "") + ".png";
    const pngFile = new File([buffer], pngFileName, { type: "image/png" });

    console.log(`✅ Converted ${file.name} to ${pngFileName}`);
    return pngFile;
  } catch (error) {
    console.error(`❌ Failed to convert ${file.name} to PNG:`, error);
    throw new Error(`Failed to process image ${file.name}: ${error}`);
  }
}

async function processBase64Image(
  base64Data: string,
  filename: string = "image.png"
): Promise<File> {
  console.log(`🔍 Processing base64 image: ${filename}`);

  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");

    // Convert base64 to buffer
    const buffer = Buffer.from(base64String, "base64");

    // Create File object as PNG
    const pngFileName = filename.replace(/\.[^/.]+$/, "") + ".png";
    const file = new File([buffer], pngFileName, { type: "image/png" });

    console.log(`✅ Processed base64 image as ${pngFileName} (${file.size}b)`);
    return file;
  } catch (error) {
    console.error(`❌ Failed to process base64 image:`, error);
    throw new Error(`Failed to process base64 image: ${error}`);
  }
}

async function uploadImageToCloudinary(file: File): Promise<string> {
  try {
    console.log(`📤 Uploading ${file.name} (${file.size}b) to Cloudinary...`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "image",
            folder: "intent_route_uploads",
            public_id: `${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`,
            format: "png",
            quality: "auto:best",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });

    const uploadResult = result as any;
    console.log(`✅ Cloudinary upload successful: ${uploadResult.secure_url}`);

    // Schedule deletion after 1 hour
    setTimeout(async () => {
      try {
        await cloudinary.uploader.destroy(uploadResult.public_id);
        console.log(`🗑️ Deleted temporary image: ${uploadResult.public_id}`);
      } catch (error) {
        console.error("Error deleting temporary image:", error);
      }
    }, 3600000); // 1 hour

    return uploadResult.secure_url;
  } catch (error) {
    console.error("❌ Cloudinary upload failed:", error);
    throw new Error(`Failed to upload ${file.name} to Cloudinary: ${error}`);
  }
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface IntentAnalysis {
  intent: string;
  confidence: number;
  endpoint: string;
  parameters: Record<string, any>;
  requiresFiles: boolean;
  explanation: string;
}

interface ChatResponse {
  status: "success" | "error";
  message: string;
  intent?: IntentAnalysis;
  result?: any;
  conversation_id?: string;
  error?: string;
}

async function parseClaudeIntent(response: any): Promise<IntentAnalysis> {
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  console.log("Claude response content:", content.text.substring(0, 200));
  let jsonStr = content.text.trim();

  // Enhanced JSON extraction logic
  const jsonExtractionSteps = [
    // Step 1: Try to find JSON in markdown code blocks
    (str: string) => {
      const jsonBlock = str.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      return jsonBlock ? jsonBlock[1].trim() : str;
    },
    // Step 2: Remove any leading/trailing non-JSON content
    (str: string) => {
      const jsonStart = str.indexOf("{");
      const jsonEnd = str.lastIndexOf("}") + 1;
      return jsonStart >= 0 && jsonEnd > jsonStart
        ? str.slice(jsonStart, jsonEnd)
        : str;
    },
    // Step 3: Clean up common formatting issues
    (str: string) => {
      return str
        .replace(/\n\s*\/\/.*$/gm, "") // Remove single-line comments
        .replace(/,\s*}/g, "}") // Remove trailing commas
        .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
    },
  ];

  // Apply extraction steps in sequence
  jsonStr = jsonExtractionSteps.reduce((str, step) => step(str), jsonStr);

  // Validate JSON structure before parsing
  if (!jsonStr.startsWith("{") || !jsonStr.endsWith("}")) {
    throw new Error("Invalid JSON structure: missing opening/closing braces");
  }

  const intentAnalysis = JSON.parse(jsonStr);

  // Validate required fields
  const requiredFields = [
    "intent",
    "confidence",
    "endpoint",
    "parameters",
    "requiresFiles",
    "explanation",
  ];

  const missingFields = requiredFields.filter(
    (field) => !(field in intentAnalysis)
  );
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  // Validate field types and values
  if (
    typeof intentAnalysis.confidence !== "number" ||
    intentAnalysis.confidence < 0 ||
    intentAnalysis.confidence > 1
  ) {
    throw new Error(
      "Invalid confidence value: must be a number between 0 and 1"
    );
  }

  if (typeof intentAnalysis.requiresFiles !== "boolean") {
    throw new Error("Invalid requiresFiles value: must be a boolean");
  }

  if (
    typeof intentAnalysis.parameters !== "object" ||
    intentAnalysis.parameters === null
  ) {
    throw new Error("Invalid parameters: must be an object");
  }

  console.log("✅ Parsed Claude intent analysis:", intentAnalysis);
  return intentAnalysis;
}

async function analyzeIntent(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  formDataEntries: [string, FormDataEntryValue][] = [],
  lastGeneratedResult?: {
    imageUrl?: string;
    endpoint?: string;
    intent?: string;
  }
): Promise<IntentAnalysis> {
  const smartFallbackAnalysis = (): IntentAnalysis => {
    const message = userMessage.toLowerCase();

    const hasProductImage = formDataEntries.some(
      ([key]) => key === "product_image" || key === "preset_product_type"
    );
    const hasDesignImage = formDataEntries.some(
      ([key]) => key === "design_image" || key === "preset_design_style"
    );
    const hasColorImage = formDataEntries.some(
      ([key]) => key === "color_image" || key === "preset_color_palette"
    );
    const hasPresetSelections = formDataEntries.some(([key]) =>
      key.startsWith("preset_")
    );
    const hasImages = hasProductImage || hasDesignImage || hasColorImage;

    console.log("Smart fallback analysis - Image detection:", {
      hasProductImage,
      hasDesignImage,
      hasColorImage,
      hasPresetSelections,
      message: message.substring(0, 50),
    });

    // Casual conversation patterns
    const casualPatterns = [
      "hi",
      "hello",
      "hey",
      "howdy",
      "good morning",
      "good afternoon",
      "good evening",
      "how are you",
      "what's up",
      "whats up",
      "sup",
      "who are you",
      "what's your name",
      "whats your name",
      "tell me about yourself",
      "what can you do",
      "what do you do",
      "help me",
      "can you help",
      "i need help",
      "thank you",
      "thanks",
      "goodbye",
      "bye",
      "see you",
      "nice weather",
    ];

    // Design-related keywords
    const designKeywords = [
      "shirt",
      "tshirt",
      "t-shirt",
      "design",
      "create",
      "make",
      "generate",
      "product",
      "image",
      "picture",
      "photo",
      "art",
      "pattern",
      "color",
      "style",
      "new",
      "custom",
      "hoodie",
      "pillow",
      "mug",
      "bag",
      "shoes",
      "dress",
      "jean",
      "plate",
      "notebook",
      "backpack",
      "lamp",
      "vase",
      "toys",
      "vehicle",
      "glasses",
      "watch",
      "earrings",
      "scarf",
      "blanket",
    ];

    const hasDesignKeywords = designKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    const isCasualConversation =
      casualPatterns.some(
        (pattern) => message.includes(pattern) || message === pattern
      ) && !hasDesignKeywords;

    // PRIORITY: Direct routing for preset selections
    if (hasPresetSelections) {
      console.log(
        "Smart fallback routing directly to design endpoint - preset selections detected"
      );
      return {
        intent: "design",
        confidence: 0.95,
        endpoint: "/api/design",
        parameters: {
          workflow_type: "preset_design",
          size: "1024x1024",
          quality: "auto",
        },
        requiresFiles: false,
        explanation:
          "User selected preset options - routing directly to design endpoint",
      };
    }

    // DESIGN REQUESTS: Route design-related requests to design endpoint
    if (hasDesignKeywords && !isCasualConversation) {
      console.log(
        "Smart fallback routing to design endpoint - design keywords detected"
      );
      return {
        intent: "design",
        confidence: 0.85,
        endpoint: "/api/design",
        parameters: {
          workflow_type: "prompt_only",
          size: "1024x1024",
          quality: "auto",
        },
        requiresFiles: false,
        explanation:
          "User request contains design-related keywords - routing to design endpoint",
      };
    }

    // CASUAL CONVERSATION
    if (isCasualConversation && !hasImages) {
      console.log("Smart fallback detected casual conversation pattern");
      return {
        intent: "casual_conversation",
        confidence: 0.9,
        endpoint: "none",
        parameters: {
          conversation_type:
            message.includes("hi") || message.includes("hello")
              ? "greeting"
              : "general",
        },
        requiresFiles: false,
        explanation:
          "Detected casual conversation pattern - no image operation requested",
      };
    }

    // IMAGE ANALYSIS
    if (
      hasImages &&
      (message.includes("analyze") ||
        message.includes("describe") ||
        message.includes("tell me about") ||
        message.includes("what is in") ||
        message.includes("what's in") ||
        message.includes("identify") ||
        message.includes("explain") ||
        message.includes("what do you see") ||
        message.includes("what can you see")) &&
      !message.includes("design") &&
      !message.includes("create") &&
      !message.includes("make")
    ) {
      console.log(
        "Smart fallback routing to analyze endpoint for image analysis"
      );
      return {
        intent: "analyze_image",
        confidence: 0.9,
        endpoint: "/api/analyzeimage",
        parameters: {},
        requiresFiles: true,
        explanation: "User explicitly wants to analyze an image",
      };
    }

    // DEFAULT TO DESIGN for images
    if (hasImages) {
      let workflowType = "prompt_only";
      if (hasProductImage && hasDesignImage && hasColorImage) {
        workflowType = "product_design_color";
      } else if (hasProductImage && hasDesignImage) {
        workflowType = "product_design";
      } else if (hasProductImage && hasColorImage) {
        workflowType = "product_color";
      } else if (hasDesignImage && hasColorImage) {
        workflowType = "design_color_prompt";
      } else if (hasProductImage) {
        workflowType = "product_prompt";
      } else if (hasDesignImage) {
        workflowType = "design_prompt";
      } else if (hasColorImage) {
        workflowType = "color_prompt";
      }

      console.log(
        `Smart fallback routing to design endpoint with workflow: ${workflowType}`
      );
      return {
        intent: "design",
        confidence: 0.9,
        endpoint: "/api/design",
        parameters: {
          prompt: userMessage,
          workflow_type: workflowType,
          size: "1024x1024",
          quality: "auto",
        },
        requiresFiles: true,
        explanation: `User uploaded images - defaulting to design with ${workflowType} workflow`,
      };
    }

    // DEFAULT TO CASUAL CONVERSATION
    console.log(
      "Smart fallback defaulting to casual conversation - request unclear"
    );
    return {
      intent: "casual_conversation",
      confidence: 0.7,
      endpoint: "none",
      parameters: { conversation_type: "general" },
      requiresFiles: false,
      explanation: "Request unclear - defaulting to conversation",
    };
  };

  const systemPrompt = `You are IRIS, an AI intent recognition system for IMAI image platform.

SUPPORTED OPERATIONS (ONLY 3):

1. CASUAL CONVERSATION → endpoint: "none"
   - Greetings: "hi", "hello", "hey", "good morning"
   - Questions: "how are you?", "what can you do?", "help me"
   - Vague requests: "I need help", "what is this?"
   - ANY unclear/ambiguous requests

2. DESIGN CREATION → /api/design
   - "make a design", "create a design", "design for t-shirt"
   - "apply design to product", "put this design on product"
   - "change my product design", "product mockup"
   - When user selects predefined product types, design styles, or color palettes
   - Any design-related requests with uploaded images

3. IMAGE ANALYSIS → /api/analyzeimage
   - "analyze this photo", "what's in this image?", "describe this image"
   - "tell me about this image", "identify this", "explain what you see"

CRITICAL RULES:
1. ALWAYS route to "none" for: greetings, questions, vague requests
2. ONLY use /api/design for explicit design creation/application requests
3. ONLY use /api/analyzeimage for explicit image analysis requests
4. When in doubt, choose "none"

RESPONSE FORMAT:
{
  "intent": "casual_conversation|design|analyze_image",
  "confidence": 0.7-0.95,
  "endpoint": "none|/api/design|/api/analyzeimage",
  "parameters": {
    "workflow_type": "prompt_only|product_prompt|design_prompt|product_design|product_design_color|design_color_prompt|color_prompt",
    "size": "1024x1024",
    "quality": "auto"
  },
  "requiresFiles": true/false,
  "explanation": "Brief explanation"
}`;

  // Try smart fallback first for speed
  const smartResult = smartFallbackAnalysis();
  if (smartResult.confidence >= 0.9) {
    console.log("⚡ Using smart fallback analysis (high confidence)");
    return smartResult;
  }

  try {
    console.log("🧠 Analyzing intent with Claude...");

    const hasUploadedImages = formDataEntries.some(([key, value]) => {
      const isImageField = key.includes("image") || key === "file";
      const isValidFile = value instanceof File && value.size > 0;
      const isBase64 =
        typeof value === "string" && value.startsWith("data:image/");
      return isImageField && (isValidFile || isBase64);
    });

    const productType =
      (formDataEntries.find(
        ([key]) => key === "product_type"
      )?.[1] as string) || "";
    const designStyles = formDataEntries
      .filter(([key]) => key.startsWith("design_style_"))
      .map(([key, value]) => value as string);
    const colorPalettes = formDataEntries
      .filter(([key]) => key.startsWith("color_palette_"))
      .map(([key, value]) => value as string);

    const prompt = `
Analyze this user message:

CURRENT USER MESSAGE: "${userMessage}"

UPLOADED IMAGES: ${hasUploadedImages ? "YES" : "NO"}
PREDEFINED SELECTIONS:
- Product Type: ${productType || "None"}
- Design Styles: ${designStyles.length > 0 ? designStyles.join(", ") : "None"}
- Color Palettes: ${colorPalettes.length > 0 ? colorPalettes.join(", ") : "None"}

Return intent JSON only.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    return await parseClaudeIntent(response);
  } catch (error: any) {
    console.error("❌ Error in intent analysis:", error);
    console.log("🔄 Using smart fallback analysis");
    return smartFallbackAnalysis();
  }
}

async function generateResponse(
  userMessage: string,
  intentAnalysis: IntentAnalysis,
  apiResult?: any
): Promise<string> {
  const smartFallbackResponse = (): string => {
    if (apiResult) {
      if (apiResult.status === "success") {
        const hasOutput =
          apiResult.firebaseOutputUrl ||
          apiResult.data_url ||
          apiResult.outputUrl ||
          apiResult.output_image ||
          apiResult.imageUrl;

        if (intentAnalysis.intent === "analyze_image" && apiResult.result) {
          const analysisContent =
            apiResult.result.raw_analysis ||
            JSON.stringify(apiResult.result, null, 2);
          return `🔍 I've analyzed your image! Here's what I found: ${analysisContent.substring(0, 200)}${analysisContent.length > 200 ? "..." : ""}`;
        }

        return `🎉 Perfect! I've successfully processed your ${intentAnalysis.intent.replace("_", " ")} request${hasOutput ? " and your result is ready!" : "!"} 🎨`;
      } else {
        return `⚠️ I encountered an issue: ${apiResult.error || "Unknown error"}. Let's try again! 🎨`;
      }
    } else {
      if (intentAnalysis.requiresFiles) {
        return `📁 I understand you want to ${intentAnalysis.intent.replace("_", " ")}! Please upload the required images and I'll process them for you.`;
      } else if (intentAnalysis.endpoint === "none") {
        return `👋 Hi there! I'm IRIS, your AI assistant for IMAI! I can help you create stunning designs and analyze images. What would you like to create today? 🎨`;
      }
    }
    return `✨ I can help you with ${intentAnalysis.intent.replace("_", " ")}!`;
  };

  try {
    // Use smart response for casual conversations
    if (
      intentAnalysis.intent === "casual_conversation" &&
      intentAnalysis.confidence >= 0.9
    ) {
      console.log("⚡ Using smart response generation");
      return smartFallbackResponse();
    }

    console.log("🗣️ Generating response with Claude...");

    let prompt = "";
    if (apiResult) {
      if (apiResult.status === "success") {
        if (intentAnalysis.intent === "analyze_image" && apiResult.result) {
          const analysisContent =
            apiResult.result.raw_analysis ||
            JSON.stringify(apiResult.result, null, 2);
          prompt = `The user said: "${userMessage}"

I successfully analyzed their image. Here's what I found:
${analysisContent}

Generate a friendly response that includes the key findings from this analysis. Be specific about what you see. Keep it engaging (3-4 sentences max). Use 1-2 emojis.`;
        } else {
          prompt = `The user said: "${userMessage}"

I successfully processed their ${intentAnalysis.intent} request using ${intentAnalysis.endpoint}.

Generate a friendly response (2-3 sentences max) explaining what was accomplished. Be encouraging. Use emojis sparingly.`;
        }
      } else {
        prompt = `The user said: "${userMessage}"

I tried to process their request but encountered an error: ${apiResult.error || "Unknown error"}

Generate a helpful response (2-3 sentences max) explaining what went wrong and suggest trying again. Be supportive.`;
      }
    } else {
      prompt = `The user said: "${userMessage}"
This seems like general conversation about our image AI platform.
Generate a friendly, helpful response (2-3 sentences max). Be welcoming and encourage them to try something.`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      temperature: 0.7,
      system: `You are IRIS, the AI assistant for IMAI - an image generation platform.

**Your personality:**
- Friendly, helpful, and conversational
- Always introduce yourself as IRIS when greeting new users
- Enthusiastic about image creation and design
- Concise but informative (2-4 sentences max)

**IMAI Platform Capabilities:**
- 🎨 Product design composition
- 🔍 Image analysis and description

**Response Guidelines:**
- For greetings: Introduce yourself, welcome them to IMAI, mention key capabilities
- For conversations: Be friendly and guide them toward trying image features
- For successful results: Celebrate their success and encourage them to try more
- For errors: Be supportive and offer alternatives
- Use 1-2 emojis max, keep it natural and professional`,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    return content.type === "text"
      ? content.text.trim()
      : "I apologize, but I had trouble generating a response.";
  } catch (error: any) {
    console.error("❌ Error generating response:", error);
    return smartFallbackResponse();
  }
}

async function routeToAPI(
  endpoint: string,
  parameters: Record<string, any>,
  files: FormData,
  userid: string,
  originalMessage: string,
  imageUrls: Record<string, string> = {}
): Promise<any> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const formData = new FormData();
    formData.append("userid", userid);

    console.log("🔗 Routing to API:", endpoint);

    // Extract preset selections
    const presetSelections: Record<string, string | string[]> = {};
    const fileEntries = Array.from(files.entries());
    for (const [key, value] of fileEntries) {
      if (key.startsWith("preset_") && typeof value === "string") {
        presetSelections[key] = value;
        console.log(`📋 Found preset selection: ${key} = ${value}`);
      }
    }

    if (endpoint === "/api/design") {
      formData.append("prompt", originalMessage);

      // Add design parameters
      if (parameters.workflow_type)
        formData.append("workflow_type", parameters.workflow_type);
      if (parameters.size) formData.append("size", parameters.size);
      if (parameters.quality) formData.append("quality", parameters.quality);

      // Add image URLs
      if (imageUrls.product_image) {
        formData.append("product_image_url", imageUrls.product_image);
        console.log("🔗 Added product_image_url:", imageUrls.product_image);
      }
      if (imageUrls.design_image) {
        formData.append("design_image_url", imageUrls.design_image);
        console.log("🔗 Added design_image_url:", imageUrls.design_image);
      }
      if (imageUrls.color_image) {
        formData.append("color_image_url", imageUrls.color_image);
        console.log("🔗 Added color_image_url:", imageUrls.color_image);
      }

      // Add preset selections
      if (presetSelections.preset_product_type) {
        formData.append(
          "preset_product_type",
          presetSelections.preset_product_type as string
        );
      }
      if (presetSelections.preset_design_style) {
        formData.append(
          "preset_design_style",
          presetSelections.preset_design_style as string
        );
      }
      if (presetSelections.preset_color_palette) {
        formData.append(
          "preset_color_palette",
          presetSelections.preset_color_palette as string
        );
      }
    } else if (endpoint === "/api/analyzeimage") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for analysis:", imageUrl);
      } else {
        throw new Error("No image URL found for analysis");
      }
    }

    console.log(`🚀 Calling ${endpoint}`);

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    console.log("=== Simplified Intent Route ===");

    const entries = Array.from(formData.entries());
    entries.forEach(([key, value]) => {
      console.log(
        `  ${key}:`,
        typeof value === "string" ? value : `[File: ${value}]`
      );
    });

    // Extract userid
    let userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      console.log("❌ Missing userid - using fallback");
      userid = "uTiXKRbCYbhWnBbkLFZoMdEMdgf2";
      formData.set("userid", userid);
    }

    const message = (formData.get("message") as string)?.trim();
    console.log("Extracted message:", message);

    // Check for images and presets
    const hasActualImages = entries.some(([key, value]) => {
      const isImageField =
        [
          "product_image",
          "design_image",
          "color_image",
          "image",
          "file",
        ].includes(key) || key.startsWith("image");
      const isValidFile = value instanceof File && value.size > 0;
      const isBase64 =
        typeof value === "string" && value.startsWith("data:image/");
      return isImageField && (isValidFile || isBase64);
    });

    const hasPresetSelections = entries.some(([key, value]) => {
      return (
        key.startsWith("preset_") &&
        typeof value === "string" &&
        value.trim().length > 0
      );
    });

    const hasImages = hasActualImages || hasPresetSelections;
    console.log("Has images:", hasImages);

    if (!message && !hasImages) {
      return NextResponse.json(
        {
          status: "error",
          error: "Either a message or images must be provided",
        },
        { status: 400 }
      );
    }

    const effectiveMessage =
      message || "Create a design using the uploaded content";

    const conversationHistoryStr = formData.get(
      "conversation_history"
    ) as string;
    let conversationHistory: ChatMessage[] = [];
    if (conversationHistoryStr) {
      try {
        conversationHistory = JSON.parse(conversationHistoryStr);
      } catch {
        conversationHistory = [];
      }
    }

    // Process images
    const imageUrls: Record<string, string> = {};
    const imageFileEntries = entries.filter(([key, value]) => {
      const isImageField =
        [
          "product_image",
          "design_image",
          "color_image",
          "image",
          "file",
        ].includes(key) || key.startsWith("image");
      const isValidFile = value instanceof File && value.size > 0;
      const isBase64 =
        typeof value === "string" && value.startsWith("data:image/");
      return isImageField && (isValidFile || isBase64);
    });

    if (imageFileEntries.length > 0) {
      console.log(`🌤️ Processing ${imageFileEntries.length} images...`);

      try {
        const uploadPromises = imageFileEntries.map(async ([key, value]) => {
          let processedFile: File;

          if (typeof value === "string") {
            processedFile = await processBase64Image(value, `${key}.png`);
          } else {
            processedFile = await validateAndProcessImage(value as File);
          }

          const imageUrl = await uploadImageToCloudinary(processedFile);
          return { key, imageUrl };
        });

        const uploadResults = await Promise.all(uploadPromises);
        uploadResults.forEach(({ key, imageUrl }) => {
          imageUrls[key] = imageUrl;
          console.log(`🔗 ${key} → ${imageUrl}`);
        });

        console.log("✅ All image uploads successful!");
      } catch (error) {
        console.error("❌ Image processing failed:", error);
        return NextResponse.json(
          { status: "error", error: `Image processing failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // Analyze intent
    const intentAnalysis = await analyzeIntent(
      effectiveMessage,
      conversationHistory,
      entries
    );
    console.log("Intent Analysis:", intentAnalysis);

    let apiResult = null;

    // Call API if needed
    if (
      intentAnalysis.endpoint &&
      intentAnalysis.endpoint !== "none" &&
      intentAnalysis.confidence > 0.5
    ) {
      try {
        apiResult = await routeToAPI(
          intentAnalysis.endpoint,
          intentAnalysis.parameters,
          formData,
          userid,
          effectiveMessage,
          imageUrls
        );
      } catch (error: any) {
        apiResult = { status: "error", error: error.message };
      }
    }

    // Generate response
    const responseMessage = await generateResponse(
      effectiveMessage,
      intentAnalysis,
      apiResult
    );

    const chatResponse: ChatResponse = {
      status: "success",
      message: responseMessage,
      intent: intentAnalysis,
      result: apiResult,
      conversation_id: `${userid}_${Date.now()}`,
    };

    return NextResponse.json(chatResponse);
  } catch (error: any) {
    console.error("Intent Route Error:", error);

    const errorResponse: ChatResponse = {
      status: "error",
      message:
        "I encountered an error while processing your request. Please try again.",
      error: error.message || "Unknown error occurred",
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
