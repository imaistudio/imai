import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import sharp from "sharp";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Add configuration for longer timeout
export const maxDuration = 300; // 5 minutes in seconds
export const dynamic = "force-dynamic";

// Firebase initialization
let firebaseInitialized = false;
if (!getApps().length) {
  try {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_CLIENT_EMAIL
    ) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      firebaseInitialized = true;
      console.log("🔥 Firebase initialized successfully for pairing route");
    } else {
      console.log(
        "🔥 Firebase disabled in pairing route - missing credentials",
      );
    }
  } catch (error) {
    console.error("🔥 Firebase initialization error in pairing route:", error);
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface PairingResponse {
  status: string;
  pairedImage?: string;
  description?: string;
  pairingReason?: string;
  suggestedUseCases?: string[];
  error?: string;
}

/**
 * Uploads a Buffer to Firebase Storage and returns a signed URL
 */
async function uploadBufferToFirebase(
  buffer: Buffer,
  destinationPath: string,
): Promise<string> {
  try {
    if (!firebaseInitialized) {
      throw new Error("Firebase is not initialized");
    }

    const bucket = getStorage().bucket();
    const file = bucket.file(destinationPath);

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=3600",
      },
      resumable: false,
      validation: false,
    });

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return signedUrl;
  } catch (error) {
    console.error("Firebase upload error:", error);
    throw error;
  }
}

/**
 * Convert file to JPEG buffer
 */
async function fileToJpegBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Convert to JPEG using sharp
  const jpegBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();

  return jpegBuffer;
}

/**
 * Resize image if it's too large for OpenAI's vision API
 */
