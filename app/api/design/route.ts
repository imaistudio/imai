import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';
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

async function uploadToCloudinary(imagePath: string): Promise<string> {
  const result = await cloudinary.uploader.upload(imagePath, {
    resource_type: 'image',
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

async function saveFileToTemp(file: File, prefix: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const tempPath = join(tmpdir(), `${prefix}_${Date.now()}_${file.name}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

function generatePrompt(workflowType: string, userPrompt?: string): string {
  if (userPrompt) return userPrompt;

  const prompts = {
    full_composition: 'Create a photorealistic product combining design elements and colors from reference images while maintaining original structure. No text allowed.',
    product_color: 'Apply color palette from reference to product while maintaining original design. Photorealistic, no text.',
    product_design: 'Apply design patterns from reference to product. Maintain form, incorporate visual style. Photorealistic, no text.',
    color_design: 'Create new product combining color and design elements from references. Photorealistic, no text.',
    prompt_only: 'Create innovative product design based on description. Photorealistic, no text.',
    product_prompt: 'Create product variation based on description while maintaining core identity. Photorealistic, no text.'
  };
  
  return prompts[workflowType as keyof typeof prompts] || prompts.full_composition;
}

async function generateWithDALLE(prompt: string, options: any = {}) {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: options.size || "1024x1024",
    quality: options.quality === "hd" ? "high" : "medium",
    n: options.n || 1,
  });

  if (!response.data?.length) {
    throw new Error('No images generated');
  }

  return response.data[0];
}

async function analyzeImage(imageUrl: string, type: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this ${type} image: describe shape, materials, textures, colors, patterns, style, and distinctive features for design recreation.`
          },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 300
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    return `Unable to analyze ${type} image`;
  }
}

async function saveBase64Image(base64Data: string, prefix: string): Promise<string> {
  await mkdir('output', { recursive: true });
  const filepath = join('output', `${prefix}_${Date.now()}.png`);
  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(filepath, buffer);
  return filepath;
}

function validateWorkflow(type: string, hasProduct: boolean, hasDesign: boolean, hasColor: boolean, hasPrompt: boolean) {
  const rules = {
    full_composition: () => hasProduct && hasDesign && hasColor,
    product_color: () => hasProduct && hasColor,
    product_design: () => hasProduct && hasDesign,
    color_design: () => (hasColor || hasDesign) && hasPrompt,
    prompt_only: () => hasPrompt && !hasProduct && !hasDesign && !hasColor,
    product_prompt: () => hasProduct && hasPrompt && !hasDesign && !hasColor
  };

  const rule = rules[type as keyof typeof rules];
  return rule ? rule() : false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    const productImage = formData.get('product_image') as File | null;
    const designImage = formData.get('design_image') as File | null;
    const colorImage = formData.get('color_image') as File | null;
    const workflow_type = (formData.get('workflow_type') as string) || 'full_composition';
    const prompt = formData.get('prompt') as string || undefined;
    const size = (formData.get('size') as string) || '1024x1024';
    const quality = (formData.get('quality') as string) || 'standard';
    const n = parseInt(formData.get('n') as string) || 1;
    
    // Validate inputs
    if (!validateWorkflow(workflow_type, !!productImage, !!designImage, !!colorImage, !!prompt)) {
      return NextResponse.json(
        { status: 'error', error: `Invalid inputs for ${workflow_type} workflow` },
        { status: 400 }
      );
    }
    
    const tempPaths: string[] = [];
    let generatedPrompt = prompt || generatePrompt(workflow_type);
    
    try {
      // Process images and generate enhanced prompt
      const analyses: string[] = [];
      
      if (productImage) {
        const tempPath = await saveFileToTemp(productImage, 'product');
        tempPaths.push(tempPath);
        const url = await uploadToCloudinary(tempPath);
        const analysis = await analyzeImage(url, 'product');
        analyses.push(`PRODUCT: ${analysis}`);
      }

      if (designImage) {
        const tempPath = await saveFileToTemp(designImage, 'design');
        tempPaths.push(tempPath);
        const url = await uploadToCloudinary(tempPath);
        const analysis = await analyzeImage(url, 'design');
        analyses.push(`DESIGN: ${analysis}`);
      }

      if (colorImage) {
        const tempPath = await saveFileToTemp(colorImage, 'color');
        tempPaths.push(tempPath);
        const url = await uploadToCloudinary(tempPath);
        const analysis = await analyzeImage(url, 'color');
        analyses.push(`COLOR: ${analysis}`);
      }

      // Enhance prompt with analyses
      if (analyses.length > 0) {
        generatedPrompt = `${analyses.join('\n\n')}\n\nUSER REQUEST: ${prompt}\n\n${generatePrompt(workflow_type)}`;
      }

      // Generate image
      const result = await generateWithDALLE(generatedPrompt, { size, quality, n });
      
      // Save and upload result
      const localPath = await saveBase64Image(result.b64_json || '', workflow_type);
      const cloudinaryUrl = await uploadToCloudinary(localPath);
      
      // Cleanup
      tempPaths.forEach(path => {
        try {
          require('fs').unlinkSync(path);
        } catch (e) {
          console.warn('Cleanup failed:', path);
        }
      });
      
      const response: ComposeResponse = {
        status: 'success',
        output_image: result.b64_json || result.url,
        cloudinaryUrl,
        workflow_type,
        generated_prompt: generatedPrompt
      };
      
      return NextResponse.json(response);
      
    } catch (processingError) {
      // Cleanup on error
      tempPaths.forEach(path => {
        try {
          require('fs').unlinkSync(path);
        } catch (e) {}
      });
      throw processingError;
    }
    
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    message: 'Compose Product API',
    workflows: [
      'full_composition: product + design + color images',
      'product_color: product + color images', 
      'product_design: product + design images',
      'color_design: (color/design images) + prompt',
      'prompt_only: text prompt only',
      'product_prompt: product image + prompt'
    ]
  });
}