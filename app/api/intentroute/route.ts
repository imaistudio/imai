import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { claudeLLM } from "@/lib/claudeLLM";

import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

// 🔧 Utility function to get the correct base URL for both development and production
function getBaseUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  // In production, use custom domain first, then Vercel URL
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback to your actual domain
  return "https://imai.studio";
}

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
    `🔍 Validating image: ${file.name} (${file.type}, ${file.size}b)`,
  );

  // Check file size (max 100MB for high-res compositions)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    console.warn(
      `⚠️ Large image detected: ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)`,
    );
    // Only reject extremely large files that might cause memory issues
    if (file.size > 200 * 1024 * 1024) {
      // 200MB absolute limit
      throw new Error(
        `Image ${file.name} is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 200MB.`,
      );
    }
  }

  // Get file buffer and detect format using Sharp
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let formatInfo = "unknown";
  let needsConversion = false;

  try {
    // Import Sharp dynamically
    const sharp = (await import("sharp")).default;

    // Get metadata to detect actual format
    const metadata = await sharp(buffer).metadata();
    formatInfo = metadata.format || "unknown";
    console.log(`🔍 Detected image format: ${formatInfo}`);

    // Define supported and unsupported formats
    const supportedFormats = ["jpeg", "jpg", "png", "webp"];
    const unsupportedFormats = ["mpo", "heic", "heif", "tiff", "bmp", "gif"];

    // Check if format conversion is needed
    if (unsupportedFormats.includes(formatInfo.toLowerCase())) {
      console.log(
        `🔄 Unsupported format detected: ${formatInfo} - converting to JPEG`,
      );
      needsConversion = true;
    } else if (!supportedFormats.includes(formatInfo.toLowerCase())) {
      console.log(
        `⚠️ Unknown format detected: ${formatInfo} - attempting conversion to JPEG`,
      );
      needsConversion = true;
    } else {
      console.log(
        `✅ Image format ${formatInfo} is supported, no conversion needed`,
      );
    }

    // Convert format if needed
    if (needsConversion) {
      console.log(`🔄 Converting ${formatInfo} to JPEG format...`);

      // Convert to JPEG using Sharp
      const convertedBuffer = await sharp(buffer)
        .jpeg({ quality: 95 })
        .toBuffer();

      // Create new file with converted buffer
      const jpegFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
      const convertedFile = new File([convertedBuffer], jpegFileName, {
        type: "image/jpeg",
      });

      console.log(
        `✅ Successfully converted ${file.name} (${formatInfo}) to ${jpegFileName} (JPEG)`,
      );
      console.log(
        `📊 Size change: ${Math.round(file.size / 1024)}KB → ${Math.round(convertedFile.size / 1024)}KB`,
      );

      return convertedFile;
    } else {
      // Format is already supported, return as-is
      console.log(`✅ Image ${file.name} format ${formatInfo} is compatible`);
      return file;
    }
  } catch (sharpError) {
    console.warn(`⚠️ Sharp format detection failed: ${sharpError}`);

    // Fallback: Basic format checking without Sharp
    const isValidMimeType = SUPPORTED_IMAGE_FORMATS.includes(
      file.type.toLowerCase(),
    );
    const hasValidExtension = SUPPORTED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );

    if (!isValidMimeType && !hasValidExtension) {
      throw new Error(
        `Unsupported image format: ${file.type || "unknown"}. Supported formats: JPG, JPEG, PNG, WebP`,
      );
    }

    // Return file as-is if basic validation passes
    console.log(
      `✅ Image ${file.name} passed basic validation (Sharp unavailable)`,
    );
    return file;
  }
}

async function processBase64Image(
  base64Data: string,
  filename: string = "image.png",
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
  isOutput: boolean = false,
): Promise<string> {
  try {
    console.log(
      `📤 Uploading ${file.name} (${file.size}b) to Firebase Storage...`,
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
      `Failed to upload ${file.name} to Firebase Storage: ${error}`,
    );
  }
}

async function saveOutputImageToFirebase(
  imageUrl: string,
  userid: string,
  endpoint: string,
): Promise<string> {
  try {
    console.log(
      `💾 Saving output image to Firebase Storage for user ${userid}...`,
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
      "Skipping Firebase initialization due to environment variable issue - testing intent logic only",
    );
    return "SKIP_FIREBASE_INIT";
  }

  if (!formattedKey.includes("-----BEGIN")) {
    throw new Error(
      "Private key is missing PEM headers. Ensure it starts with -----BEGIN PRIVATE KEY-----",
    );
  }

  if (!formattedKey.includes("-----END")) {
    console.error(
      "Current private key content (first 100 chars):",
      formattedKey.substring(0, 100),
    );
    console.error(
      "Current private key content (last 100 chars):",
      formattedKey.substring(-100),
    );
    throw new Error(`Private key is missing PEM footers. Current key length: ${formattedKey.length}. Ensure it ends with -----END PRIVATE KEY-----. 
    
If you're having issues with multi-line environment variables, try setting FIREBASE_PRIVATE_KEY as a single line with \\n for line breaks, like:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_CONTENT\\n-----END PRIVATE KEY-----"`);
  }

  return formattedKey;
}