async function resizeImageIfNeeded(imageUrl: string): Promise<string> {
  try {
    // Fetch the image to check its size
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to fetch image for size check: ${response.statusText}`,
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
      `✅ Image resized from ${sizeMB.toFixed(2)}MB to ${(resizedBuffer.length / (1024 * 1024)).toFixed(2)}MB`,
    );
    return resizedUrl;
  } catch (error) {
    console.error("Error checking/resizing image:", error);
    return imageUrl; // Return original URL on error
  }
}

/**
 * Analyze product image to understand characteristics and determine pairing strategy
 */
async function analyzeProductForPairing(imageUrl: string): Promise<{
  productAnalysis: string;
  pairingStrategy: string;
  suggestedComplement: string;
}> {
  try {
    const analysisPrompt = `Analyze this product image for AI pairing. You need to provide:

1. **Product Analysis**: Describe the product's:
   - Category, material, and style
   - Color palette and visual characteristics
   - Design language and aesthetic
   - Intended use case and target audience

2. **Pairing Strategy**: Determine the best approach:
   - Visual balance (contrast vs harmony)
   - Functional relationship (complementary use)
   - Aesthetic coherence (matching style/theme)
   - Scene composition (layout and arrangement)

3. **Suggested Complement**: Recommend a specific item that would:
   - Enhance the main product's appeal
   - Create visual interest and balance
   - Suggest practical use-case scenarios
   - Maintain aesthetic consistency

Be specific about materials, colors, shapes, and positioning for the complementary item.`;

    // Resize image if needed before sending to OpenAI
    const resizedImageUrl = await resizeImageIfNeeded(imageUrl);

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: analysisPrompt,
            },
            {
              type: "image_url",
              image_url: { url: resizedImageUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const analysisResult = response.choices[0].message.content || "";

    // Parse the analysis to extract structured information
    const sections = analysisResult.split(/\d\.\s\*\*[^*]+\*\*:/);

    return {
      productAnalysis: sections[1]?.trim() || analysisResult,
      pairingStrategy:
        sections[2]?.trim() || "Create visual balance and functional harmony",
      suggestedComplement:
        sections[3]?.trim() ||
        "Complementary item that enhances the product's appeal",
    };
  } catch (error) {
    console.error("Error analyzing product for pairing:", error);
    throw error;
  }
}

/**
 * Extract specific product request from user message and form data
 */
function extractProductRequest(message: string, formData: FormData): string {
  const messageLC = message.toLowerCase();

  // Check form data parameters first
  const productType = formData.get("product_type") as string;
  const complementTarget = formData.get("complement_target") as string;
  const pairingContext = formData.get("pairing_context") as string;

  if (productType && productType !== "undefined") {
    return productType;
  }

  // Extract from message
  const productPatterns = [
    /what\s+(?:type\s+of\s+)?(\w+)\s+would\s+complement/i,
    /what\s+(\w+)\s+(?:would\s+)?(?:go\s+with|match|pair)/i,
    /suggest\s+(?:a\s+)?(\w+)\s+(?:for|to\s+go\s+with)/i,
    /(\w+)\s+(?:that\s+)?(?:would\s+)?(?:complement|match|pair)/i,
    /find\s+(?:a\s+)?(\w+)\s+(?:that\s+)?(?:goes\s+with|matches)/i,
  ];

  for (const pattern of productPatterns) {
    const match = messageLC.match(pattern);
    if (match && match[1]) {
      const product = match[1];
      // Map common variations
      const productMap: { [key: string]: string } = {
        pants: "pants",
        pant: "pants",
        trousers: "pants",
        jeans: "pants",
        shirt: "shirt",
        tshirt: "shirt",
        "t-shirt": "shirt",
        shoes: "shoes",
        shoe: "shoes",
        bag: "bag",
        handbag: "bag",
        purse: "bag",
        jacket: "jacket",
        coat: "jacket",
        accessory: "accessory",
        accessories: "accessory",
        jewelry: "jewelry",
        jewellery: "jewelry",
        watch: "watch",
        belt: "belt",
        scarf: "scarf",
        hat: "hat",
        cap: "hat",
      };

      return productMap[product] || product;
    }
  }

  // Default fallback
  return "complementary item";
}

/**
 * Generate the pairing prompt for OpenAI image generation
 */
function generatePairingPrompt(
  productAnalysis: string,
  pairingStrategy: string,
  suggestedComplement: string,
  specificRequest: string,
  userMessage: string,
): string {
  const specificProductInstruction =
    specificRequest && specificRequest !== "complementary item"
      ? `\n🎯 SPECIFIC REQUEST: The user specifically asked for "${specificRequest}" - you MUST generate ${specificRequest}, not any other type of product.`
      : "";

  return `You are a professional product stylist creating a complementary product that pairs beautifully with the original item.

🧾 ORIGINAL PRODUCT ANALYSIS:
${productAnalysis}

🎯 PAIRING STRATEGY:
${pairingStrategy}

➕ COMPLEMENTARY ITEM TO CREATE:
${suggestedComplement}

📝 USER REQUEST: "${userMessage}"${specificProductInstruction}

🖼️ GENERATION INSTRUCTIONS:
Create ONLY the complementary product image - do NOT include the original product in this image.
${specificRequest && specificRequest !== "complementary item" ? `You MUST generate ${specificRequest} - this is the user's specific request.` : ""}

🎨 COLOR & DESIGN RULES:
- Use CONTRASTING colors, not similar ones
- If the original is warm-toned, use cool tones (blues, greens, purples)
- If the original is cool-toned, use warm tones (reds, oranges, yellows)
- If the original is neutral, add a pop of vibrant color
- If the original is colorful, use elegant neutrals (black, white, gray, beige)
- Create visual interest through texture, material, or pattern differences

🎯 COMPLEMENTARY PRODUCT FOCUS:
- Generate a single, high-quality product image
- Professional product photography style
- Clean white or neutral background
- Soft, even lighting with natural shadows
- The product should feel intentionally designed to complement the original
- Focus on materials, textures, and finishes that create contrast

🚫 AVOID:
- Including the original product in the image
- Using the same color palette as the original
- Creating an exact match - we want complementary contrast
- Busy backgrounds or distracting elements
- Adding text, labels, or branding
${specificRequest && specificRequest !== "complementary item" ? `- Creating anything other than ${specificRequest}` : ""}

📸 STYLE:
- Professional product photography
- Studio-quality lighting
- Clean, minimalist presentation
- Focus entirely on the complementary product
- High contrast and sharp details

🎨 GOAL:
Create a beautiful complementary ${specificRequest} that enhances the original through contrast and thoughtful design differences, not similarities.`;
}

/**
 * Generate paired image using OpenAI
 */
async function generatePairedImage(
  prompt: string,
  originalImageUrl: string,
): Promise<string> {
  try {
    // Upload original image to OpenAI Files API for reference
    const response = await fetch(originalImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to JPEG if needed
    const jpegBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

    const file = new File([jpegBuffer], "product.jpg", {
      type: "image/jpeg",
    });

    const fileUpload = await openai.files.create({
      file: file,
      purpose: "vision",
    });

    // Use Responses API to generate ONLY the complementary product
    const generationResponse = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `You must generate a complementary product image using the image_generation tool. Here is the pairing prompt: ${prompt}

IMPORTANT: You MUST call the image_generation tool to create ONLY the complementary product image. Do NOT include the original product in the generated image. Use the provided image only as reference to understand what would complement it.`,
            },
            {
              type: "input_image",
              file_id: fileUpload.id,
              detail: "auto",
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          size: "1024x1024",
          quality: "auto",
        },
      ],
    });

    // Extract the generated image
    const imageGenerationCalls = (generationResponse.output as any[]).filter(
      (output: any) => output.type === "image_generation_call",
    );

    if (imageGenerationCalls.length === 0) {
      throw new Error("No image generation calls found in response");
    }

    const imageData =
      imageGenerationCalls[0].result || imageGenerationCalls[0].b64_json;
    if (!imageData) {
      throw new Error("No image data found in response");
    }

    return imageData; // Returns base64 image data
  } catch (error) {
    console.error("Error generating paired image:", error);
    throw error;
  }
}

/**
 * Generate description and use cases for the pairing
 */
async function generatePairingDescription(
  productAnalysis: string,
  pairingStrategy: string,
  suggestedComplement: string,
): Promise<{
  description: string;
  pairingReason: string;
  suggestedUseCases: string[];
}> {
  try {
    const descriptionPrompt = `Based on this product pairing analysis, create a compelling description:

**Product Analysis**: ${productAnalysis}
**Pairing Strategy**: ${pairingStrategy}
**Suggested Complement**: ${suggestedComplement}

Provide:
1. **Description**: A concise, engaging description (2-3 sentences) explaining the pairing
2. **Pairing Reason**: Why these items work well together (1-2 sentences)
3. **Use Cases**: 3-4 specific scenarios where this pairing would be perfect

Keep the tone professional yet approachable, suitable for product marketing.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: descriptionPrompt,
        },
      ],
      max_tokens: 500,
    });

    const result = response.choices[0].message.content || "";

    // Parse the structured response
    const lines = result.split("\n").filter((line) => line.trim());

    let description = "";
    let pairingReason = "";
    let useCases: string[] = [];

    let currentSection = "";

    for (const line of lines) {
      if (line.includes("Description") || line.includes("1.")) {
        currentSection = "description";
        continue;
      } else if (line.includes("Pairing Reason") || line.includes("2.")) {
        currentSection = "reason";
        continue;
      } else if (line.includes("Use Cases") || line.includes("3.")) {
        currentSection = "usecases";
        continue;
      }

      if (currentSection === "description" && line.trim()) {
        description += line.trim() + " ";
      } else if (currentSection === "reason" && line.trim()) {
        pairingReason += line.trim() + " ";
      } else if (currentSection === "usecases" && line.trim()) {
        useCases.push(line.trim().replace(/^[-*•]\s*/, ""));
      }
    }

    // Fallback if parsing fails
    if (!description) {
      description = result.substring(0, 200) + "...";
    }
    if (!pairingReason) {
      pairingReason =
        "These items create visual harmony and functional synergy.";
    }
    if (useCases.length === 0) {
      useCases = [
        "Perfect for gifting",
        "Great for home or office",
        "Ideal for daily use",
      ];
    }

    return {
      description: description.trim(),
      pairingReason: pairingReason.trim(),
      suggestedUseCases: useCases.slice(0, 4),
    };
  } catch (error) {
    console.error("Error generating pairing description:", error);
    return {
      description:
        "This pairing creates an appealing and functional combination that enhances both products' appeal.",
      pairingReason:
        "These items complement each other visually and functionally.",
      suggestedUseCases: [
        "Perfect for gifting",
        "Great for home or office",
        "Ideal for daily use",
      ],
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // Extract and validate userid
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    // Validate Firebase user if initialized
    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
      } catch {
        return NextResponse.json(
          { status: "error", error: "Invalid Firebase user ID" },
          { status: 400 },
        );
      }
    }

    // Extract product image (file or URL)
    const productImage = formData.get("product_image") as File | null;
    const productImageUrl = formData.get("product_image_url") as string | null;

    if (!productImage && !productImageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error:
            "Missing product image. Please provide either product_image file or product_image_url.",
        },
        { status: 400 },
      );
    }

    // Extract user message for specific product requests
    const userMessage = (formData.get("prompt") as string) || "";
    const specificRequest = extractProductRequest(userMessage, formData);

    console.log("🧩 PAIRING ROUTE: Starting product pairing process");
    console.log("📝 User message:", userMessage);
    console.log("🎯 Specific request:", specificRequest);

    // Process product image
    let finalProductImageUrl: string;

    if (productImage) {
      console.log("📤 Processing uploaded product image file");
      const productBuffer = await fileToJpegBuffer(productImage);

      if (firebaseInitialized) {
        const productPath = `${userid}/input/${uuidv4()}.jpg`;
        finalProductImageUrl = await uploadBufferToFirebase(
          productBuffer,
          productPath,
        );
      } else {
        // Convert to base64 for non-Firebase mode
        const base64 = productBuffer.toString("base64");
        finalProductImageUrl = `data:image/jpeg;base64,${base64}`;
      }
    } else {
      console.log("🔗 Using provided product image URL");
      finalProductImageUrl = productImageUrl!;
    }

    // Step 1: Analyze the product for pairing
    console.log("🔍 Analyzing product for pairing strategy");
    const pairingAnalysis =
      await analyzeProductForPairing(finalProductImageUrl);

    // Step 2: Generate the pairing prompt with specific request
    console.log("📝 Generating pairing prompt for:", specificRequest);
    const pairingPrompt = generatePairingPrompt(
      pairingAnalysis.productAnalysis,
      pairingAnalysis.pairingStrategy,
      pairingAnalysis.suggestedComplement,
      specificRequest,
      userMessage,
    );

    // Step 3: Generate the paired image (complementary product only)
    console.log("🎨 Generating complementary product image with OpenAI");
    const pairedImageBase64 = await generatePairedImage(
      pairingPrompt,
      finalProductImageUrl,
    );

    // Step 4: Process the generated image
    let finalPairedImageUrl: string;

    if (firebaseInitialized) {
      // Upload to Firebase
      const pairedImageBuffer = Buffer.from(pairedImageBase64, "base64");
      const pairedImagePath = `${userid}/output/${uuidv4()}_pairing.jpg`;
      finalPairedImageUrl = await uploadBufferToFirebase(
        pairedImageBuffer,
        pairedImagePath,
      );
    } else {
      // Return as base64 data URL
      finalPairedImageUrl = `data:image/jpeg;base64,${pairedImageBase64}`;
    }

    // Step 5: Generate description and use cases
    console.log("📖 Generating pairing description and use cases");
    const pairingDescription = await generatePairingDescription(
      pairingAnalysis.productAnalysis,
      pairingAnalysis.pairingStrategy,
      pairingAnalysis.suggestedComplement,
    );

    console.log("✅ PAIRING ROUTE: Successfully completed pairing process");

    const response: PairingResponse = {
      status: "success",
      pairedImage: finalPairedImageUrl,
      description: pairingDescription.description,
      pairingReason: pairingDescription.pairingReason,
      suggestedUseCases: pairingDescription.suggestedUseCases,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ PAIRING ROUTE: Error processing pairing request:", error);

    const response: PairingResponse = {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Pairing API is running",
    description: "Generate AI-paired product images with complementary items",
    endpoints: {
      POST: {
        description: "Create a paired product image with complementary item",
        parameters: {
          userid: "string (required) - User ID for authentication",
          product_image: "File (optional) - Product image file to pair",
          product_image_url: "string (optional) - Product image URL to pair",
        },
        note: "Either product_image or product_image_url is required",
      },
    },
    examples: {
      "Via IntentRoute":
        "POST /api/intentroute with message='pair this product' and product_image file",
      "Direct API":
        "POST /api/pairing with userid and product_image/product_image_url",
    },
  });
}
