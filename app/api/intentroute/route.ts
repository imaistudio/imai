import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    console.log(
      `✅ Cloudinary upload successful (converted to PNG): ${uploadResult.secure_url}`
    );

    // Schedule deletion after 1 hour for testing
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

function formatFirebasePrivateKey(privateKey: string): string {
  if (!privateKey) {
    throw new Error("Firebase private key is empty or undefined");
  }

  let formattedKey = privateKey
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\")
    .trim();

  if (
    formattedKey === "-----BEGIN PRIVATE KEY-----" ||
    formattedKey.length < 100
  ) {
    console.log(
      "Skipping Firebase initialization due to environment variable issue - testing intent logic only"
    );
    return "SKIP_FIREBASE_INIT";
  }

  if (!formattedKey.includes("-----BEGIN")) {
    throw new Error(
      "Private key is missing PEM headers. Ensure it starts with -----BEGIN PRIVATE KEY-----"
    );
  }

  if (!formattedKey.includes("-----END")) {
    console.error(
      "Current private key content (first 100 chars):",
      formattedKey.substring(0, 100)
    );
    console.error(
      "Current private key content (last 100 chars):",
      formattedKey.substring(-100)
    );
    throw new Error(`Private key is missing PEM footers. Current key length: ${formattedKey.length}. Ensure it ends with -----END PRIVATE KEY-----. 
    
If you're having issues with multi-line environment variables, try setting FIREBASE_PRIVATE_KEY as a single line with \\n for line breaks, like:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_CONTENT\\n-----END PRIVATE KEY-----"`);
  }

  return formattedKey;
}

let firebaseInitialized = false;
console.log("🔥 Firebase disabled - using Cloudinary for image handling");

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

