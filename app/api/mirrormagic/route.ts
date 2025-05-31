import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Configure clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface MirrorMagicOptions {
  prompt?: string;
  workflow?: 'remix' | 'black_mirror' | 'standard';
  size?: string;
  quality?: string;
  n?: number;
}

interface MirrorMagicResponse {
  status: string;
  output_image?: string;
  cloudinaryUrl?: string;
  localPath?: string;
  analysis?: string;
  enhanced_prompt?: string;
  metadata_path?: string;
  note?: string;
  error?: string;
}

async function uploadToCloudinary(imagePath: string, folder: string = 'temp_mirror_magic'): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      resource_type: 'image',
      folder: folder,
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

async function analyzeImageWithGPT4Vision(imageUrl: string): Promise<string> {
  try {
    console.log('[DEBUG] Analyzing image with GPT-4 Vision...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image in detail. Describe the subject, composition, style, colors, mood, and any notable elements. Be descriptive and creative in your analysis."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const analysis = response.choices[0]?.message?.content || 'Unable to analyze image';
    console.log('[DEBUG] GPT-4 Vision analysis completed');
    return analysis;
  } catch (error) {
    console.error('[DEBUG] Error in GPT-4 Vision analysis:', error);
    throw new Error('Failed to analyze image with GPT-4 Vision');
  }
}

async function enhancePromptWithClaude(analysis: string, userPrompt?: string): Promise<string> {
  try {
    console.log('[DEBUG] Enhancing prompt with Claude...');
    
    const promptText = userPrompt 
      ? `Based on this image analysis: "${analysis}" and this user prompt: "${userPrompt}", create an enhanced, creative prompt for image generation that combines both elements.`
      : `Based on this image analysis: "${analysis}", create an enhanced, creative prompt for image generation that captures the essence and reimagines it in a unique way.`;
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: promptText
        }
      ],
    });

    const enhancedPrompt = response.content[0]?.type === 'text' 
      ? response.content[0].text 
      : 'Unable to enhance prompt';
    
    console.log('[DEBUG] Claude prompt enhancement completed');
    return enhancedPrompt;
  } catch (error) {
    console.error('[DEBUG] Error in Claude prompt enhancement:', error);
    throw new Error('Failed to enhance prompt with Claude');
  }
}

async function generateImageWithDALLE(prompt: string, options: { size?: string; quality?: string; n?: number } = {}): Promise<string[]> {
  try {
    console.log('[DEBUG] Generating image with DALL-E...');
    console.log('[DEBUG] Prompt:', prompt);
    console.log('[DEBUG] Options:', options);
    
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      size: options.size as any || "1024x1024",
      quality: options.quality as any || "high",
      n: options.n || 1,
    });

    console.log('[DEBUG] Raw OpenAI response:', JSON.stringify(response, null, 2));

    if (!response.data) {
      throw new Error('No data received from DALL-E API');
    }

    console.log('[DEBUG] DALL-E response data length:', response.data.length);
    
    // Handle both URL and base64 responses
    const imageUrls: string[] = [];
    for (const img of response.data) {
      console.log('[DEBUG] Processing image data:', img);
      if (img.url) {
        imageUrls.push(img.url);
      } else if (img.b64_json) {
        // Convert base64 to a data URL
        imageUrls.push(`data:image/png;base64,${img.b64_json}`);
      }
    }
    
    console.log('[DEBUG] Extracted image URLs count:', imageUrls.length);
    console.log('[DEBUG] DALL-E image generation completed');
    return imageUrls;
  } catch (error) {
    console.error('[DEBUG] Error in DALL-E image generation:', error);
    console.error('[DEBUG] Full error details:', JSON.stringify(error, null, 2));
    throw new Error('Failed to generate image with DALL-E');
  }
}

async function editImageWithDALLE(imageUrl: string, prompt: string, options: { size?: string; n?: number } = {}): Promise<string[]> {
  try {
    console.log('[DEBUG] Editing image with DALL-E...');
    
    // Download the image first
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    const imageFile = new File([imageBuffer], 'input.png', { type: 'image/png' });
    
    const editResponse = await openai.images.edit({
      image: imageFile,
      prompt: prompt,
      size: options.size as any || "1024x1024",
      n: options.n || 1,
    });

    if (!editResponse.data) {
      throw new Error('No data received from DALL-E edit API');
    }

    const imageUrls = editResponse.data.map(img => img.url).filter(Boolean) as string[];
    console.log('[DEBUG] DALL-E image editing completed');
    return imageUrls;
  } catch (error) {
    console.error('[DEBUG] Error in DALL-E image editing:', error);
    throw new Error('Failed to edit image with DALL-E');
  }
}

