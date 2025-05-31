import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Mocked image generation function (you'll replace this)
async function generateImageWorkflow({
  productImagePath,
  designImagePath,
  colorImagePath,
  prompt,
  workflowType,
}: {
  productImagePath?: string;
  designImagePath?: string;
  colorImagePath?: string;
  prompt?: string;
  workflowType: string;
}) {
  // Validation logic copied from Python
  if (workflowType === 'full_composition') {
    if (!productImagePath || !designImagePath || !colorImagePath)
      throw new Error('Full composition requires all three images');
  } else if (workflowType === 'product_color') {
    if (!productImagePath || !colorImagePath)
      throw new Error('Product+Color workflow requires both product and color images');
  } else if (workflowType === 'product_design') {
    if (!productImagePath || !designImagePath)
      throw new Error('Product+Design workflow requires both product and design images');
  } else if (workflowType === 'color_design') {
    if (!colorImagePath || !designImagePath || !prompt)
      throw new Error('Color+Design workflow requires both images and a prompt');
  } else {
    throw new Error(`Unknown workflow type: ${workflowType}`);
  }

  if (!prompt) {
    if (workflowType === 'full_composition') {
      prompt = 'Compose a new design using the provided product, design, and color inspirations.';
    } else if (workflowType === 'product_color') {
      prompt = 'Apply the color palette to the product while maintaining its original design.';
    } else if (workflowType === 'product_design') {
      prompt = 'Apply the design to the product while keeping its form and structure.';
    } else {
      throw new Error('Prompt is required for color+design workflow');
    }
  }

  // Simulate processing
  return {
    status: 'success',
    detail: 'Image composed successfully',
    inputs: { productImagePath, designImagePath, colorImagePath, prompt, workflowType },
  };
}

export async function POST(request: NextRequest) {
  try {
    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const formData = await request.formData();
    
    // Helper function to save uploaded files
    const saveFile = async (file: File): Promise<string> => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Generate unique filename
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      const extension = path.extname(file.name) || '.jpg';
      const filename = `${timestamp}_${random}${extension}`;
      const filepath = path.join(tmpDir, filename);
      
      fs.writeFileSync(filepath, buffer);
      return filepath;
    };

    // Extract and save files
    let productImagePath: string | undefined;
    let designImagePath: string | undefined;
    let colorImagePath: string | undefined;

    const productFile = formData.get('product') as File | null;
    const designFile = formData.get('design') as File | null;
    const colorFile = formData.get('color') as File | null;

    if (productFile) {
      productImagePath = await saveFile(productFile);
    }
    if (designFile) {
      designImagePath = await saveFile(designFile);
    }
    if (colorFile) {
      colorImagePath = await saveFile(colorFile);
    }

    // Extract text fields
    const prompt = formData.get('prompt') as string | null;
    const workflowType = (formData.get('workflowType') as string) || 'full_composition';

    const result = await generateImageWorkflow({
      productImagePath,
      designImagePath,
      colorImagePath,
      prompt: prompt || undefined,
      workflowType,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { status: 'error', detail: error.message },
      { status: 400 }
    );
  }
}

// Optional: Add cleanup function to remove old files
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filepath = searchParams.get('filepath');
    
    if (!filepath) {
      return NextResponse.json(
        { status: 'error', detail: 'Filepath parameter required' },
        { status: 400 }
      );
    }

    // Security check: ensure file is in tmp directory
    const tmpDir = path.join(process.cwd(), 'tmp');
    const resolvedPath = path.resolve(filepath);
    const resolvedTmpDir = path.resolve(tmpDir);
    
    if (!resolvedPath.startsWith(resolvedTmpDir)) {
      return NextResponse.json(
        { status: 'error', detail: 'Invalid file path' },
        { status: 403 }
      );
    }

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return NextResponse.json({ status: 'success', detail: 'File deleted' });
    } else {
      return NextResponse.json(
        { status: 'error', detail: 'File not found' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { status: 'error', detail: error.message },
      { status: 500 }
    );
  }
}