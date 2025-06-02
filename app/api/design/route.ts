import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { tmpdir } from 'os';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '@/lib/firebase';
import sharp from 'sharp'; // Added for image conversion
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ComposeResponse {
  status: string;
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  error?: string;
}

// Helper to auto-detect workflow type
function detectWorkflow(
  hasProduct: boolean,
  hasDesign: boolean,
  hasColor: boolean,
  hasPrompt: boolean
): string {
  if (hasProduct && hasDesign && hasColor) return 'full_composition';
  if (hasProduct && hasColor) return 'product_color';
  if (hasProduct && hasDesign) return 'product_design';
  if ((hasColor || hasDesign) && hasPrompt) return 'color_design';
  if (hasProduct && hasPrompt) return 'product_prompt';
  if (hasPrompt) return 'prompt_only';
  throw new Error('Invalid input combination - Provide at least a prompt or one image');
}

async function uploadToFirebaseStorage(buffer: Buffer, destinationPath: string): Promise<string> {
  const storageRef = ref(storage, destinationPath);
  const snapshot = await uploadBytes(storageRef, buffer);
  return await getDownloadURL(snapshot.ref);
}

async function saveFileToTemp(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tempPath = join(tmpdir(), `compose_${Date.now()}_${file.name}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

function generatePrompt(workflowType: string, userPrompt?: string): string {
  if (userPrompt) return userPrompt;

  const prompts: Record<string, string> = {
    full_composition: 'Create a photorealistic product combining all reference images. Maintain original structure, no text.',
    product_color: 'Apply color palette from reference to product. Keep original design, photorealistic, no text.',
    product_design: 'Apply design patterns from reference to product. Maintain form, photorealistic, no text.',
    color_design: 'Create new product using colors/designs from references. Photorealistic, no text.',
    prompt_only: 'Generate innovative product based on description. Photorealistic, no text.',
    product_prompt: 'Modify product based on description while keeping core identity. Photorealistic, no text.'
  };

  return prompts[workflowType] || prompts.full_composition;
}

async function analyzeImage(imageUrl: string, type: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Analyze this ${type} for shape, materials, colors, and distinctive features:` },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }],
    max_tokens: 300
  });

  return response.choices[0].message.content || '';
}

export async function POST(request: NextRequest) {
  const tempPaths: string[] = [];

  try {
    const formData = await request.formData();
    const userId = formData.get('userId') as string | null;
    const idToken = formData.get('idToken') as string | null;
    
    // Validate userId and idToken exist
    if (!userId || !idToken) {
      return NextResponse.json(
        { status: 'error', error: 'userId and idToken are required' },
        { status: 400 }
      );
    }

    // Verify the ID token
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      if (decodedToken.uid !== userId) {
        return NextResponse.json(
          { status: 'error', error: 'User ID mismatch' },
          { status: 403 }
        );
      }
    } catch (error: any) {
      console.error('Token verification error:', error);
      return NextResponse.json(
        { status: 'error', error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const productImage = formData.get('product_image') as File | null;
    const designImage = formData.get('design_image') as File | null;
    const colorImage = formData.get('color_image') as File | null;
    const prompt = formData.get('prompt') as string | null;
    const size = (formData.get('size') as string) || '1024x1024';
    const quality = (formData.get('quality') as string) || 'standard';

    // Auto-detect workflow
    const workflow_type = detectWorkflow(
      !!productImage,
      !!designImage,
      !!colorImage,
      !!prompt
    );

    // Process images
    const analyses: string[] = [];
    let firebaseUrls: string[] = [];

    const processImage = async (file: File | null, type: string) => {
      if (!file) return null;
      
      try {
        // Save to temp file
        const tempPath = await saveFileToTemp(file);
        tempPaths.push(tempPath);
        
        // Upload to Firebase Storage in user's input folder
        const destinationPath = `${userId}/inputs/${Date.now()}_${file.name}`;
        const fileBuffer = await readFile(tempPath);
        const url = await uploadToFirebaseStorage(fileBuffer, destinationPath);
        firebaseUrls.push(url);
        
        return analyzeImage(url, type);
      } catch (error: any) {
        console.error(`Error processing ${type} image:`, error);
        throw new Error(`Failed to process ${type} image: ${error.message}`);
      }
    };

    try {
      const [productAnalysis, designAnalysis, colorAnalysis] = await Promise.all([
        processImage(productImage, 'product'),
        processImage(designImage, 'design'),
        processImage(colorImage, 'color')
      ]);

      if (productAnalysis) analyses.push(`PRODUCT: ${productAnalysis}`);
      if (designAnalysis) analyses.push(`DESIGN: ${designAnalysis}`);
      if (colorAnalysis) analyses.push(`COLOR: ${colorAnalysis}`);

      // Generate final prompt
      const finalPrompt = analyses.length > 0
        ? `${analyses.join('\n\n')}\n\n${prompt || generatePrompt(workflow_type)}`
        : prompt || generatePrompt(workflow_type);

      // Generate image
      const response: any = await openai.images.generate({
        model: "dall-e-3",
        prompt: finalPrompt,
        size: size as "1024x1024" | "1792x1024" | "1024x1792",
        quality: quality === "hd" ? "hd" : "standard",
        n: 1,
        response_format: "b64_json"
      });

      if (!response.data[0]?.b64_json) {
        throw new Error('Image generation failed');
      }

      // Convert base64 to JPG buffer using sharp
      const jpgBuffer = await sharp(Buffer.from(response.data[0].b64_json, 'base64'))
        .jpeg({ quality: 90 })
        .toBuffer();
      
      // Upload JPG result to Firebase Storage in user's output folder
      const outputDestinationPath = `${userId}/outputs/${Date.now()}_result.jpg`;
      const firebaseOutputUrl = await uploadToFirebaseStorage(jpgBuffer, outputDestinationPath);

      // Cleanup temp files
      await Promise.all(tempPaths.map(async (path) => {
        try { await unlink(path); } catch {} 
      }));

      return NextResponse.json({
        status: 'success',
        firebaseOutputUrl,
        workflow_type,
        generated_prompt: finalPrompt
      });

    } catch (error: any) {
      console.error('Error in image processing:', error);
      return NextResponse.json(
        { status: 'error', error: error.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in request handling:', error);
    return NextResponse.json(
      { status: 'error', error: error.message },
      { status: 500 }
    );
  } finally {
    // Cleanup temp files in case of any error
    await Promise.all(tempPaths.map(async (path) => {
      try { await unlink(path); } catch {} 
    }));
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Auto-detecting workflow API',
    supported_inputs: [
      'userId (required: Firebase user ID)',
      'product_image (file)',
      'design_image (file)',
      'color_image (file)',
      'prompt (text)',
      'size (optional: 1024x1024, 1792x1024, 1024x1792)',
      'quality (optional: standard, hd)'
    ]
  });
}