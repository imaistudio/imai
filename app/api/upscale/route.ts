import { NextRequest, NextResponse } from 'next/server';
import * as fal from '@fal-ai/serverless-client';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configure FAL AI
fal.config({
  credentials: process.env.FAL_KEY,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface UpscaleOptions {
  scale?: number;
  enhance_face?: boolean;
  enhance_details?: boolean;
}

interface UpscaleResponse {
  status: string;
  imageUrl?: string;
  localPath?: string;
  error?: string;
}

async function uploadToCloudinary(imagePath: string): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      resource_type: 'image',
      folder: 'temp_upscale',
    });
    
    // Schedule deletion after 45 seconds
    setTimeout(async () => {
      try {
        await cloudinary.uploader.destroy(result.public_id);
        console.log(`Deleted temporary image: ${result.public_id}`);
      } catch (error) {
        console.error('Error deleting temporary image:', error);
      }
    }, 45000);
    
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Failed to upload image to Cloudinary');
  }
}

async function saveImageFile(file: File): Promise<string> {
  try {
    // Create temp directory if it doesn't exist
    await mkdir('tmp', { recursive: true });
    
    // Generate unique filename
    const filename = `${uuidv4()}_${file.name}`;
    const filepath = join('tmp', filename);
    
    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);
    
    return filepath;
  } catch (error) {
    console.error('Error saving image file:', error);
    throw new Error('Failed to save image file');
  }
}

async function upscaleImage(imageUrl: string, options: UpscaleOptions): Promise<string> {
  try {
    const { scale = 2, enhance_face = true, enhance_details = true } = options;
    
    console.log('Submitting request to FAL AI...');
    console.log(`Arguments: scale=${scale}, enhance_face=${enhance_face}, enhance_details=${enhance_details}`);
    
    // Submit the request to FAL AI
    const result = await fal.subscribe('fal-ai/aura-sr', {
      input: {
        image_url: imageUrl,
        scale,
        enhance_face,
        enhance_details,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('Processing in progress...');
        }
      },
    });
    
    console.log('Processing completed successfully!');
    console.log('Raw result:', result);
    
    // Extract image URL from result with proper typing
    let outputImageUrl = null;
    const resultData = result as any; // Type assertion since FAL client doesn't provide proper types
    
    // Handle the actual FAL AI response structure
    if (resultData.image && typeof resultData.image === 'object' && 'url' in resultData.image) {
      outputImageUrl = resultData.image.url;
    } else if (resultData.data && typeof resultData.data === 'object') {
      if ('image' in resultData.data && resultData.data.image && typeof resultData.data.image === 'object' && 'url' in resultData.data.image) {
        outputImageUrl = resultData.data.image.url;
      } else if ('url' in resultData.data) {
        outputImageUrl = resultData.data.url;
      }
    }
    
    if (!outputImageUrl) {
      throw new Error(`No image URL found in result. Result structure: ${JSON.stringify(result)}`);
    }
    
    return outputImageUrl;
  } catch (error) {
    console.error('Error in upscaleImage:', error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    // Get the image file
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) {
      return NextResponse.json(
        { status: 'error', error: 'Image file is required' },
        { status: 400 }
      );
    }
    
    // Get optional parameters
    const scale = parseInt(formData.get('scale') as string) || 2;
    const enhance_face = (formData.get('enhance_face') as string)?.toLowerCase() !== 'false';
    const enhance_details = (formData.get('enhance_details') as string)?.toLowerCase() !== 'false';
    
    console.log('Starting image upscaling...');
    console.log(`Parameters: scale=${scale}, enhance_face=${enhance_face}, enhance_details=${enhance_details}`);
    
    // Save the uploaded file temporarily
    const tempImagePath = await saveImageFile(imageFile);
    
    try {
      // Upload to Cloudinary and get URL
      const imageUrl = await uploadToCloudinary(tempImagePath);
      console.log('Image uploaded to Cloudinary:', imageUrl);
      
      // Upscale the image
      const upscaledImageUrl = await upscaleImage(imageUrl, {
        scale,
        enhance_face,
        enhance_details,
      });
      
      console.log('Upscaling completed!');
      console.log('Upscaled image URL:', upscaledImageUrl);
      
      // Clean up temp file
      try {
        const fs = require('fs');
        fs.unlinkSync(tempImagePath);
        console.log('Temporary file cleaned up');
      } catch (cleanupError) {
        console.warn('Could not clean up temporary file:', cleanupError);
      }
      
      const response: UpscaleResponse = {
        status: 'success',
        imageUrl: upscaledImageUrl,
      };
      
      return NextResponse.json(response);
      
    } catch (processingError) {
      // Clean up temp file on error
      try {
        const fs = require('fs');
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Could not clean up temporary file after error:', cleanupError);
      }
      throw processingError;
    }
    
  } catch (error: any) {
    console.error('API Error:', error);
    
    const response: UpscaleResponse = {
      status: 'error',
      error: error.message || 'Unknown error occurred',
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}

// Health check endpoint
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    message: 'Upscale API is running',
    endpoints: {
      POST: {
        description: 'Upscale an image using FAL AI AuraSR',
        parameters: {
          image: 'File (required) - Image file to upscale',
          scale: 'number (optional) - Upscale factor (default: 2)',
          enhance_face: 'boolean (optional) - Enhance faces (default: true)',
          enhance_details: 'boolean (optional) - Enhance details (default: true)',
        },
      },
    },
  });
}