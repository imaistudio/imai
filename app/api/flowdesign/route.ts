import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp, { Sharp } from "sharp";
import fs from "fs";
import path from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import { getNextFalKey } from "@/lib/falKeyManager";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

interface ImageMetadata {
  width: number;
  height: number;
  channels: number;
}

interface CompositeInput {
  input: Buffer;
  left: number;
  top: number;
}

interface FluxAPIResponse {
  images?: Array<{ url: string }>;
  error?: { message: string };
}

interface FALResponse {
  data: {
    images: Array<{ url: string }>;
    timings: Record<string, unknown>;
    seed: number;
    has_nsfw_concepts: boolean[];
    prompt: string;
  };
  requestId: string;
}

interface FlowDesignResponse {
  success: boolean;
  imageUrl: string;
  inputImages: string[];
  concatenatedImage: string;
  designAnalysis: string;
  enhancedPrompt: string;
  basePrompt: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Firebase initialization
function formatFirebasePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("FIREBASE_PRIVATE_KEY environment variable is not set");
  }

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formatFirebasePrivateKey(privateKey),
    }),
    storageBucket: "imai-studio-fae1b.firebasestorage.app", // 🔧 FIX: Use hardcoded bucket name
  });
}

async function uploadImageToFirebaseStorage(
  imageBuffer: Buffer,
  userid: string,
  filename: string,
  isOutput: boolean = false,
): Promise<string> {
  try {
    const storage = getStorage();
    const bucket = storage.bucket("imai-studio-fae1b.firebasestorage.app"); // 🔧 FIX: Explicit bucket name

    const folder = isOutput ? "output" : "input";
    const filePath = `${userid}/${folder}/${filename}`;
    const file = bucket.file(filePath);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          firebaseStorageDownloadTokens: uuidv4(),
        },
      },
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log(`✅ Firebase Storage upload successful: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error("❌ Firebase Storage upload failed:", error);
    throw error;
  }
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function saveImageLocally(
  imageBuffer: Buffer,
  filename: string,
): Promise<string> {
  const publicDir = path.join(process.cwd(), "public", "generated");
  ensureDirectoryExists(publicDir);

  const filePath = path.join(publicDir, filename);
  await fs.promises.writeFile(filePath, imageBuffer);
  return `/generated/${filename}`;
}

async function createBlankImage(
  width: number = 500,
  height: number = 500,
): Promise<Buffer> {
  const blankImage = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return blankImage;
}

async function concatenateImages(
  imageBuffers: Buffer[],
  direction: "horizontal" | "vertical" = "horizontal",
): Promise<Buffer> {
  if (!imageBuffers || imageBuffers.length === 0) {
    throw new Error("No images provided");
  }

  const images: ImageMetadata[] = await Promise.all(
    imageBuffers.map(async (buffer) => {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        channels: metadata.channels || 4,
      };
    }),
  );

  if (direction === "horizontal") {
    const totalWidth = images.reduce((sum, img) => sum + img.width, 0);
    const maxHeight = Math.max(...images.map((img) => img.height));

    const composite: CompositeInput[] = [];
    let xOffset = 0;

    for (let i = 0; i < imageBuffers.length; i++) {
      composite.push({
        input: imageBuffers[i],
        left: xOffset,
        top: 0,
      });
      xOffset += images[i].width;
    }

    return sharp({
      create: {
        width: totalWidth,
        height: maxHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(composite)
      .png()
      .toBuffer();
  } else {
    const maxWidth = Math.max(...images.map((img) => img.width));
    const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

    const composite: CompositeInput[] = [];
    let yOffset = 0;

    for (let i = 0; i < imageBuffers.length; i++) {
      composite.push({
        input: imageBuffers[i],
        left: 0,
        top: yOffset,
      });
      yOffset += images[i].height;
    }

    return sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(composite)
      .png()
      .toBuffer();
  }
}

function extractImageUrl(data: FluxAPIResponse): string | null {
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    const firstImage = data.images[0];
    if (firstImage.url && typeof firstImage.url === "string") {
      const match = firstImage.url.match(/https:\/\/.*\.(jpg|jpeg|png|webp)/i);
      if (match) {
        return match[0];
      }
      return firstImage.url;
    }
  }
  return null;
}

async function generateImageWithFluxAPI(prompt: string): Promise<ArrayBuffer> {
  try {
    if (!process.env.FLUX_API_KEY) {
      throw new Error("FLUX_API_KEY is not set in environment variables");
    }

    const response = await fetch(
      "https://api.aimlapi.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLUX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          model: "flux-pro/v1.1-ultra",
        }),
      },
    );

    const data: FluxAPIResponse = await response.json();

    if (!response.ok) {
      throw new Error(
        `Flux API error: ${data.error?.message || response.statusText}`,
      );
    }

    const imageUrl = extractImageUrl(data);
    if (!imageUrl) {
      throw new Error("No image URL found in the API response");
    }

    console.log(`Extracted Image URL: ${imageUrl}`);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download generated image: ${imageResponse.statusText}`,
      );
    }

    return await imageResponse.arrayBuffer();
  } catch (error) {
    console.error("Error generating image with Flux API:", error);
    throw error;
  }
}

