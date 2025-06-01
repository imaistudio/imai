import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { tmpdir } from 'os';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface ComposeResponse {
  status: string;
  output_image?: string;
  cloudinaryUrl?: string;
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

async function uploadToCloudinary(imagePath: string): Promise<string> {
  const result = await cloudinary.uploader.upload(imagePath, {
    folder: 'compose_product',
  });

  // Auto-delete after 1 hour
  setTimeout(async () => {
    try {
      await cloudinary.uploader.destroy(result.public_id);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }, 3600000);

  return result.secure_url;
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
    let cloudinaryUrls: string[] = [];

    const processImage = async (file: File | null, type: string) => {
      if (!file) return null;
      const tempPath = await saveFileToTemp(file);
      tempPaths.push(tempPath);
      const url = await uploadToCloudinary(tempPath);
      cloudinaryUrls.push(url);
      return analyzeImage(url, type);
    };

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
    const response:any = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      quality: quality === "hd" ? "hd" : "standard",
      n: 1,
      response_format: "b64_json"
    });

    if (!response.data[0]?.b64_json) throw new Error('Image generation failed');

    // Upload result
    const resultPath = join(tmpdir(), `result_${Date.now()}.png`);
    await writeFile(resultPath, Buffer.from(response.data[0].b64_json, 'base64'));
    const resultUrl = await uploadToCloudinary(resultPath);

    // Cleanup
    await Promise.all([...tempPaths, resultPath].map(async (path) => {
      try { await unlink(path); } catch {} 
    }));

    return NextResponse.json({
      status: 'success',
      output_image: response.data[0].b64_json,
      cloudinaryUrl: resultUrl,
      workflow_type,
      generated_prompt: finalPrompt
    });

  } catch (error: any) {
    // Cleanup on error
    await Promise.all(tempPaths.map(async (path) => {
      try { await unlink(path); } catch {}
    }));

    return NextResponse.json(
      { status: 'error', error: error.message },
      { status: error.message.includes('Invalid input') ? 400 : 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Auto-detecting workflow API',
    supported_inputs: [
      'product_image (file)',
      'design_image (file)',
      'color_image (file)',
      'prompt (text)',
      'size (optional: 1024x1024, 1792x1024, 1024x1792)',
      'quality (optional: standard, hd)'
    ]
  });
}