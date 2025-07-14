import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  // Check if we have the required Firebase Admin environment variables
  const hasFirebaseAdminConfig = process.env.FIREBASE_PROJECT_ID && 
                                 process.env.FIREBASE_CLIENT_EMAIL && 
                                 process.env.FIREBASE_PRIVATE_KEY;
  
  if (hasFirebaseAdminConfig) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } else {
    console.log("⚠️ Firebase Admin not initialized - missing environment variables");
  }
}

interface InpaintOptions {
  prompt: string;
  imageData: string;
  maskData: string;
  referenceImages?: string[];
}

interface InpaintResponse {
  success: boolean;
  imageData?: string;
  firebaseUrl?: string;
  error?: string;
}

// Sharp.js utility functions for image processing
async function ensurePng(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
    
  // Check if image is too large for API (OpenAI has limits)
  const maxDimension = 2048;
  let processedImage = image;
  
  if (metadata.width && metadata.height && (metadata.width > maxDimension || metadata.height > maxDimension)) {
    console.log(`🔄 Resizing image from ${metadata.width}x${metadata.height} to fit API limits...`);
    processedImage = image.resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  
  if (metadata.format !== "png") {
    console.log(`🔄 Converting ${metadata.format} to PNG...`);
    return await processedImage.png().toBuffer();
  }
  // If already PNG, process and return
  return await processedImage.png().toBuffer();
}

async function uploadImageToFirebaseStorage(
  imageBuffer: Buffer,
  userid: string,
  filename: string,
  isOutput: boolean = false,
): Promise<string> {
  try {
    // Check if Firebase Admin is initialized
    const apps = getApps();
    if (apps.length === 0) {
      console.log("⚠️ Firebase Admin not initialized - returning mock URL");
      return "https://mock-storage-url.com/uploaded-image.jpg";
    }

    const storage = getStorage();
    const bucket = storage.bucket("imai-studio-fae1b.firebasestorage.app");

    const folder = isOutput ? "output" : "input";
    const filePath = `${userid}/${folder}/${filename}`;
    const file = bucket.file(filePath);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: filename,
          userId: userid,
          folder: folder,
        },
      },
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log(`✅ Firebase Storage upload successful: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error("❌ Firebase Storage upload failed:", error);
    // Return mock URL in case of error
    return "https://mock-storage-url.com/uploaded-image.jpg";
  }
}

async function performInpainting(options: InpaintOptions): Promise<{ imageData: string }> {
  const startTime = Date.now();
  
  try {
    const { prompt, imageData, maskData, referenceImages = [] } = options;

    // Convert base64 data to buffers
    const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
    const maskBuffer = Buffer.from(maskData.split(',')[1], 'base64');
    
    // Process images with Sharp.js
    console.log('🔧 Processing images with Sharp.js...');
    const processedImageBuffer = await ensurePng(imageBuffer);
    const processedMaskBuffer = await ensurePng(maskBuffer);
    
    // Process reference images if provided
    const processedReferenceImageBuffers: Buffer[] = [];
    for (let i = 0; i < referenceImages.length; i++) {
      try {
        console.log(`🔧 Processing reference image ${i + 1}...`);
        const refBuffer = Buffer.from(referenceImages[i].split(',')[1], 'base64');
        console.log(`📦 Reference image ${i + 1} raw buffer size: ${Math.round(refBuffer.length / 1024)}KB`);
        
        const processedRefBuffer = await ensurePng(refBuffer);
        processedReferenceImageBuffers.push(processedRefBuffer);
        console.log(`📏 Processed reference image ${i + 1} size: ${Math.round(processedRefBuffer.length / 1024)}KB`);
      } catch (error) {
        console.error(`❌ Failed to process reference image ${i + 1}:`, error);
        // Continue without this reference image
      }
    }

    // Create file IDs for the images using File objects
    console.log('📤 Step 3: Uploading files to OpenAI...');
    console.log(`📤 Uploading main image (${Math.round(processedImageBuffer.length / 1024)}KB)...`);
    const imageFile = await openai.files.create({
      file: new File([processedImageBuffer], 'image.png', { type: 'image/png' }),
      purpose: "vision"
    });
    console.log(`✅ Main image uploaded with ID: ${imageFile.id}`);
    
    console.log(`📤 Uploading mask image (${Math.round(processedMaskBuffer.length / 1024)}KB)...`);
    const maskFile = await openai.files.create({
      file: new File([processedMaskBuffer], 'mask.png', { type: 'image/png' }),
      purpose: "vision"
    });
    console.log(`✅ Mask image uploaded with ID: ${maskFile.id}`);

    // Create file IDs for reference images
    const referenceFileIds: string[] = [];
    for (let i = 0; i < processedReferenceImageBuffers.length; i++) {
      console.log(`📤 Uploading reference image ${i + 1} (${Math.round(processedReferenceImageBuffers[i].length / 1024)}KB)...`);
      const refFile = await openai.files.create({
        file: new File([processedReferenceImageBuffers[i]], `reference_${i}.png`, { type: 'image/png' }),
        purpose: "vision"
      });
      referenceFileIds.push(refFile.id);
      console.log(`✅ Reference image ${i + 1} uploaded with ID: ${refFile.id}`);
    }

    // Create enhanced prompt with reference images context
    let enhancedPrompt = `You must generate an image using the image_generation tool. Here is the inpainting prompt: ${prompt}

IMPORTANT: You MUST call the image_generation tool to create the inpainted image. Do not respond with text only - you must generate an image.`;
    
    if (referenceImages.length > 0) {
      enhancedPrompt = `${enhancedPrompt} (Use the ${referenceImages.length} reference image(s) as reference for style, composition, or elements to incorporate)`;
      console.log(`🖼️ ${referenceImages.length} reference image(s) provided, enhancing prompt with context...`);
    }
    
    console.log(`📝 Enhanced prompt: "${enhancedPrompt}"`);

    // Prepare content array with main image and reference images
    const content: any[] = [
      {
        type: "input_text",
        text: enhancedPrompt,
      },
      {
        type: "input_image",
        file_id: imageFile.id,
        detail: "high"
      }
    ];

    // Add reference images to content
    referenceFileIds.forEach(fileId => {
      content.push({
        type: "input_image",
        file_id: fileId,
        detail: "high"
      });
    });


    
    const response = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: content,
        },
      ],
      tools: [
        {
          type: "image_generation",
          quality: "high",
          input_image_mask: {
            file_id: maskFile.id,
          },
        },
      ],
    });

  
    const generatedImageData = response.output
      .filter((output) => output.type === "image_generation_call")
      .map((output) => output.result);

    console.log(`📊 Found ${generatedImageData.length} image generation results`);

    if (generatedImageData.length > 0 && generatedImageData[0]) {
      const imageBase64 = generatedImageData[0];
      console.log(`📊 Generated image base64 size: ${Math.round(imageBase64.length / 1024)}KB`);
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ Inpainting completed in ${processingTime}ms`);

      return { imageData: imageBase64 };
    } else {
      throw new Error("No image data received from OpenAI API");
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error("❌ Inpainting failed:", error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("🎨 Inpainting API called");
    
    const body = await request.json();
    const { prompt, imageData, maskData, referenceImages = [] } = body;

    // Validate required fields
    if (!imageData) {
      return NextResponse.json(
        { success: false, error: "Image data is required" },
        { status: 400 }
      );
    }

    if (!maskData) {
      return NextResponse.json(
        { success: false, error: "Mask data is required" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Validate reference images if provided
    if (referenceImages && referenceImages.length > 0) {
      console.log(`🔍 Validating ${referenceImages.length} reference images...`);
      for (let i = 0; i < referenceImages.length; i++) {
        const refImage = referenceImages[i];
        if (!refImage || typeof refImage !== 'string') {
          console.error(`❌ Reference image ${i + 1} is invalid`);
          return NextResponse.json(
            { success: false, error: `Reference image ${i + 1} is invalid` },
            { status: 400 }
          );
        }
        if (!refImage.startsWith('data:image/')) {
          console.error(`❌ Reference image ${i + 1} is not a valid data URL`);
          return NextResponse.json(
            { success: false, error: `Reference image ${i + 1} is not a valid data URL` },
            { status: 400 }
          );
        }
      }
    }

    // Perform inpainting
    const result = await performInpainting({
      prompt,
      imageData,
      maskData,
      referenceImages,
    });

    // Upload result to Firebase Storage
    let firebaseUrl: string;
    try {
      const imageBuffer = Buffer.from(result.imageData, "base64");
      const userId = "anonymous"; // You can extract this from auth if needed
      const timestamp = Date.now();
      const filename = `inpaint_${timestamp}.png`;
      
      firebaseUrl = await uploadImageToFirebaseStorage(
        imageBuffer,
        userId,
        filename,
        true
      );
      
      console.log("✅ Result uploaded to Firebase Storage:", firebaseUrl);
    } catch (uploadError) {
      console.error("❌ Failed to upload result:", uploadError);
      // Return base64 data as fallback
      firebaseUrl = `data:image/png;base64,${result.imageData}`;
    }

    const response: InpaintResponse = {
      success: true,
      imageData: result.imageData,
      firebaseUrl: firebaseUrl,
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Inpainting API is running",
    timestamp: new Date().toISOString(),
  });
} 