async function generateImageWithFAL(prompt: string): Promise<ArrayBuffer> {
  try {
    const { fal } = await import("@fal-ai/client");

    fal.config({
      credentials: getNextFalKey(),
    });

    console.log("Generating image with fal.ai Flux API...");
    const result: FALResponse = await fal.subscribe(
      "fal-ai/flux-pro/v1.1-ultra",
      {
        input: {
          prompt: prompt,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log: any) => log.message).forEach(console.log);
          }
        },
      },
    );

    console.log("fal.ai result:", result);

    if (!result.data?.images?.[0]?.url) {
      throw new Error("No image URL found in FAL response");
    }

    console.log("Downloading generated image from fal.ai...");
    const imageResponse = await fetch(result.data.images[0].url);

    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download image from FAL: ${imageResponse.statusText}`,
      );
    }

    return await imageResponse.arrayBuffer();
  } catch (error) {
    console.error("Error generating image with FAL:", error);
    throw error;
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<FlowDesignResponse | { error: string }>> {
  try {
    console.log("Flow Design: Starting design generation process");
    const formData = await request.formData();
    const imageBuffers: Buffer[] = [];
    const uploadedImageUrls: string[] = [];

    // Extract userid (required for Firebase upload)
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    const productImageUrl = formData.get("product_image_url") as string | null;
    const designImageUrl = formData.get("design_image_url") as string | null;
    const colorImageUrl = formData.get("color_image_url") as string | null;
    const prompt = formData.get("prompt") as string | null;

    console.log("Flow Design: Processing input images");
    console.log("URL Parameters:", {
      productImageUrl: productImageUrl ? "Yes" : "No",
      designImageUrl: designImageUrl ? "Yes" : "No",
      colorImageUrl: colorImageUrl ? "Yes" : "No",
      prompt,
    });

    const imageUrls = [productImageUrl, designImageUrl, colorImageUrl];
    const fileImages = [
      formData.get("image1") as File | null,
      formData.get("image2") as File | null,
      formData.get("image3") as File | null,
    ];

    for (let i = 0; i < 3; i++) {
      let buffer: Buffer | null = null;

      if (imageUrls[i]) {
        try {
          console.log(
            `Flow Design: Downloading image ${i + 1} from URL: ${imageUrls[i]}`,
          );
          const imageResponse = await fetch(imageUrls[i]!);
          if (imageResponse.ok) {
            const arrayBuffer = await imageResponse.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            console.log(
              `Flow Design: Successfully downloaded image ${i + 1} from URL`,
            );
          } else {
            console.log(
              `Flow Design: Failed to download image ${i + 1} from URL, using blank`,
            );
          }
        } catch (error) {
          console.error(
            `Flow Design: Error downloading image ${i + 1} from URL:`,
            error,
          );
        }
      } else if (fileImages[i]) {
        console.log(`Flow Design: Using uploaded file for image ${i + 1}`);
        const arrayBuffer = await fileImages[i]!.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      if (buffer) {
        console.log(
          `Flow Design: Converting input image ${i + 1} to PNG format`,
        );
        const pngBuffer = await sharp(buffer).png().toBuffer();

        console.log(`Flow Design: Saving input image ${i + 1} locally`);
        const imageUrl = await saveImageLocally(
          pngBuffer,
          `input_${i + 1}_${Date.now()}.png`,
        );
        uploadedImageUrls.push(imageUrl);

        imageBuffers.push(pngBuffer);
      } else {
        console.log(`Flow Design: Creating blank image ${i + 1}`);
        const blankImage = await createBlankImage();

        const imageUrl = await saveImageLocally(
          blankImage,
          `blank_${i + 1}_${Date.now()}.png`,
        );
        uploadedImageUrls.push(imageUrl);

        imageBuffers.push(blankImage);
      }
    }

    console.log("Flow Design: Analyzing each image separately for inspiration");
    const imageAnalyses: string[] = [];

    // Analyze each image individually to extract inspiration elements
    for (let i = 0; i < imageBuffers.length; i++) {
      console.log(
        `Flow Design: Analyzing image ${i + 1} for design inspiration`,
      );
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract design inspiration from this image. Focus ONLY on: 1) Color palette (specific colors, hex codes if possible), 2) Visual themes and mood, 3) Style elements (patterns, textures, shapes), 4) Design principles used. DO NOT describe what the object is - only extract the design DNA that could inspire a completely new creation.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBuffers[i].toString("base64")}`,
                },
              },
            ],
          },
        ],
        max_tokens: 200,
      });

      const analysis =
        response.choices[0]?.message?.content || "No analysis available";
      imageAnalyses.push(analysis);
      console.log(
        `Flow Design: Image ${i + 1} inspiration analysis:`,
        analysis,
      );
    }

    console.log("Flow Design: Combining inspiration elements");
    const combinedAnalysis = imageAnalyses.join("\n\n---\n\n");

    // For backward compatibility, still create concatenated image
    console.log("Flow Design: Creating concatenated image for reference");
    const concatenatedImage = await concatenateImages(
      imageBuffers,
      "horizontal",
    );
    const concatenatedImageUrl = await saveImageLocally(
      concatenatedImage,
      `concatenated_${Date.now()}.png`,
    );

    console.log("Flow Design: Creating enhanced prompt");
    const basePrompt = prompt || "Create a professional design composition";
    const enhancedPrompt = `I am a designer creating innovative new designs. Create a completely NEW and UNIQUE design that draws inspiration from these three sources:

${combinedAnalysis}

CRITICAL REQUIREMENTS:
- Create something BRAND NEW, not a copy or collage of the inputs
- Combine the best color palettes from all three sources
- Merge the visual themes and moods into one cohesive design
- Incorporate style elements (patterns, textures, shapes) from all sources
- Apply the design principles identified across all three
- The result should be a single, unified design that feels inspired by all three but is completely original
- No text, no logos, no symbols - pure design elements only
- Focus on creating a design pattern/composition that could be used for products, backgrounds, or other applications

Generate one unified design that synthesizes all these inspiration elements into something completely new and unique.`;

    console.log("Flow Design: Generating final image with Flux");

    let generatedImageBuffer: Buffer;

    try {
      const falImage = await generateImageWithFAL(enhancedPrompt);
      generatedImageBuffer = Buffer.from(falImage);
    } catch (falError) {
      console.error("FAL.AI failed, falling back to Flux API:", falError);

      try {
        const fluxImage = await generateImageWithFluxAPI(enhancedPrompt);
        generatedImageBuffer = Buffer.from(fluxImage);
      } catch (fluxError) {
        console.error("Both FAL.AI and Flux API failed:", fluxError);
        throw new Error("Image generation failed with both APIs");
      }
    }

    console.log(
      "Flow Design: Processing and uploading generated image to Firebase",
    );
    const processedImage = await sharp(generatedImageBuffer).png().toBuffer();

    const finalImageUrl = await uploadImageToFirebaseStorage(
      processedImage,
      userid,
      `${Date.now()}_flow_design_output.png`,
      true, // isOutput = true
    );

    console.log("Flow Design: Process completed successfully");

    const result: FlowDesignResponse = {
      success: true,
      imageUrl: finalImageUrl,
      inputImages: uploadedImageUrls,
      concatenatedImage: concatenatedImageUrl,
      designAnalysis: combinedAnalysis,
      enhancedPrompt: enhancedPrompt,
      basePrompt: basePrompt,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in flow design generation:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
