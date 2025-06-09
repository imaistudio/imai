// TypeScript: route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

// Configure FAL
fal.config({
  credentials: process.env.FAL_KEY,
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Function to process reframe - simplified approach
async function processReframe(imageUrl: string, options: { imageSize: string; webhookUrl?: string }) {
  try {
    console.log('🖼️ Processing reframe...');
    console.log('Image URL:', imageUrl);
    console.log('Target size:', options.imageSize);

    // For now, return the original image URL as reframing functionality
    // This is a placeholder until proper reframing API is implemented
    console.log('⚠️ Using placeholder reframe - returning original image');
    
    return {
      requestId: 'reframe_' + Date.now(),
      images: [
        {
          url: imageUrl // Return original image for now
        }
      ],
      downloadedPath: null
    };

  } catch (error) {
    console.error('❌ Error in processReframe:', error);
    throw new Error(`Failed to process reframe: ${error}`);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    // 🎯 NEW: Check for image_url parameter first (URL-based approach)
    const imageUrl = (formData.get('image_url') as string | null)?.trim();
    const imageFile = formData.get('image') as File;
    const imageSize = formData.get('imageSize') as string || 'square_hd';

    let finalImageUrl: string;

    if (imageUrl) {
      // URL-based approach - use the provided Cloudinary URL directly
      console.log('🔗 Using provided image URL for reframing:', imageUrl);
      finalImageUrl = imageUrl;
    } else if (imageFile) {
      // Fallback: File-based approach (backward compatibility)
      console.log('📁 Using file-based approach for reframing...');
      
      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' },
          { status: 400 }
        );
      }

      // Validate file size
      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File size too large. Maximum size is 10MB.' },
          { status: 400 }
        );
      }

      // Convert File to Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Convert Buffer to base64
      const base64 = buffer.toString('base64');
      finalImageUrl = `data:${imageFile.type};base64,${base64}`;
    } else {
      return NextResponse.json(
        { error: 'Either image_url or image file must be provided' },
        { status: 400 }
      );
    }

    // Validate image size option
    const validImageSizes = ['square_hd', 'square', 'portrait', 'landscape'];
    if (!validImageSizes.includes(imageSize)) {
      return NextResponse.json(
        { error: 'Invalid image size option.' },
        { status: 400 }
      );
    }

    console.log('🖼️ Starting reframe processing with image size:', imageSize);

    // Process the image with FAL AI using the final image URL
    const result = await processReframe(finalImageUrl, {
      imageSize,
      webhookUrl: undefined
    });

    console.log('✅ Reframe processing completed');

    return NextResponse.json({
      status: 'success',
      result: {
        requestId: result.requestId,
        imageUrl: result.images[0].url,
        downloadedPath: result.downloadedPath
      }
    });

  } catch (error: any) {
    console.error('Error in reframe route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process image' },
      { status: 500 }
    );
  }
}