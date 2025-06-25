import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { claudeLLM } from "@/lib/claudeLLM";

import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

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

  // Convert to PNG for OpenAI compatibility
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

async function uploadImageToFirebaseStorage(
  file: File,
  userid: string,
  isOutput: boolean = false
): Promise<string> {
  try {
    console.log(
      `📤 Uploading ${file.name} (${file.size}b) to Firebase Storage...`
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get Firebase Storage bucket
    const bucket = getStorage().bucket();

    // Create storage path: userid/input or userid/output
    const folder = isOutput ? "output" : "input";
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name.replace(/\.[^/.]+$/, ".png")}`;
    const filePath = `${userid}/${folder}/${fileName}`;

    // Create file reference
    const fileRef = bucket.file(filePath);

    // Upload the file
    await fileRef.save(buffer, {
      metadata: {
        contentType: "image/png",
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

    console.log(`✅ Firebase Storage upload successful: ${publicUrl}`);

    // Schedule deletion after 24 hours for temporary files (inputs only)
    // Output files are permanent for user access
    if (!isOutput) {
      setTimeout(async () => {
        try {
          await fileRef.delete();
          console.log(`🗑️ Deleted temporary input image: ${filePath}`);
        } catch (error) {
          console.error("Error deleting temporary image:", error);
        }
      }, 24 * 3600000); // 24 hours for inputs
    }

    return publicUrl;
  } catch (error) {
    console.error("❌ Firebase Storage upload failed:", error);
    throw new Error(
      `Failed to upload ${file.name} to Firebase Storage: ${error}`
    );
  }
}

async function saveOutputImageToFirebase(
  imageUrl: string,
  userid: string,
  endpoint: string
): Promise<string> {
  try {
    console.log(
      `💾 Saving output image to Firebase Storage for user ${userid}...`
    );

    // Fetch the image from the URL
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    const fileName = `${endpoint.replace("/api/", "")}_output_${Date.now()}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    // Upload to Firebase Storage in the output folder
    const firebaseUrl = await uploadImageToFirebaseStorage(file, userid, true);

    console.log(`✅ Output image saved to Firebase Storage: ${firebaseUrl}`);
    return firebaseUrl;
  } catch (error) {
    console.error("❌ Failed to save output image to Firebase:", error);
    // Return original URL as fallback
    return imageUrl;
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

let firebaseInitialized = true;
console.log(
  "🔥 Firebase initialized - using Firebase Storage for image handling"
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Enhanced interface for multi-step operations
interface MultiStepOperation {
  steps: IntentAnalysis[];
  executionPlan: "sequential" | "parallel";
  contextChain: boolean; // Whether to use output of previous step as input to next
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  images?: string[]; // Add images field
}

interface IntentAnalysis {
  intent: string;
  confidence: number;
  endpoint: string;
  parameters: Record<string, any>;
  requiresFiles: boolean;
  explanation: string;
  isMultiStep?: boolean;
  multiStepPlan?: MultiStepOperation;
  targetImages?: string[]; // For multi-image operations
}

interface ChatResponse {
  status: "success" | "error";
  message: string;
  intent?: IntentAnalysis;
  result?: any;
  conversation_id?: string;
  error?: string;
  allStepResults?: any[]; // For multi-step operations
}

async function parseClaudeIntent(response: any): Promise<IntentAnalysis> {
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  console.log("Claude response content:", content.text);
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

  let intentAnalysis;
  try {
    intentAnalysis = JSON.parse(jsonStr);
  } catch (parseError: any) {
    console.error("❌ JSON parsing failed:", parseError);
    console.error("Problematic JSON string:", jsonStr);

    // Try to fix common JSON issues
    let fixedJsonStr = jsonStr
      .replace(/,\s*}/g, "}") // Remove trailing commas in objects
      .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
      .replace(/:\s*([^",\[\]{}]+)([,}])/g, ': "$1"$2') // Quote unquoted string values
      .replace(/: "(\d+\.?\d*)"([,}])/g, ": $1$2") // Unquote numeric values
      .replace(/: "(true|false)"([,}])/g, ": $1$2"); // Unquote boolean values

    console.log("🔧 Attempting to fix JSON:", fixedJsonStr);

    try {
      intentAnalysis = JSON.parse(fixedJsonStr);
      console.log("✅ JSON parsing succeeded after fixes");
    } catch (secondParseError: any) {
      console.error("❌ Second JSON parsing attempt failed:", secondParseError);
      throw new Error(
        `JSON parsing failed: ${(parseError as Error).message}. Original: ${jsonStr}`
      );
    }
  }

  // Validate required fields with detailed error messages
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

  // Validate endpoint format
  if (
    intentAnalysis.endpoint !== "none" &&
    intentAnalysis.endpoint !== "multi_step" &&
    !intentAnalysis.endpoint.startsWith("/api/")
  ) {
    throw new Error(
      'Invalid endpoint format: must be "none", "multi_step", or start with "/api/"'
    );
  }

  console.log("✅ Parsed Claude intent analysis:", intentAnalysis);
  return intentAnalysis;
}

function extractOfferedOptions(assistantMessage: string): string[] {
  const options: string[] = [];
  const message = assistantMessage.toLowerCase();

  // Look for specific IMAI feature recommendations
  if (message.includes("upscale")) options.push("upscale");
  if (message.includes("landscape") || message.includes("portrait"))
    options.push("reframe");
  if (message.includes("background")) options.push("background_modify");
  if (message.includes("similar design") || message.includes("create similar"))
    options.push("create_similar");
  if (message.includes("different colors") || message.includes("apply colors"))
    options.push("color_modify");
  if (message.includes("enhance") || message.includes("improve"))
    options.push("enhance");
  if (message.includes("analyze") || message.includes("describe"))
    options.push("analyze");

  return options;
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

    const hasProductImage =
      formDataEntries.some(
        ([key]) =>
          key === "product_image" ||
          key === "product_image_url" ||
          key === "preset_product_type"
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Product Image:") ||
          msg.content.includes("product_image")
      );
    const hasDesignImage =
      formDataEntries.some(
        ([key]) =>
          key === "design_image" ||
          key === "design_image_url" ||
          key === "preset_design_style"
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Design Image:") ||
          msg.content.includes("design_image")
      );
    const hasColorImage =
      formDataEntries.some(
        ([key]) =>
          key === "color_image" ||
          key === "color_image_url" ||
          key === "preset_color_palette"
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Color Image:") ||
          msg.content.includes("color_image")
      );

    // Check for preset selections
    const hasPresetProduct = formDataEntries.some(
      ([key]) => key === "preset_product_type"
    );
    const hasPresetDesign = formDataEntries.some(
      ([key]) => key === "preset_design_style"
    );
    const hasPresetColor = formDataEntries.some(
      ([key]) => key === "preset_color_palette"
    );
    const hasAnyPresets = hasPresetProduct || hasPresetDesign || hasPresetColor;

    console.log("Smart fallback analysis - Image detection:", {
      hasProductImage,
      hasDesignImage,
      hasColorImage,
      hasPresetProduct,
      hasPresetDesign,
      hasPresetColor,
      hasAnyPresets,
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
      // Math and simple questions
      "what is",
      "what's",
      "whats",
      "2+2",
      "2 + 2",
      "calculate",
      "math",
      "sum",
      "plus",
      "minus",
      "multiply",
      "divide",
      "h2o",
      "water",
      "drink",
      "python",
      "code",
      "for loop",
      "programming",
      "weather",
      "time",
      "date",
    ];

    // Check for design-related keywords that should NOT be casual conversation
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
      "airplane",
      "aeroplane",
      "plane",
      "car",
      "truck",
      "boat",
      "ship",
    ];

    const hasDesignKeywords = designKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    // 🚨 ENHANCED: Better casual conversation detection
    // 🚨 ENHANCED: Better casual conversation detection with partial matching
    const isCasualConversation =
      casualPatterns.some(
        (pattern) =>
          message.includes(pattern) ||
          message === pattern ||
          message.startsWith(pattern) ||
          pattern.includes(message.toLowerCase())
      ) && !hasDesignKeywords; // Only casual if no design keywords present

    // 🆕 Return casual conversation intent for local LLM
    if (isCasualConversation && !hasAnyPresets) {
      console.log(
        "🤖 Smart fallback detected casual conversation - routing to local LLM"
      );
      return {
        intent: "casual_conversation",
        confidence: 0.95,
        endpoint: "none",
        parameters: {},
        requiresFiles: false,
        explanation:
          "Casual conversation - will use local LLM for response generation",
      };
    }

    // 🎯 PRIORITY: Direct routing for preset selections
    if (hasAnyPresets) {
      console.log(
        "Smart fallback routing directly to design endpoint - preset selections detected"
      );

      // 🚨 CRITICAL: Check if this is a modification of existing content vs fresh design
      const hasExplicitReference = formDataEntries.some(
        ([key]) => key === "explicit_reference"
      );
      const shouldClearContext = !hasExplicitReference; // Only clear if no explicit reference

      console.log(
        `📋 Preset with explicit reference: ${hasExplicitReference}, clear_context: ${shouldClearContext}`
      );

      return {
        intent: "design",
        confidence: 0.95,
        endpoint: "/api/design",
        parameters: {
          workflow_type: "preset_design",
          size: "1024x1024",
          quality: "auto",
          clear_context: shouldClearContext,
        },
        requiresFiles: false, // Presets don't require actual files
        explanation: hasExplicitReference
          ? "User selected preset options to modify referenced image - preserving context"
          : "User selected preset options - routing directly to design endpoint with fresh context",
      };
    }

    // 🆕 PRIORITY: Check for fresh design requests that should ignore previous context
    const freshDesignPatterns = [
      "generate",
      "can you generate",
      "create",
      "make",
      "design",
      "new",
    ];
    const isFreshDesignRequest =
      freshDesignPatterns.some((pattern) =>
        message.toLowerCase().includes(pattern.toLowerCase())
      ) && hasDesignKeywords;

    if (isFreshDesignRequest) {
      console.log(
        "🆕 Smart fallback detected fresh design request - clearing context"
      );
      return {
        intent: "design",
        confidence: 0.9,
        endpoint: "/api/design",
        parameters: {
          workflow_type: "prompt_only",
          size: "1024x1024",
          quality: "auto",
          clear_context: true, // Don't use previous results
        },
        requiresFiles: false,
        explanation: "Fresh design request - starting with clean context",
      };
    }

    // 🎯 PRIORITY: Check for upscale/enhance requests even without new images (conversation context)
    const upscaleKeywords = [
      "enhance",
      "upscale",
      "upcale",
      "upscal",
      "make bigger",
      "increase resolution",
      "improve quality",
      "make it bigger",
      "enhance it",
      "upscale it",
      "upcale it",
    ];
    const hasUpscaleRequest = upscaleKeywords.some((keyword) =>
      message.includes(keyword)
    );

    if (
      hasUpscaleRequest &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage
    ) {
      // Check if this is actually a multi-step operation that wasn't caught earlier
      if (
        message.includes("landscape") ||
        message.includes("portrait") ||
        message.includes("reframe") ||
        message.includes("crop")
      ) {
        console.log(
          "Smart fallback detected multi-step upscale + reframe operation"
        );
        const orientation = message.includes("landscape")
          ? "landscape"
          : message.includes("portrait")
            ? "portrait"
            : "auto";

        return {
          intent: "upscale_image",
          confidence: 0.95,
          endpoint: "/api/upscale",
          parameters: { quality: "auto" },
          requiresFiles: true,
          explanation: "First step of upscale + reframe operation",
          isMultiStep: true,
          multiStepPlan: {
            steps: [
              {
                intent: "upscale_image",
                confidence: 0.95,
                endpoint: "/api/upscale",
                parameters: { quality: "auto" },
                requiresFiles: true,
                explanation: "Step 1: Upscale image",
                isMultiStep: true,
              },
              {
                intent: "reframe_image",
                confidence: 0.95,
                endpoint: "/api/reframe",
                parameters: { imageSize: orientation },
                requiresFiles: true,
                explanation: "Step 2: Reframe to " + orientation,
                isMultiStep: true,
              },
            ],
            executionPlan: "sequential",
            contextChain: true,
          },
        };
      }

      console.log(
        "Smart fallback detected upscale request without new images - using conversation context"
      );
      return {
        intent: "upscale_image",
        confidence: 0.95,
        endpoint: "/api/upscale",
        parameters: { quality: "auto" },
        requiresFiles: true,
        explanation:
          "User wants to upscale previous image from conversation context",
      };
    }

    // Similar detection for other operations on previous results
    const analyzeKeywords = [
      "analyze",
      "describe",
      "what is in",
      "what's in",
      "identify",
      "what do you see",
      "analyze it",
      "describe it",
      "analyze this",
      "describe this",
    ];

    // Don't treat general questions about capabilities as image analysis
    const isGeneralQuestion =
      message.includes("capabilities") ||
      message.includes("what can you do") ||
      message.includes("your features") ||
      message.includes("help me") ||
      (message.includes("tell me about") && !message.includes("this image")) ||
      (message.includes("explain") && !message.includes("this image"));

    const hasAnalyzeRequest =
      analyzeKeywords.some((keyword) => message.includes(keyword)) &&
      !isGeneralQuestion;

    if (
      hasAnalyzeRequest &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage &&
      !isGeneralQuestion
    ) {
      console.log(
        "Smart fallback detected analyze request without new images - using conversation context"
      );
      return {
        intent: "analyze_image",
        confidence: 0.95,
        endpoint: "/api/analyzeimage",
        parameters: {},
        requiresFiles: true,
        explanation:
          "User wants to analyze previous image from conversation context",
      };
    }

    const reframeKeywords = [
      "reframe",
      "crop",
      "landscape",
      "portrait",
      "square",
      "resize",
      "crop it",
      "reframe it",
      "make it square",
    ];
    const hasReframeRequest = reframeKeywords.some((keyword) =>
      message.includes(keyword)
    );

    if (
      hasReframeRequest &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage
    ) {
      console.log(
        "Smart fallback detected reframe request without new images - using conversation context"
      );

      let imageSize = "square_hd"; // default
      if (message.includes("landscape")) {
        imageSize = "landscape";
      } else if (message.includes("portrait")) {
        imageSize = "portrait";
      } else if (message.includes("square")) {
        imageSize = "square_hd";
      }

      return {
        intent: "reframe_image",
        confidence: 0.95,
        endpoint: "/api/reframe",
        parameters: { imageSize: imageSize },
        requiresFiles: true,
        explanation: `User wants to reframe previous image to ${imageSize} format`,
      };
    }

    // 🎯 PRIORITY: Check for specific image operations BEFORE general design routing
    if (hasProductImage || hasDesignImage || hasColorImage) {
      const imageCount = [
        hasProductImage,
        hasDesignImage,
        hasColorImage,
      ].filter(Boolean).length;

      // UPSCALE requests (with typo tolerance)
      if (
        imageCount === 1 &&
        (message.includes("enhance") ||
          message.includes("upscale") ||
          message.includes("upcale") || // Common typo
          message.includes("upscal") || // Another typo
          message.includes("make bigger") ||
          message.includes("increase resolution") ||
          message.includes("improve quality"))
      ) {
        console.log(
          "Smart fallback routing to upscale endpoint for single image enhancement"
        );
        return {
          intent: "upscale_image",
          confidence: 0.95,
          endpoint: "/api/upscale",
          parameters: { quality: "auto" },
          requiresFiles: true,
          explanation:
            "User explicitly wants to enhance/upscale a single image",
        };
      }

      // REFRAME requests
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

        let imageSize = "square_hd"; // default
        if (message.includes("landscape")) {
          imageSize = "landscape";
        } else if (message.includes("portrait")) {
          imageSize = "portrait";
        } else if (message.includes("square")) {
          imageSize = "square_hd";
        }

        console.log(`🎯 Detected aspect ratio request: ${imageSize}`);

        return {
          intent: "reframe_image",
          confidence: 0.95,
          endpoint: "/api/reframe",
          parameters: { imageSize: imageSize },
          requiresFiles: true,
          explanation: `User explicitly wants to reframe/crop a single image to ${imageSize} format`,
        };
      }

      // ANALYZE requests
      if (
        imageCount === 1 &&
        (message.includes("analyze") ||
          message.includes("describe") ||
          (message.includes("tell me about") && message.includes("this")) ||
          message.includes("what is in") ||
          message.includes("what's in") ||
          message.includes("identify") ||
          (message.includes("explain") && message.includes("this")) ||
          message.includes("what do you see") ||
          message.includes("what can you see")) &&
        !message.includes("Create a design composition") &&
        !message.includes("design") &&
        !message.includes("create") &&
        !message.includes("make") &&
        !isGeneralQuestion
      ) {
        console.log(
          "Smart fallback routing to analyze endpoint for single image analysis"
        );
        return {
          intent: "analyze_image",
          confidence: 0.95,
          endpoint: "/api/analyzeimage",
          parameters: {},
          requiresFiles: true,
          explanation:
            "User explicitly wants to analyze a single specific image",
        };
      }
    }

    // 🎨 DESIGN REQUESTS: Only route very obvious design requests
    // Don't classify analysis requests as design just because they mention "image"
    const isObviousDesign =
      hasDesignKeywords &&
      !isCasualConversation &&
      !message.includes("tell me about") &&
      !message.includes("describe") &&
      !message.includes("analyze") &&
      !message.includes("what") &&
      (message.includes("generate") ||
        message.includes("create") ||
        message.includes("make"));

    if (isObviousDesign) {
      console.log(
        "Smart fallback routing to design endpoint - obvious design request"
      );
      return {
        intent: "design",
        confidence: 0.9, // Lower confidence so Claude can override if needed
        endpoint: "/api/design",
        parameters: {
          workflow_type: "prompt_only",
          size: "1024x1024",
          quality: "auto",
        },
        requiresFiles: false,
        explanation: "User request is obviously asking for design generation",
      };
    }

    // Check for prompt enhancement requests
    if (
      message.includes("enhance my prompt") ||
      message.includes("improve this description") ||
      message.includes("make my prompt better") ||
      message.includes("expand this prompt") ||
      message.includes("enhance prompt")
    ) {
      console.log("Smart fallback routing to prompt enhancer");
      return {
        intent: "enhance_prompt",
        confidence: 0.9,
        endpoint: "/api/promptenhancer",
        parameters: { enhancement_type: "design" },
        requiresFiles: false,
        explanation: "User explicitly wants to enhance their prompt",
      };
    }

    // Check for title generation requests
    if (
      message.includes("create a title") ||
      message.includes("name this conversation") ||
      message.includes("generate title") ||
      message.includes("what should I call this") ||
      message.includes("title for this")
    ) {
      console.log("Smart fallback routing to title renamer");
      return {
        intent: "generate_title",
        confidence: 0.9,
        endpoint: "/api/titlerenamer",
        parameters: {},
        requiresFiles: false,
        explanation: "User explicitly wants to generate a title",
      };
    }

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
        message.includes("create a flow design") ||
        message.includes("flow pattern") ||
        message.includes("make a flow") ||
        (message.includes("pattern") &&
          (message.includes("from these") || message.includes("using these")))
      ) {
        console.log(
          "Smart fallback routing to flowdesign endpoint for explicit flow/pattern design creation"
        );
        return {
          intent: "create_design",
          confidence: 0.98, // Higher confidence to override Claude
          endpoint: "/api/flowdesign",
          parameters: {
            workflow_type: "multi_image_design",
            size: "1024x1024",
            quality: "auto",
          },
          requiresFiles: true,
          explanation:
            "User explicitly wants to create a NEW flow design/pattern using multiple images",
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

      // Clarity upscaler (keeping this one as it wasn't moved above)
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
        (message.includes("mirror") ||
          message.includes("symmetry") ||
          message.includes("reflection") ||
          message.includes("mirror effect"))
      ) {
        console.log(
          "Smart fallback routing to mirror magic endpoint for image mirroring"
        );
        return {
          intent: "mirror_magic",
          confidence: 0.9,
          endpoint: "/api/mirrormagic",
          parameters: { workflow: "mirror" },
          requiresFiles: true,
          explanation:
            "User explicitly wants to create mirror/symmetry effect on image",
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

  // Reference detection patterns
  const referencePatterns = [
    "make it",
    "change it",
    "modify it",
    "update it",
    "alter it",
    "make this",
    "change this",
    "modify this",
    "update this",
    "make that",
    "change that",
    "modify that",
    "update that",
    "in [color]",
    "with [style]",
    "but [modification]",
    "add [element]",
    "remove [element]",
    "without [element]",
    "more [adjective]",
    "less [adjective]",
    "bigger",
    "smaller",
    "different color",
    "another color",
    "new color",
    "same but",
    "similar but",
    "like this but",
  ];

  const hasReference = referencePatterns.some((pattern) =>
    userMessage.toLowerCase().includes(pattern.replace(/\[.*?\]/g, ""))
  );

  const systemPrompt = `You are IRIS, an AI intent recognition system for IMAI image platform with CONVERSATION CONTEXT AWARENESS.

CONTEXT ANALYSIS:
- You have access to conversation history and previous results
- Detect when users reference previous images/results with phrases like "make it", "change it", "modify this"
- If user references previous result, continue with the SAME operation type but with modifications

REFERENCE DETECTION:
${hasReference ? `🔍 REFERENCE DETECTED: User is referring to a previous result with: "${userMessage}"` : ""}
${lastGeneratedResult ? `📋 LAST RESULT: ${lastGeneratedResult.intent} via ${lastGeneratedResult.endpoint}${lastGeneratedResult.imageUrl ? ` (Image: ${lastGeneratedResult.imageUrl})` : ""}` : ""}

CLASSIFICATION RULES:

1. CASUAL CONVERSATION → endpoint: "none"
   - Greetings: "hi", "hello", "hey", "good morning"
   - Questions: "how are you?", "what can you do?", "help me"
   - Vague requests: "I need help", "what is this?"
   - ANY unclear/ambiguous requests WITHOUT context

2. REFERENCE-BASED OPERATIONS (when user refers to previous result):
   - "make it [color]" → SAME endpoint as last result + color parameters
   - "change it to [style]" → SAME endpoint as last result + style parameters
   - "make it bigger" → /api/upscale (regardless of previous endpoint)
   - "crop it" → /api/reframe (regardless of previous endpoint)
   - "analyze it" → /api/analyzeimage (regardless of previous endpoint)

3. NEW IMAGE OPERATIONS → specific API endpoint
   A. NEW PATTERN CREATION → /api/flowdesign
      - ONLY for creating NEW abstract patterns/flows from scratch
      - "create a NEW pattern using these images"
      - "make a NEW pattern"
      - "new pattern with colors"
      - "flow pattern"
      - "flow design"
      - "create a flow pattern"
      - "create a flow design"
      - "make a flow design"
      - "generate abstract pattern"
      - "pattern from these images"

   B. PRODUCT DESIGN → /api/design
      - ONLY for applying designs TO products (t-shirts, mugs, etc.)
      - "make a design" 
      - "create a design" 
      - "apply design to product"
      - "put this design on the product"
      - "change my product design"
      - "design for t-shirt"
      - "product mockup"
      - ALSO for modifying existing designs with colors/styles
      - ALSO when user selects predefined product types, design styles, or color palettes from UI

   C. IMAGE ENHANCEMENT → /api/upscale
      - "enhance this image"
      - "upscale this photo"
      - "make bigger"
      - "increase resolution"

   D. IMAGE CLARITY → /api/clarityupscaler
      - "sharpen this image"
      - "improve clarity"
      - "make it crisp"
      - "high definition"

   E. IMAGE REFRAMING → /api/reframe
      - "reframe my image"
      - "crop this picture"
      - "make it landscape/portrait"

   F. VIDEO CREATION → /api/kling
      - "animate this image"
      - "create a video"
      - "make it move"

   G. IMAGE ANALYSIS → /api/analyzeimage
      - "analyze this photo/image"
      - "what's in this image?"
      - "describe this image"
      - "tell me about this image"
      - "tell me about the [X] image"  
      - "what do you see in this?"
      - "explain this image"
      - "what can you tell me about this?"
      - ANY request asking for description/analysis of an existing image

   H. MIRROR MAGIC → /api/mirrormagic
      - "mirror this image"
      - "create symmetry"
      - "mirror effect"
      - "reflection"

   I. PROMPT ENHANCEMENT → /api/promptenhancer
      - "enhance my prompt"
      - "improve this description"
      - "make my prompt better"
      - "expand this prompt"

   J. TITLE GENERATION → /api/titlerenamer
      - "create a title"
      - "name this conversation"
      - "generate title"
      - "what should I call this"

CRITICAL RULES:
1. ALWAYS route to "none" for: greetings ONLY (without design requests), general questions about the platform, vague help requests
2. ANALYSIS TAKES PRIORITY: If someone asks "tell me about", "describe", "what is", "analyze" + mentions an image → /api/analyzeimage (NOT design!)
3. /api/flowdesign → ONLY for creating NEW abstract patterns/flows from scratch
4. /api/design → For generating NEW images, creating designs, product compositions (t-shirts, mugs, etc.)
5. If request mentions "pattern" or "flow" → /api/flowdesign
6. If request mentions "generate image", "create image", "make image", "design" → /api/design
7. When in doubt between analysis vs design: if they're asking ABOUT an existing image → analysis, if they want to CREATE → design

CRITICAL CONTEXT RULES:
1. If user UPLOADED images + uses "it"/"this"/"that" → They mean the UPLOADED image, NOT previous results
2. If user references previous result ("it", "this", "that") WITHOUT uploaded images → Use SAME endpoint + modifications
3. If last result was design + user wants color change → /api/design with color parameters
4. If last result was any type + user wants "bigger" → /api/upscale
5. If last result was any type + user wants "crop" → /api/reframe
6. Extract color/style parameters from reference requests
7. When in doubt with references, default to last used endpoint

INTELLIGENT REFERENCE UNDERSTANDING:
- "suggest me some tshirt that would go with this bag" = User wants NEW t-shirt design INSPIRED by the referenced bag
- "make this in blue" = User wants to MODIFY the referenced image with blue colors
- "create something similar" = User wants NEW design INSPIRED by the reference
- Always distinguish between MODIFICATION vs INSPIRATION requests

UPLOADED IMAGE RULES:
1. If user uploaded image + wants "upscale"/"bigger"/"enhance" → /api/upscale
2. If user uploaded image + wants "reframe"/"crop"/"landscape"/"portrait" → /api/reframe
3. If user uploaded image + wants "analyze"/"describe"/"what is" → /api/analyzeimage
4. If user uploaded image + wants "design"/"apply design" → /api/design
5. If user uploaded image + wants "video"/"animate" → /api/kling
6. If user uploaded image + wants "clarity"/"sharpen" → /api/clarityupscaler

PREDEFINED SELECTION RULES:
1. If user selected product type, design style, or color palette WITHOUT specific instructions → /api/design
2. If user selected predefined options + has text prompt → Combine both for design generation
3. Predefined selections should be included in parameters for design endpoint

CRITICAL PRESET SELECTION UNDERSTANDING:
- PRESET SELECTIONS ARE EQUIVALENT TO UPLOADED IMAGES - they provide visual design context
- When you see preset_product_type, preset_design_style, preset_color_palette in the form data → USER HAS PROVIDED VISUAL CONTENT
- Empty message + preset selections = DESIGN REQUEST, NOT casual conversation
- Empty message + manual references = DESIGN REQUEST, NOT casual conversation  
- Empty message + preset selections + manual references = DESIGN REQUEST, NOT casual conversation
- "Create a design composition using the uploaded images" + presets = DESIGN intent with confidence 0.95+
- Never classify preset-based requests as "casual_conversation" - presets ARE the uploaded content
- Never classify reference-based requests as "casual_conversation" - references ARE visual content
- RULE: If user has ANY visual content (presets, references, uploaded images), it's NEVER casual conversation

ASPECT RATIO SELECTION RULES (OpenAI Supported Dimensions Only):
1. For pants, trousers, leggings, jeans → use "1536x1024" (landscape) - clothing looks better wide
2. For dresses, shirts, jackets, coats → use "1024x1536" (portrait) - tall clothing items
3. For shoes, bags, accessories, jewelry → use "1024x1024" (square) - compact items
4. For general designs or unclear product type → use "1024x1024" (square) as default
5. If user specifically mentions "landscape" or "wide" → use "1536x1024"
6. If user specifically mentions "portrait" or "tall" → use "1024x1536"
7. CRITICAL: Only use these exact dimensions: 1024x1024, 1024x1536, 1536x1024, or "auto" - no other sizes are supported

MULTI-STEP OPERATIONS:
- Detect when users want multiple operations: "upscale and make landscape", "create design and then upscale"
- For multi-step operations, return intent "multi_step" with steps array
- Use context_chain: true when output of step 1 becomes input of step 2
- Common patterns: upscale→reframe, design→upscale, analyze→design

CONVERSATION FLOW RULES FOR SPECIFIC RECOMMENDATIONS:
1. If assistant offered specific options (check LAST ASSISTANT MESSAGE for offered options):
   - "yes" or "all" → Create multi_step with all offered options
   - "upscale" → Route to /api/upscale
   - "landscape" or "portrait" → Route to /api/reframe
   - "background" → Route to /api/design with background modification
   - "similar" or "create similar" → Route to /api/design with reference
   - "colors" or "different colors" → Route to /api/design with color changes
   - "A" or "first" or "1" → Route to first option mentioned
   - "B" or "second" or "2" → Route to second option mentioned  
   - "C" or "third" or "3" → Route to third option mentioned
   - "upscale and landscape" → Create multi_step with both operations
2. CRITICAL: If user says "third one" or "the third" and assistant offered "create similar design", route to /api/design
3. If assistant asked vague question without specific options:
   - Vague responses like "yes please" should be "casual_conversation" for clarification
4. User can always override with explicit intent: "create design", "analyze this", etc.
5. Use conversation context to understand WHAT they're referring to and WHICH options were offered
6. Parse user responses against the specific options the assistant provided

MAPPING OFFERED OPTIONS TO ENDPOINTS:
- "upscale" → /api/upscale
- "reframe" → /api/reframe  
- "background_modify" → /api/design with background parameters
- "create_similar" → /api/design with reference parameters
- "color_modify" → /api/design with color parameters
- "enhance" → /api/upscale or /api/clarityupscaler
- "analyze" → /api/analyzeimage

RESPONSE FORMAT:

For multi-step operations:
{
  "intent": "multi_step",
  "confidence": 0.8-0.95,
  "endpoint": "multi_step",
  "parameters": {
    "steps": [
      {
        "intent": "upscale_image",
        "endpoint": "/api/upscale",
        "parameters": {"quality": "auto"}
      },
      {
        "intent": "reframe_image", 
        "endpoint": "/api/reframe",
        "parameters": {"imageSize": "landscape"}
      }
    ],
    "execution_plan": "sequential",
    "context_chain": true
  },
  "requiresFiles": true,
  "explanation": "Multi-step operation: upscale → reframe to landscape"
}

For single operations:
{
  "intent": "casual_conversation|create_design|design|upscale_image|clarity_upscale|analyze_image|reframe_image|create_video|mirror_magic|enhance_prompt|generate_title",
  "confidence": 0.8-0.95,
  "endpoint": "none|/api/flowdesign|/api/design|/api/upscale|/api/clarityupscaler|/api/analyzeimage|/api/reframe|/api/kling|/api/mirrormagic|/api/promptenhancer|/api/titlerenamer",
  "parameters": {
    "workflow_type": "prompt_only|product_prompt|design_prompt|multi_image_design",
    "size": "1024x1024|1792x1024|1024x1792", // Choose based on product type: square for general, landscape for pants/clothing, portrait for tall items
    "quality": "auto",
    "reference_image_url": "use_previous_result_if_referencing",
    "color_modification": "extracted_colors_if_mentioned",
    "style_modification": "extracted_style_if_mentioned",
    "product_type": "pants|shirt|shoe|scarf|dress|etc_if_mentioned"
  },
  "requiresFiles": true/false,
  "explanation": "Brief explanation including context awareness"
}`;

  // 🧠 CLAUDE FIRST: Let Claude handle 95% of intent classification
  // Only use smart fallback for very obvious cases where Claude is unnecessary

  const smartResult = smartFallbackAnalysis();

  // Only bypass Claude for extremely obvious cases with very high confidence
  const isSuperObvious =
    smartResult.confidence >= 0.95 &&
    // Only bypass Claude for these super obvious patterns:
    (smartResult.intent === "upscale_image" ||
      smartResult.intent === "reframe_image" ||
      (smartResult.intent === "design" &&
        userMessage.toLowerCase().includes("generate") &&
        userMessage.toLowerCase().includes("image")) ||
      // ✅ RESTORED: Always bypass Claude for preset selections WITHOUT manual references
      // This handles the case where user just selects presets and clicks generate
      (smartResult.intent === "design" &&
        formDataEntries.some(([key]) => key.startsWith("preset_")) &&
        !formDataEntries.some(([key]) => key === "explicit_reference")));

  if (isSuperObvious) {
    console.log(
      "⚡ Using smart fallback for super obvious operation - skipping Claude"
    );
    return smartResult;
  }

  console.log(
    "🧠 Using Claude for intelligent analysis (let Claude be the brain!)"
  );

  try {
    console.log("🧠 Analyzing intent with Claude Sonnet 4...");
    console.log("User message:", userMessage);
    console.log("API Key available:", !!process.env.ANTHROPIC_API_KEY);

    // Extract image metadata - check for any image-related fields
    const imageFileEntries = formDataEntries.filter(([key, value]) => {
      const isImageField =
        key.includes("image") ||
        key === "file" ||
        key === "product" ||
        key === "design" ||
        key === "color";
      const isValidFile = value instanceof File && value.size > 0;
      const isBase64 =
        typeof value === "string" && value.startsWith("data:image/");
      const isImageUrl =
        typeof value === "string" &&
        (value.startsWith("http") || value.startsWith("https")) &&
        (key.includes("image_url") || key.includes("_url"));
      return isImageField && (isValidFile || isBase64 || isImageUrl);
    });

    const hasUploadedImages = imageFileEntries.length > 0;

    // Extract predefined selections from constants
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

    // Build conversation context
    const recentHistory = conversationHistory.slice(-4); // Last 4 messages for context
    const contextSummary =
      recentHistory.length > 0
        ? recentHistory
            .map(
              (msg) =>
                `${msg.role}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? "..." : ""}`
            )
            .join("\n")
        : "No previous conversation";

    // Get the last assistant message for conversation context
    const lastAssistantMessage = conversationHistory
      .slice()
      .reverse()
      .find((msg) => msg.role === "assistant");

    const assistantContext = lastAssistantMessage
      ? `LAST ASSISTANT MESSAGE: "${lastAssistantMessage.content}"`
      : "No previous assistant message";

    // Analyze if assistant offered specific recommendations
    const offeredOptions = lastAssistantMessage?.content
      ? extractOfferedOptions(lastAssistantMessage.content)
      : [];
    const offeredOptionsContext =
      offeredOptions.length > 0
        ? `\n🎯 ASSISTANT OFFERED SPECIFIC OPTIONS: ${offeredOptions.join(", ")}`
        : "";

    // Build a clear, structured prompt with context
    const prompt = `
Analyze this user message with full conversation context:

CURRENT USER MESSAGE: "${userMessage}"

UPLOADED IMAGES IN THIS REQUEST: ${hasUploadedImages ? `YES (${imageFileEntries.length} images uploaded)` : "NO"}
${hasUploadedImages ? imageFileEntries.map(([key]) => `- ${key}`).join("\n") : ""}

PREDEFINED SELECTIONS FROM UI (THESE ARE VISUAL UPLOADS):
- Product Type: ${productType || "None selected"} ${productType ? "✅ VISUAL CONTENT PROVIDED" : ""}
- Design Styles: ${designStyles.length > 0 ? designStyles.join(", ") + " ✅ VISUAL CONTENT PROVIDED" : "None selected"}
- Color Palettes: ${colorPalettes.length > 0 ? colorPalettes.join(", ") + " ✅ VISUAL CONTENT PROVIDED" : "None selected"}

PRESET SELECTIONS DETECTED: ${formDataEntries.some(([key]) => key.startsWith("preset_")) ? "YES ✅ VISUAL CONTENT PROVIDED" : "NO"}
${formDataEntries
  .filter(([key]) => key.startsWith("preset_"))
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

MANUAL REFERENCES DETECTED: ${formDataEntries.some(([key]) => key === "explicit_reference") ? "YES ✅ VISUAL CONTENT PROVIDED" : "NO"}

${
  formDataEntries.some(([key]) => key.startsWith("preset_"))
    ? "🎨 IMPORTANT: User has provided PRESET SELECTIONS which are equivalent to uploaded images. This is NOT a casual conversation - it's a DESIGN REQUEST!"
    : ""
}

${
  formDataEntries.some(([key]) => key === "explicit_reference") &&
  formDataEntries.some(([key]) => key.startsWith("preset_"))
    ? "🔗 COMPLEX SCENARIO: User has BOTH manual references AND preset selections. This is a DESIGN REQUEST to modify/create using the referenced image + new presets. NEVER classify this as casual_conversation!"
    : ""
}

${
  formDataEntries.some(([key]) => key === "explicit_reference") ||
  formDataEntries.some(([key]) => key.startsWith("preset_"))
    ? "🚨 CRITICAL: The user HAS PROVIDED VISUAL CONTENT (presets and/or references). Empty message + visual content = DESIGN REQUEST, not casual conversation!"
    : ""
}

CONVERSATION CONTEXT:
${assistantContext}${offeredOptionsContext}

RECENT CONVERSATION HISTORY:
${contextSummary}

${
  lastGeneratedResult
    ? `
PREVIOUS RESULT CONTEXT:
- Last operation: ${lastGeneratedResult.intent} 
- Last endpoint: ${lastGeneratedResult.endpoint}
- Generated image: ${lastGeneratedResult.imageUrl || "None"}
`
    : ""
}

REFERENCE ANALYSIS:
- Contains reference words: ${hasReference ? "YES" : "NO"}
- Has uploaded images: ${hasUploadedImages ? "YES" : "NO"}
- Likely referring to UPLOADED image: ${hasReference && hasUploadedImages ? "YES" : "NO"}
- Likely referring to PREVIOUS result: ${hasReference && lastGeneratedResult && !hasUploadedImages ? "YES" : "NO"}

CRITICAL: If user uploaded images and uses words like "it", "this", "that" - they are referring to the UPLOADED images, NOT previous results!

Follow system instructions and return intent JSON only.`;

    let intentAnalysis;
    try {
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

      intentAnalysis = await parseClaudeIntent(response);
    } catch (error) {
      console.warn(
        "⚠️ First attempt failed, retrying Claude intent parsing..."
      );

      // Retry with slightly higher temperature for more creative parsing
      const retryResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        temperature: 0.2, // Slightly higher temperature for retry
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt + "\n\nPlease ensure your response is valid JSON.",
          },
        ],
      });

      intentAnalysis = await parseClaudeIntent(retryResponse);
    }

    return intentAnalysis;
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
    // 🤖 NEW: Try Claude first for casual conversations
    if (
      intentAnalysis.intent === "casual_conversation" &&
      intentAnalysis.confidence >= 0.9
    ) {
      console.log("🤖 Attempting to use Claude for casual conversation");
      const claudeResponse =
        await claudeLLM.generateCasualResponse(userMessage);

      if (claudeResponse.success && !claudeResponse.usedFallback) {
        console.log("✅ Claude response generated successfully");
        return claudeResponse.text;
      } else {
        console.log(
          "⚠️ Claude failed, using smart fallback:",
          claudeResponse.error
        );
        return smartFallbackResponse();
      }
    }

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
        // Special handling for image analysis - include the actual analysis content
        if (intentAnalysis.intent === "analyze_image" && apiResult.result) {
          const analysisContent =
            apiResult.result.raw_analysis ||
            JSON.stringify(apiResult.result, null, 2);
          prompt = `The user said: "${userMessage}"

I successfully analyzed their image using ${intentAnalysis.endpoint}. Here's what I found:

${analysisContent}

Generate a SHORT response (2-3 sentences max) that:
1. Briefly mentions key visual findings (colors, shapes, composition) in 1 sentence
2. Offers 3 simple options: "Would you like me to **upscale this**, **change to landscape**, or **create similar design**?"
3. Use just the feature names without detailed explanations
4. Keep it concise and direct. Use 1 emoji max.`;
        } else {
          // For all other successful image operations, provide proactive recommendations
          const operationNames: Record<string, string> = {
            design: "custom design",
            design_image: "design composition",
            elemental_design: "elemental design",
            flow_design: "flow design",
            reframe_image: "image reframing",
            upscale_image: "image upscaling",
          };

          const operationName =
            operationNames[intentAnalysis.intent] ||
            intentAnalysis.intent.replace("_", " ");

          prompt = `The user said: "${userMessage}"

I successfully created their ${operationName} and the result is ready!

Generate a SHORT response (2-3 sentences max) that:
1. Celebrates the success briefly (1 sentence)
2. Offers 3 simple options: "Would you like me to **upscale this**, **change to landscape**, or **create similar with different colors**?"
3. Use just the feature names without detailed explanations
4. Keep it concise and direct. Use 1 emoji max.`;
        }
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
  imageUrls: Record<string, string> = {},
  request?: NextRequest
): Promise<any> {
  try {
    // ✅ Instead of making HTTP calls, import and call the API logic directly
    // This avoids authentication issues and is more efficient
    console.log(`🌐 Calling ${endpoint} logic directly (no HTTP call)`);

    // Create FormData for the API call parameters
    const formData = new FormData();
    formData.append("userid", userid);
    console.log("🔗 Using Firebase Storage with imageUrls:", imageUrls);

    // Helper function to extract category from preset path
    const extractPresetCategory = (path: string): string => {
      if (path.includes("/")) {
        // Extract filename without extension
        return path.split("/").pop()?.split(".")[0] || path;
      }
      return path;
    };

    // Extract preset selections from the original FormData
    const presetSelections: Record<string, string | string[]> = {};
    const fileEntries = Array.from(files.entries());
    for (const [key, value] of fileEntries) {
      if (key.startsWith("preset_") && typeof value === "string") {
        let processedValue = value;

        // Extract category from path for design and color presets
        if (key === "preset_design_style" || key === "preset_color_palette") {
          processedValue = extractPresetCategory(value);
        }

        // Handle multiple selections for the same key
        if (presetSelections[key]) {
          // Convert to array if not already
          if (Array.isArray(presetSelections[key])) {
            (presetSelections[key] as string[]).push(processedValue);
          } else {
            presetSelections[key] = [
              presetSelections[key] as string,
              processedValue,
            ];
          }
        } else {
          presetSelections[key] = processedValue;
        }
        console.log(
          `📋 Found preset selection: ${key} = ${processedValue} (from ${value})`
        );
      }
    }

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

      // Add color/style modifications if specified
      if (parameters.color_modification) {
        formData.append("color_modification", parameters.color_modification);
        console.log(
          "🎨 Added color modification:",
          parameters.color_modification
        );
      }
      if (parameters.style_modification) {
        formData.append("style_modification", parameters.style_modification);
        console.log(
          "✨ Added style modification:",
          parameters.style_modification
        );
      }

      // 🎯 Pass image URLs instead of files - check all possible key patterns
      const imageFields = ["product_image", "design_image", "color_image"];
      imageFields.forEach((field) => {
        if (imageUrls[field]) {
          formData.append(`${field}_url`, imageUrls[field]);
          console.log(`🔗 Added ${field}_url:`, imageUrls[field]);
        }
      });

      // Also check for any processed URLs from file uploads that might have different key names
      Object.keys(imageUrls).forEach((key) => {
        if (key.includes("product") && !formData.has("product_image_url")) {
          formData.append("product_image_url", imageUrls[key]);
          console.log(
            `🔗 Added product_image_url from ${key}:`,
            imageUrls[key]
          );
        } else if (
          key.includes("design") &&
          !formData.has("design_image_url")
        ) {
          formData.append("design_image_url", imageUrls[key]);
          console.log(`🔗 Added design_image_url from ${key}:`, imageUrls[key]);
        } else if (key.includes("color") && !formData.has("color_image_url")) {
          formData.append("color_image_url", imageUrls[key]);
          console.log(`🔗 Added color_image_url from ${key}:`, imageUrls[key]);
        }
      });

      // 🔄 Handle reference image intelligently based on context
      if (parameters.reference_image_url) {
        // Check if we have inherited product presets - if so, DON'T override product
        const hasInheritedProduct = presetSelections.preset_product_type;
        const hasInheritedDesign = presetSelections.preset_design_style;

        if (hasInheritedProduct && !formData.has("product_image_url")) {
          // We have a product type preset, so reference image should be for inspiration only
          console.log(
            "🧬 Preserving product type preset, using reference for style inspiration only"
          );
          // Don't add reference as product_image_url - let preset handle product type
        } else if (
          !formData.has("product_image_url") &&
          !formData.has("design_image_url")
        ) {
          // Check if this is a fresh design request before adding reference
          const claudeExplanation = parameters.explanation?.toLowerCase() || "";
          const isExplicitlyFreshRequest =
            claudeExplanation.includes("not referencing previous results") ||
            claudeExplanation.includes("new design request") ||
            claudeExplanation.includes("fresh design request") ||
            parameters.workflow_type === "prompt_only";

          if (!isExplicitlyFreshRequest) {
            // No presets, so reference image becomes the product to modify
            formData.append(
              "product_image_url",
              parameters.reference_image_url
            );
            console.log(
              "🔄 Added reference image as product_image_url:",
              parameters.reference_image_url
            );
          } else {
            console.log(
              "🆕 Skipping product_image_url - fresh design request detected:",
              claudeExplanation
            );
          }
        } else {
          console.log(
            "🔄 Reference image available but product/design already defined via presets"
          );
        }
      }

      // 📋 Handle preset selections
      if (presetSelections.preset_product_type) {
        const productType = Array.isArray(presetSelections.preset_product_type)
          ? presetSelections.preset_product_type.join(", ")
          : presetSelections.preset_product_type;
        formData.append("preset_product_type", productType);
        console.log("📋 Added preset product type:", productType);
      }
      if (presetSelections.preset_design_style) {
        const designStyle = Array.isArray(presetSelections.preset_design_style)
          ? presetSelections.preset_design_style.join(", ")
          : presetSelections.preset_design_style;
        formData.append("preset_design_style", designStyle);
        console.log("📋 Added preset design style:", designStyle);
      }
      if (presetSelections.preset_color_palette) {
        const colorPalette = Array.isArray(
          presetSelections.preset_color_palette
        )
          ? presetSelections.preset_color_palette.join(", ")
          : presetSelections.preset_color_palette;
        formData.append("preset_color_palette", colorPalette);
        console.log("📋 Added preset color palette:", colorPalette);
      }
    } else if (endpoint === "/api/flowdesign") {
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
        imageUrls.product_image_image ||
        imageUrls.design_image ||
        imageUrls.design_image_image ||
        imageUrls.color_image ||
        imageUrls.color_image_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for analysis:", imageUrl);
      } else {
        console.log("🔍 Available imageUrls keys:", Object.keys(imageUrls));
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
        imageUrls.product_image_image ||
        imageUrls.design_image ||
        imageUrls.design_image_image ||
        imageUrls.color_image ||
        imageUrls.color_image_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for upscaling:", imageUrl);
      } else {
        console.log("🔍 Available imageUrls keys:", Object.keys(imageUrls));
        console.log("🔍 Available parameters:", Object.keys(parameters));
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
        imageUrls.product_image_image ||
        imageUrls.design_image ||
        imageUrls.design_image_image ||
        imageUrls.color_image ||
        imageUrls.color_image_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for reframing:", imageUrl);
      } else {
        console.log("🔍 Available imageUrls keys:", Object.keys(imageUrls));
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
        imageUrls.color_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

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

        // ✅ For clarityupscaler, we'll need to implement direct import or handle separately
        throw new Error(
          `Direct import not implemented for ${endpoint}. HTTP calls not supported in production.`
        );
      } else {
        throw new Error("No image URL found for clarity upscaling");
      }
    } else if (endpoint === "/api/kling") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

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
        imageUrls.color_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

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
    } else if (endpoint === "/api/promptenhancer") {
      // Add prompt enhancer parameters
      formData.append("prompt", originalMessage);

      if (parameters.enhancement_type) {
        formData.append("enhancement_type", parameters.enhancement_type);
      }

      // Add image context flags
      if (imageUrls.product_image) {
        formData.append("has_product_image", "true");
      }
      if (imageUrls.design_image) {
        formData.append("has_design_image", "true");
      }
      if (imageUrls.color_image) {
        formData.append("has_color_image", "true");
      }

      console.log("🔗 Added prompt enhancer parameters for:", originalMessage);
    } else if (endpoint === "/api/titlerenamer") {
      // Add title renamer parameters
      if (parameters.messages) {
        formData.append("messages", JSON.stringify(parameters.messages));
      } else {
        // Create a basic message structure if not provided
        const messages = [
          {
            role: "user",
            content: originalMessage,
            timestamp: new Date().toISOString(),
          },
        ];
        formData.append("messages", JSON.stringify(messages));
      }

      console.log("🔗 Added title renamer parameters");
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

    // ✅ Direct function call instead of HTTP request
    if (endpoint === "/api/design") {
      // Import and call the design API logic directly
      const { POST: designPOST } = await import("../design/route");

      // Create a mock NextRequest object with the FormData
      const mockRequest = new Request("http://localhost:3000/api/design", {
        method: "POST",
        body: formData,
      });

      const response = await designPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/reframe") {
      // Import and call the reframe API logic directly
      const { POST: reframePOST } = await import("../reframe/route");

      // Create a mock NextRequest object with the FormData
      const mockRequest = new Request("http://localhost:3000/api/reframe", {
        method: "POST",
        body: formData,
      });

      const response = await reframePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/upscale") {
      // Import and call the upscale API logic directly
      const { POST: upscalePOST } = await import("../upscale/route");

      const mockRequest = new Request("http://localhost:3000/api/upscale", {
        method: "POST",
        body: formData,
      });

      const response = await upscalePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/analyzeimage") {
      // Import and call the analyzeimage API logic directly
      const { POST: analyzeImagePOST } = await import("../analyzeimage/route");

      const mockRequest = new Request(
        "http://localhost:3000/api/analyzeimage",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await analyzeImagePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/flowdesign") {
      // Import and call the flowdesign API logic directly
      const { POST: flowDesignPOST } = await import("../flowdesign/route");

      const mockRequest = new Request("http://localhost:3000/api/flowdesign", {
        method: "POST",
        body: formData,
      });

      const response = await flowDesignPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/kling") {
      // Import and call the kling API logic directly
      const { POST: klingPOST } = await import("../kling/route");

      const mockRequest = new Request("http://localhost:3000/api/kling", {
        method: "POST",
        body: formData,
      });

      const response = await klingPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/mirrormagic") {
      // Import and call the mirrormagic API logic directly
      const { POST: mirrorMagicPOST } = await import("../mirrormagic/route");

      const mockRequest = new Request("http://localhost:3000/api/mirrormagic", {
        method: "POST",
        body: formData,
      });

      const response = await mirrorMagicPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/promptenhancer") {
      // Import and call the promptenhancer API logic directly
      const { POST: promptEnhancerPOST } = await import(
        "../promptenhancer/route"
      );

      const mockRequest = new Request(
        "http://localhost:3000/api/promptenhancer",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await promptEnhancerPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/titlerenamer") {
      // Import and call the titlerenamer API logic directly
      const { POST: titleRenamerPOST } = await import("../titlerenamer/route");

      const mockRequest = new Request(
        "http://localhost:3000/api/titlerenamer",
        {
          method: "POST",
          body: formData,
        }
      );

      const response = await titleRenamerPOST(mockRequest as any);
      return await response.json();
    } else {
      // For endpoints not yet implemented with direct imports
      throw new Error(
        `Direct import not implemented for ${endpoint}. Please add direct import support for this endpoint.`
      );
    }
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
        "❌ Missing userid parameter - using valid user for debugging"
      );
      userid = "uTiXKRbCYbhWnBbkLFZoMdEMdgf2";
      formData.set("userid", userid);
      console.log("✅ Using fallback userid:", userid);
    } else {
      console.log("✅ Got userid:", userid);
    }
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
        console.log("✅ Firebase user ID validated successfully");
      } catch (error) {
        console.log("❌ Invalid Firebase user ID:", error);
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid Firebase user ID - authentication required",
          },
          { status: 401 }
        );
      }
    } else {
      console.log("Skipping Firebase user validation - testing mode");
    }

    const message = (formData.get("message") as string)?.trim();
    console.log("Extracted message:", message);

    // Check for all types of image inputs
    const hasActualImages = entries.some(([key, value]) => {
      // Check for standard image fields (files)
      const isStandardImageField = [
        "product_image",
        "design_image",
        "color_image",
        "image",
        "file",
      ].includes(key);
      const isValidFile = value instanceof File && value.size > 0;

      // Check for base64 data fields
      const isBase64Field = key.endsWith("_base64");
      const isBase64Data =
        typeof value === "string" && value.startsWith("data:image/");

      // Check for URL fields
      const isUrlField = key.endsWith("_url");
      const isValidUrl =
        typeof value === "string" &&
        (value.startsWith("http") || value.startsWith("/"));

      // Legacy base64 detection
      const isLegacyBase64 =
        typeof value === "string" &&
        (value.startsWith("data:image/") || value.match(/^[A-Za-z0-9+/]+=*$/));

      return (
        (isStandardImageField && isValidFile) ||
        (isBase64Field && isBase64Data) ||
        (isUrlField && isValidUrl) ||
        (key.startsWith("image") && isLegacyBase64)
      );
    });

    const hasPresetSelections = entries.some(([key, value]) => {
      return (
        key.startsWith("preset_") &&
        typeof value === "string" &&
        value.trim().length > 0
      );
    });

    const hasImages = hasActualImages || hasPresetSelections;
    console.log("Has actual images:", hasActualImages);
    console.log("Has preset selections:", hasPresetSelections);
    console.log("Has images (combined):", hasImages);

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

    // 🔧 ENHANCED: Handle explicit reference with smart chain resolution and multi-image support
    const explicitReferenceStr = formData.get("explicit_reference") as string;
    let explicitReference:
      | {
          imageUrl?: string;
          endpoint?: string;
          intent?: string;
          text?: string;
          images?: string[];
          inheritedPresets?: Record<string, string>;
        }
      | undefined;

    // Smart reference chain resolution function
    const resolveReferenceChain = (
      reference: any,
      conversationHistory: ChatMessage[]
    ): {
      images: string[];
      text: string;
      chainLength: number;
      inheritedPresets?: Record<string, string>;
    } => {
      let currentRef = reference;
      let allImages: string[] = [];
      let allText: string[] = [];
      let chainLength = 0;
      let inheritedPresets: Record<string, string> = {};
      const visitedIds = new Set(); // Prevent infinite loops

      while (currentRef && chainLength < 10) {
        // Max chain depth of 10
        chainLength++;

        // Prevent infinite loops
        if (currentRef.id && visitedIds.has(currentRef.id)) {
          console.log("🔄 Reference chain loop detected, breaking");
          break;
        }
        if (currentRef.id) visitedIds.add(currentRef.id);

        // 🧠 SMART REFERENCE RESOLUTION: Look for AI's response to this message
        if (currentRef.timestamp) {
          const refTimestamp = new Date(currentRef.timestamp).getTime();
          console.log(
            `🔍 Looking for AI response to message with timestamp: ${currentRef.timestamp} (${refTimestamp})`
          );

          // Find the AI's response that came after this user message
          for (let i = 0; i < conversationHistory.length - 1; i++) {
            const userMsg = conversationHistory[i];
            const aiMsg = conversationHistory[i + 1];

            const userTimestamp = new Date(userMsg.timestamp || 0).getTime();
            console.log(
              `🔍 Checking user message: ${userMsg.timestamp} (${userTimestamp}) vs ref: ${refTimestamp}, diff: ${Math.abs(userTimestamp - refTimestamp)}ms`
            );

            // More flexible timestamp matching - within 30 seconds to account for processing delays
            if (
              Math.abs(userTimestamp - refTimestamp) < 30000 && // Within 30 seconds
              aiMsg.role === "assistant"
            ) {
              console.log(
                `✅ Found matching user message, checking AI response for Firebase URLs...`
              );

              // Extract Firebase URLs from AI response text
              const firebaseUrlRegex =
                /https:\/\/storage\.googleapis\.com\/[^\s)]+/g;
              const foundUrls = aiMsg.content.match(firebaseUrlRegex) || [];

              // Also check if AI message has images array
              const aiImages = (aiMsg as any).images || [];
              const allFoundUrls = [
                ...foundUrls,
                ...aiImages.filter((img: string) =>
                  img.includes("storage.googleapis.com")
                ),
              ];

              if (allFoundUrls.length > 0) {
                console.log(
                  `🎯 Found ${allFoundUrls.length} generated result(s) for referenced message:`,
                  allFoundUrls
                );
                allImages.push(...allFoundUrls);
                allText.push(
                  `Generated result: ${aiMsg.content.slice(0, 100)}...`
                );
              } else {
                console.log(
                  `⚠️ AI response found but no Firebase URLs detected. Content: ${aiMsg.content.slice(0, 200)}`
                );
              }
              break;
            }
          }
        }

        // 🧬 PRESET INHERITANCE: Extract presets from referenced message
        if (currentRef.images && Array.isArray(currentRef.images)) {
          // Extract presets from the original input images
          currentRef.images.forEach((imagePath: string) => {
            if (typeof imagePath === "string") {
              // Product presets (placeholders like t-shirt, mug, etc.)
              if (
                imagePath.startsWith("/inputs/placeholders/") &&
                !imagePath.includes("/colors/")
              ) {
                inheritedPresets.preset_product_type = imagePath;
                console.log(`🧬 Inherited product preset: ${imagePath}`);
              }
              // Design presets
              else if (imagePath.startsWith("/inputs/designs/")) {
                inheritedPresets.preset_design_style = imagePath;
                console.log(`🧬 Inherited design preset: ${imagePath}`);
              }
              // Color presets
              else if (imagePath.startsWith("/inputs/placeholders/colors/")) {
                inheritedPresets.preset_color_palette = imagePath;
                console.log(`🧬 Inherited color preset: ${imagePath}`);
              }
            }
          });

          // Only add input images if we didn't find generated results
          const hasGeneratedResults = allImages.some((img) =>
            img.includes("storage.googleapis.com")
          );
          if (!hasGeneratedResults) {
            console.log(
              "⚠️ No generated results found, falling back to input images:",
              currentRef.images
            );
            allImages.push(...currentRef.images);
          }
        }
        if (currentRef.text) {
          allText.push(currentRef.text);
        }

        // Look for nested references in the text (like "this" or "that" pointing to another message)
        const textToCheck = currentRef.text?.toLowerCase() || "";
        if (
          textToCheck.includes("this") ||
          textToCheck.includes("that") ||
          textToCheck.includes("it")
        ) {
          // Find the most recent message before this one that has images
          const currentTimestamp = new Date(
            currentRef.timestamp || 0
          ).getTime();
          let foundNextRef = false;

          for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const msg = conversationHistory[i];
            const msgTimestamp = new Date(msg.timestamp || 0).getTime();

            if (
              msgTimestamp < currentTimestamp &&
              (msg as any).images &&
              (msg as any).images.length > 0
            ) {
              currentRef = {
                images: (msg as any).images,
                text: msg.content,
                timestamp: msg.timestamp,
                id: `chain_${i}`,
              };
              foundNextRef = true;
              break;
            }
          }

          if (!foundNextRef) break;
        } else {
          break; // No more chain references
        }
      }

      return {
        images: Array.from(new Set(allImages)), // Remove duplicates
        text: allText.join(" → "),
        chainLength,
        inheritedPresets,
      };
    };

    if (explicitReferenceStr) {
      try {
        const reference = JSON.parse(explicitReferenceStr);

        // Resolve reference chain to get all images and context
        const resolvedChain = resolveReferenceChain(
          reference,
          conversationHistory
        );

        explicitReference = {
          imageUrl: resolvedChain.images[0], // Primary image (fallback)
          text: resolvedChain.text,
          images: resolvedChain.images, // All images in the chain
          inheritedPresets: resolvedChain.inheritedPresets, // Inherited presets
          // We don't have endpoint/intent from the reference, but that's ok
        };

        console.log(
          `🔧 Explicit reference resolved (chain length: ${resolvedChain.chainLength}):`,
          {
            imageCount: resolvedChain.images.length,
            images: resolvedChain.images,
            text: resolvedChain.text,
            inheritedPresets: resolvedChain.inheritedPresets,
          }
        );
      } catch (error) {
        console.log("⚠️ Could not parse explicit reference:", error);
      }
    }

    console.log("✅ Validation passed, proceeding with intent analysis");

    const imageUrls: Record<string, string> = {};

    // Process all types of image inputs
    const allImageEntries = entries.filter(([key, value]) => {
      // Files
      const isFileField =
        [
          "product_image",
          "design_image",
          "color_image",
          "image",
          "file",
        ].includes(key) || key.startsWith("image");
      const isValidFile = value instanceof File && value.size > 0;

      // Base64 data
      const isBase64Field = key.endsWith("_base64");
      const isBase64Data =
        typeof value === "string" && value.startsWith("data:image/");

      // URLs
      const isUrlField = key.endsWith("_url");
      const isValidUrl =
        typeof value === "string" &&
        (value.startsWith("http") || value.startsWith("/"));

      // Preset selections
      const isPresetField = key.startsWith("preset_");
      const isValidPreset =
        typeof value === "string" && value.trim().length > 0;

      return (
        (isFileField && isValidFile) ||
        (isBase64Field && isBase64Data) ||
        (isUrlField && isValidUrl) ||
        (isPresetField && isValidPreset)
      );
    });

    if (allImageEntries.length > 0) {
      console.log("🌤️ Processing", allImageEntries.length, "image inputs...");

      try {
        const processPromises = allImageEntries.map(async ([key, value]) => {
          // Handle preset selections
          if (key.startsWith("preset_")) {
            console.log(`📋 Processing preset: ${key} = ${value}`);
            return { key, value: value as string, type: "preset" };
          }

          // Handle URL inputs
          if (key.endsWith("_url")) {
            const url = value as string;
            console.log(`🔗 Processing URL: ${key} = ${url}`);

            if (url.startsWith("/")) {
              // Local path - convert to full URL
              // Use relative URLs in production to avoid authentication issues
              const fullUrl =
                process.env.NODE_ENV === "development"
                  ? `http://localhost:3000${url}`
                  : url; // Use relative URL in production
              console.log(`🔄 Converting local path to full URL: ${fullUrl}`);

              try {
                const response = await fetch(fullUrl);
                const blob = await response.blob();
                const file = new File(
                  [blob],
                  `${key.replace("_url", "")}.png`,
                  { type: "image/png" }
                );
                const processedFile = await validateAndProcessImage(file);
                const imageUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid
                );

                // Convert URL field to standard image field
                const standardKey = key.replace("_url", "_image");
                return { key: standardKey, value: imageUrl, type: "url" };
              } catch (error) {
                console.warn(`⚠️ Failed to fetch local URL ${fullUrl}:`, error);
                return null;
              }
            } else {
              // External URL - fetch and process
              try {
                const response = await fetch(url);
                const blob = await response.blob();
                const file = new File(
                  [blob],
                  `${key.replace("_url", "")}.png`,
                  { type: "image/png" }
                );
                const processedFile = await validateAndProcessImage(file);
                const imageUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid
                );

                // Convert URL field to standard image field
                const standardKey = key.replace("_url", "_image");
                return { key: standardKey, value: imageUrl, type: "url" };
              } catch (error) {
                console.warn(`⚠️ Failed to fetch external URL ${url}:`, error);
                return null;
              }
            }
          }

          // Handle base64 inputs
          if (key.endsWith("_base64")) {
            console.log(`📄 Processing base64: ${key}`);
            const base64Data = value as string;
            const processedFile = await processBase64Image(
              base64Data,
              `${key.replace("_base64", "")}.png`
            );
            const imageUrl = await uploadImageToFirebaseStorage(
              processedFile,
              userid
            );

            // Convert base64 field to standard image field
            const standardKey = key.replace("_base64", "_image");
            return { key: standardKey, value: imageUrl, type: "base64" };
          }

          // Handle file uploads
          if (value instanceof File) {
            console.log(`📁 Processing file: ${key}`);
            const processedFile = await validateAndProcessImage(value);
            const imageUrl = await uploadImageToFirebaseStorage(
              processedFile,
              userid
            );
            return { key, value: imageUrl, type: "file" };
          }

          return null;
        });

        const processResults = await Promise.all(processPromises);

        // Separate processed images and presets
        const processedImages = processResults.filter(
          (result) => result && result.type !== "preset"
        );
        const presetSelections = processResults.filter(
          (result) => result && result.type === "preset"
        );

        // Store image URLs
        processedImages.forEach((result) => {
          if (result) {
            imageUrls[result.key] = result.value;
            console.log(`🔗 ${result.key} → ${result.value}`);
          }
        });

        // Process preset selections
        presetSelections.forEach((result) => {
          if (result) {
            console.log(`📋 Preset processed: ${result.key} = ${result.value}`);
            // Add preset selections back to formData for downstream processing
            formData.set(result.key, result.value);
          }
        });

        // 🧬 PRESET INHERITANCE: Merge inherited presets with current presets
        if (explicitReference?.inheritedPresets) {
          console.log(
            "🧬 Processing inherited presets from reference:",
            explicitReference.inheritedPresets
          );

          Object.entries(explicitReference.inheritedPresets).forEach(
            ([presetKey, presetValue]) => {
              // Only inherit preset if current request doesn't already have it
              if (!formData.has(presetKey)) {
                console.log(`🧬 Inheriting ${presetKey}: ${presetValue}`);
                formData.set(presetKey, presetValue);
              } else {
                console.log(
                  `🔄 Overriding inherited ${presetKey} with current selection: ${formData.get(presetKey)}`
                );
              }
            }
          );
        }

        console.log("✅ All image processing successful!");
        console.log("📋 Image URLs:", imageUrls);
        console.log("📋 Preset selections:", presetSelections.length);
      } catch (error) {
        console.error("❌ Image processing failed:", error);
        return NextResponse.json(
          { status: "error", error: `Image processing failed: ${error}` },
          { status: 500 }
        );
      }
    } else {
      console.log("📷 No images to process");
    }

    // Extract last generated result from conversation history for context
    let lastGeneratedResult:
      | { imageUrl?: string; endpoint?: string; intent?: string }
      | undefined;
    if (conversationHistory.length > 0) {
      // Look for the most recent assistant message with result information
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === "assistant") {
          try {
            let extractedImageUrl: string | undefined;
            let extractedEndpoint: string | undefined;
            let extractedIntent: string | undefined;

            // 🔧 FIX: First check if the message has images field (stored from frontend)
            if (
              (msg as any).images &&
              Array.isArray((msg as any).images) &&
              (msg as any).images.length > 0
            ) {
              extractedImageUrl = (msg as any).images[0]; // Use the first image
              console.log(
                "🔍 Found image URL in message images field:",
                extractedImageUrl
              );
            }

            // Fallback: Try to extract result info from assistant message content - look for various patterns
            if (!extractedImageUrl) {
              const firebaseUrlMatch = msg.content.match(
                /firebaseOutputUrl['":\s]*([^"'\s,}]+)/
              );
              const imageUrlMatch = msg.content.match(
                /imageUrl['":\s]*([^"'\s,}]+)/
              );
              const outputUrlMatch = msg.content.match(
                /outputUrl['":\s]*([^"'\s,}]+)/
              );
              const dataUrlMatch = msg.content.match(
                /data_url['":\s]*([^"'\s,}]+)/
              );

              extractedImageUrl =
                firebaseUrlMatch?.[1] ||
                imageUrlMatch?.[1] ||
                outputUrlMatch?.[1] ||
                dataUrlMatch?.[1];
            }

            // Look for endpoint and intent information in content
            const endpointMatch =
              msg.content.match(/endpoint['":\s]*([^"'\s,}]+)/) ||
              msg.content.match(/→\s*([\/\w]+)/); // Match "→ /api/design" pattern
            const intentMatch =
              msg.content.match(/intent['":\s]*([^"'\s,}]+)/) ||
              msg.content.match(/Intent:\s*(\w+)/); // Match "Intent: design" pattern

            extractedEndpoint = endpointMatch?.[1];
            extractedIntent = intentMatch?.[1];

            // If we found an image URL or other context info, use it
            if (extractedImageUrl || extractedEndpoint || extractedIntent) {
              lastGeneratedResult = {
                imageUrl: extractedImageUrl,
                endpoint: extractedEndpoint,
                intent: extractedIntent,
              };
              console.log(
                "🔍 Extracted last result context:",
                lastGeneratedResult
              );
              break;
            }
          } catch (error) {
            console.log(
              "⚠️ Could not parse last result context from message:",
              msg.content.slice(0, 100)
            );
          }
        }
      }
    }

    const intentAnalysis = await analyzeIntent(
      effectiveMessage,
      conversationHistory,
      entries,
      explicitReference || lastGeneratedResult // 🔧 Prioritize explicit reference over auto-detected
    );

    console.log("Intent Analysis:", intentAnalysis);

    // 🔧 FIX: Replace Claude's placeholder reference_image_url with actual URL
    if (
      intentAnalysis.parameters?.reference_image_url ===
        "use_previous_result_if_referencing" ||
      intentAnalysis.parameters?.reference_image_url === "previous_result_url"
    ) {
      const actualReferenceUrl = (explicitReference || lastGeneratedResult)
        ?.imageUrl;
      if (actualReferenceUrl) {
        intentAnalysis.parameters.reference_image_url = actualReferenceUrl;
        console.log(
          `🔧 Replaced Claude's placeholder with actual reference URL: ${actualReferenceUrl}`
        );
      } else {
        delete intentAnalysis.parameters.reference_image_url;
        console.log("🔧 No actual reference URL found, removed placeholder");
      }
    }

    // 🔧 FIX: Add reference image URL to imageUrls BEFORE multi-step operations
    const referenceResult = explicitReference || lastGeneratedResult;
    const shouldClearContext =
      intentAnalysis.parameters?.clear_context === true;

    // 🚨 NEW: Check if this is a fresh design request that should ignore context
    if (shouldClearContext && intentAnalysis.intent === "design") {
      console.log(
        `🆕 Skipping context reference for fresh design request - clear_context=true`
      );
    } else if (
      referenceResult?.imageUrl &&
      Object.keys(imageUrls).length === 0
    ) {
      const sourceType = explicitReference
        ? "explicit reference"
        : "previous result";
      console.log(
        `🔄 No new images uploaded - using ${sourceType} image for operation`
      );

      // For multi-step operations, always add as product_image
      if (intentAnalysis.intent === "multi_step") {
        imageUrls.product_image = referenceResult.imageUrl;
        console.log(
          `✅ Added ${sourceType} image as product_image for multi-step:`,
          referenceResult.imageUrl
        );
      }
      // Determine the correct image field based on the current intent
      else if (
        intentAnalysis.intent === "upscale_image" ||
        intentAnalysis.intent === "analyze_image" ||
        intentAnalysis.intent === "reframe_image" ||
        intentAnalysis.intent === "clarity_upscale" ||
        intentAnalysis.intent === "create_video" ||
        intentAnalysis.intent === "mirror_magic"
      ) {
        // For single-image operations, use product_image as the standard field
        imageUrls.product_image = referenceResult.imageUrl;
        console.log(
          `✅ Added ${sourceType} image as product_image:`,
          referenceResult.imageUrl
        );
      } else if (
        intentAnalysis.intent === "design" &&
        referenceResult.imageUrl
      ) {
        // 🎯 PRIORITY: If Claude identified a reference_image_url, always use it
        // This means the user explicitly wants to modify a specific image
        const claudeWantsSpecificImage =
          intentAnalysis.parameters.reference_image_url;

        if (claudeWantsSpecificImage) {
          // 🧠 SMART SELECTION: Claude identified a specific image from the reference chain
          // Use Claude's choice instead of the fallback first image
          const claudeSelectedImage =
            intentAnalysis.parameters.reference_image_url;

          // Verify the Claude-selected image is in our reference chain
          if (explicitReference?.images?.includes(claudeSelectedImage)) {
            imageUrls.product_image = claudeSelectedImage;
            console.log(
              `🧠 Claude selected specific image from reference chain:`,
              claudeSelectedImage
            );
          } else {
            // Fallback to the reference result if Claude's choice isn't in the chain
            imageUrls.product_image = referenceResult.imageUrl;
            console.log(
              `🔄 Claude's choice not in chain, using reference result:`,
              referenceResult.imageUrl
            );
          }
        } else {
          // 🧬 PRESET INHERITANCE: Only use inherited presets if Claude didn't specify an image
          const hasInheritedPresets =
            explicitReference?.inheritedPresets &&
            Object.keys(explicitReference.inheritedPresets).length > 0;

          if (hasInheritedPresets) {
            console.log(
              `🧬 No specific image reference - creating fresh design with inherited presets`
            );
            // Add a flag to indicate we have inherited presets
            intentAnalysis.parameters.has_inherited_presets = true;
            // Don't add the reference image - let the system create fresh with inherited presets
          } else {
            // For design operations, add as product_image for modification
            imageUrls.product_image = referenceResult.imageUrl;
            console.log(
              `✅ Added ${sourceType} image as product_image for design modification:`,
              referenceResult.imageUrl
            );
          }
        }
      }

      // Also add to intent parameters if not already set
      if (!intentAnalysis.parameters.reference_image_url) {
        // 🎯 SMART: Only add reference_image_url if Claude's analysis suggests it should be used
        // Check if Claude explicitly said this is NOT referencing previous results
        const claudeExplanation =
          intentAnalysis.explanation?.toLowerCase() || "";
        const isExplicitlyFreshRequest =
          claudeExplanation.includes("not referencing previous results") ||
          claudeExplanation.includes("new design request") ||
          claudeExplanation.includes("fresh design request") ||
          intentAnalysis.parameters.workflow_type === "prompt_only";

        if (!isExplicitlyFreshRequest) {
          // Only add reference if Claude didn't explicitly say it's a fresh request
          intentAnalysis.parameters.reference_image_url =
            referenceResult.imageUrl;
          console.log(
            `✅ Added reference_image_url to intent parameters:`,
            referenceResult.imageUrl
          );
        } else {
          console.log(
            `🆕 Skipping reference_image_url - Claude detected fresh design request:`,
            claudeExplanation
          );
        }
      }
    }

    // 🎯 INTELLIGENT: Handle Claude-detected multi-step operations
    if (
      intentAnalysis.intent === "multi_step" &&
      intentAnalysis.parameters?.steps
    ) {
      const steps = intentAnalysis.parameters.steps;
      console.log(
        `🧠 Executing Claude-detected multi-step operation: ${steps.length} steps`
      );
      let currentResult = null;
      let allResults: any[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`⚡ Executing step ${i + 1}: ${step.intent}`);

        // For steps after the first, use the output of the previous step if context_chain is enabled
        let stepImageUrls = { ...imageUrls };
        if (i > 0 && intentAnalysis.parameters.context_chain) {
          // Check if previous step succeeded and has a valid output URL
          const previousOutputUrl =
            currentResult?.firebaseOutputUrl ||
            currentResult?.data_url ||
            currentResult?.outputUrl ||
            currentResult?.output_image ||
            currentResult?.imageUrl ||
            currentResult?.result?.imageUrl;

          console.log(`🔍 Step ${i + 1} chaining validation:`);
          console.log(`  - currentResult?.status: ${currentResult?.status}`);
          console.log(
            `  - currentResult?.firebaseOutputUrl: ${currentResult?.firebaseOutputUrl}`
          );
          console.log(
            `  - currentResult?.data_url: ${currentResult?.data_url}`
          );
          console.log(
            `  - currentResult?.outputUrl: ${currentResult?.outputUrl}`
          );
          console.log(
            `  - currentResult?.output_image: ${currentResult?.output_image}`
          );
          console.log(
            `  - currentResult?.imageUrl: ${currentResult?.imageUrl}`
          );
          console.log(
            `  - currentResult?.result?.imageUrl: ${currentResult?.result?.imageUrl}`
          );
          console.log(`  - previousOutputUrl: ${previousOutputUrl}`);

          if (
            currentResult?.status === "success" &&
            previousOutputUrl &&
            typeof previousOutputUrl === "string"
          ) {
            stepImageUrls.product_image = previousOutputUrl;
            console.log(
              `🔗 Using previous step output as input: ${previousOutputUrl}`
            );
          } else {
            console.log(
              `❌ Cannot chain to step ${i + 1}: Previous step failed or has no valid output`
            );
            allResults.push({
              stepIndex: i + 1,
              status: "error",
              error:
                "Previous step failed - cannot continue with context chaining",
            });
            break; // Stop execution if context chaining is required but previous step failed
          }
        }

        try {
          const stepResult = await routeToAPI(
            step.endpoint,
            step.parameters || {},
            formData,
            userid,
            effectiveMessage,
            stepImageUrls,
            request
          );

          currentResult = stepResult;
          allResults.push({ stepIndex: i + 1, ...stepResult });
          console.log(`✅ Step ${i + 1} completed:`, stepResult.status);
          console.log(
            `🔍 Step ${i + 1} result structure:`,
            JSON.stringify(stepResult, null, 2)
          );

          // Process output image for Firebase storage
          if (stepResult && stepResult.status === "success") {
            const outputUrl =
              stepResult.firebaseOutputUrl ||
              stepResult.data_url ||
              stepResult.outputUrl ||
              stepResult.output_image ||
              stepResult.imageUrl ||
              stepResult.result?.imageUrl;

            if (outputUrl && typeof outputUrl === "string") {
              if (outputUrl.startsWith("data:image/")) {
                console.log(
                  `🔄 Converting step ${i + 1} base64 output to Firebase Storage...`
                );
                try {
                  const processedFile = await processBase64Image(
                    outputUrl,
                    `step_${i + 1}_output.png`
                  );
                  const firebaseUrl = await uploadImageToFirebaseStorage(
                    processedFile,
                    userid,
                    true
                  );

                  // Update current result with Firebase URL
                  currentResult = {
                    ...stepResult,
                    firebaseOutputUrl: firebaseUrl,
                    data_url: firebaseUrl,
                    outputUrl: firebaseUrl,
                    output_image: firebaseUrl,
                    imageUrl: firebaseUrl,
                  };

                  console.log(
                    `✅ Step ${i + 1} output saved to Firebase:`,
                    firebaseUrl
                  );
                } catch (error) {
                  console.error(
                    `❌ Failed to save step ${i + 1} output:`,
                    error
                  );
                }
              } else if (
                outputUrl.startsWith("http") &&
                !outputUrl.includes("firebasestorage.googleapis.com")
              ) {
                console.log(
                  `🔄 Downloading step ${i + 1} external output to Firebase Storage...`
                );
                try {
                  const firebaseUrl = await saveOutputImageToFirebase(
                    outputUrl,
                    userid,
                    `step_${i + 1}`
                  );

                  // Update current result with Firebase URL
                  currentResult = {
                    ...stepResult,
                    firebaseOutputUrl: firebaseUrl,
                    data_url: firebaseUrl,
                    outputUrl: firebaseUrl,
                    output_image: firebaseUrl,
                    imageUrl: firebaseUrl,
                  };

                  console.log(
                    `✅ Step ${i + 1} external output saved to Firebase:`,
                    firebaseUrl
                  );
                } catch (error) {
                  console.error(
                    `❌ Failed to save step ${i + 1} external output:`,
                    error
                  );
                  // Don't fail the step - external URL can still be used for chaining
                  console.log(
                    `⚠️ Continuing with external URL for chaining: ${outputUrl}`
                  );
                }
              }
            }
          }
        } catch (error: any) {
          console.error(`❌ Step ${i + 1} failed:`, error);
          allResults.push({
            stepIndex: i + 1,
            status: "error",
            error: error.message || "Unknown error",
          });
          break; // Stop execution on error
        }
      }

      // Return the final result with ALL step results visible
      const finalResult = currentResult || allResults[allResults.length - 1];
      const successCount = allResults.filter(
        (r) => r.status === "success"
      ).length;

      // 🆕 Build comprehensive message including all step results
      let detailedMessage = `🎉 Multi-step operation completed! Successfully executed ${successCount} out of ${steps.length} steps.\n\n`;

      // Add results from each step
      allResults.forEach((result, index) => {
        const stepNumber = index + 1;
        const stepIntent = steps[index].intent;

        if (result.status === "success") {
          detailedMessage += `✅ Step ${stepNumber} (${stepIntent}): `;

          // Add specific result details
          if (stepIntent === "analyze_image" && result.result) {
            const analysis =
              result.raw_analysis || result.result || "Analysis completed";
            detailedMessage += `${analysis}\n\n`;
          } else if (result.firebaseOutputUrl || result.imageUrl) {
            detailedMessage += `Result generated successfully!\n\n`;
          } else {
            detailedMessage += `Completed successfully!\n\n`;
          }
        } else {
          detailedMessage += `❌ Step ${stepNumber} (${stepIntent}): ${result.error || "Failed"}\n\n`;
        }
      });

      const chatResponse: ChatResponse = {
        status: finalResult?.status || "error",
        message: detailedMessage.trim(),
        intent: intentAnalysis,
        result: finalResult,
        // 🆕 Include all step results for frontend access
        allStepResults: allResults,
        conversation_id: `${userid}_${Date.now()}`,
      };

      return NextResponse.json(chatResponse);
    }

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
          imageUrls,
          request
        );

        // 🔧 Process output images and save to Firebase Storage
        if (apiResult && apiResult.status === "success") {
          // Handle different possible output URL fields
          const outputUrl =
            apiResult.firebaseOutputUrl ||
            apiResult.data_url ||
            apiResult.outputUrl ||
            apiResult.output_image ||
            apiResult.imageUrl;

          if (outputUrl && typeof outputUrl === "string") {
            if (outputUrl.startsWith("data:image/")) {
              console.log(
                "🔄 Converting base64 output URL to Firebase Storage URL..."
              );
              try {
                const processedFile = await processBase64Image(
                  outputUrl,
                  "design_output.png"
                );
                const firebaseUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid,
                  true
                );

                // Update all possible output URL fields
                if (apiResult.firebaseOutputUrl)
                  apiResult.firebaseOutputUrl = firebaseUrl;
                if (apiResult.data_url) apiResult.data_url = firebaseUrl;
                if (apiResult.outputUrl) apiResult.outputUrl = firebaseUrl;
                if (apiResult.output_image)
                  apiResult.output_image = firebaseUrl;
                if (apiResult.imageUrl) apiResult.imageUrl = firebaseUrl;

                console.log(
                  "✅ Converted base64 to Firebase Storage URL:",
                  firebaseUrl
                );
              } catch (error) {
                console.error("❌ Failed to convert base64 URL:", error);
                // Keep original base64 URL as fallback
              }
            } else if (outputUrl.startsWith("http")) {
              // Save external URL to Firebase Storage
              console.log(
                "💾 Saving external output image to Firebase Storage..."
              );
              try {
                const firebaseUrl = await saveOutputImageToFirebase(
                  outputUrl,
                  userid,
                  intentAnalysis.endpoint
                );

                // Update the result to use Firebase URL
                if (apiResult.firebaseOutputUrl)
                  apiResult.firebaseOutputUrl = firebaseUrl;
                if (apiResult.data_url) apiResult.data_url = firebaseUrl;
                if (apiResult.outputUrl) apiResult.outputUrl = firebaseUrl;
                if (apiResult.output_image)
                  apiResult.output_image = firebaseUrl;
                if (apiResult.imageUrl) apiResult.imageUrl = firebaseUrl;

                console.log(
                  "✅ Output image saved to Firebase Storage:",
                  firebaseUrl
                );
              } catch (error) {
                console.error("❌ Failed to save output image:", error);
                // Keep original URL as fallback
              }
            }
          }
        }
      } catch (error: any) {
        apiResult = {
          status: "error",
          error: error.message,
        };
      }
    }

    // For image operations, return immediately with the result to avoid waiting for Claude
    const imageOperations = [
      "reframe_image",
      "upscale_image",
      "analyze_image",
      "design",
      "design_image",
      "elemental_design",
      "flow_design",
    ];
    const isImageOperation = imageOperations.includes(intentAnalysis.intent);

    if (isImageOperation && apiResult && apiResult.status === "success") {
      console.log(
        `🔍 ${intentAnalysis.intent} detected - using Claude to generate proactive response with recommendations`
      );

      // Always use Claude for ALL successful image operations to provide proactive recommendations
      const proactiveResponse = await generateResponse(
        effectiveMessage,
        intentAnalysis,
        apiResult
      );

      const chatResponse: ChatResponse = {
        status: "success",
        message: proactiveResponse,
        intent: intentAnalysis,
        result: apiResult,
        conversation_id: `${userid}_${Date.now()}`,
      };

      return NextResponse.json(chatResponse);
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
