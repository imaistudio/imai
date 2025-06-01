import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { tmpdir } from 'os';

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface ComposeProductOptions {
  workflow_type?: string;
  prompt?: string;
  size?: string;
  quality?: string;
  n?: number;
}

interface ComposeProductResponse {
  status: string;
  output_image?: string;
  cloudinaryUrl?: string;
  localPath?: string;
  workflow_type?: string;
  generated_prompt?: string;
  note?: string;
  error?: string;
}

async function uploadToCloudinary(imagePath: string, folder: string = 'temp_compose_product'): Promise<string> {
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

async function saveImageFile(file: File, prefix: string = 'image'): Promise<string> {
  try {
    // Create temp directory if it doesn't exist
    await mkdir('tmp', { recursive: true });
    
    // Generate unique filename
    const filename = `${uuidv4()}_${prefix}_${file.name}`;
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

// Add helper function to save File objects
async function saveFileToTemp(file: File, prefix: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const tempPath = join(tmpdir(), `${prefix}_${Date.now()}_${file.name}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

function generateWorkflowPrompt(
  workflowType: string, 
  userPrompt?: string,
  hasProduct?: boolean,
  hasDesign?: boolean,
  hasColor?: boolean
): string {
  if (userPrompt) {
    return userPrompt;
  }

  switch (workflowType) {
    case 'full_composition':
        return 'Create a photorealistic version of the original product, incorporating design elements from the design image and colors from image. Strictly retain the original product’s shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette. Apply only external surface-level changes like textures, colors, or patterns. No text or fonts are allowed.';
    
    case 'product_color':
      return 'Apply the color palette and color scheme from the color reference image to the product while maintaining its original design and structure. Keep all product details but transform only the colors to match the reference.photorealistic. No textes or fonts are allowed';
    
    case 'product_design':
      return 'Apply the design patterns, textures, and visual elements from the design image to the product. Use the colors from the design image and incorporate its visual style while maintaining the product\'s form and structure.photorealistic. No textes or fonts are allowed';
    
    case 'color_design':
      return 'Create a new product design that combines the color palette from the color image with the design patterns and style from the design image. Generate a cohesive product that incorporates both visual elements.photorealistic. No textes or fonts are allowed';
    
    case 'prompt_only':
      return 'Create a new innovative product design based on the provided description. Generate a photorealistic, high-quality product design. No text or fonts are allowed';
    
    case 'product_prompt':
      return 'Create a new version or variation of the provided product based on the custom description. Maintain the core product identity while incorporating the requested changes. Generate a photorealistic design. No text or fonts are allowed';
    
    default:
      return 'Compose a new product design using the provided visual references, maintaining harmony between form, color, and design elements. No textes or fonts are allowed';
  }
}

async function composeProductWithDALLE(
  imageUrls: string[],
  prompt: string,
  options: { size?: string; quality?: string; n?: number } = {}
): Promise<Array<{type: 'url' | 'base64', data: string, index: number}>> {
  try {
    console.log('[DEBUG] Composing product with DALL-E...');
    console.log(`[DEBUG] Prompt: ${prompt}`);
    console.log(`[DEBUG] Number of reference images: ${imageUrls.length}`);
    
    // DALL-E 3 doesn't support image references directly, so we use detailed text prompts
    // The prompt should already be well-crafted based on the workflow type
    const enhancedPrompt = prompt;
    
    // Map old quality values to new DALL-E supported values
    let dalleQuality = options.quality || "standard";
    if (dalleQuality === "standard") {
      dalleQuality = "medium";
    } else if (dalleQuality === "hd") {
      dalleQuality = "high";
    }
    // Ensure we only use supported values
    if (!['low', 'medium', 'high', 'auto'].includes(dalleQuality)) {
      dalleQuality = "medium";
    }
    
    console.log(`[DEBUG] Using DALL-E quality: ${dalleQuality}`);
    console.log(`[DEBUG] Final prompt: ${enhancedPrompt}`);
    console.log('[DEBUG] Making DALL-E API call...');
    
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: options.size as any || "1024x1024",
      quality: dalleQuality as any,
      n: options.n || 1,
    });

    console.log('[DEBUG] DALL-E response received');
    console.log('[DEBUG] Response data length:', response.data?.length || 0);
    
    if (response.data && response.data.length > 0) {
      console.log('[DEBUG] First image data keys:', Object.keys(response.data[0]));
      // Don't log the full response as b64_json is huge
      console.log('[DEBUG] Has b64_json:', !!response.data[0].b64_json);
      console.log('[DEBUG] Has url:', !!response.data[0].url);
    }

    if (!response.data || response.data.length === 0) {
      throw new Error('No data received from DALL-E API');
    }

    // Handle gpt-image-1 response format (b64_json) vs DALL-E format (url)
    const imageResults = response.data
      .map((img: any, index: number) => {
        if (img.b64_json) {
          // gpt-image-1 returns base64 encoded images
          console.log('[DEBUG] Processing b64_json response from gpt-image-1');
          return { type: 'base64' as const, data: img.b64_json, index };
        } else if (img.url) {
          // DALL-E 2/3 returns URLs
          console.log('[DEBUG] Processing URL response from DALL-E');
          return { type: 'url' as const, data: img.url, index };
        } else {
          console.log('[DEBUG] Unknown response format:', Object.keys(img));
          return null;
        }
      })
      .filter((result): result is {type: 'url' | 'base64', data: string, index: number} => result !== null);
      
    console.log('[DEBUG] Processed image results:', imageResults.length);
    
    if (imageResults.length === 0) {
      throw new Error('No valid image data in API response');
    }

    console.log('[DEBUG] DALL-E product composition completed');
    return imageResults;
  } catch (error: any) {
    console.error('[DEBUG] Detailed error in DALL-E composition:');
    console.error('[DEBUG] Error type:', error.constructor?.name);
    console.error('[DEBUG] Error message:', error.message);
    console.error('[DEBUG] Full error:', error);
    
    if (error.status) {
      console.error('[DEBUG] HTTP Status:', error.status);
    }
    if (error.error) {
      console.error('[DEBUG] API Error details:', error.error);
    }
    
    throw new Error(`Failed to compose product with DALL-E: ${error.message || 'Unknown error'}`);
  }
}

async function downloadAndSaveImage(imageUrl: string, prefix: string = 'composed_product'): Promise<string> {
  try {
    // Create output directory if it doesn't exist
    await mkdir('output', { recursive: true });
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.png`;
    const filepath = join('output', filename);
    
    console.log(`[DEBUG] Downloading composed image from: ${imageUrl}`);
    
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

async function saveBase64Image(base64Data: string, prefix: string = 'composed_product'): Promise<string> {
  try {
    // Create output directory if it doesn't exist
    await mkdir('output', { recursive: true });
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.png`;
    const filepath = join('output', filename);
    
    console.log(`[DEBUG] Saving base64 image to: ${filepath}`);
    
    // Convert base64 to buffer and save
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);
    
    console.log(`[DEBUG] Base64 image saved to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error('[DEBUG] Error saving base64 image:', error);
    throw error;
  }
}

function validateWorkflowInputs(
  workflowType: string,
  hasProduct: boolean,
  hasDesign: boolean,
  hasColor: boolean,
  hasPrompt: boolean
): { valid: boolean; error?: string } {
  switch (workflowType) {
    case 'full_composition':
      if (!hasProduct || !hasDesign || !hasColor) {
        return { valid: false, error: 'Full composition requires product, design, and color images' };
      }
      break;
    
    case 'product_color':
      if (!hasProduct || !hasColor) {
        return { valid: false, error: 'Product+Color workflow requires both product and color images' };
      }
      break;
    
    case 'product_design':
      if (!hasProduct || !hasDesign) {
        return { valid: false, error: 'Product+Design workflow requires both product and design images' };
      }
      break;
    
    case 'color_design':
      if (!hasColor && !hasDesign) {
        return { valid: false, error: 'Color+Design workflow requires at least one of: color image or design image' };
      }
      if (!hasPrompt) {
        return { valid: false, error: 'Color+Design workflow requires a prompt describing the desired product' };
      }
      break;
    
    case 'prompt_only':
      if (!hasPrompt) {
        return { valid: false, error: 'Prompt-only workflow requires a text prompt' };
      }
      if (hasProduct || hasDesign || hasColor) {
        return { valid: false, error: 'Prompt-only workflow should not include any images' };
      }
      break;
    
    case 'product_prompt':
      if (!hasProduct) {
        return { valid: false, error: 'Product+Prompt workflow requires a product image' };
      }
      if (!hasPrompt) {
        return { valid: false, error: 'Product+Prompt workflow requires a custom prompt' };
      }
      if (hasDesign || hasColor) {
        return { valid: false, error: 'Product+Prompt workflow should only include product image and prompt' };
      }
      break;
    
    default:
      return { valid: false, error: `Unknown workflow type: ${workflowType}` };
  }
  
  return { valid: true };
}

// Add image analysis function before the existing functions
async function analyzeImageWithGPT4Vision(imageUrl: string, analysisType: string): Promise<string> {
  try {
    console.log(`[DEBUG] Analyzing image with GPT-4 Vision: ${analysisType}`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${analysisType} image in detail. Describe:
              - The main object/product and its shape, form factor
              - Materials, textures, and surface finishes 
              - Colors, patterns, and visual design elements
              - Style, aesthetic, and design language
              - Any unique or distinctive features
              Provide a detailed, technical description that could be used to recreate similar design elements.`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const analysis = response.choices[0].message.content || "";
    console.log(`[DEBUG] ${analysisType} analysis: ${analysis.substring(0, 200)}...`);
    return analysis;
  } catch (error) {
    console.error(`[DEBUG] Error analyzing ${analysisType} image:`, error);
    return `Unable to analyze ${analysisType} image`;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    // Get images
    const productImage = formData.get('product_image') as File | null;
    const designImage = formData.get('design_image') as File | null;
    const colorImage = formData.get('color_image') as File | null;
    
    // Get parameters
    const workflow_type = (formData.get('workflow_type') as string) || 'full_composition';
    const prompt = formData.get('prompt') as string || undefined;
    const size = (formData.get('size') as string) || '1024x1024';
    const quality = (formData.get('quality') as string) || 'standard';
    const n = parseInt(formData.get('n') as string) || 1;
    
    console.log('[DEBUG] Starting Product Composition workflow...');
    console.log(`[DEBUG] Workflow type: ${workflow_type}`);
    console.log(`[DEBUG] Has product: ${!!productImage}, design: ${!!designImage}, color: ${!!colorImage}`);
    console.log(`[DEBUG] Custom prompt: ${prompt || 'None'}`);
    
    // Validate inputs based on workflow type
    const validation = validateWorkflowInputs(
      workflow_type,
      !!productImage,
      !!designImage,
      !!colorImage,
      !!prompt
    );
    
    if (!validation.valid) {
      return NextResponse.json(
        { status: 'error', error: validation.error },
        { status: 400 }
      );
    }
    
    // Save uploaded images temporarily
    const tempPaths: string[] = [];
    const imageUrls: string[] = [];
    
    try {
      // Upload images to Cloudinary for analysis
      const imageUrls: string[] = [];
      let productAnalysis = "";
      let designAnalysis = "";  
      let colorAnalysis = "";

      if (productImage) {
        console.log('[DEBUG] Product image uploaded to Cloudinary');
        const tempPath = await saveFileToTemp(productImage, 'product');
        tempPaths.push(tempPath);
        const productUrl = await uploadToCloudinary(tempPath, 'temp_compose_product');
        imageUrls.push(productUrl);
        productAnalysis = await analyzeImageWithGPT4Vision(productUrl, 'product');
      }

      if (designImage) {
        console.log('[DEBUG] Design image uploaded to Cloudinary');
        const tempPath = await saveFileToTemp(designImage, 'design');
        tempPaths.push(tempPath);
        const designUrl = await uploadToCloudinary(tempPath, 'temp_compose_product');
        imageUrls.push(designUrl);
        designAnalysis = await analyzeImageWithGPT4Vision(designUrl, 'design reference');
      }

      if (colorImage) {
        console.log('[DEBUG] Color image uploaded to Cloudinary');
        const tempPath = await saveFileToTemp(colorImage, 'color');
        tempPaths.push(tempPath);
        const colorUrl = await uploadToCloudinary(tempPath, 'temp_compose_product');
        imageUrls.push(colorUrl);
        colorAnalysis = await analyzeImageWithGPT4Vision(colorUrl, 'color reference');
      }

      // Generate enhanced prompt based on workflow type and image analyses
      let generatedPrompt: string = prompt || "Create an innovative product design";
      
      if (workflow_type === 'full_composition' && productAnalysis && designAnalysis && colorAnalysis) {
        generatedPrompt = `Create a new product that combines these elements:
        
        BASE PRODUCT: ${productAnalysis}
        
        DESIGN INSPIRATION: ${designAnalysis}
        
        COLOR PALETTE: ${colorAnalysis}
        
        USER REQUEST: ${prompt}
        
        Generate a photorealistic cohesive product design that maintains the form factor,materials, texture and core functionality of the base product while incorporating the design language and color scheme from the references. no texta or fonts are allowed`;
      } else if (workflow_type === 'product_color' && productAnalysis && colorAnalysis) {
        generatedPrompt = `Create a new version of this product with updated colors:
        
        ORIGINAL PRODUCT: ${productAnalysis}
        
        COLOR REFERENCE: ${colorAnalysis}
        
        USER REQUEST: ${prompt}
        
        Maintain the exact same product design, materials, texture and form factor, but apply the color palette and finish style from the color reference, making it look like a new product and photorealistic. no texta or fonts are allowed`;
      } else if (workflow_type === 'product_design' && productAnalysis && designAnalysis) {
        generatedPrompt = `Create a new version of this product with updated design elements:
        
        ORIGINAL PRODUCT: ${productAnalysis}
        
        DESIGN REFERENCE: ${designAnalysis}
        
        USER REQUEST: ${prompt}
        
        Keep the core functionality and general form factor, texture but incorporate the design patterns, textures, and aesthetic elements from the design reference. mkaing it a new product and photorealistic. no texta or fonts are allowed`;
      } else if (workflow_type === 'color_design') {
        if (colorAnalysis && designAnalysis) {
          // Both color and design references
          generatedPrompt = `Create a new product inspired by these references:
        
        DESIGN INSPIRATION: ${designAnalysis}
        
        COLOR PALETTE: ${colorAnalysis}
        
        USER REQUEST: ${prompt}
        
        Create an innovative product that combines the design language from the first reference with the color scheme from the second reference. Generate a photorealistic, cohesive design. No text or fonts are allowed.`;
        } else if (colorAnalysis) {
          // Only color reference
          generatedPrompt = `Create a new product inspired by this color palette:
        
        COLOR PALETTE: ${colorAnalysis}
        
        USER REQUEST: ${prompt}
        
        Design an innovative product that incorporates the colors, patterns, and visual style from the reference image. Generate a photorealistic design. No text or fonts are allowed.`;
        } else if (designAnalysis) {
          // Only design reference
          generatedPrompt = `Create a new product inspired by this design:
        
        DESIGN INSPIRATION: ${designAnalysis}
        
        USER REQUEST: ${prompt}
        
        Design an innovative product that incorporates the design patterns, textures, and aesthetic elements from the reference image. Generate a photorealistic design. No text or fonts are allowed.`;
        }
      } else if (workflow_type === 'prompt_only') {
        // Pure text-to-image generation
        generatedPrompt = `Create a new innovative product design:
        
        USER REQUEST: ${prompt}
        
        Generate a photorealistic, high-quality product design based on this description. Focus on modern aesthetics, functionality, and visual appeal. No text or fonts are allowed.`;
      } else if (workflow_type === 'product_prompt' && productAnalysis) {
        // Product + custom prompt
        generatedPrompt = `Create a new version of this product:
        
        ORIGINAL PRODUCT: ${productAnalysis}
        
        USER REQUEST: ${prompt}
        
        Maintain the core product identity and form factor while incorporating the requested changes or enhancements. Generate a photorealistic design that evolves the original product. No text or fonts are allowed.`;
      }

      console.log(`[DEBUG] Generated enhanced prompt: ${generatedPrompt.substring(0, 300)}...`);
      
      // Compose the product using DALL-E
      const composedImageResults = await composeProductWithDALLE(imageUrls, generatedPrompt, {
        size,
        quality,
        n
      });
      
      if (!composedImageResults.length) {
        throw new Error('No images were generated');
      }
      
      console.log('[DEBUG] Product composition completed!');
      
      // Download and save the composed image
      let localPath: string;
      const firstResult = composedImageResults[0];
      
      if (firstResult.type === 'base64') {
        // Save base64 data directly
        localPath = await saveBase64Image(firstResult.data, workflow_type);
      } else {
        // Download from URL
        localPath = await downloadAndSaveImage(firstResult.data, workflow_type);
      }
      
      // Upload result to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(localPath, 'compose_product_results');
      console.log('[DEBUG] Result uploaded to Cloudinary:', cloudinaryUrl);
      
      // Clean up temp files
      tempPaths.forEach(path => {
        try {
          const fs = require('fs');
          fs.unlinkSync(path);
        } catch (cleanupError) {
          console.warn('[DEBUG] Could not clean up temporary file:', path);
        }
      });
      console.log('[DEBUG] Temporary files cleaned up');
      
      const response: ComposeProductResponse = {
        status: 'success',
        output_image: firstResult.data,
        cloudinaryUrl: cloudinaryUrl,
        localPath: localPath,
        workflow_type: workflow_type,
        generated_prompt: generatedPrompt,
        note: `Product composition workflow: ${workflow_type} - Combined ${imageUrls.length} reference images using ${firstResult.type === 'base64' ? 'gpt-image-1' : 'DALL-E'}`,
      };
      
      return NextResponse.json(response);
      
    } catch (processingError) {
      // Clean up temp files on error
      tempPaths.forEach(path => {
        try {
          const fs = require('fs');
          fs.unlinkSync(path);
        } catch (cleanupError) {
          console.warn('[DEBUG] Could not clean up temporary file after error:', path);
        }
      });
      throw processingError;
    }
    
  } catch (error: any) {
    console.error('[DEBUG] API Error:', error);
    
    const response: ComposeProductResponse = {
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
    message: 'Compose Product API is running',
    endpoints: {
      POST: {
        description: 'Compose a new product design using different combinations of reference images',
        parameters: {
          product_image: 'File (conditional) - Product reference image',
          design_image: 'File (conditional) - Design pattern reference image',
          color_image: 'File (conditional) - Color palette reference image',
          workflow_type: 'string (optional) - Workflow type: full_composition, product_color, product_design, color_design, prompt_only, product_prompt (default: full_composition)',
          prompt: 'string (optional) - Custom prompt to guide the composition (required for color_design, prompt_only, product_prompt workflows)',
          size: 'string (optional) - Output image size: 1024x1024, 1024x1792, 1792x1024 (default: 1024x1024)',
          quality: 'string (optional) - Image quality: standard, hd (default: standard)',
          n: 'number (optional) - Number of images to generate (default: 1)',
        },
        workflows: {
          full_composition: 'Requires: product_image, design_image, color_image - Combines all elements',
          product_color: 'Requires: product_image, color_image - Applies color scheme to product',
          product_design: 'Requires: product_image, design_image - Applies design patterns to product',
          color_design: 'Requires: (color_image OR design_image), prompt - Creates new product from color and/or design references',
          prompt_only: 'Requires: prompt - Generates product from text description only',
          product_prompt: 'Requires: product_image, prompt - Enhances existing product based on text instructions'
        }
      },
    },
  });
}