async function analyzeIntent(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  formDataEntries: [string, FormDataEntryValue][] = []
): Promise<IntentAnalysis> {
  const smartFallbackAnalysis = (): IntentAnalysis => {
    const message = userMessage.toLowerCase();

    const hasProductImage =
      formDataEntries.some(([key]) => key === "product_image") ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Product Image:") ||
          msg.content.includes("product_image")
      );
    const hasDesignImage =
      formDataEntries.some(([key]) => key === "design_image") ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Design Image:") ||
          msg.content.includes("design_image")
      );
    const hasColorImage =
      formDataEntries.some(([key]) => key === "color_image") ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Color Image:") ||
          msg.content.includes("color_image")
      );

    console.log("Smart fallback analysis - Image detection:", {
      hasProductImage,
      hasDesignImage,
      hasColorImage,
      message: message.substring(0, 50),
    });

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

    const isCasualConversation = casualPatterns.some(
      (pattern) => message.includes(pattern) || message === pattern
    );

    if (
      isCasualConversation &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage
    ) {
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

    if (hasProductImage || hasDesignImage || hasColorImage) {
      const imageCount = [
        hasProductImage,
        hasDesignImage,
        hasColorImage,
      ].filter(Boolean).length;

      if (
        message.includes("create a new design") ||
        message.includes("new design") ||
        (message.includes("create a design using") &&
          message.includes("these")) ||
        message.includes("make a new design") ||
        message.includes("design a new") ||
        message.includes("flow design") ||
        message.includes("create a flow design")
      ) {
        console.log(
          "Smart fallback routing to flow_design endpoint for explicit new design creation"
        );
        return {
          intent: "create_design",
          confidence: 0.95,
          endpoint: "/api/flow_design",
          parameters: {
            workflow_type: "multi_image_design",
            size: "1024x1024",
            quality: "auto",
          },
          requiresFiles: true,
          explanation:
            "User explicitly wants to create a NEW design using multiple images",
        };
      }

      if (
        (message.includes("apply") && message.includes("design")) ||
        message.includes("put this design on") ||
        message.includes("change my product design") ||
        message.includes("vintage but funky") ||
        message.includes("product composition")
      ) {
        console.log(
          "Smart fallback routing to design endpoint for product design application"
        );
        return {
          intent: "design",
          confidence: 0.95,
          endpoint: "/api/design",
          parameters: {
            workflow_type: "product_design",
            size: "1024x1024",
            quality: "auto",
          },
          requiresFiles: true,
          explanation:
            "User explicitly wants to apply a design to an existing product",
        };
      }

      if (
        imageCount === 1 &&
        (message.includes("enhance") ||
          message.includes("upscale") ||
          message.includes("make bigger") ||
          message.includes("increase resolution") ||
          message.includes("improve quality"))
      ) {
        console.log(
          "Smart fallback routing to upscale endpoint for single image enhancement"
        );
        return {
          intent: "upscale_image",
          confidence: 0.9,
          endpoint: "/api/upscale",
          parameters: { quality: "auto" },
          requiresFiles: true,
          explanation:
            "User explicitly wants to enhance/upscale a single image",
        };
      }

      if (
        imageCount === 1 &&
        (message.includes("clarity") ||
          message.includes("clear up") ||
          message.includes("sharpen") ||
          message.includes("crisp") ||
          message.includes("detailed") ||
          message.includes("hd") ||
          message.includes("4k") ||
          message.includes("high definition"))
      ) {
        console.log(
          "Smart fallback routing to clarity upscaler for image clarity enhancement"
        );
        return {
          intent: "clarity_upscale",
          confidence: 0.9,
          endpoint: "/api/clarityupscaler",
          parameters: { upscaleFactor: 2, creativity: 0.35 },
          requiresFiles: true,
          explanation:
            "User explicitly wants to improve image clarity and detail",
        };
      }
      if (
        imageCount === 1 &&
        (message.includes("reframe") ||
          message.includes("crop") ||
          message.includes("landscape") ||
          message.includes("portrait") ||
          message.includes("square") ||
          message.includes("resize"))
      ) {
        console.log(
          "Smart fallback routing to reframe endpoint for single image reframing"
        );
        return {
          intent: "reframe_image",
          confidence: 0.9,
          endpoint: "/api/reframe",
          parameters: { imageSize: "square_hd" },
          requiresFiles: true,
          explanation: "User explicitly wants to reframe/crop a single image",
        };
      }

      if (
        imageCount === 1 &&
        (message.includes("video") ||
          message.includes("animate") ||
          message.includes("motion") ||
          message.includes("move") ||
          message.includes("kling") ||
          message.includes("animation") ||
          message.includes("gif") ||
          message.includes("movie"))
      ) {
        console.log(
          "Smart fallback routing to kling endpoint for image-to-video"
        );
        return {
          intent: "create_video",
          confidence: 0.9,
          endpoint: "/api/kling",
          parameters: { duration: "5", cfg_scale: 0.5 },
          requiresFiles: true,
          explanation:
            "User explicitly wants to create video/animation from image",
        };
      }

      if (
        imageCount === 1 &&
        (message.includes("analyze this") ||
          message.includes("describe this") ||
          message.includes("what is in this") ||
          message.includes("identify this")) &&
        !message.includes("Create a design composition")
      ) {
        console.log(
          "Smart fallback routing to analyze endpoint for single image analysis"
        );
        return {
          intent: "analyze_image",
          confidence: 0.9,
          endpoint: "/api/analyzeimage",
          parameters: {},
          requiresFiles: true,
          explanation:
            "User explicitly wants to analyze a single specific image",
        };
      }

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
        explanation: `User uploaded ${imageCount} image(s) - defaulting to product composition with ${workflowType} workflow`,
      };
    }

    console.log(
      "Smart fallback defaulting to casual conversation - request unclear"
    );
    return {
      intent: "casual_conversation",
      confidence: 0.7,
      endpoint: "none",
      parameters: { conversation_type: "general" },
      requiresFiles: false,
      explanation:
        "Request unclear or ambiguous - defaulting to conversation for better user experience",
    };
  };

  const systemPrompt = `You are IRIS, an AI intent recognition system for IMAI image platform. You must classify user input into exactly TWO categories:

**CATEGORY 1: CASUAL CONVERSATION** → endpoint: "none"
Use this for ALL of these cases:
- Greetings: "hi", "hello", "hey", "good morning", "what's up", "howdy"
- Personal questions: "how are you?", "what's your name?", "who are you?", "tell me about yourself"
- App questions: "what can you do?", "what is this app?", "help me", "what are your features?"
- Polite conversation: "nice weather", "thank you", "thanks", "goodbye", "see you later"
- Vague requests: "help", "I need assistance", "can you help me?", "I'm confused"
- Questions about capabilities: "what kind of images can you make?", "how does this work?"
- ANY unclear/ambiguous requests that don't explicitly ask for specific image operations

**CATEGORY 2: IMAGE GENERATION/MANIPULATION** → specific API endpoint
Use this ONLY when user explicitly requests specific image operations:

**DESIGN CREATION (using multiple images to create NEW designs):**
- "create a NEW design using these images" → /api/flow_design
- "make a NEW design" → /api/flow_design
- "new design with colors" → /api/flow_design
- "design a new layout using these" → /api/flow_design
- "flow design" → /api/flow_design
- "create a flow design" → /api/flow_design

**PRODUCT COMPOSITION (applying designs/effects TO existing products):**
- "make a design" (without "new") → /api/design
- "create a design" (without "new") → /api/design
- "apply design to product" → /api/design
- "put this design on the product" → /api/design
- "change my product design" → /api/design
- "vintage but funky" (with product image) → /api/design

**OTHER IMAGE OPERATIONS:**
- "make this image bigger" or "upscale this photo" → /api/upscale  
- "sharpen this image" or "improve clarity" → /api/clarityupscaler
- "analyze this photo" or "what's in this image?" → /api/analyzeimage
- "reframe my image" or "crop this picture" → /api/reframe
- "animate this image" or "create a video" → /api/kling

**CRITICAL RULES - NEVER BREAK THESE:**
1. "hi", "hello", "hey", "good morning" → ALWAYS endpoint: "none"
2. "how are you?", "what's your name?" → ALWAYS endpoint: "none"  
3. "what can you do?", "help me" → ALWAYS endpoint: "none"
4. If unclear what they want → ALWAYS endpoint: "none"
5. ONLY use API endpoints for crystal-clear image operation requests
6. When in doubt, choose "none" - it's better to have a conversation than wrong routing
7. **"create a NEW design using these images" / "make a NEW design" / "new design with colors" → /api/flow_design**
8. **"make a design" (without "new") / "create a design" (without "new") / "apply design to product" → /api/design**
9. **IF 1 IMAGE + "enhance/upscale/increase resolution/make bigger" → /api/upscale**
10. **IF 1 IMAGE + "clarity/sharpen/crisp/detailed/hd/4k" → /api/clarityupscaler**
11. **IF 1 IMAGE + "reframe/crop/landscape/portrait/square" → /api/reframe**
12. **IF 1 IMAGE + "video/animate/motion/kling/gif/movie" → /api/kling**
13. **IF 1 IMAGE + "analyze this specific image" → /api/analyzeimage**

**CONVERSATION EXAMPLES (ALL endpoint: "none"):**
- "hi" → casual_conversation
- "hello there" → casual_conversation  
- "how are you doing?" → casual_conversation
- "what can you help me with?" → casual_conversation
- "I need help" → casual_conversation (too vague)
- "can you assist me?" → casual_conversation (no specific request)
- "tell me about yourself" → casual_conversation
- "what kind of images do you make?" → casual_conversation
- "how does this platform work?" → casual_conversation

**IMAGE TASK EXAMPLES (API endpoints):**
- "create a design using these images" → /api/flow_design
- "make a design" → /api/flow_design
- "a new design with colors" → /api/flow_design
- "flow design" → /api/flow_design
- "apply this design to my product" → /api/design
- "change my product design" → /api/design
- "1 image + enhance this" → /api/upscale
- "1 image + make this bigger" → /api/upscale
- "1 image + sharpen this image" → /api/clarityupscaler
- "1 image + improve clarity" → /api/clarityupscaler
- "1 image + make it crisp and detailed" → /api/clarityupscaler
- "1 image + reframe to square" → /api/reframe
- "1 image + crop this to portrait" → /api/reframe
- "1 image + animate this" → /api/kling
- "1 image + create a video" → /api/kling
- "1 image + make it move" → /api/kling
- "1 image + analyze this photo" → /api/analyzeimage

**FORMAT - ALWAYS USE THIS EXACT JSON:**
For casual conversation:
{
  "intent": "casual_conversation",
  "confidence": 0.9,
  "endpoint": "none",
  "parameters": {
    "conversation_type": "greeting|question|general"
  },
  "requiresFiles": false,
  "explanation": "User is having casual conversation - respond conversationally"
}

For image tasks:
{
  "intent": "create_design|design|upscale_image|clarity_upscale|analyze_image|reframe_image|create_video",
  "confidence": 0.8-0.95,
  "endpoint": "/api/flow_design|/api/design|/api/upscale|/api/clarityupscaler|/api/analyzeimage|/api/reframe|/api/kling",
  "parameters": {
    "workflow_type": "prompt_only|product_prompt|design_prompt|etc",
    "size": "1024x1024",
    "quality": "auto"
  },
  "requiresFiles": true/false,
  "explanation": "User explicitly requested specific image operation"
}
`;

  try {
    console.log("🧠 Analyzing intent with Claude Sonnet 4...");
    console.log("User message:", userMessage);
    console.log("API Key available:", !!process.env.ANTHROPIC_API_KEY);

    const conversationContext = conversationHistory
      .slice(-3)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const prompt = `${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ""}Current user message: "${userMessage}"

Analyze this message and determine the user's intent. If images are being uploaded, prioritize design/creation workflows.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("✅ Claude API response received");

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    console.log("Claude response content:", content.text.substring(0, 200));
    try {
      let jsonStr = content.text.trim();
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.split("```json")[1].split("```")[0].trim();
      }

      const intentAnalysis = JSON.parse(jsonStr);

      const requiredFields = [
        "intent",
        "confidence",
        "endpoint",
        "parameters",
        "requiresFiles",
        "explanation",
      ];
      for (const field of requiredFields) {
        if (!(field in intentAnalysis)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      console.log("✅ Parsed Claude intent analysis:", intentAnalysis);
      return intentAnalysis;
    } catch (parseError) {
      console.error("❌ Error parsing Claude JSON response:", parseError);
      console.error("Raw Claude response:", content.text);
      console.log("🔄 Using smart fallback analysis");
      return smartFallbackAnalysis();
    }
  } catch (error: any) {
    console.error("❌ Claude API Error:", error);
    if (
      error.message?.includes("invalid x-api-key") ||
      error.message?.includes("authentication_error")
    ) {
      console.error("🔑 Authentication failed - API key issue");
      console.error(
        "API Key length:",
        process.env.ANTHROPIC_API_KEY?.length || "undefined"
      );
      console.error(
        "API Key starts with:",
        process.env.ANTHROPIC_API_KEY?.substring(0, 20) || "undefined"
      );
    }

    console.log("🔄 Using smart fallback analysis due to API error");
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
        return `🎉 Fantastic! I've successfully processed your ${intentAnalysis.intent.replace("_", " ")} request${hasOutput ? " and your result is ready for download!" : "!"} Feel free to try more IMAI features!`;
      } else {
        return `⚠️ I encountered an issue while processing your request: ${apiResult.error || "Unknown error"}. Let's try again - I'm here to help you create amazing images! 🎨`;
      }
    } else {
      if (intentAnalysis.requiresFiles) {
        return `📁 I understand you want to ${intentAnalysis.intent.replace("_", " ")}! Please upload the required files and I'll process them for you using IMAI's powerful tools.`;
      } else if (
        intentAnalysis.endpoint === "none" ||
        intentAnalysis.intent === "casual_conversation"
      ) {
        return `👋 Hi there! I'm IRIS, your AI assistant for IMAI - an advanced image generation platform! I can help you create stunning product designs, upscale images, analyze visuals, and so much more. What would you like to create today? 🎨`;
      } else {
        return `✨ I can help you with ${intentAnalysis.intent.replace("_", " ")}! Let me process that for you using IMAI's capabilities.`;
      }
    }
  };

  try {
    console.log("🗣️ Generating conversational response with Claude...");

    let prompt = "";

    if (apiResult) {
      if (apiResult.status === "success") {
        const hasOutput =
          apiResult.firebaseOutputUrl ||
          apiResult.data_url ||
          apiResult.outputUrl ||
          apiResult.output_image ||
          apiResult.imageUrl;
        const resultSummary = {
          status: apiResult.status,
          hasOutput: !!hasOutput,
          endpoint: intentAnalysis.endpoint,
          intent: intentAnalysis.intent,
        };

        prompt = `The user said: "${userMessage}"

I successfully processed their request using ${intentAnalysis.endpoint}. The intent was: ${intentAnalysis.intent}

API Response Summary: ${JSON.stringify(resultSummary, null, 2)}

Generate a friendly, conversational response (2-3 sentences max) explaining what was accomplished. ${hasOutput ? "Mention that their result is ready." : ""} Be encouraging and helpful. Use emojis sparingly.`;
      } else {
        prompt = `The user said: "${userMessage}"

I tried to process their request using ${intentAnalysis.endpoint} but encountered an error.

Error: ${apiResult.error || "Unknown error"}

Generate a helpful response (2-3 sentences max) explaining what went wrong and suggest how they might try again. Be supportive and offer alternatives if possible.`;
      }
    } else {
      if (intentAnalysis.requiresFiles) {
        prompt = `The user said: "${userMessage}"

I understand they want to: ${intentAnalysis.intent}
This requires using ${intentAnalysis.endpoint}

Generate a helpful response (2-3 sentences max) explaining what files they need to upload and how to proceed. Be encouraging and clear about next steps.`;
      } else {
        prompt = `The user said: "${userMessage}"

This seems like general conversation about our image AI platform capabilities.

Generate a friendly, helpful response (2-3 sentences max). Briefly explain what kinds of image generation and manipulation tasks I can help with. Be welcoming and encourage them to try something.`;
      }
    }

    // Call Claude for response generation (same pattern as old working code)
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514", // Same model as working old code
      max_tokens: 400, // Slightly longer for better introductions
      temperature: 0.7,
      system: `You are IRIS, the AI assistant for IMAI - an advanced image generation and manipulation platform. 

**Your personality:**
- Friendly, helpful, and conversational
- Always introduce yourself as IRIS when greeting new users
- Enthusiastic about image creation and design
- Concise but informative (2-4 sentences max)

**IMAI Platform Capabilities:**
- 🎨 Product design composition (combine product, design, and color references)
- ⬆️ Image upscaling and enhancement  
- 🔍 Image analysis and description
- 🖼️ Image reframing and cropping
- ✨ Prompt enhancement for better results
- 🎯 Elemental and flow-based design creation

**Response Guidelines:**
- For greetings: Introduce yourself as IRIS, welcome them to IMAI, briefly mention 2-3 key capabilities
- For conversations: Be friendly and guide them toward trying image features
- For successful results: Celebrate their success and encourage them to try more
- For errors: Be supportive and offer helpful alternatives
- Use 1-2 emojis max, keep it natural and professional`,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("✅ Claude response generation successful");

    const content = response.content[0];
    return content.type === "text"
      ? content.text.trim()
      : "I apologize, but I had trouble generating a response.";
  } catch (error: any) {
    console.error("❌ Error generating Claude response:", error);
    console.log("🔄 Using smart fallback response generation");
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

    // Create FormData for the API call
    const formData = new FormData();
    formData.append("userid", userid);
    console.log("🔗 Using URL-based API routing with imageUrls:", imageUrls);

    if (endpoint === "/api/design" || endpoint === "/api/design") {
      formData.append("prompt", originalMessage);

      // Add design-specific parameters
      if (parameters.workflow_type) {
        formData.append("workflow_type", parameters.workflow_type);
      }
      if (parameters.size) {
        formData.append("size", parameters.size);
      }
      if (parameters.quality) {
        formData.append("quality", parameters.quality);
      }

      // 🎯 Pass image URLs instead of files
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
    } else if (endpoint === "/api/flow_design") {
      formData.append("prompt", originalMessage);

      if (parameters.workflow_type) {
        formData.append("workflow_type", parameters.workflow_type);
      }
      if (parameters.size) {
        formData.append("size", parameters.size);
      }
      if (parameters.quality) {
        formData.append("quality", parameters.quality);
      }

      if (imageUrls.product_image) {
        formData.append("product_image_url", imageUrls.product_image);
        console.log(
          "🔗 Added product_image_url for flow design:",
          imageUrls.product_image
        );
      }
      if (imageUrls.design_image) {
        formData.append("design_image_url", imageUrls.design_image);
        console.log(
          "🔗 Added design_image_url for flow design:",
          imageUrls.design_image
        );
      }
      if (imageUrls.color_image) {
        formData.append("color_image_url", imageUrls.color_image);
        console.log(
          "🔗 Added color_image_url for flow design:",
          imageUrls.color_image
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

      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== "image_url") {
          formData.append(key, String(value));
        }
      });
    } else if (endpoint === "/api/upscale") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for upscaling:", imageUrl);
      } else {
        throw new Error("No image URL found for upscaling");
      }

      // Add other upscale-specific parameters
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      if (originalMessage && !parameters.prompt) {
        formData.append("prompt", originalMessage);
      }
    } else if (endpoint === "/api/reframe") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for reframing:", imageUrl);
      } else {
        throw new Error("No image URL found for reframing");
      }

      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      if (originalMessage && !parameters.prompt) {
        formData.append("prompt", originalMessage);
      }
    } else if (endpoint === "/api/clarityupscaler") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        const clarityPayload = {
          imageUrl: imageUrl,
          prompt:
            parameters.prompt ||
            originalMessage ||
            "masterpiece, best quality, highres",
          upscaleFactor: parameters.upscaleFactor || 2,
          creativity: parameters.creativity || 0.35,
          resemblance: parameters.resemblance || 0.6,
          guidanceScale: parameters.guidanceScale || 4,
          numInferenceSteps: parameters.numInferenceSteps || 18,
          enableSafetyChecker: true,
        };

        console.log("🔗 Added clarity upscaler payload:", clarityPayload);

        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(clarityPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API call failed: ${response.status} ${errorText}`);
        }

        return await response.json();
      } else {
        throw new Error("No image URL found for clarity upscaling");
      }
    } else if (endpoint === "/api/kling") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        formData.append(
          "prompt",
          parameters.prompt ||
            originalMessage ||
            "Create a smooth transition video"
        );
        console.log("🔗 Added image_url for kling video creation:", imageUrl);
      } else {
        throw new Error("No image URL found for video creation");
      }

      // Add other kling-specific parameters
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== "image_url") {
          formData.append(key, String(value));
        }
      });
    } else if (endpoint === "/api/mirrormagic") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image;

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for mirror magic:", imageUrl);
      } else {
        throw new Error("No image URL found for mirror magic transformation");
      }

      // Add mirror magic specific parameters
      if (parameters.workflow) {
        formData.append("workflow", parameters.workflow);
      }
      if (parameters.size) {
        formData.append("size", parameters.size);
      }
      if (parameters.quality) {
        formData.append("quality", parameters.quality);
      }
      if (parameters.n) {
        formData.append("n", String(parameters.n));
      }

      // Add prompt if provided
      if (originalMessage && !parameters.prompt) {
        formData.append("prompt", originalMessage);
      } else if (parameters.prompt) {
        formData.append("prompt", parameters.prompt);
      }
    } else {
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      if (originalMessage && !parameters.prompt) {
        formData.append("prompt", originalMessage);
      }
    }

    console.log(`🚀 Calling ${endpoint} with URL-based parameters:`, {
      prompt: originalMessage,
      otherParams: Object.keys(parameters),
      imageUrls: Object.keys(imageUrls),
      hasFiles: false,
    });

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
    console.log("=== Intent Route Debug ===");
    console.log("FormData entries:");
    const entries = Array.from(formData.entries());
    entries.forEach(([key, value]) => {
      console.log(
        `  ${key}:`,
        typeof value === "string" ? value : `[File: ${value}]`
      );
    });

    // 1) Extract and validate userid
    let userid = (formData.get("userid") as string | null)?.trim();
    console.log("Extracted userid:", userid);
    if (!userid) {
      console.log(
        "❌ Missing userid parameter - using test user for debugging"
      );
      userid = "test-user-123";
      formData.set("userid", userid);
      console.log("✅ Using test userid:", userid);
    } else {
      console.log("✅ Got userid:", userid);
    }
    if (firebaseInitialized) {
      try {
        // await getAuth().getUser(userid);
      } catch {
        console.log("❌ Invalid Firebase user ID");
        return NextResponse.json(
          { status: "error", error: "Invalid Firebase user ID" },
          { status: 400 }
        );
      }
    } else {
      console.log("Skipping Firebase user validation - testing mode");
    }

    const message = (formData.get("message") as string)?.trim();
    console.log("Extracted message:", message);

    const hasImages = entries.some(
      ([key, value]) =>
        ["product_image", "design_image", "color_image"].includes(key) &&
        value instanceof File &&
        value.size > 0
    );
    console.log("Has images:", hasImages);

    if (!message && !hasImages) {
      console.log("❌ Missing both message and images");
      return NextResponse.json(
        {
          status: "error",
          error: "Either a message or images must be provided",
        },
        { status: 400 }
      );
    }

    const effectiveMessage =
      message || "Create a design composition using the uploaded images";
    console.log("Effective message:", effectiveMessage);

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

    console.log("✅ Validation passed, proceeding with intent analysis");

    const imageUrls: Record<string, string> = {};
    const imageFileEntries = entries.filter(
      ([key, value]) =>
        ["product_image", "design_image", "color_image"].includes(key) &&
        value instanceof File &&
        value.size > 0
    );

    if (imageFileEntries.length > 0) {
      console.log(
        "🌤️ Testing Cloudinary uploads for",
        imageFileEntries.length,
        "images..."
      );

      try {
        const uploadPromises = imageFileEntries.map(async ([key, file]) => {
          const imageUrl = await uploadImageToCloudinary(file as File);
          return { key, imageUrl };
        });

        const uploadResults = await Promise.all(uploadPromises);
        uploadResults.forEach(({ key, imageUrl }) => {
          imageUrls[key] = imageUrl;
          console.log(`🔗 ${key} → ${imageUrl}`);
        });

        console.log("✅ All Cloudinary uploads successful!");
        console.log("📋 Image URLs:", imageUrls);
      } catch (error) {
        console.error("❌ Cloudinary upload failed:", error);
        return NextResponse.json(
          { status: "error", error: `Image upload failed: ${error}` },
          { status: 500 }
        );
      }
    } else {
      console.log("📷 No images to upload to Cloudinary");
    }
    const intentAnalysis = await analyzeIntent(
      effectiveMessage,
      conversationHistory,
      entries
    );

    console.log("Intent Analysis:", intentAnalysis);

    let apiResult = null;
    let responseMessage = "";

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
        apiResult = {
          status: "error",
          error: error.message,
        };
      }
    }

    responseMessage = await generateResponse(
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