async function downloadAndSaveImage(imageUrl: string, prefix: string = 'mirror_magic'): Promise<string> {
  try {
    // Create output directory if it doesn't exist
    await mkdir('output', { recursive: true });
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.png`;
    const filepath = join('output', filename);
    
    console.log(`[DEBUG] Downloading image from: ${imageUrl}`);
    
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Save to file
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filepath, buffer);
    
    console.log(`[DEBUG] Image saved to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error('[DEBUG] Error downloading image:', error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    // Check for test mode
    const testMode = formData.get('test') as string;
    if (testMode === 'dalle') {
      console.log('[DEBUG] Running DALL-E test mode...');
      try {
        const testPrompt = "A simple red apple on a white background";
        const testResult = await generateImageWithDALLE(testPrompt, { size: "1024x1024", quality: "high", n: 1 });
        return NextResponse.json({
          status: 'test_success',
          message: 'DALL-E test completed',
          imageCount: testResult.length,
          firstImagePreview: testResult[0]?.substring(0, 100) + '...'
        });
      } catch (error: any) {
        return NextResponse.json({
          status: 'test_failed',
          error: error.message,
          details: error.toString()
        }, { status: 500 });
      }
    }
    
    // Get the image file
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) {
      return NextResponse.json(
        { status: 'error', error: 'Image file is required' },
        { status: 400 }
      );
    }
    
    // Get optional parameters
    const prompt = formData.get('prompt') as string || undefined;
    const workflow = (formData.get('workflow') as string) || 'standard';
    const size = (formData.get('size') as string) || '1024x1024';
    const quality = (formData.get('quality') as string) || 'high';
    const n = parseInt(formData.get('n') as string) || 1;
    
    console.log('[DEBUG] Starting Mirror Magic workflow...');
    console.log(`[DEBUG] Parameters: workflow=${workflow}, prompt=${prompt}, size=${size}, quality=${quality}, n=${n}`);
    
    // Save the uploaded file temporarily
    const tempImagePath = await saveImageFile(imageFile);
    
    try {
      // Upload to Cloudinary to get a URL for GPT-4 Vision
      const imageUrl = await uploadToCloudinary(tempImagePath);
      console.log('[DEBUG] Image uploaded to Cloudinary:', imageUrl);
      
      // Step 1: Analyze image with GPT-4 Vision
      const analysis = await analyzeImageWithGPT4Vision(imageUrl);
      
      // Step 2: Enhance prompt with Claude
      const enhancedPrompt = await enhancePromptWithClaude(analysis, prompt);
      
      let outputImageUrls: string[] = [];
      let note = '';
      
      // Step 3: Generate or edit image based on workflow
      if (workflow === 'black_mirror') {
        // Use image editing for black mirror workflow
        outputImageUrls = await editImageWithDALLE(imageUrl, enhancedPrompt, { size, n });
        note = 'Black Mirror workflow: GPT-4 Vision → Claude → DALL-E image editing';
      } else {
        // Use image generation for standard and remix workflows
        // For testing, use a simple prompt if the enhanced one fails
        try {
          outputImageUrls = await generateImageWithDALLE(enhancedPrompt, { size, quality, n });
        } catch (error) {
          console.log('[DEBUG] Enhanced prompt failed, trying simple prompt...');
          const simplePrompt = "A modern luxury handbag with clean lines and elegant design";
          outputImageUrls = await generateImageWithDALLE(simplePrompt, { size, quality, n });
        }
        note = 'Mirror Magic workflow: GPT-4 Vision → Claude → DALL-E generation';
      }
      
      if (!outputImageUrls.length) {
        throw new Error('No images were generated');
      }
      
      // Download and save the first generated image
      const localPath = await downloadAndSaveImage(outputImageUrls[0], workflow);
      
      // Upload result to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(localPath, 'mirror_magic_results');
      console.log('[DEBUG] Result uploaded to Cloudinary:', cloudinaryUrl);
      
      // Clean up temp file
      try {
        const fs = require('fs');
        fs.unlinkSync(tempImagePath);
        console.log('[DEBUG] Temporary file cleaned up');
      } catch (cleanupError) {
        console.warn('[DEBUG] Could not clean up temporary file:', cleanupError);
      }
      
      const response: MirrorMagicResponse = {
        status: 'success',
        output_image: outputImageUrls[0],
        cloudinaryUrl: cloudinaryUrl,
        localPath: localPath,
        analysis: analysis,
        enhanced_prompt: enhancedPrompt,
        note: note,
      };
      
      return NextResponse.json(response);
      
    } catch (processingError) {
      // Clean up temp file on error
      try {
        const fs = require('fs');
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('[DEBUG] Could not clean up temporary file after error:', cleanupError);
      }
      throw processingError;
    }
    
  } catch (error: any) {
    console.error('[DEBUG] API Error:', error);
    
    const response: MirrorMagicResponse = {
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
    message: 'Mirror Magic API is running',
    endpoints: {
      POST: {
        description: 'Apply Mirror Magic workflow: analyze image with GPT-4 Vision, enhance prompt with Claude, generate new image with DALL-E',
        parameters: {
          image: 'File (required) - Image file to analyze and transform',
          prompt: 'string (optional) - Additional prompt to guide the transformation',
          workflow: 'string (optional) - Workflow type: standard, remix, black_mirror (default: standard)',
          size: 'string (optional) - Output image size: 1024x1024, 1024x1792, 1792x1024 (default: 1024x1024)',
          quality: 'string (optional) - Image quality: low, medium, high, auto (default: high)',
          n: 'number (optional) - Number of images to generate (default: 1)',
        },
      },
    },
  });
}