let firebaseInitialized = true;
console.log(
  "🔥 Firebase initialized - using Firebase Storage for image handling",
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
        `JSON parsing failed: ${(parseError as Error).message}. Original: ${jsonStr}`,
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
    (field) => !(field in intentAnalysis),
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
      "Invalid confidence value: must be a number between 0 and 1",
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
      'Invalid endpoint format: must be "none", "multi_step", or start with "/api/"',
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
  if (
    message.includes("remove background") ||
    message.includes("transparent") ||
    message.includes("cut out") ||
    message.includes("removebg")
  )
    options.push("removebg");

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
  },
): Promise<IntentAnalysis> {
  const smartFallbackAnalysis = (): IntentAnalysis => {
    const message = userMessage.toLowerCase();

    const hasProductImage =
      formDataEntries.some(
        ([key]) =>
          key === "product_image" ||
          key === "product_image_url" ||
          key.includes("product_image"), // ✅ Catch product_image_0_image, etc.
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Product Image:") ||
          msg.content.includes("product_image"),
      );
    const hasDesignImage =
      formDataEntries.some(
        ([key]) =>
          key === "design_image" ||
          key === "design_image_url" ||
          key.includes("design_image"), // ✅ Catch design_image_0_image, etc.
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Design Image:") ||
          msg.content.includes("design_image"),
      );
    const hasColorImage =
      formDataEntries.some(
        ([key]) =>
          key === "color_image" ||
          key === "color_image_url" ||
          key.includes("color_image"), // ✅ Catch color_image_0_image, etc.
      ) ||
      conversationHistory.some(
        (msg) =>
          msg.content.includes("[Color Image:") ||
          msg.content.includes("color_image"),
      );

    // Check for preset selections
    const hasPresetProduct = formDataEntries.some(
      ([key]) => key === "preset_product_type",
    );
    const hasPresetDesign = formDataEntries.some(
      ([key]) => key === "preset_design_style",
    );
    const hasPresetColor = formDataEntries.some(
      ([key]) => key === "preset_color_palette",
    );
    const hasAnyPresets = hasPresetProduct || hasPresetDesign || hasPresetColor;

    // 🔍 ENHANCED: Detect explicit references and previous results
    const hasExplicitReference = formDataEntries.some(
      ([key]) => key === "explicit_reference",
    );
    const hasPreviousResult = !!lastGeneratedResult?.imageUrl;
    const hasAnyImages = hasProductImage || hasDesignImage || hasColorImage;

    console.log("Smart fallback analysis - Enhanced detection:", {
      hasProductImage,
      hasDesignImage,
      hasColorImage,
      hasAnyImages,
      hasPresetProduct,
      hasPresetDesign,
      hasPresetColor,
      hasAnyPresets,
      hasExplicitReference,
      hasPreviousResult,
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
      message.toLowerCase().includes(keyword.toLowerCase()),
    );

    // 🚨 ENHANCED: Better casual conversation detection
    // 🚨 ENHANCED: Better casual conversation detection with partial matching
    const isCasualConversation =
      casualPatterns.some(
        (pattern) =>
          message.includes(pattern) ||
          message === pattern ||
          message.startsWith(pattern) ||
          pattern.includes(message.toLowerCase()),
      ) && !hasDesignKeywords; // Only casual if no design keywords present

    // 🆕 Return casual conversation intent for local LLM
    if (
      isCasualConversation &&
      !hasAnyPresets &&
      !hasExplicitReference &&
      !hasPreviousResult
    ) {
      console.log(
        "🤖 Smart fallback detected casual conversation - routing to local LLM",
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
        "Smart fallback routing directly to design endpoint - preset selections detected",
      );

      // 🚨 CRITICAL: Check if this is a modification of existing content vs fresh design
      const hasExplicitReference = formDataEntries.some(
        ([key]) => key === "explicit_reference",
      );

      // 🔧 AUTO-REFERENCING: Preserve context if there's a previous result available
      const hasPreviousResult = !!lastGeneratedResult?.imageUrl;
      const shouldClearContext = !hasExplicitReference && !hasPreviousResult; // Only clear if no explicit reference AND no previous result

      // 🎯 SMART WORKFLOW DETECTION: Choose workflow based on combination of uploads + presets

      // 🔧 DETECT PRESET TYPES: Check what specific presets are provided
      const hasProductPreset = formDataEntries.some(
        ([key]) =>
          key.startsWith("preset_product") || key === "preset_product_type",
      );
      const hasDesignPreset = formDataEntries.some(
        ([key]) =>
          key.startsWith("preset_design") || key.startsWith("design_style"),
      );
      const hasColorPreset = formDataEntries.some(
        ([key]) =>
          key.startsWith("preset_color") || key.startsWith("color_palette"),
      );

      // 🎯 SMART WORKFLOW SELECTION: Choose based on preset types + message content
      let workflowType = "preset_design"; // fallback default

      // 🔧 CRITICAL FIX: Handle color-only presets properly
      if (!hasProductPreset && !hasDesignPreset && hasColorPreset) {
        // Only color preset + prompt = color_prompt workflow
        workflowType = "color_prompt";
        console.log(
          "🎯 PRESET TYPE: Color preset only → color_prompt workflow",
        );
      } else if (!hasProductPreset && hasDesignPreset && !hasColorPreset) {
        // Only design preset + prompt = design_prompt workflow
        workflowType = "design_prompt";
        console.log(
          "🎯 PRESET TYPE: Design preset only → design_prompt workflow",
        );
      } else if (hasProductPreset || (hasDesignPreset && hasColorPreset)) {
        // Product preset OR (design + color presets) = preset_design workflow
        workflowType = "preset_design";
        console.log(
          "🎯 PRESET TYPE: Product or multiple presets → preset_design workflow",
        );
      } else {
        // Fallback to preset_design for other combinations
        workflowType = "preset_design";
        console.log("🎯 PRESET TYPE: Fallback → preset_design workflow");
      }

      // 🔧 ENHANCED: Better detection for complex reference + upload scenarios
      const hasAnyActualImages =
        hasProductImage || hasDesignImage || hasColorImage;
      const hasReferenceContext = hasExplicitReference || hasPreviousResult;

      if (hasAnyActualImages) {
        // When actual images exist, check for presets FIRST and override workflow

        // 🔧 PRIORITY 1: If ANY presets are involved with uploads or references, use preset_design workflow
        if (hasDesignPreset || hasColorPreset || hasProductPreset) {
          workflowType = "preset_design"; // Preset + upload/reference combinations
          console.log(
            "🎯 Presets detected with uploads/references - using preset_design workflow",
          );
        }
        // 🔧 PRIORITY 2: Complex reference + upload scenarios (the failing cases!)
        else if (hasReferenceContext && hasAnyActualImages) {
          // These are the exact scenarios the user described as failing
          if (hasProductImage && hasDesignImage && hasColorImage) {
            workflowType = "full_composition"; // Product + design + color + reference
            console.log(
              "🎯 COMPLEX: Product + design + color images with reference - full_composition",
            );
          } else if (hasProductImage && hasDesignImage) {
            workflowType = "product_design"; // Product + design + reference
            console.log(
              "🎯 COMPLEX: Product + design images with reference - product_design",
            );
          } else if (hasProductImage && hasColorImage) {
            workflowType = "product_color"; // Product + color + reference
            console.log(
              "🎯 COMPLEX: Product + color images with reference - product_color",
            );
          } else if (hasDesignImage && hasColorImage) {
            workflowType = "full_composition"; // Design + color + reference
            console.log(
              "🎯 COMPLEX: Design + color images with reference - full_composition",
            );
          } else if (hasDesignImage) {
            workflowType = "product_design"; // Design + reference (reference becomes product)
            console.log(
              "🎯 COMPLEX: Design image with reference - product_design",
            );
          } else if (hasColorImage) {
            workflowType = "product_color"; // Color + reference (reference becomes product)
            console.log(
              "🎯 COMPLEX: Color image with reference - product_color",
            );
          } else if (hasProductImage) {
            workflowType = "product_prompt"; // Product + reference (for modification)
            console.log(
              "🎯 COMPLEX: Product image with reference - product_prompt",
            );
          } else {
            workflowType = "product_prompt"; // Reference only with prompt
            console.log("🎯 COMPLEX: Reference only - product_prompt");
          }
        }
        // 🔧 PRIORITY 3: Only actual images, no presets, no references - use image-based workflows
        else if (hasAnyActualImages && !hasReferenceContext) {
          if (hasProductImage && hasDesignImage && hasColorImage) {
            workflowType = "full_composition"; // All 3 actual images (no presets/references)
          } else if (hasDesignImage && hasColorImage) {
            workflowType = "full_composition"; // Design + color images
          } else if (hasDesignImage && !hasColorImage) {
            workflowType = "product_design"; // Product + design image only
          } else if (!hasDesignImage && hasColorImage) {
            workflowType = "product_color"; // Product + color image only
          } else {
            workflowType = "product_prompt"; // Product + other scenarios
          }
          console.log(
            "🎯 Only actual images detected - using image-based workflows",
          );
        }
        // 🔧 PRIORITY 4: Only references/presets, no uploads
        else if (hasReferenceContext && !hasAnyActualImages) {
          workflowType = "product_prompt"; // Reference with prompt only
          console.log("🎯 Reference/previous result only - product_prompt");
        }
      }
      // 🔧 PRESET-ONLY WORKFLOWS: If no actual images, preserve the preset-based workflow we determined earlier
      // This includes: color_prompt, design_prompt, or preset_design based on preset types

      console.log(
        `📋 Preset with explicit reference: ${hasExplicitReference}, has previous result: ${hasPreviousResult}, workflow: ${workflowType}, clear_context: ${shouldClearContext}`,
      );

      return {
        intent: "design",
        confidence: 0.95,
        endpoint: "/api/design",
        parameters: {
          workflow_type: workflowType,
          // No explicit size - let design route auto-detect aspect ratio from product image
          quality: "auto",
          clear_context: shouldClearContext,
        },
        requiresFiles: false, // Presets don't require actual files
        explanation: hasExplicitReference
          ? `User selected preset options (${workflowType}) to modify referenced image - preserving context`
          : hasPreviousResult
            ? `User selected preset options (${workflowType}) with auto-reference to previous result - preserving context`
            : `User selected preset options (${workflowType}) - routing directly to design endpoint with fresh context`,
      };
    }

    // 🎯 ENHANCED: Direct routing for actual image uploads with comprehensive reference handling
    if (
      ((hasDesignImage || hasColorImage) && !hasAnyPresets) ||
      (hasAnyImages && hasExplicitReference)
    ) {
      console.log(
        `Smart fallback routing directly to design endpoint - images detected (uploads: ${hasDesignImage || hasColorImage}, explicit ref: ${hasExplicitReference})`,
      );

      // 🔧 ENHANCED AUTO-REFERENCING: Consider both previous results and explicit references
      const shouldClearContext = !hasExplicitReference && !hasPreviousResult;

      // 🎯 ENHANCED WORKFLOW DETECTION: Handle all complex scenarios including explicit references
      let workflowType = "prompt_only"; // default

      // Complex scenarios with explicit references (the failing cases!)
      if (hasExplicitReference) {
        if (hasProductImage && hasDesignImage && hasColorImage) {
          workflowType = "full_composition"; // Product + design + color + explicit reference
        } else if (hasProductImage && hasDesignImage) {
          workflowType = "product_design"; // Product + design + explicit reference
        } else if (hasProductImage && hasColorImage) {
          workflowType = "product_color"; // Product + color + explicit reference
        } else if (hasDesignImage && hasColorImage) {
          workflowType = "full_composition"; // Design + color + explicit reference
        } else if (hasDesignImage) {
          workflowType = "product_design"; // Design + explicit reference (reference becomes product)
        } else if (hasColorImage) {
          workflowType = "product_color"; // Color + explicit reference (reference becomes product)
        } else if (hasProductImage) {
          workflowType = "product_prompt"; // Product + explicit reference
        } else {
          workflowType = "product_prompt"; // Explicit reference only
        }
      }
      // Previous result scenarios (auto-referencing)
      else if (hasPreviousResult && hasDesignImage && hasColorImage) {
        workflowType = "full_composition"; // Previous result + design + color = full composition
      } else if (hasPreviousResult && hasDesignImage && !hasColorImage) {
        workflowType = "product_design"; // Previous result + design only
      } else if (hasPreviousResult && !hasDesignImage && hasColorImage) {
        workflowType = "product_color"; // Previous result + color only
      }
      // Fresh upload scenarios (no references)
      else if (hasProductImage && hasDesignImage && hasColorImage) {
        workflowType = "full_composition"; // Fresh product + design + color (all 3 images)
      } else if (hasDesignImage && hasColorImage) {
        workflowType = "color_design"; // Fresh design + color (no product)
      } else if (hasDesignImage) {
        workflowType = "design_prompt"; // Fresh design only
      } else if (hasColorImage) {
        workflowType = "color_prompt"; // Fresh color only
      }

      console.log(
        `📋 Enhanced image routing - Previous result: ${hasPreviousResult}, Explicit reference: ${hasExplicitReference}, Workflow: ${workflowType}, Clear context: ${shouldClearContext}`,
      );

      return {
        intent: "design",
        confidence: 0.95,
        endpoint: "/api/design",
        parameters: {
          workflow_type: workflowType,
          quality: "auto",
          clear_context: shouldClearContext,
          ...(hasPreviousResult && !hasExplicitReference
            ? { reference_image_url: lastGeneratedResult.imageUrl }
            : {}),
        },
        requiresFiles: true,
        explanation: hasExplicitReference
          ? `Complex reference scenario detected: ${workflowType} with explicit reference - preserving context`
          : hasPreviousResult
            ? `User uploaded images with auto-reference to previous result: ${workflowType} - preserving context`
            : `Fresh image upload: ${workflowType} - new design request`,
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
        message.toLowerCase().includes(pattern.toLowerCase()),
      ) && hasDesignKeywords;

    if (isFreshDesignRequest) {
      console.log(
        "🆕 Smart fallback detected fresh design request - clearing context",
      );
      return {
        intent: "design",
        confidence: 0.9,
        endpoint: "/api/design",
        parameters: {
          workflow_type: "prompt_only",
          // No explicit size - let design route auto-detect aspect ratio from product image
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
      message.includes(keyword),
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
          "Smart fallback detected multi-step upscale + reframe operation",
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
        "Smart fallback detected upscale request without new images - using conversation context",
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
        "Smart fallback detected analyze request without new images - using conversation context",
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
      message.includes(keyword),
    );

    if (
      hasReframeRequest &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage
    ) {
      console.log(
        "Smart fallback detected reframe request without new images - using conversation context",
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

    const removebgKeywords = [
      "remove background",
      "remove the background",
      "make transparent",
      "make it transparent",
      "cut out",
      "cut it out",
      "background removal",
      "transparent background",
      "no background",
      "without background",
      "isolate",
      "extract",
      "removebg",
      "rembg",
    ];
    const hasRemovebgRequest = removebgKeywords.some((keyword) =>
      message.includes(keyword),
    );

    if (
      hasRemovebgRequest &&
      !hasProductImage &&
      !hasDesignImage &&
      !hasColorImage
    ) {
      console.log(
        "Smart fallback detected removebg request without new images - using conversation context",
      );
      return {
        intent: "remove_background",
        confidence: 0.95,
        endpoint: "/api/removebg",
        parameters: { sync_mode: false },
        requiresFiles: true,
        explanation:
          "User wants to remove background from previous image from conversation context",
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
          "Smart fallback routing to upscale endpoint for single image enhancement",
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
          "Smart fallback routing to reframe endpoint for single image reframing",
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
          "Smart fallback routing to analyze endpoint for single image analysis",
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

      // REMOVE BACKGROUND requests
      if (
        imageCount === 1 &&
        (message.includes("remove background") ||
          message.includes("remove the background") ||
          message.includes("make transparent") ||
          message.includes("make it transparent") ||
          message.includes("cut out") ||
          message.includes("cut it out") ||
          message.includes("background removal") ||
          message.includes("transparent background") ||
          message.includes("no background") ||
          message.includes("without background") ||
          message.includes("isolate") ||
          message.includes("extract") ||
          message.includes("removebg") ||
          message.includes("rembg"))
      ) {
        console.log(
          "Smart fallback routing to removebg endpoint for background removal",
        );
        return {
          intent: "remove_background",
          confidence: 0.95,
          endpoint: "/api/removebg",
          parameters: { sync_mode: false },
          requiresFiles: true,
          explanation:
            "User explicitly wants to remove background from a single image",
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
        "Smart fallback routing to design endpoint - obvious design request",
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
          "Smart fallback routing to flowdesign endpoint for explicit flow/pattern design creation",
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
          "Smart fallback routing to design endpoint for product design application",
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
          "Smart fallback routing to clarity upscaler for image clarity enhancement",
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
          "Smart fallback routing to kling endpoint for image-to-video",
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
          "Smart fallback routing to mirror magic endpoint for image mirroring",
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
        workflowType = "full_composition";
      } else if (hasProductImage && hasDesignImage) {
        workflowType = "product_design";
      } else if (hasProductImage && hasColorImage) {
        workflowType = "product_color";
      } else if (hasDesignImage && hasColorImage) {
        workflowType = "color_design";
      } else if (hasProductImage) {
        workflowType = "product_prompt";
      } else if (hasDesignImage) {
        workflowType = "design_prompt";
      } else if (hasColorImage) {
        workflowType = "color_prompt";
      }

      console.log(
        `Smart fallback routing to design endpoint with workflow: ${workflowType}`,
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
      "Smart fallback defaulting to casual conversation - request unclear",
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
    userMessage.toLowerCase().includes(pattern.replace(/\[.*?\]/g, "")),
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

MODIFICATION WITH NEW UPLOADS (previous result + new images):
   - Previous result available + design image uploaded → workflow_type: "product_design"
   - Previous result available + color image uploaded → workflow_type: "product_color"  
   - Previous result available + design + color images → workflow_type: "full_composition"
   - Always set reference_image_url to previous result URL for modification workflows
   - These are MODIFICATION operations, not fresh creation

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

   K. BACKGROUND REMOVAL → /api/removebg
      - "remove background"
      - "remove the background"
      - "make transparent"
      - "cut out"
      - "background removal"
      - "transparent background"
      - "no background"
      - "without background"
      - "isolate"
      - "extract"

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
7. If user uploaded image + wants "remove background"/"transparent"/"cut out" → /api/removebg

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

INTELLIGENT ASPECT RATIO SELECTION (Like ChatGPT):
📱 PORTRAIT (1024x1536) - Choose when content is naturally tall:
- Tall clothing: dresses, jackets, coats, hoodies, t-shirts (but NOT shoes)
- People/characters: portraits, figures, models, fashion
- Tall objects: towers, buildings, trees, phone cases
- Mobile contexts: phone UI, app design, mobile layouts
- User mentions: "portrait", "tall", "vertical", "person", "character"

🖼️ LANDSCAPE (1536x1024) - Choose when content is naturally wide:
- Wide clothing: pants, jeans, trousers, leggings, shorts
- Wide scenes: landscapes, panoramas, horizons, skylines
- Wide objects: cars, vehicles, sofas, beds, tables, desks
- Nature scenes: mountains, oceans, sunsets, beaches
- User mentions: "landscape", "wide", "horizontal", "scene", "panorama"

⬜ SQUARE (1024x1024) - Default for products and compact items:
- Footwear: shoes, sneakers, boots, sandals (ALWAYS square - portrait cuts them off!)
- Accessories: bags, jewelry, watches, hats
- Compact items: mugs, pillows, logos, icons, stickers
- Product mockups: generic product shots, e-commerce style
- When content doesn't clearly suggest portrait/landscape
- General designs where aspect ratio is ambiguous

CRITICAL: Only use these exact dimensions: 1024x1024, 1024x1536, 1536x1024

MULTI-STEP OPERATIONS:
- Detect when users want multiple operations: "upscale and make landscape", "create design and then upscale", "remove background then upscale"
- For multi-step operations, return intent "multi_step" with steps array
- Use context_chain: true when output of step 1 becomes input of step 2
- Common patterns: upscale→reframe, design→upscale, analyze→design, removebg→upscale, removebg→reframe

CONVERSATION FLOW RULES FOR SPECIFIC RECOMMENDATIONS:
1. If assistant offered specific options (check LAST ASSISTANT MESSAGE for offered options):
   - "yes" or "all" → Create multi_step with all offered options
   - "upscale" → Route to /api/upscale
   - "removebg" or "remove background" → Route to /api/removebg
   - "landscape" or "portrait" → Route to /api/reframe
   - "background" → Route to /api/design with background modification
   - "similar" or "create similar" → Route to /api/design with reference
   - "colors" or "different colors" → Route to /api/design with color changes
   - "A" or "first" or "1" → Route to first option mentioned
   - "B" or "second" or "2" → Route to second option mentioned  
   - "C" or "third" or "3" → Route to third option mentioned
   - "upscale and landscape" → Create multi_step with both operations
   - "remove background and upscale" → Create multi_step with both operations
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
- "removebg" → /api/removebg

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
  "intent": "casual_conversation|create_design|design|upscale_image|clarity_upscale|analyze_image|reframe_image|create_video|mirror_magic|enhance_prompt|generate_title|remove_background",
  "confidence": 0.8-0.95,
  "endpoint": "none|/api/flowdesign|/api/design|/api/upscale|/api/clarityupscaler|/api/analyzeimage|/api/reframe|/api/kling|/api/mirrormagic|/api/promptenhancer|/api/titlerenamer|/api/removebg",
  "parameters": {
    "workflow_type": "prompt_only|product_prompt|design_prompt|color_prompt|product_design|product_color|color_design|full_composition|preset_design",
    "size": "1024x1024|1536x1024|1024x1536", // AUTO-SELECT: portrait (1024x1536) for tall items/clothing, landscape (1536x1024) for wide scenes/pants, square (1024x1024) for products/general
    "quality": "auto",
    "reference_image_url": "use_previous_result_if_referencing",
    "color_modification": "extracted_colors_if_mentioned",
    "style_modification": "extracted_style_if_mentioned",
    "product_type": "pants|shirt|shoe|scarf|dress|etc_if_mentioned",
    "semantic_analysis": {
      "user_intent": "modification|creation|extraction|inspiration",
      "reference_role": "product|design|color|none",
      "input_roles": {
        "product_sources": "reference|preset|upload|none",
        "design_sources": "reference|preset|upload|none", 
        "color_sources": "reference|preset|upload|none"
      }
    }
  },
  "requiresFiles": true/false,
  "explanation": "Brief explanation including semantic role assignments and intent analysis"
}

🧠 INTELLIGENT SEMANTIC WORKFLOW ANALYSIS (FOR /api/design ENDPOINT):

YOU ARE A SEMANTIC ANALYZER - UNDERSTAND INTENT AND RESPECT EXPLICIT INSTRUCTIONS!

🚨 FIRST PRIORITY: EXPLICIT USER INSTRUCTIONS OVERRIDE SEMANTIC ANALYSIS!

Before doing ANY semantic analysis, check if user explicitly stated how to use the reference:
- "use reference as color only" → MUST use reference_role: "color", color_sources: "reference" (ignore semantic assumptions)
- "use reference as design only" → MUST use reference_role: "design", design_sources: "reference" (ignore semantic assumptions)
- "reference for colors only" → MUST use reference_role: "color", color_sources: "reference" (ignore semantic assumptions)
- "only for design" → MUST use reference_role: "design", design_sources: "reference" (ignore semantic assumptions)
- "extract colors from reference" → MUST use reference_role: "color", color_sources: "reference" (ignore semantic assumptions)
- "use reference style only" → MUST use reference_role: "design", design_sources: "reference" (ignore semantic assumptions)

🎯 CORE PRINCIPLE: SAME INPUT CAN PLAY DIFFERENT ROLES based on user intent:
- Reference image can be PRODUCT (base to modify) OR DESIGN (style inspiration) OR COLOR (palette source)
- Uploaded image can be PRODUCT OR DESIGN OR COLOR depending on context
- Presets can supplement or replace actual uploads

🚨 CRITICAL RULE: REFERENCE FILLS THE MISSING ROLE
When user has BOTH product AND design presets, the reference should be used as COLOR source!
When user has product preset but NO design preset, reference is DESIGN source.  
When user has design preset but NO product preset, reference is PRODUCT source.
This prevents conflicts between explicit presets and reference assignments.

🎯 REFERENCE MODE OVERRIDE LOGIC (HIGHEST PRIORITY):
If user explicitly set referencemode:
- referencemode = "color" → Use reference for COLOR only, generate fresh design
- referencemode = "design" → Use reference for DESIGN (and color if needed)  
- referencemode = "product" → Use reference for PRODUCT
- BUT if referencemode = "product" AND product preset/image already exists → Use reference for DESIGN + COLOR (conflict resolution)

🧠 SEMANTIC ROLE ASSIGNMENT LOGIC:

1. ANALYZE USER INTENT FIRST:
- "Apply this color to..." → Color application intent
- "Make this look like..." → Design/style application intent  
- "Create a product..." → Product creation intent
- "Extract colors from..." → Color extraction intent
- "Use this as inspiration..." → Design inspiration intent

2. ASSIGN INPUT ROLES BASED ON INTENT:

📦 PRODUCT ROLE (base item to modify/create):
- Reference image when user wants to MODIFY existing result
- Product preset selection
- Uploaded image when user wants to APPLY something TO it
- Previous generated result in modification context

🎨 DESIGN ROLE (style/pattern/visual inspiration):
- Reference image when user wants NEW product INSPIRED by reference
- Design preset selection  
- Uploaded image when user wants to APPLY its style to something else
- ANY image when user says "make it look like this", "use this style"

🌈 COLOR ROLE (palette/color scheme source):
- Color preset selection
- Uploaded image when user wants to EXTRACT colors from it
- Reference image when user says "use these colors", "apply this palette"
- ANY image when focus is on COLOR extraction/application

3. INTELLIGENT EDGE CASE HANDLING:

🔄 REFERENCE + PRESET COMBINATIONS:

🚨 CRITICAL: REFERENCE FILLS THE MISSING ROLE!

Reference + Product Preset + Design Preset:
├─ Intent: Create product using both presets, extract colors from reference
├─ Product Preset → PRODUCT role (base form)  
├─ Design Preset → DESIGN role (style/patterns)
├─ Reference → COLOR role (extract color palette)
└─ Workflow: preset_design (all three inputs covered)

Reference + Product Preset ONLY (no design preset):
├─ Intent: Create product using reference as design inspiration
├─ Product Preset → PRODUCT role (base form)
├─ Reference → DESIGN role (style inspiration)
├─ Reference → COLOR role (color extraction) [SAME REFERENCE, DUAL PURPOSE]
├─ CRITICAL: reference_role should be "design" (primary purpose)
├─ CRITICAL: input_roles = product_sources:"preset", design_sources:"reference", color_sources:"reference"
└─ Workflow: preset_design

Reference + Design Preset ONLY (no product preset):
├─ Intent: Apply design to reference as product base
├─ Reference → PRODUCT role (base to modify)
├─ Design Preset → DESIGN role (style to apply)
└─ Workflow: preset_design

Reference + Color Preset ONLY (no product/design presets):
├─ Intent: Apply color to existing reference
├─ Reference → PRODUCT role (base to modify)
├─ Color Preset → COLOR role (palette to apply)
└─ Workflow: preset_design

Reference as Color Source + Design Image:
├─ Intent: Extract colors from reference, apply to design
├─ Reference → COLOR role (extract palette)
├─ Design Image → DESIGN role (style to color)
└─ Workflow: color_design

🔄 MULTI-INPUT SCENARIOS:

Product + Design + Color (any combination of actual images/presets):
└─ Workflow: full_composition OR preset_design (if any presets involved)

Product + Design (any combination):
└─ Workflow: product_design OR preset_design (if any presets involved)

Product + Color (any combination):
└─ Workflow: product_color OR preset_design (if any presets involved)

Design + Color (no product):
└─ Workflow: color_design

Single Input + Prompt:
├─ Product role → product_prompt
├─ Design role → design_prompt  
└─ Color role → color_prompt

No Images + Prompt:
└─ Workflow: prompt_only

4. PRESET vs ACTUAL IMAGE PRIORITY:
- ANY preset involved → Use preset_design workflow (it handles mixed scenarios perfectly)
- Pure actual images → Use specific workflow (full_composition, product_color, etc.)
- Mixed presets + images → Always use preset_design (it's designed for this)

5. REFERENCE IMAGE CONTEXT ANALYSIS:

🚨 CRITICAL CONTEXT RULES FOR REFERENCE + PRESET COMBINATIONS:

Reference + Color Preset ONLY:
├─ Intent: RECOLOR/MODIFY the reference image with new color palette
├─ Reference → PRODUCT role (base item to recolor)
├─ Color Preset → COLOR role (new colors to apply)
├─ User wants: Same product structure, different colors
└─ This is MODIFICATION of existing reference, NOT creation of new design

Reference + Design Preset ONLY:
├─ Intent: RESTYLE the reference image with new design patterns
├─ Reference → PRODUCT role (base item to restyle)
├─ Design Preset → DESIGN role (new patterns to apply)
├─ User wants: Same product structure, different design elements
└─ This is MODIFICATION of existing reference, NOT creation inspired by reference

Reference + Product Preset + Other Presets:
├─ Intent: CREATE new product using reference as DESIGN inspiration
├─ Product Preset → PRODUCT role (what to create)
├─ Reference → DESIGN role (style inspiration)
├─ Other Presets → Additional styling
└─ This is CREATION inspired by reference

"Create a design composition using the uploaded images" + Reference + Color Preset:
├─ Analysis: User wants to RECOLOR existing design composition
├─ Reference → PRODUCT role (existing composition to modify)
├─ Color Preset → COLOR role (new color scheme)
├─ Result: Same design composition with different colors
└─ This is MODIFICATION/RECOLORING, not new creation

"Apply this color to the design" + Reference Available:
├─ Analysis: User wants to MODIFY existing reference
├─ Reference → PRODUCT role (base to modify)
├─ Color upload → COLOR role (palette to apply)
└─ This is MODIFICATION of the reference

6. CRITICAL SEMANTIC DISTINCTION:
- MODIFICATION INTENT: "Change this", "Apply to this", "Modify this", "recolor this", "use these colors on this" → Reference = PRODUCT role
- CREATION INTENT: "Create using this", "Make something like this", "Inspired by this", "new design based on this" → Reference = DESIGN role  
- EXTRACTION INTENT: "Use colors from this", "Extract palette" → Reference = COLOR role

🚨 SPECIAL CASE: When user has ONLY reference + single preset (color OR design):
- This is ALMOST ALWAYS modification intent (recolor or restyle the reference)
- Reference should be PRODUCT role (base to modify)
- Preset provides the modification (color change or design change)
- NOT inspiration for creating something new

🚨 ULTRA-CRITICAL PRESET + REFERENCE SCENARIOS:

**SCENARIO 1: Product Preset + Reference** (MOST COMMON FAILING CASE)
User: "Create a design composition using the uploaded images"
Context: Has product preset (e.g. pillow) + reference image (e.g. sneaker)
CORRECT Analysis:
├─ Intent: CREATE NEW product (pillow) using reference as design inspiration
├─ Product Preset → PRODUCT role (defines WHAT to create: pillow shape/form)
├─ Reference → DESIGN role (defines HOW to style it: extract visual patterns from sneaker)
├─ Reference → COLOR role (defines COLORS to use: extract color palette from sneaker)
├─ reference_role: "design" (primary purpose is visual inspiration)
├─ input_roles: {product_sources:"preset", design_sources:"reference", color_sources:"reference"}
└─ Result: Pillow with sneaker-inspired patterns and colors

**SCENARIO 2: Reference + Color Preset Only**
User: "Apply these colors to this design"
Context: Has reference image + color preset
CORRECT Analysis:
├─ Intent: MODIFY existing reference with new colors
├─ Reference → PRODUCT role (base design to recolor)
├─ Color Preset → COLOR role (new colors to apply)
├─ reference_role: "product" (primary purpose is the base to modify)
├─ input_roles: {product_sources:"reference", design_sources:"none", color_sources:"preset"}
└─ Result: Same design composition with different colors

**SCENARIO 3: Uploaded Product + Reference** (CRITICAL FIX - MOST COMMON USER SCENARIO)
User: "Create a design composition using the uploaded images"
Context: User uploaded product image + has reference available
CORRECT Analysis:
├─ Intent: MODIFY uploaded product using reference (CHECK REFERENCE MODE FIRST!)
├─ Uploaded Product Image → PRODUCT role (ALWAYS the uploaded image - this is what user wants to modify)
├─ Reference usage depends on referencemode:
│   ├─ If referencemode="color" → Reference → COLOR role only
│   ├─ If referencemode="design" → Reference → DESIGN role (and COLOR if needed)
│   ├─ If referencemode="product" → Reference → DESIGN + COLOR (conflict resolution)
│   └─ If no referencemode → Default to DESIGN + COLOR (semantic analysis)
├─ reference_role: Based on referencemode or "design" (fallback)
├─ input_roles: {product_sources:"upload", design_sources:"reference", color_sources:"reference"} (adjust based on referencemode)
└─ Result: User's uploaded product with reference used according to their specified mode

**SCENARIO 4: Uploaded Product + Reference + Color Preset** (CRITICAL FIX)
User: "Create a design composition using the uploaded images"
Context: User uploaded product image + has reference + selected color preset
CORRECT Analysis:
├─ Intent: MODIFY uploaded product using reference design + preset colors
├─ Uploaded Product Image → PRODUCT role (ALWAYS the uploaded image - this is what user wants to modify)
├─ Reference → DESIGN role (extract patterns/style from reference to apply to uploaded product)
├─ Color Preset → COLOR role (apply preset color scheme to uploaded product)
├─ reference_role: "design" (reference provides design elements only, colors from preset)
├─ input_roles: {product_sources:"upload", design_sources:"reference", color_sources:"preset"}
└─ Result: User's uploaded product with reference-inspired design + preset colors

**ULTRA-CRITICAL RULE**: 
- When user UPLOADS a product image, that uploaded image is ALWAYS the PRODUCT base to modify
- Reference is NEVER the product when user has uploaded their own product image
- Product preset present = CREATE new product, reference = design inspiration
- No product preset = MODIFY existing reference OR uploaded product (uploaded takes priority)

EDGE CASE EXAMPLES:
- Reference + Product preset + Color preset = full_composition (reference as design inspiration)
- Reference + Color preset = product_color (reference as product base)
- Reference as color source + Design upload = color_design (reference as color source)
- Multiple color presets = preset_design (blend multiple color palettes)
- Reference + "make it look different" = product_prompt (reference as product base)`;

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
        !formDataEntries.some(([key]) => key === "explicit_reference")) ||
      // ✅ NEW: Always bypass Claude for actual image uploads with auto-referencing
      // Smart fallback is excellent at detecting these workflow combinations
      (smartResult.intent === "design" &&
        formDataEntries.some(
          ([key]) =>
            key.includes("design_image") || key.includes("color_image"),
        ) &&
        !formDataEntries.some(([key]) => key.startsWith("preset_"))));

  if (isSuperObvious) {
    console.log(
      "⚡ Using smart fallback for super obvious operation - skipping Claude",
    );
    return smartResult;
  }

  console.log(
    "🧠 Using Claude for intelligent analysis (let Claude be the brain!)",
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
        ([key]) => key === "product_type",
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
                `${msg.role}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? "..." : ""}`,
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

🔧 EXPLICIT REFERENCE ROLE INSTRUCTIONS:
${
  formDataEntries.some(([key]) => key === "referencemode")
    ? `User explicitly specified reference mode: "${formDataEntries.find(([key]) => key === "referencemode")?.[1]}" 

🚨 CRITICAL REFERENCE MODE HANDLING:
- If referencemode="color" → Use reference for COLOR only, design_sources="none"
- If referencemode="design" → Use reference for DESIGN (and COLOR if needed)
- If referencemode="product" → Use reference for PRODUCT
- BUT if referencemode="product" AND user has product preset/image → Use reference for DESIGN+COLOR (conflict resolution)

The user specifically chose "${formDataEntries.find(([key]) => key === "referencemode")?.[1]}" mode - RESPECT THIS CHOICE!`
    : "No specific reference mode from UI - check message for explicit instructions"
}

🔍 EXPLICIT REFERENCE ROLE DETECTION IN USER MESSAGE:
Check for these explicit instructions in the user message:
- "use reference as color only" / "reference for colors only" / "only for color" → reference_role: "color", color_sources: "reference", design_sources: "none"
- "use reference as design only" / "reference for design only" / "only for design" → reference_role: "design", design_sources: "reference", color_sources: "none"  
- "use reference as product only" / "reference for product only" / "only for product" → reference_role: "product", product_sources: "reference"
- "reference for both design and color" / "use for design and color" → design_sources: "reference", color_sources: "reference"
- "only colors from reference" / "just the colors" / "extract colors only" → reference_role: "color", color_sources: "reference"
- "only the style from reference" / "just the design" / "design inspiration only" → reference_role: "design", design_sources: "reference"

⚠️ CRITICAL: If user gives EXPLICIT instructions about reference usage, ALWAYS follow those instructions instead of making semantic assumptions!

🎯 EXPLICIT INSTRUCTION PRIORITY:
1. FIRST: Check for UI reference mode setting (referencemode parameter) - HIGHEST PRIORITY
2. SECOND: Check for explicit reference role instructions in user message
3. THIRD: Use semantic analysis as fallback only when no explicit instructions

🚨 CRITICAL: If referencemode is set, it OVERRIDES all semantic analysis! User made an explicit choice!

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

🔍 REFERENCE IMAGE AVAILABLE: ${lastGeneratedResult.imageUrl ? "YES ✅ - User can modify this image" : "NO"}
${lastGeneratedResult.imageUrl ? `📸 REFERENCE URL: ${lastGeneratedResult.imageUrl}` : ""}
`
    : ""
}

REFERENCE ANALYSIS:
- Contains reference words: ${hasReference ? "YES" : "NO"}
- Has uploaded images: ${hasUploadedImages ? "YES" : "NO"}
- Likely referring to UPLOADED image: ${hasReference && hasUploadedImages ? "YES" : "NO"}
- Likely referring to PREVIOUS result: ${hasReference && lastGeneratedResult && !hasUploadedImages ? "YES" : "NO"}

CRITICAL: If user uploaded images and uses words like "it", "this", "that" - they are referring to the UPLOADED images, NOT previous results!

🎯 WORKFLOW SCENARIO DETECTION:
${
  hasUploadedImages && lastGeneratedResult?.imageUrl
    ? `
⚠️ MODIFICATION SCENARIO DETECTED:
- User has REFERENCE IMAGE available: ${lastGeneratedResult.imageUrl}
- User uploaded NEW IMAGE(S): ${imageFileEntries.map(([key]) => key).join(", ")}
- This is a MODIFICATION workflow, not fresh creation
- Choose appropriate product_* workflow (product_color, product_design, etc.)
`
    : hasUploadedImages
      ? `
🆕 FRESH CREATION SCENARIO:
- User uploaded image(s) but no reference available
- This is a FRESH CREATION workflow
- Choose appropriate *_prompt workflow (color_prompt, design_prompt, etc.)
`
      : lastGeneratedResult?.imageUrl
        ? `
📝 TEXT MODIFICATION SCENARIO:
- User has reference image but no new uploads
- This is text-based modification of existing result
- Choose appropriate *_prompt workflow based on what user wants to change
`
        : `
💬 NO IMAGES SCENARIO:
- No reference image and no uploads detected
- This might be casual conversation or prompt-only generation
`
}

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
        "⚠️ First attempt failed, retrying Claude intent parsing...",
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
  apiResult?: any,
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
          claudeResponse.error,
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
          // Helper to clean result data
          const sanitizeAnalysis = (obj: any): string => {
            if (typeof obj === "string") return obj;
            const sanitized = { ...obj };
            Object.keys(sanitized).forEach((key) => {
              const value = sanitized[key];
              if (
                typeof value === "string" &&
                (value.startsWith("data:image/") || value.length > 1000)
              ) {
                sanitized[key] =
                  `[TRUNCATED_${Math.floor(value.length / 1024)}KB]`;
              }
            });
            return JSON.stringify(sanitized, null, 2);
          };

          const analysisContent =
            apiResult.result.raw_analysis || sanitizeAnalysis(apiResult.result);
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
  request?: NextRequest,
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
          // Handle comma-separated multiple presets
          if (value.includes(",")) {
            // Split by comma, extract category from each path, then rejoin
            const paths = value.split(",").map((path) => path.trim());
            const categories = paths.map((path) => extractPresetCategory(path));
            processedValue = categories.join(", ");
            console.log(
              `🎨 Multiple presets detected: ${categories.join(" + ")} (from ${paths.length} paths)`,
            );
          } else {
            processedValue = extractPresetCategory(value);
          }
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
          `📋 Found preset selection: ${key} = ${processedValue} (from ${value})`,
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

      // 🧠 CRITICAL: Pass semantic analysis for intelligent input role assignment
      if (parameters.semantic_analysis) {
        const serializedAnalysis =
          typeof parameters.semantic_analysis === "object"
            ? JSON.stringify(parameters.semantic_analysis)
            : parameters.semantic_analysis;
        formData.append("semantic_analysis", serializedAnalysis);
        console.log(
          "🧠 Added semantic analysis for intelligent processing:",
          serializedAnalysis,
        );
      }

      // Add color/style modifications if specified
      if (parameters.color_modification) {
        formData.append("color_modification", parameters.color_modification);
        console.log(
          "🎨 Added color modification:",
          parameters.color_modification,
        );
      }
      if (parameters.style_modification) {
        formData.append("style_modification", parameters.style_modification);
        console.log(
          "✨ Added style modification:",
          parameters.style_modification,
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

      // 🔧 CRITICAL FIX: Pass reference_image_url parameter directly to design route
      if (parameters.reference_image_url) {
        formData.append("reference_image_url", parameters.reference_image_url);
        console.log(
          `🔗 Added reference_image_url parameter:`,
          parameters.reference_image_url,
        );
      }

      // Also check for any processed URLs from file uploads that might have different key names
      // Prioritize fresh uploads over cached URLs
      const productKeys = Object.keys(imageUrls).filter((key) =>
        key.includes("product"),
      );
      const designKeys = Object.keys(imageUrls).filter((key) =>
        key.includes("design"),
      );
      const colorKeys = Object.keys(imageUrls).filter((key) =>
        key.includes("color"),
      );

      // For product URLs, prioritize fresh uploads (containing timestamps) over cached ones
      if (productKeys.length > 0 && !formData.has("product_image_url")) {
        // Sort keys to prioritize fresh uploads with timestamps over cached URLs
        const sortedProductKeys = productKeys.sort((a, b) => {
          const aUrl = imageUrls[a];
          const bUrl = imageUrls[b];

          // Prioritize URLs with timestamps (fresh uploads) over those with IMG_ (cached)
          const aIsFresh = aUrl.includes("/input/") && /\d{13}_/.test(aUrl);
          const bIsFresh = bUrl.includes("/input/") && /\d{13}_/.test(bUrl);
          const aIsCached = aUrl.includes("IMG_");
          const bIsCached = bUrl.includes("IMG_");

          if (aIsFresh && !bIsFresh) return -1;
          if (!aIsFresh && bIsFresh) return 1;
          if (aIsCached && !bIsCached) return 1;
          if (!aIsCached && bIsCached) return -1;

          return 0;
        });

        const selectedProductKey = sortedProductKeys[0];
        formData.append("product_image_url", imageUrls[selectedProductKey]);
        console.log(
          `🔗 Added product_image_url from ${selectedProductKey}:`,
          imageUrls[selectedProductKey],
        );
        if (productKeys.length > 1) {
          console.log(
            `📋 Skipped ${productKeys.length - 1} other product URLs (prioritized fresh upload)`,
          );
        }
      }

      if (designKeys.length > 0 && !formData.has("design_image_url")) {
        const selectedDesignKey = designKeys[0];
        formData.append("design_image_url", imageUrls[selectedDesignKey]);
        console.log(
          `🔗 Added design_image_url from ${selectedDesignKey}:`,
          imageUrls[selectedDesignKey],
        );
      }

      if (colorKeys.length > 0 && !formData.has("color_image_url")) {
        const selectedColorKey = colorKeys[0];
        formData.append("color_image_url", imageUrls[selectedColorKey]);
        console.log(
          `🔗 Added color_image_url from ${selectedColorKey}:`,
          imageUrls[selectedColorKey],
        );
      }

      // 🎯 CRITICAL FIX: Handle direct color_image assignment from reference/complex scenarios
      if (!formData.has("color_image_url") && imageUrls.color_image) {
        formData.append("color_image_url", imageUrls.color_image);
        console.log(
          "🔗 Added color_image_url from direct assignment (reference):",
          imageUrls.color_image,
        );
      }

      // 🔄 Handle reference image intelligently based on context
      if (parameters.reference_image_url) {
        // Check if we have inherited product presets - if so, DON'T override product
        const hasInheritedProduct = presetSelections.preset_product_type;

        // 🎯 CRITICAL FIX: Check if user selected a different product preset
        const useNewProductPreset = parameters.use_new_product_preset;

        // Check if this is a fresh design request
        const claudeExplanation = parameters.explanation?.toLowerCase() || "";
        const isExplicitlyFreshRequest =
          claudeExplanation.includes("not referencing previous results") ||
          claudeExplanation.includes("new design request") ||
          claudeExplanation.includes("fresh design request") ||
          parameters.workflow_type === "prompt_only";

        // 🔧 MODIFICATION WORKFLOWS: Always need reference image as product base
        const modificationWorkflows = [
          "product_color",
          "product_design",
          "full_composition",
        ];
        const isModificationWorkflow = modificationWorkflows.includes(
          parameters.workflow_type,
        );

        // 🔧 NON-PRODUCT WORKFLOWS: Don't add reference as product_image
        const workflowsWithoutProduct = [
          "color_prompt",
          "design_prompt",
          "prompt_only",
        ];
        const workflowRequiresNoProduct = workflowsWithoutProduct.includes(
          parameters.workflow_type,
        );

        if (useNewProductPreset) {
          // 🎯 USER SELECTED DIFFERENT PRODUCT PRESET: Don't use reference image as product base
          console.log(
            "🎯 Different product preset selected - ignoring reference image for product base, using new preset instead",
          );
          // Don't add reference as product_image_url - let the new product preset handle the product type
        } else if (
          hasInheritedProduct &&
          !formData.has("product_image_url") &&
          !isModificationWorkflow
        ) {
          // We have a product type preset, so reference image should be for inspiration only
          console.log(
            "🧬 Preserving product type preset, using reference for style inspiration only",
          );
          // Don't add reference as product_image_url - let preset handle product type
        } else if (
          isModificationWorkflow &&
          !formData.has("product_image_url") &&
          !isExplicitlyFreshRequest
        ) {
          // MODIFICATION: Always use reference image as product base
          formData.append("product_image_url", parameters.reference_image_url);
          console.log(
            `🔄 Added reference image as product_image_url for ${parameters.workflow_type} modification:`,
            parameters.reference_image_url,
          );
        } else if (
          !formData.has("product_image_url") &&
          !workflowRequiresNoProduct &&
          !isExplicitlyFreshRequest
        ) {
          // GENERAL: Add reference as product if no product defined and workflow allows it
          formData.append("product_image_url", parameters.reference_image_url);
          console.log(
            "🔄 Added reference image as product_image_url:",
            parameters.reference_image_url,
          );
        } else if (workflowRequiresNoProduct) {
          console.log(
            `🎯 Skipping product_image_url for ${parameters.workflow_type} workflow (requires hasProduct=false)`,
          );
        } else if (isExplicitlyFreshRequest) {
          console.log(
            "🆕 Skipping product_image_url - fresh design request detected:",
            claudeExplanation,
          );
        } else {
          console.log(
            "🔄 Reference image available but product already defined or not needed",
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
          presetSelections.preset_color_palette,
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
          imageUrls.product_image,
        );
      }
      if (imageUrls.design_image) {
        formData.append("design_image_url", imageUrls.design_image);
        console.log(
          "🔗 Added design_image_url for flow design:",
          imageUrls.design_image,
        );
      }
      if (imageUrls.color_image) {
        formData.append("color_image_url", imageUrls.color_image);
        console.log(
          "🔗 Added color_image_url for flow design:",
          imageUrls.color_image,
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
          // 🎯 CRITICAL FIX: Properly serialize objects to JSON for complex parameters
          const serializedValue =
            typeof value === "object" ? JSON.stringify(value) : String(value);
          formData.append(key, serializedValue);
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
          // 🎯 CRITICAL FIX: Properly serialize objects to JSON for complex parameters
          const serializedValue =
            typeof value === "object" ? JSON.stringify(value) : String(value);
          formData.append(key, serializedValue);
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
          // 🎯 CRITICAL FIX: Properly serialize objects to JSON for complex parameters
          const serializedValue =
            typeof value === "object" ? JSON.stringify(value) : String(value);
          formData.append(key, serializedValue);
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
          `Direct import not implemented for ${endpoint}. HTTP calls not supported in production.`,
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
            "Create a smooth transition video",
        );
        console.log("🔗 Added image_url for kling video creation:", imageUrl);
      } else {
        throw new Error("No image URL found for video creation");
      }

      // Add other kling-specific parameters
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== "image_url") {
          // 🎯 CRITICAL FIX: Properly serialize objects to JSON for complex parameters
          const serializedValue =
            typeof value === "object" ? JSON.stringify(value) : String(value);
          formData.append(key, serializedValue);
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
    } else if (endpoint === "/api/removebg") {
      const imageUrl =
        imageUrls.product_image ||
        imageUrls.design_image ||
        imageUrls.color_image ||
        parameters.reference_image_url; // 🔧 Add fallback for previous result

      if (imageUrl) {
        formData.append("image_url", imageUrl);
        console.log("🔗 Added image_url for background removal:", imageUrl);
      } else {
        throw new Error("No image URL found for background removal");
      }

      // Add removebg specific parameters
      if (parameters.sync_mode !== undefined) {
        formData.append("sync_mode", String(parameters.sync_mode));
      }

      console.log("🔗 Added removebg parameters");
    } else {
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // 🎯 CRITICAL FIX: Properly serialize objects to JSON for complex parameters
          const serializedValue =
            typeof value === "object" ? JSON.stringify(value) : String(value);
          formData.append(key, serializedValue);
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
      const mockRequest = new Request(`${getBaseUrl()}/api/design`, {
        method: "POST",
        body: formData,
      });

      console.log("🚀 Calling design route...");
      const response = await designPOST(mockRequest as any);
      const result = await response.json();

      // Clean logging helper (reused from above)
      const sanitizeForLogging = (obj: any): any => {
        if (!obj) return obj;
        const sanitized = { ...obj };
        Object.keys(sanitized).forEach((key) => {
          const value = sanitized[key];
          if (typeof value === "string") {
            if (
              value.startsWith("data:image/") ||
              value.match(/^[A-Za-z0-9+/]+=*$/)
            ) {
              sanitized[key] =
                `[BASE64_IMAGE_DATA_${Math.floor(value.length / 1024)}KB]`;
            } else if (value.length > 1000) {
              sanitized[key] =
                `[LARGE_STRING_${Math.floor(value.length / 1024)}KB]`;
            }
          }
        });
        return sanitized;
      };

      console.log(
        "🔍 Design route result:",
        JSON.stringify(sanitizeForLogging(result), null, 2),
      );
      return result;
    } else if (endpoint === "/api/reframe") {
      // Import and call the reframe API logic directly
      const { POST: reframePOST } = await import("../reframe/route");

      // Create a mock NextRequest object with the FormData
      const mockRequest = new Request(`${getBaseUrl()}/api/reframe`, {
        method: "POST",
        body: formData,
      });

      const response = await reframePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/upscale") {
      // Import and call the upscale API logic directly
      const { POST: upscalePOST } = await import("../upscale/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/upscale`, {
        method: "POST",
        body: formData,
      });

      const response = await upscalePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/analyzeimage") {
      // Import and call the analyzeimage API logic directly
      const { POST: analyzeImagePOST } = await import("../analyzeimage/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/analyzeimage`, {
        method: "POST",
        body: formData,
      });

      const response = await analyzeImagePOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/flowdesign") {
      // Import and call the flowdesign API logic directly
      const { POST: flowDesignPOST } = await import("../flowdesign/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/flowdesign`, {
        method: "POST",
        body: formData,
      });

      const response = await flowDesignPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/kling") {
      // Import and call the kling API logic directly
      const { POST: klingPOST } = await import("../kling/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/kling`, {
        method: "POST",
        body: formData,
      });

      const response = await klingPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/mirrormagic") {
      // Import and call the mirrormagic API logic directly
      const { POST: mirrorMagicPOST } = await import("../mirrormagic/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/mirrormagic`, {
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

      const mockRequest = new Request(`${getBaseUrl()}/api/promptenhancer`, {
        method: "POST",
        body: formData,
      });

      const response = await promptEnhancerPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/titlerenamer") {
      // Import and call the titlerenamer API logic directly
      const { POST: titleRenamerPOST } = await import("../titlerenamer/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/titlerenamer`, {
        method: "POST",
        body: formData,
      });

      const response = await titleRenamerPOST(mockRequest as any);
      return await response.json();
    } else if (endpoint === "/api/removebg") {
      // Import and call the removebg API logic directly
      const { POST: removebgPOST } = await import("../removebg/route");

      const mockRequest = new Request(`${getBaseUrl()}/api/removebg`, {
        method: "POST",
        body: formData,
      });

      const response = await removebgPOST(mockRequest as any);
      return await response.json();
    } else {
      // For endpoints not yet implemented with direct imports
      throw new Error(
        `Direct import not implemented for ${endpoint}. Please add direct import support for this endpoint.`,
      );
    }
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("=== Intent Route Debug ===");
  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    // 1) Extract and validate userid and chatId
    let userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      userid = "uTiXKRbCYbhWnBbkLFZoMdEMdgf2";
      formData.set("userid", userid);
    }

    const chatId = (formData.get("chatId") as string | null)?.trim();
    console.log("Extracted chatId:", chatId);
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
      } catch (error) {
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid Firebase user ID - authentication required",
          },
          { status: 401 },
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
        { status: 400 },
      );
    }

    const effectiveMessage =
      message || "Create a design composition using the uploaded images";
    console.log("Effective message:", effectiveMessage);

    const conversationHistoryStr = formData.get(
      "conversation_history",
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
    // 🔧 NEW: Handle reference mode for contextual processing
    const referenceMode = formData.get("referencemode") as string;

    let explicitReference:
      | {
          imageUrl?: string;
          endpoint?: string;
          intent?: string;
          text?: string;
          images?: string[];
          inheritedPresets?: Record<string, string>;
          referencemode?: "product" | "color" | "design"; // 🔧 NEW: Include reference mode
        }
      | undefined;

    console.log(`🔧 REFERENCE MODE DEBUG:`);
    console.log(`  - Reference mode: ${referenceMode || "not specified"}`);
    console.log(
      `  - Explicit reference: ${explicitReferenceStr ? "present" : "not present"}`,
    );

    // Smart reference chain resolution function
    const resolveReferenceChain = (
      reference: any,
      conversationHistory: ChatMessage[],
    ): {
      images: string[];
      text: string;
      chainLength: number;
      inheritedPresets?: Record<string, string>;
      referencemode?: "product" | "color" | "design"; // 🔧 NEW: Propagate reference mode
    } => {
      let currentRef = reference;
      let allImages: string[] = [];
      let allText: string[] = [];
      let chainLength = 0;
      let inheritedPresets: Record<string, string> = {};
      let detectedReferenceMode = referenceMode as
        | "product"
        | "color"
        | "design"; // 🔧 NEW: Track reference mode
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
            `🔍 Looking for AI response to message with timestamp: ${currentRef.timestamp} (${refTimestamp})`,
          );

          // Find the AI's response that came after this user message
          for (let i = 0; i < conversationHistory.length - 1; i++) {
            const userMsg = conversationHistory[i];
            const aiMsg = conversationHistory[i + 1];

            const userTimestamp = new Date(userMsg.timestamp || 0).getTime();
            console.log(
              `🔍 Checking user message: ${userMsg.timestamp} (${userTimestamp}) vs ref: ${refTimestamp}, diff: ${Math.abs(userTimestamp - refTimestamp)}ms`,
            );

            // More flexible timestamp matching - within 30 seconds to account for processing delays
            if (
              Math.abs(userTimestamp - refTimestamp) < 30000 && // Within 30 seconds
              aiMsg.role === "assistant"
            ) {
              console.log(
                `✅ Found matching user message, checking AI response for Firebase URLs...`,
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
                  img.includes("storage.googleapis.com"),
                ),
              ];

              if (allFoundUrls.length > 0) {
                console.log(
                  `🎯 Found ${allFoundUrls.length} generated result(s) for referenced message:`,
                  allFoundUrls,
                );
                allImages.push(...allFoundUrls);
                allText.push(
                  `Generated result: ${aiMsg.content.slice(0, 100)}...`,
                );
              } else {
                console.log(
                  `⚠️ AI response found but no Firebase URLs detected. Content: ${aiMsg.content.slice(0, 200)}`,
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
            img.includes("storage.googleapis.com"),
          );
          if (!hasGeneratedResults) {
            console.log(
              "⚠️ No generated results found, falling back to input images:",
              currentRef.images,
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
            currentRef.timestamp || 0,
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
        referencemode: detectedReferenceMode, // 🔧 NEW: Include reference mode in resolved chain
      };
    };

    if (explicitReferenceStr) {
      try {
        const reference = JSON.parse(explicitReferenceStr);
        // 🔧 NEW: Include reference mode in the reference object
        reference.referencemode = referenceMode;

        // Resolve reference chain to get all images and context
        const resolvedChain = resolveReferenceChain(
          reference,
          conversationHistory,
        );

        explicitReference = {
          imageUrl: resolvedChain.images[0], // Primary image (fallback)
          text: resolvedChain.text,
          images: resolvedChain.images, // All images in the chain
          inheritedPresets: resolvedChain.inheritedPresets, // Inherited presets
          referencemode: resolvedChain.referencemode, // 🔧 NEW: Include reference mode
          // We don't have endpoint/intent from the reference, but that's ok
        };

        console.log(
          `🔧 Explicit reference resolved (chain length: ${resolvedChain.chainLength}):`,
          {
            imageCount: resolvedChain.images.length,
            images: resolvedChain.images,
            text: resolvedChain.text,
            inheritedPresets: resolvedChain.inheritedPresets,
          },
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
              // Use dynamic base URL to work in both development and production
              const fullUrl = `${getBaseUrl()}${url}`;
              console.log(`🔄 Converting local path to full URL: ${fullUrl}`);

              try {
                const response = await fetch(fullUrl);
                const blob = await response.blob();
                const file = new File(
                  [blob],
                  `${key.replace("_url", "")}.png`,
                  { type: "image/png" },
                );
                const processedFile = await validateAndProcessImage(file);
                const imageUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid,
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
                  { type: "image/png" },
                );
                const processedFile = await validateAndProcessImage(file);
                const imageUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid,
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
              `${key.replace("_base64", "")}.png`,
            );
            const imageUrl = await uploadImageToFirebaseStorage(
              processedFile,
              userid,
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
              userid,
            );
            return { key, value: imageUrl, type: "file" };
          }

          return null;
        });

        const processResults = await Promise.all(processPromises);

        // Separate processed images and presets
        const processedImages = processResults.filter(
          (result) => result && result.type !== "preset",
        );
        const presetSelections = processResults.filter(
          (result) => result && result.type === "preset",
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
            explicitReference.inheritedPresets,
          );

          Object.entries(explicitReference.inheritedPresets).forEach(
            ([presetKey, presetValue]) => {
              // Only inherit preset if current request doesn't already have it
              if (!formData.has(presetKey)) {
                console.log(`🧬 Inheriting ${presetKey}: ${presetValue}`);
                formData.set(presetKey, presetValue);
              } else {
                console.log(
                  `🔄 Overriding inherited ${presetKey} with current selection: ${formData.get(presetKey)}`,
                );
              }
            },
          );
        }

        console.log("✅ All image processing successful!");
        console.log("📋 Image URLs:", imageUrls);
        console.log("📋 Preset selections:", presetSelections.length);
      } catch (error) {
        console.error("❌ Image processing failed:", error);
        return NextResponse.json(
          { status: "error", error: `Image processing failed: ${error}` },
          { status: 500 },
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
                extractedImageUrl,
              );
            }

            // Fallback: Try to extract result info from assistant message content - look for various patterns
            if (!extractedImageUrl) {
              const firebaseUrlMatch = msg.content.match(
                /firebaseOutputUrl['":\s]*([^"'\s,}]+)/,
              );
              const imageUrlMatch = msg.content.match(
                /imageUrl['":\s]*([^"'\s,}]+)/,
              );
              const outputUrlMatch = msg.content.match(
                /outputUrl['":\s]*([^"'\s,}]+)/,
              );
              const dataUrlMatch = msg.content.match(
                /data_url['":\s]*([^"'\s,}]+)/,
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
                lastGeneratedResult,
              );
              break;
            }
          } catch (error) {
            console.log(
              "⚠️ Could not parse last result context from message:",
              msg.content.slice(0, 100),
            );
          }
        }
      }
    }

    const intentAnalysis = await analyzeIntent(
      effectiveMessage,
      conversationHistory,
      entries,
      explicitReference || lastGeneratedResult, // 🔧 Prioritize explicit reference over auto-detected
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
          `🔧 Replaced Claude's placeholder with actual reference URL: ${actualReferenceUrl}`,
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

    // 🔍 ENHANCED DEBUGGING: Add comprehensive logging for complex reference scenarios
    console.log(`🔍 COMPLEX SCENARIO DEBUGGING - Input Analysis:`);
    console.log(
      `📋 Form data entries:`,
      Array.from(formData.entries()).map(([key, value]: [string, any]) => ({
        key,
        valueType: typeof value,
        isFile: value instanceof File,
        fileName: value instanceof File ? value.name : "N/A",
      })),
    );
    console.log(
      `📋 Current imageUrls:`,
      Object.keys(imageUrls).map((key) => ({
        key,
        url: imageUrls[key]?.substring(0, 50) + "...",
      })),
    );
    console.log(`📋 Reference result:`, {
      hasExplicitReference: !!explicitReference,
      hasLastGeneratedResult: !!lastGeneratedResult,
      referenceUrl: referenceResult?.imageUrl?.substring(0, 50) + "...",
      inheritedPresets: explicitReference?.inheritedPresets,
    });
    console.log(`📋 Intent analysis:`, {
      intent: intentAnalysis.intent,
      endpoint: intentAnalysis.endpoint,
      workflowType: intentAnalysis.parameters?.workflow_type,
      shouldClearContext,
      explanation: intentAnalysis.explanation?.substring(0, 100) + "...",
    });

    // 🚨 NEW: Check if this is a fresh design request that should ignore context
    if (shouldClearContext && intentAnalysis.intent === "design") {
      console.log(
        `🆕 Skipping context reference for fresh design request - clear_context=true`,
      );
    }
    // 🔧 CRITICAL FIX: Check for fresh generation scenarios (preset-aware)
    else if (referenceResult?.imageUrl) {
      const workflowType = intentAnalysis.parameters.workflow_type;

      // Check for presets (this is the key fix)
      const hasProductPreset = !!formData.get("preset_product_type");
      const hasColorPreset = !!formData.get("preset_color_palette");
      const hasDesignPreset = !!formData.get("preset_design_style");

      // 🔧 CRITICAL: Primary fresh generation detection for preset-only scenarios
      const isPresetOnlyFreshPattern =
        workflowType === "preset_design" &&
        hasProductPreset &&
        hasColorPreset &&
        !hasDesignPreset &&
        Object.keys(imageUrls).length === 0;

      console.log(`🔍 PRESET-ONLY FRESH GENERATION CHECK:`);
      console.log(`   - Workflow: ${workflowType}`);
      console.log(`   - Product preset: ${hasProductPreset}`);
      console.log(`   - Color preset: ${hasColorPreset}`);
      console.log(`   - Design preset: ${hasDesignPreset}`);
      console.log(`   - No uploads: ${Object.keys(imageUrls).length === 0}`);
      console.log(`   - Is fresh pattern: ${isPresetOnlyFreshPattern}`);

      if (isPresetOnlyFreshPattern) {
        console.log(
          `🆕 PRESET-ONLY FRESH GENERATION DETECTED: Skipping auto-reference - user wants clean generation with presets only`,
        );
        console.log(
          `   - Using: Product preset + Color preset (no design = fresh generation)`,
        );
        // Skip adding reference - let the user's presets be used as-is
      } else if (Object.keys(imageUrls).length > 0) {
        // Handle complex scenarios with uploads
        const sourceType = explicitReference
          ? "explicit reference"
          : "previous result";
        console.log(
          `🎯 COMPLEX SCENARIO: New images uploaded AND ${sourceType} available - combining both!`,
        );
        console.log(`📋 Current imageUrls:`, Object.keys(imageUrls));
        console.log(`🔗 Reference URL:`, referenceResult.imageUrl);

        // 🔧 COMPLEX REFERENCE HANDLING: Intelligently assign reference based on what's missing
        const workflowType = intentAnalysis.parameters.workflow_type;

        // 🎯 CRITICAL FIX: Check ALL possible image keys (including uploaded numbered versions)
        const allCurrentImageKeys = Object.keys(imageUrls);
        const hasProductSlot =
          !!imageUrls.product_image ||
          allCurrentImageKeys.some((key) => key.includes("product_image"));
        const hasDesignSlot =
          !!imageUrls.design_image ||
          allCurrentImageKeys.some((key) => key.includes("design_image"));
        const hasColorSlot =
          !!imageUrls.color_image ||
          allCurrentImageKeys.some((key) => key.includes("color_image"));

        // 🔧 CRITICAL FIX: Also check for color presets in slot availability
        const hasColorPresetForLogging = !!formData.get("preset_color_palette");
        const hasColorInputForLogging =
          hasColorSlot || hasColorPresetForLogging;

        console.log(
          `🔍 Slot availability: product=${hasProductSlot}, design=${hasDesignSlot}, color=${hasColorInputForLogging} (uploaded=${hasColorSlot}, preset=${hasColorPresetForLogging}), workflow=${workflowType}`,
        );
        console.log(
          `🔍 Current image keys detected: [${allCurrentImageKeys.join(", ")}]`,
        );

        // 🎯 CRITICAL: Check if user selected a different product preset than the reference
        const currentProductPreset = formData.get(
          "preset_product_type",
        ) as string;
        const inheritedProductPreset =
          explicitReference?.inheritedPresets?.preset_product_type;
        const isDifferentProductPreset =
          currentProductPreset &&
          inheritedProductPreset &&
          currentProductPreset !== inheritedProductPreset &&
          !currentProductPreset.includes("undefined") &&
          !currentProductPreset.includes("null");

        console.log(
          `🔍 Product preset conflict check: current="${currentProductPreset}", inherited="${inheritedProductPreset}", isDifferent=${isDifferentProductPreset}`,
        );

        if (isDifferentProductPreset) {
          console.log(
            `🎯 USER CHOICE PRIORITY: User selected different product preset "${currentProductPreset}" - using preset instead of reference image`,
          );
          // Don't add reference as product_image - let the new preset be used instead
          intentAnalysis.parameters.use_new_product_preset = true;
          intentAnalysis.parameters.reference_for_inspiration_only = true;

          // Add reference only for design/color slots, never as product
          const sourceType = explicitReference
            ? "explicit reference"
            : "previous result";
          if (workflowType === "full_composition" && !hasDesignSlot) {
            imageUrls.design_image = referenceResult.imageUrl;
            console.log(
              `✅ Added ${sourceType} as design_image for inspiration (user chose different product)`,
            );
          } else if (workflowType === "full_composition" && !hasColorSlot) {
            imageUrls.color_image = referenceResult.imageUrl;
            console.log(
              `✅ Added ${sourceType} as color_image for inspiration (user chose different product)`,
            );
          } else if (workflowType === "product_design" && !hasDesignSlot) {
            imageUrls.design_image = referenceResult.imageUrl;
            console.log(
              `✅ Added ${sourceType} as design_image for inspiration (user chose different product)`,
            );
          } else if (workflowType === "product_color" && !hasColorSlot) {
            imageUrls.color_image = referenceResult.imageUrl;
            console.log(
              `✅ Added ${sourceType} as color_image for inspiration (user chose different product)`,
            );
          } else if (workflowType === "preset_design") {
            // 🎯 CRITICAL FIX: preset_design workflow with product conflict - use reference for missing design/color
            if (!hasDesignSlot && !hasColorSlot) {
              // If both missing, prioritize design
              imageUrls.design_image = referenceResult.imageUrl;
              console.log(
                `✅ Added ${sourceType} as design_image for preset_design (user chose different product, missing both)`,
              );
            } else if (!hasDesignSlot) {
              imageUrls.design_image = referenceResult.imageUrl;
              console.log(
                `✅ Added ${sourceType} as design_image for preset_design (user chose different product, missing design)`,
              );
            } else if (!hasColorSlot) {
              imageUrls.color_image = referenceResult.imageUrl;
              console.log(
                `✅ Added ${sourceType} as color_image for preset_design (user chose different product, missing color)`,
              );
            } else {
              console.log(
                `ℹ️ User chose different product - keeping reference for context only (preset_design has all slots)`,
              );
            }
          } else {
            console.log(
              `ℹ️ User chose different product - keeping reference for context only (no slot assignment)`,
            );
          }
        } else {
          console.log(
            `🔍 No product preset conflict - proceeding with normal slot assignment`,
          );

          // 🔧 CRITICAL FIX: Detect fresh generation scenarios to prevent unwanted auto-referencing
          // Check for color presets as well as uploaded color images
          const hasColorPreset = !!formData.get("preset_color_palette");
          const hasColorInput = hasColorSlot || hasColorPreset;

          // 🔧 CRITICAL: Primary fresh generation detection based on workflow patterns (regardless of message content)
          const isPrimaryFreshPattern =
            (workflowType === "product_color" &&
              hasProductSlot &&
              hasColorInput &&
              !hasDesignSlot) ||
            (workflowType === "preset_design" &&
              hasProductSlot &&
              hasColorInput &&
              !hasDesignSlot);

          // 🔧 SECONDARY: Message-based fresh generation indicators
          const hasMessageIndicators =
            effectiveMessage?.toLowerCase().includes("fresh") ||
            effectiveMessage?.toLowerCase().includes("new") ||
            effectiveMessage?.toLowerCase().includes("clean") ||
            effectiveMessage?.toLowerCase().includes("start over");

          // 🔧 TERTIARY: General pattern with message context
          const isGeneralFreshPattern =
            hasProductSlot &&
            hasColorInput &&
            !hasDesignSlot &&
            !effectiveMessage?.toLowerCase().includes("reference") &&
            !effectiveMessage?.toLowerCase().includes("continue");

          const isFreshGenerationScenario =
            isPrimaryFreshPattern ||
            hasMessageIndicators ||
            isGeneralFreshPattern;

          console.log(`🔍 FRESH GENERATION DEBUG:`);
          console.log(
            `   - Primary pattern (${workflowType} + product + color - design): ${isPrimaryFreshPattern}`,
          );
          console.log(`   - Message indicators: ${hasMessageIndicators}`);
          console.log(`   - General pattern: ${isGeneralFreshPattern}`);
          console.log(`   - Final decision: ${isFreshGenerationScenario}`);

          if (isFreshGenerationScenario) {
            console.log(
              `🆕 FRESH GENERATION DETECTED: User wants clean generation with just their inputs - skipping auto-reference`,
            );
            console.log(`   - Workflow: ${workflowType}`);
            console.log(
              `   - Slots: product=${hasProductSlot}, design=${hasDesignSlot}, color=${hasColorInput} (uploaded=${hasColorSlot}, preset=${hasColorPreset})`,
            );
            console.log(
              `   - Message indicators: ${effectiveMessage?.substring(0, 100)}`,
            );
            // Don't add reference to design slot - user wants fresh generation
          } else {
            // 🔧 CRITICAL RESTRICTION: Auto-referencing should ONLY be used for product slot when no product is provided
            // Do NOT auto-reference to design or color slots - those should be explicit user choices

            // Check if user has provided any product input (uploaded image or preset)
            const hasProductPreset = !!formData.get("preset_product_type");
            const hasAnyProductInput = hasProductSlot || hasProductPreset;

            if (!hasAnyProductInput) {
              // Only auto-reference to product when no product input is provided
              imageUrls.product_image = referenceResult.imageUrl;
              console.log(
                `✅ AUTO-REFERENCE: Added ${sourceType} as product_image (no product input provided)`,
              );
            } else {
              // User provided product input - don't auto-reference anything
              console.log(
                `ℹ️ AUTO-REFERENCE SKIPPED: User provided product input (uploaded=${hasProductSlot}, preset=${hasProductPreset}) - no auto-referencing needed`,
              );
            }
          } // End of else block for fresh generation check
        }

        // 🎯 CRITICAL: Only add reference_image_url parameter for manual references, not auto-references
        // Auto-references should not set reference_image_url as that would interfere with fresh generations

        // 🔧 ENHANCED MANUAL REFERENCE DETECTION: Handle all manual reference scenarios
        const isManualReference =
          explicitReference?.imageUrl ||
          (referenceResult?.imageUrl &&
            // Original: Full composition with all 3 slots
            ((intentAnalysis.parameters.workflow_type === "full_composition" &&
              hasProductSlot &&
              hasDesignSlot &&
              hasColorSlot) ||
              // NEW: Product + design combinations (the failing case!)
              (intentAnalysis.parameters.workflow_type === "product_design" &&
                hasProductSlot &&
                hasDesignSlot) ||
              // NEW: Product + color combinations
              (intentAnalysis.parameters.workflow_type === "product_color" &&
                hasProductSlot &&
                hasColorSlot) ||
              // NEW: Design + color combinations
              (intentAnalysis.parameters.workflow_type === "full_composition" &&
                hasDesignSlot &&
                hasColorSlot)));

        console.log(`🔍 MANUAL REFERENCE DETECTION:`);
        console.log(
          `   - Has explicit reference: ${!!explicitReference?.imageUrl}`,
        );
        console.log(
          `   - Has reference result: ${!!referenceResult?.imageUrl}`,
        );
        console.log(
          `   - Workflow type: ${intentAnalysis.parameters.workflow_type}`,
        );
        console.log(
          `   - Slots: product=${hasProductSlot}, design=${hasDesignSlot}, color=${hasColorSlot}`,
        );
        console.log(`   - Final decision: ${isManualReference}`);

        if (
          !intentAnalysis.parameters.reference_image_url &&
          isManualReference
        ) {
          intentAnalysis.parameters.reference_image_url =
            referenceResult.imageUrl;
          console.log(
            `✅ Added reference_image_url parameter for manual reference scenario`,
          );
        } else if (!isManualReference) {
          console.log(
            `ℹ️ Skipping reference_image_url parameter - this is an auto-reference or fresh generation`,
          );
        }

        // 🎯 CRITICAL FIX: Override Claude's workflow choice for complex reference scenarios
        // Claude doesn't always understand the complexity when references are involved

        // 🔧 FIX: Check ALL possible image keys (including numbered versions)
        const allImageKeys = Object.keys(imageUrls);
        const hasUploadedProduct = allImageKeys.some(
          (key) => key.includes("product_image") || key === "product_image",
        );
        const hasUploadedDesign = allImageKeys.some(
          (key) => key.includes("design_image") || key === "design_image",
        );
        const hasUploadedColor = allImageKeys.some(
          (key) => key.includes("color_image") || key === "color_image",
        );

        // 🔧 NEW: Detect reference role - which slot did the reference fill?
        const referenceUrlToCheck = referenceResult.imageUrl;
        const hasReferenceAsProduct = Object.values(imageUrls).some(
          (url) =>
            url === referenceUrlToCheck &&
            Object.keys(imageUrls).find(
              (key) =>
                imageUrls[key] === url &&
                (key.includes("product_image") || key === "product_image"),
            ),
        );
        const hasReferenceAsDesign = Object.values(imageUrls).some(
          (url) =>
            url === referenceUrlToCheck &&
            Object.keys(imageUrls).find(
              (key) =>
                imageUrls[key] === url &&
                (key.includes("design_image") || key === "design_image"),
            ),
        );
        const hasReferenceAsColor = Object.values(imageUrls).some(
          (url) =>
            url === referenceUrlToCheck &&
            Object.keys(imageUrls).find(
              (key) =>
                imageUrls[key] === url &&
                (key.includes("color_image") || key === "color_image"),
            ),
        );

        const originalWorkflow = intentAnalysis.parameters.workflow_type;

        console.log(
          `🔍 Reference role detection: product=${hasReferenceAsProduct}, design=${hasReferenceAsDesign}, color=${hasReferenceAsColor}`,
        );
        console.log(
          `🔍 Uploaded content detection: product=${hasUploadedProduct}, design=${hasUploadedDesign}, color=${hasUploadedColor}`,
        );

        // 🔧 COMPREHENSIVE WORKFLOW OVERRIDE: Handle all reference role scenarios
        if (hasReferenceAsProduct && hasUploadedDesign && hasUploadedColor) {
          // Scenario 1: Product reference + design + color
          intentAnalysis.parameters.workflow_type = "full_composition";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to full_composition (product ref + design + color)`,
          );
        } else if (hasReferenceAsProduct && hasUploadedDesign) {
          // Scenario 3: Product reference + design
          intentAnalysis.parameters.workflow_type = "product_design";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to product_design (product ref + design)`,
          );
        } else if (hasReferenceAsProduct && hasUploadedColor) {
          // Scenario 2: Product reference + color
          intentAnalysis.parameters.workflow_type = "product_color";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to product_color (product ref + color)`,
          );
        } else if (hasReferenceAsProduct) {
          // Product reference only
          intentAnalysis.parameters.workflow_type = "product_prompt";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to product_prompt (product ref only)`,
          );
        } else if (
          hasReferenceAsDesign &&
          hasUploadedProduct &&
          hasUploadedColor
        ) {
          // Scenario 4: Product + design reference + color
          intentAnalysis.parameters.workflow_type = "full_composition";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to full_composition (product + design ref + color)`,
          );
        } else if (hasReferenceAsDesign && hasUploadedProduct) {
          // Scenario 5: Product + design reference
          intentAnalysis.parameters.workflow_type = "product_design";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to product_design (product + design ref)`,
          );
        } else if (
          hasReferenceAsColor &&
          hasUploadedProduct &&
          hasUploadedDesign
        ) {
          // Scenario 6: Product + design + color reference
          intentAnalysis.parameters.workflow_type = "full_composition";
          console.log(
            `🔧 OVERRIDE: Changed workflow from ${originalWorkflow} to full_composition (product + design + color ref)`,
          );
        }
        const finalHasProduct =
          !!imageUrls.product_image ||
          allImageKeys.some(
            (key) => key.includes("product_image") || key === "product_image",
          );
        const finalHasDesign = allImageKeys.some(
          (key) => key.includes("design_image") || key === "design_image",
        );
        const finalHasColor = allImageKeys.some(
          (key) => key.includes("color_image") || key === "color_image",
        );
        console.log(
          `🎯 FINAL WORKFLOW: ${intentAnalysis.parameters.workflow_type} with slots: product=${finalHasProduct}, design=${finalHasDesign}, color=${finalHasColor}`,
        );

        // 🔧 CRITICAL FIX: Additional workflow override for reference-as-design scenarios
        // When reference is used as design (not product), we need to update workflow type
        if (finalHasProduct && finalHasDesign && finalHasColor) {
          if (intentAnalysis.parameters.workflow_type !== "full_composition") {
            const oldWorkflow = intentAnalysis.parameters.workflow_type;
            intentAnalysis.parameters.workflow_type = "full_composition";
            console.log(
              `🔧 REFERENCE-AS-DESIGN OVERRIDE: Changed workflow from ${oldWorkflow} to full_composition (has all 3: product + design + color)`,
            );
          }
        } else if (finalHasProduct && finalHasDesign && !finalHasColor) {
          if (intentAnalysis.parameters.workflow_type !== "product_design") {
            const oldWorkflow = intentAnalysis.parameters.workflow_type;
            intentAnalysis.parameters.workflow_type = "product_design";
            console.log(
              `🔧 REFERENCE-AS-DESIGN OVERRIDE: Changed workflow from ${oldWorkflow} to product_design (has product + design)`,
            );
          }
        }
      }
      // 🔧 ORIGINAL: Handle scenarios with ONLY references (no new uploads)
      else if (
        referenceResult?.imageUrl &&
        Object.keys(imageUrls).length === 0
      ) {
        const sourceType = explicitReference
          ? "explicit reference"
          : "previous result";
        console.log(
          `🔄 No new images uploaded - using ${sourceType} image for operation`,
        );

        // For multi-step operations, always add as product_image
        if (intentAnalysis.intent === "multi_step") {
          imageUrls.product_image = referenceResult.imageUrl;
          console.log(
            `✅ Added ${sourceType} image as product_image for multi-step:`,
            referenceResult.imageUrl,
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
            referenceResult.imageUrl,
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
                claudeSelectedImage,
              );
            } else {
              // 🎯 SMART FALLBACK: Use correct image slot based on workflow type (same logic as other branch)
              const workflowType = intentAnalysis.parameters.workflow_type;

              if (workflowType === "design_prompt") {
                imageUrls.design_image = referenceResult.imageUrl;
                console.log(
                  `🔄 Claude's choice not in chain, using reference result as design_image for design_prompt:`,
                  referenceResult.imageUrl,
                );
              } else if (workflowType === "color_prompt") {
                imageUrls.color_image = referenceResult.imageUrl;
                console.log(
                  `🔄 Claude's choice not in chain, using reference result as color_image for color_prompt:`,
                  referenceResult.imageUrl,
                );
              } else if (
                workflowType === "product_prompt" ||
                workflowType === "product_design" ||
                workflowType === "product_color" ||
                workflowType === "full_composition"
              ) {
                imageUrls.product_image = referenceResult.imageUrl;
                console.log(
                  `🔄 Claude's choice not in chain, using reference result as product_image for ${workflowType}:`,
                  referenceResult.imageUrl,
                );
              } else {
                // Default fallback: use as product_image for modification (original behavior)
                imageUrls.product_image = referenceResult.imageUrl;
                console.log(
                  `🔄 Claude's choice not in chain, using reference result as product_image (default):`,
                  referenceResult.imageUrl,
                );
              }
            }
          } else {
            // 🧬 PRESET INHERITANCE: Only use inherited presets if Claude didn't specify an image
            const hasInheritedPresets =
              explicitReference?.inheritedPresets &&
              Object.keys(explicitReference.inheritedPresets).length > 0;

            // 🎯 DIFFERENT PRODUCT PRESET DETECTION: Check if user selected a different product type
            const currentProductPreset = formData.get(
              "preset_product_type",
            ) as string;
            const previousProductPreset =
              explicitReference?.inheritedPresets?.preset_product_type;
            const isDifferentProductPreset =
              currentProductPreset &&
              currentProductPreset !== previousProductPreset &&
              !currentProductPreset.includes("undefined") &&
              !currentProductPreset.includes("null");

            // 🎯 FRESH REQUEST DETECTION: Check if Claude said this is a fresh design request
            const claudeExplanation =
              intentAnalysis.explanation?.toLowerCase() || "";
            const isExplicitlyFreshRequest =
              claudeExplanation.includes("not referencing previous results") ||
              claudeExplanation.includes("new design request") ||
              claudeExplanation.includes("fresh design request") ||
              intentAnalysis.parameters.workflow_type === "prompt_only";

            // 🔄 MODIFICATION DETECTION: Check if user uploaded new images for modification
            const workflowType = intentAnalysis.parameters.workflow_type;
            const isModificationWorkflow =
              workflowType === "product_color" ||
              workflowType === "product_design" ||
              workflowType === "product_prompt" ||
              workflowType === "full_composition";
            const hasNewUploads = hasActualImages; // User uploaded new images in this request

            if (isDifferentProductPreset) {
              console.log(
                `🎯 DIFFERENT PRODUCT PRESET DETECTED: User selected "${currentProductPreset}" (different from previous "${previousProductPreset}") - prioritizing new preset over previous result`,
              );
              // User explicitly selected a different product type - don't use previous result image
              // Let the system create fresh with the new product preset
              intentAnalysis.parameters.has_inherited_presets = false;
              intentAnalysis.parameters.use_new_product_preset = true;
              console.log(
                `🚫 SKIPPING reference image completely - user wants to use different product preset instead`,
              );
              // Don't add reference image to any slot - completely ignore previous result
            } else if (isModificationWorkflow && referenceResult?.imageUrl) {
              console.log(
                `🔄 MODIFICATION DETECTED: ${workflowType} workflow with reference image - using reference as base product`,
              );
              // For modification workflows, ALWAYS use reference image as the base, regardless of inherited presets
              imageUrls.product_image = referenceResult.imageUrl;
              console.log(
                `✅ Added ${sourceType} image as product_image for ${workflowType} modification:`,
                referenceResult.imageUrl,
              );
              // IMPORTANT: Skip inherited presets when we have a modification workflow
              console.log(
                `🚫 SKIPPING inherited presets for modification workflow - using actual reference image instead`,
              );
            } else if (hasInheritedPresets && !isModificationWorkflow) {
              console.log(
                `🧬 Fresh design creation with inherited presets (not modification workflow)`,
              );
              // Add a flag to indicate we have inherited presets
              intentAnalysis.parameters.has_inherited_presets = true;
              // Don't add the reference image - let the system create fresh with inherited presets
            } else if (isExplicitlyFreshRequest) {
              console.log(
                `🆕 Claude detected fresh design request - NOT adding previous result as input:`,
                claudeExplanation,
              );
              // Don't add the previous result - this is a fresh request
            } else {
              // 🎯 SMART IMAGE SLOT ASSIGNMENT: Choose correct image slot based on workflow type
              const workflowType = intentAnalysis.parameters.workflow_type;

              if (workflowType === "design_prompt") {
                // design_prompt requires: hasDesign=true, hasPrompt=true, hasProduct=false, hasColor=false
                imageUrls.design_image = referenceResult.imageUrl;
                console.log(
                  `✅ Added ${sourceType} image as design_image for design_prompt workflow:`,
                  referenceResult.imageUrl,
                );
              } else if (workflowType === "color_prompt") {
                // color_prompt requires: hasColor=true, hasPrompt=true, hasProduct=false, hasDesign=false
                imageUrls.color_image = referenceResult.imageUrl;
                console.log(
                  `✅ Added ${sourceType} image as color_image for color_prompt workflow:`,
                  referenceResult.imageUrl,
                );
              } else if (
                workflowType === "product_prompt" ||
                workflowType === "product_design" ||
                workflowType === "product_color" ||
                workflowType === "full_composition"
              ) {
                // These workflows expect the previous result to be the product to modify
                imageUrls.product_image = referenceResult.imageUrl;
                console.log(
                  `✅ Added ${sourceType} image as product_image for ${workflowType} workflow:`,
                  referenceResult.imageUrl,
                );
              } else {
                // Default fallback: use as product_image for modification (original behavior)
                imageUrls.product_image = referenceResult.imageUrl;
                console.log(
                  `✅ Added ${sourceType} image as product_image for design modification (default):`,
                  referenceResult.imageUrl,
                );
              }
            }
          }

          // 🎯 CRITICAL FIX: Override Claude's workflow choice for ALL reference scenarios
          // This happens after imageUrls assignment so we know what slots are filled
          const hasReferenceAsProduct = !!imageUrls.product_image;

          // 🔧 FIX: Check ALL possible design/color image keys (including numbered versions)
          const allImageKeys = Object.keys(imageUrls);
          const hasActualDesign = allImageKeys.some(
            (key) => key.includes("design_image") || key === "design_image",
          );
          const hasActualColor = allImageKeys.some(
            (key) => key.includes("color_image") || key === "color_image",
          );

          // 🔧 CRITICAL: Check if user has actual presets selected (not just inherited)
          const hasCurrentPresets =
            formData.get("preset_design_style") ||
            formData.get("preset_color_palette") ||
            formData.get("preset_product_type");

          const originalWorkflow = intentAnalysis.parameters.workflow_type;

          // 🔧 CRITICAL: Don't override if user has explicit presets - keep original workflow
          if (hasCurrentPresets) {
            console.log(
              `🎯 PRESET PRIORITY: User has explicit presets - keeping original workflow ${originalWorkflow} (no reference override)`,
            );
          } else if (
            hasReferenceAsProduct &&
            hasActualDesign &&
            hasActualColor
          ) {
            intentAnalysis.parameters.workflow_type = "full_composition";
            console.log(
              `🔧 REFERENCE OVERRIDE: Changed workflow from ${originalWorkflow} to full_composition (reference + design + color)`,
            );
          } else if (hasReferenceAsProduct && hasActualDesign) {
            intentAnalysis.parameters.workflow_type = "product_design";
            console.log(
              `🔧 REFERENCE OVERRIDE: Changed workflow from ${originalWorkflow} to product_design (reference + design)`,
            );
          } else if (hasReferenceAsProduct && hasActualColor) {
            intentAnalysis.parameters.workflow_type = "product_color";
            console.log(
              `🔧 REFERENCE OVERRIDE: Changed workflow from ${originalWorkflow} to product_color (reference + color)`,
            );
          } else if (
            hasReferenceAsProduct &&
            !hasActualDesign &&
            !hasActualColor
          ) {
            intentAnalysis.parameters.workflow_type = "product_prompt";
            console.log(
              `🔧 REFERENCE OVERRIDE: Changed workflow from ${originalWorkflow} to product_prompt (reference only)`,
            );
          }
          const finalRefHasProduct = !!imageUrls.product_image;
          const finalRefHasDesign = allImageKeys.some(
            (key) => key.includes("design_image") || key === "design_image",
          );
          const finalRefHasColor = allImageKeys.some(
            (key) => key.includes("color_image") || key === "color_image",
          );
          console.log(
            `🎯 FINAL REFERENCE WORKFLOW: ${intentAnalysis.parameters.workflow_type} with slots: product=${finalRefHasProduct}, design=${finalRefHasDesign}, color=${finalRefHasColor}, hasPresets=${!!hasCurrentPresets}`,
          );
        }

        // Also add to intent parameters if not already set and NOT a fresh request
        if (!intentAnalysis.parameters.reference_image_url) {
          // 🎯 REUSE: Use the same fresh request detection from above
          const claudeExplanation =
            intentAnalysis.explanation?.toLowerCase() || "";
          const isExplicitlyFreshRequest =
            claudeExplanation.includes("not referencing previous results") ||
            claudeExplanation.includes("new design request") ||
            claudeExplanation.includes("fresh design request") ||
            intentAnalysis.parameters.workflow_type === "prompt_only";

          // 🎯 CRITICAL FIX: Also check if user selected a different product preset
          const useNewProductPreset =
            intentAnalysis.parameters.use_new_product_preset;

          if (!isExplicitlyFreshRequest && !useNewProductPreset) {
            // Only add reference if Claude didn't explicitly say it's a fresh request AND user didn't select different product preset
            intentAnalysis.parameters.reference_image_url =
              referenceResult.imageUrl;
            console.log(
              `✅ Added reference_image_url to intent parameters:`,
              referenceResult.imageUrl,
            );
          } else if (useNewProductPreset) {
            console.log(
              `🎯 Skipping reference_image_url - user selected different product preset`,
            );
          } else {
            console.log(
              `🆕 Skipping reference_image_url - Claude detected fresh design request:`,
              claudeExplanation,
            );
          }
        }
      }
    } // Close the else if (Object.keys(imageUrls).length > 0) block

    // 🎯 INTELLIGENT: Handle Claude-detected multi-step operations
    if (
      intentAnalysis.intent === "multi_step" &&
      intentAnalysis.parameters?.steps
    ) {
      const steps = intentAnalysis.parameters.steps;
      console.log(
        `🧠 Executing Claude-detected multi-step operation: ${steps.length} steps`,
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
            `  - currentResult?.firebaseOutputUrl: ${currentResult?.firebaseOutputUrl}`,
          );
          console.log(
            `  - currentResult?.data_url: ${currentResult?.data_url}`,
          );
          console.log(
            `  - currentResult?.outputUrl: ${currentResult?.outputUrl}`,
          );
          console.log(
            `  - currentResult?.output_image: ${currentResult?.output_image}`,
          );
          console.log(
            `  - currentResult?.imageUrl: ${currentResult?.imageUrl}`,
          );
          console.log(
            `  - currentResult?.result?.imageUrl: ${currentResult?.result?.imageUrl}`,
          );
          console.log(`  - previousOutputUrl: ${previousOutputUrl}`);

          if (
            currentResult?.status === "success" &&
            previousOutputUrl &&
            typeof previousOutputUrl === "string"
          ) {
            // 🎯 SMART CHAINING: Use correct image slot based on current step workflow type
            const stepWorkflowType = step.parameters?.workflow_type;

            if (stepWorkflowType === "design_prompt") {
              stepImageUrls.design_image = previousOutputUrl;
              console.log(
                `🔗 Using previous step output as design_image for design_prompt: ${previousOutputUrl}`,
              );
            } else if (stepWorkflowType === "color_prompt") {
              stepImageUrls.color_image = previousOutputUrl;
              console.log(
                `🔗 Using previous step output as color_image for color_prompt: ${previousOutputUrl}`,
              );
            } else {
              // Default: use as product_image (for product_prompt, product_design, etc.)
              stepImageUrls.product_image = previousOutputUrl;
              console.log(
                `🔗 Using previous step output as product_image: ${previousOutputUrl}`,
              );
            }
          } else {
            console.log(
              `❌ Cannot chain to step ${i + 1}: Previous step failed or has no valid output`,
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
            request,
          );

          currentResult = stepResult;
          allResults.push({ stepIndex: i + 1, ...stepResult });
          // Helper to sanitize step results for logging
          const sanitizeStepResult = (obj: any): any => {
            if (!obj) return obj;
            const sanitized = { ...obj };
            Object.keys(sanitized).forEach((key) => {
              const value = sanitized[key];
              if (typeof value === "string") {
                if (
                  value.startsWith("data:image/") ||
                  value.match(/^[A-Za-z0-9+/]+=*$/)
                ) {
                  sanitized[key] =
                    `[BASE64_IMAGE_DATA_${Math.floor(value.length / 1024)}KB]`;
                } else if (value.length > 1000) {
                  sanitized[key] =
                    `[LARGE_STRING_${Math.floor(value.length / 1024)}KB]`;
                }
              }
            });
            return sanitized;
          };

          console.log(`✅ Step ${i + 1} completed:`, stepResult.status);
          console.log(
            `🔍 Step ${i + 1} result structure:`,
            JSON.stringify(sanitizeStepResult(stepResult), null, 2),
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
                  `🔄 Converting step ${i + 1} base64 output to Firebase Storage...`,
                );
                try {
                  const processedFile = await processBase64Image(
                    outputUrl,
                    `step_${i + 1}_output.png`,
                  );
                  const firebaseUrl = await uploadImageToFirebaseStorage(
                    processedFile,
                    userid,
                    true,
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
                    firebaseUrl,
                  );
                } catch (error) {
                  console.error(
                    `❌ Failed to save step ${i + 1} output:`,
                    error,
                  );
                }
              } else if (
                outputUrl.startsWith("http") &&
                !outputUrl.includes("firebasestorage.googleapis.com")
              ) {
                console.log(
                  `🔄 Downloading step ${i + 1} external output to Firebase Storage...`,
                );
                try {
                  const firebaseUrl = await saveOutputImageToFirebase(
                    outputUrl,
                    userid,
                    `step_${i + 1}`,
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
                    firebaseUrl,
                  );
                } catch (error) {
                  console.error(
                    `❌ Failed to save step ${i + 1} external output:`,
                    error,
                  );
                  // Don't fail the step - external URL can still be used for chaining
                  console.log(
                    `⚠️ Continuing with external URL for chaining: ${outputUrl}`,
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
        (r) => r.status === "success",
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
        console.log("🚀 About to call routeToAPI with:");
        console.log("  - Endpoint:", intentAnalysis.endpoint);
        console.log("  - Parameters:", intentAnalysis.parameters);
        console.log("  - ImageUrls:", imageUrls);

        apiResult = await routeToAPI(
          intentAnalysis.endpoint,
          intentAnalysis.parameters,
          formData,
          userid,
          effectiveMessage,
          imageUrls,
          request,
        );

        // Helper function to sanitize objects for logging (removes base64 data)
        const sanitizeForLogging = (obj: any): any => {
          if (!obj) return obj;
          const sanitized = { ...obj };

          // Remove or truncate common base64 fields
          Object.keys(sanitized).forEach((key) => {
            const value = sanitized[key];
            if (typeof value === "string") {
              if (
                value.startsWith("data:image/") ||
                value.match(/^[A-Za-z0-9+/]+=*$/)
              ) {
                sanitized[key] =
                  `[BASE64_IMAGE_DATA_${Math.floor(value.length / 1024)}KB]`;
              } else if (value.length > 1000) {
                sanitized[key] =
                  `[LARGE_STRING_${Math.floor(value.length / 1024)}KB]`;
              }
            }
          });

          return sanitized;
        };

        console.log("🔍 routeToAPI returned:");
        console.log("  - Status:", apiResult?.status);
        console.log("  - Keys:", apiResult ? Object.keys(apiResult) : "none");
        console.log(
          "  - Clean result:",
          JSON.stringify(sanitizeForLogging(apiResult), null, 2),
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
                "🔄 Converting base64 output URL to Firebase Storage URL...",
              );
              try {
                const processedFile = await processBase64Image(
                  outputUrl,
                  "design_output.png",
                );
                const firebaseUrl = await uploadImageToFirebaseStorage(
                  processedFile,
                  userid,
                  true,
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
                  firebaseUrl,
                );
              } catch (error) {
                console.error("❌ Failed to convert base64 URL:", error);
                // Keep original base64 URL as fallback
              }
            } else if (outputUrl.startsWith("http")) {
              // Save external URL to Firebase Storage
              console.log(
                "💾 Saving external output image to Firebase Storage...",
              );
              try {
                const firebaseUrl = await saveOutputImageToFirebase(
                  outputUrl,
                  userid,
                  intentAnalysis.endpoint,
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
                  firebaseUrl,
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

    // 🔍 DEBUG: Log the actual API result to see what's happening
    console.log(`🔍 API Result Debug:`);
    console.log(`  - Intent: ${intentAnalysis.intent}`);
    console.log(`  - Is image operation: ${isImageOperation}`);
    console.log(`  - API result exists: ${!!apiResult}`);
    console.log(`  - API result status: ${apiResult?.status || "undefined"}`);
    console.log(
      `  - API result keys: ${apiResult ? Object.keys(apiResult) : "none"}`,
    );

    if (isImageOperation && apiResult && apiResult.status === "success") {
      // 🔍 Check if this is part of a multi-step operation
      if (intentAnalysis.isMultiStep && intentAnalysis.multiStepPlan) {
        console.log(
          `🔄 Multi-step operation detected - continuing with remaining steps instead of returning early`,
        );
        // Don't return early - let the multi-step logic handle it
      } else {
        console.log(
          `🔍 ${intentAnalysis.intent} detected - using Claude to generate proactive response with recommendations`,
        );

        // 🔧 NEW: Call titlerenamer with Complete Final Prompt after successful generation
        if (apiResult.generated_prompt) {
          callTitleRenamerWithPrompt(
            userid,
            apiResult.generated_prompt,
            chatId,
          ).catch((error) => {
            console.error("❌ Title renamer failed (non-blocking):", error);
          });
        }

        // Always use Claude for ALL successful image operations to provide proactive recommendations
        const proactiveResponse = await generateResponse(
          effectiveMessage,
          intentAnalysis,
          apiResult,
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
    }

    // 🔧 NEW: Call titlerenamer with Complete Final Prompt after successful generation
    if (apiResult?.status === "success" && apiResult.generated_prompt) {
      callTitleRenamerWithPrompt(
        userid,
        apiResult.generated_prompt,
        chatId,
      ).catch((error) => {
        console.error("❌ Title renamer failed (non-blocking):", error);
      });
    }

    responseMessage = await generateResponse(
      effectiveMessage,
      intentAnalysis,
      apiResult,
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

// 🔧 NEW: Function to call titlerenamer API with Complete Final Prompt (ONCE per chat)
async function callTitleRenamerWithPrompt(
  userid: string,
  generatedPrompt: string,
  chatId?: string,
): Promise<void> {
  try {
    if (!generatedPrompt || generatedPrompt.length < 100) {
      console.log("⏸️ Skipping title rename - prompt too short or missing");
      return;
    }

    if (!chatId) {
      console.log("⏸️ Skipping title rename - no chat ID provided");
      return;
    }

    // 🔧 Check if chat already has a meaningful title
    const { getFirestore } = await import("firebase-admin/firestore");
    const firestore = getFirestore();

    try {
      const sidebarDocRef = firestore.doc(`users/${userid}/sidebar/${chatId}`);
      const sidebarDoc = await sidebarDocRef.get();

      if (sidebarDoc.exists) {
        const data = sidebarDoc.data();
        const currentTitle = data?.chatSummary || "";

        // Check if title is still generic or matches user input
        const genericTitles = [
          "untitled",
          "untitled chat",
          "new chat",
          "chat session",
          "conversation",
          "new conversation",
          "chat",
          "session",
          "",
          " ",
          "create a design composition using the uploaded images",
        ];

        const isGenericTitle =
          genericTitles.some(
            (generic) =>
              currentTitle.toLowerCase().trim() ===
              generic.toLowerCase().trim(),
          ) || currentTitle.length < 5;

        // 🔧 NEW: Check if title is just the user's original message (also considered generic)
        // Extract user message from the generated prompt to compare
        const userMessageFromPrompt = generatedPrompt
          .match(/USER PROMPT:\s*(.+?)(?:\n|$)/)?.[1]
          ?.trim();
        const isTitleSameAsUserMessage =
          userMessageFromPrompt &&
          currentTitle.toLowerCase().trim() ===
            userMessageFromPrompt.toLowerCase().trim();

        // 🔧 NEW: Check if title was already renamed (has the titleRenamed flag)
        const wasAlreadyRenamed = data?.titleRenamed === true;

        if (!isGenericTitle && !isTitleSameAsUserMessage) {
          console.log("✅ Chat already has meaningful title:", currentTitle);
          console.log("⏸️ Skipping title rename - title already set");
          return;
        }

        if (wasAlreadyRenamed && !isGenericTitle && !isTitleSameAsUserMessage) {
          console.log(
            "✅ Chat title already renamed previously:",
            currentTitle,
          );
          console.log("⏸️ Skipping title rename - already processed once");
          return;
        }

        if (isTitleSameAsUserMessage) {
          console.log(
            "🔍 Current title matches user input (generic):",
            currentTitle,
          );
        } else {
          console.log("🔍 Current title is generic:", currentTitle);
        }
      } else {
        console.log(
          "🔍 No sidebar document found - will proceed with title generation",
        );
      }
    } catch (firestoreError) {
      console.warn(
        "⚠️ Firestore check failed, proceeding with title generation:",
        firestoreError,
      );
    }

    console.log("🎯 Calling titlerenamer with Complete Final Prompt...");
    console.log("  - User ID:", userid.slice(0, 8) + "...");
    console.log("  - Chat ID:", chatId?.slice(0, 8) + "...");
    console.log("  - Prompt length:", generatedPrompt.length);

    const formData = new FormData();
    formData.append("userid", userid);
    formData.append("prompt", generatedPrompt);

    const baseUrl = getBaseUrl();
    console.log("🔗 Making request to:", `${baseUrl}/api/titlerenamer`);

    const response = await fetch(`${baseUrl}/api/titlerenamer`, {
      method: "POST",
      body: formData,
    });

    console.log("📡 Title renamer response status:", response.status);

    if (response.ok) {
      const result = await response.json();
      console.log("📥 Title renamer response:", result);

      if (result.status === "success") {
        console.log("✅ Title generated successfully:", result.title);
        console.log("  - Category:", result.category);

        // Update the sidebar document with the new title
        try {
          const sidebarDocRef = firestore.doc(
            `users/${userid}/sidebar/${chatId}`,
          );
          await sidebarDocRef.set(
            {
              chatSummary: result.title,
              category: result.category,
              titleRenamed: true,
              renamedAt: new Date(),
              updatedAt: new Date(),
            },
            { merge: true },
          );

          console.log("✅ Sidebar updated with new title:", result.title);
        } catch (updateError) {
          console.error("❌ Failed to update sidebar:", updateError);
          throw updateError; // Re-throw to see in logs
        }
      } else {
        console.error("❌ Title rename API failed:", result.error);
        throw new Error(`Title rename API failed: ${result.error}`);
      }
    } else {
      const errorText = await response.text();
      console.error("❌ Title rename HTTP error:", response.status, errorText);
      throw new Error(
        `Title rename HTTP error: ${response.status} - ${errorText}`,
      );
    }
  } catch (error) {
    console.error("❌ Title rename call failed:", error);
    // Don't throw - title renaming failure shouldn't break the main flow
  }
}
