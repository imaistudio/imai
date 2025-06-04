import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import sharp from 'sharp';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface ComposeProductResponse {
  status: string;
  firebaseInputUrls?: {
    product?: string;
    design?: string;
    color?: string;
  };
  firebaseOutputUrl?: string;
  workflow_type?: string;
  generated_prompt?: string;
  revised_prompt?: string;
  response_id?: string;
  model_used?: string;
  generation_method?: 'responses_api' | 'image_api';
  streaming_supported?: boolean;
  error?: string;
}

/**
 * Uploads a Buffer to Firebase Storage under the given path, and returns a signed URL.
 */
async function uploadBufferToFirebase(
  buffer: Buffer,
  destinationPath: string
): Promise<string> {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error('Invalid buffer: Buffer is empty or undefined');
    }

    if (!destinationPath) {
      throw new Error('Invalid destination path: Path is empty or undefined');
    }

    console.log(`Uploading to Firebase Storage: ${destinationPath}, size: ${buffer.length} bytes`);
    
    const bucket = getStorage().bucket();
    if (!bucket) {
      throw new Error('Failed to get Firebase Storage bucket');
    }

    const file = bucket.file(destinationPath);

    // Save the buffer as a JPEG
    await file.save(buffer, {
      metadata: { 
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=3600'
      },
      resumable: false,
    });

    console.log('File uploaded successfully, generating signed URL...');

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    if (!signedUrl) {
      throw new Error('Failed to generate signed URL');
    }

    console.log('Signed URL generated successfully');
    return signedUrl;
  } catch (error: any) {
    console.error('Error uploading to Firebase Storage:', error);
    throw new Error(`Failed to upload to Firebase Storage: ${error.message}`);
  }
}

/**
 * Converts an input File object (from FormData) to a JPEG Buffer.
 */
async function fileToJpegBuffer(file: File): Promise<Buffer> {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error(`Invalid file type: ${file.type}. Only image files are supported.`);
    }

    console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
    
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Failed to read file data');
    }

    const inputBuffer = Buffer.from(arrayBuffer);
    
    // Validate the input buffer
    if (!inputBuffer || inputBuffer.length === 0) {
      throw new Error('Failed to create buffer from file data');
    }

    // Use sharp to convert any input image format to JPEG
    const jpegBuffer = await sharp(inputBuffer)
      .jpeg({ quality: 90 }) // Set a reasonable quality
      .toBuffer();

    if (!jpegBuffer || jpegBuffer.length === 0) {
      throw new Error('Failed to convert image to JPEG format');
    }

    console.log(`Successfully converted image to JPEG, size: ${jpegBuffer.length} bytes`);
    return jpegBuffer;
  } catch (error: any) {
    console.error('Error in fileToJpegBuffer:', error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Validates the required inputs for each workflow type.
 */
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
      return { valid: false, error: 'full_composition requires product, design, and color images' };
    }
    break;

  case 'product_color':
    if (!hasProduct || !hasColor || hasDesign) {
      return { valid: false, error: 'product_color requires product and color images (no design image)' };
    }
    break;

  case 'product_design':
    if (!hasProduct || !hasDesign || hasColor) {
      return { valid: false, error: 'product_design requires product and design images (no color image)' };
    }
    break;

  case 'color_design':
    if ((!hasColor && !hasDesign) || !hasPrompt || hasProduct) {
      return { valid: false, error: 'color_design requires color/design and prompt, but no product' };
    }
    break;

  case 'color_prompt':
    if (!hasColor || !hasPrompt || hasProduct || hasDesign) {
      return { valid: false, error: 'color_prompt requires only color image and prompt' };
    }
    break;

  case 'design_prompt':
    if (!hasDesign || !hasPrompt || hasProduct || hasColor) {
      return { valid: false, error: 'design_prompt requires only design image and prompt' };
    }
    break;

  case 'product_prompt':
    if (!hasProduct || !hasPrompt || hasDesign || hasColor) {
      return { valid: false, error: 'product_prompt requires only product and prompt (no design or color)' };
    }
    break;

  case 'prompt_only':
    if (!hasPrompt || hasProduct || hasDesign || hasColor) {
      return { valid: false, error: 'prompt_only requires only a prompt (no images)' };
    }
    break;

  default:
    return { valid: false, error: `Unknown workflow type: ${workflowType}` };
  }

  return { valid: true };
}

/**
 * Generates a workflow prompt based on type, optional analyses, and user prompt.
 */
function generateWorkflowPrompt(
  workflowType: string,
  userPrompt?: string,
  productAnalysis?: string,
  designAnalysis?: string,
  colorAnalysis?: string
): string {
  switch (workflowType) {
    case 'full_composition':
      const baseFullPrompt = `Create a photorealistic version of the original product, drawing design inspiration only and not the colors from the design reference and applying the colors from the color reference. Strictly retain the original product's shape, structure, proportions, and geometry — do not alter its form, dimensions, or silhouette. The design reference should inspire creative visual elements, patterns, or stylistic approaches, but not be directly copied or imprinted. The color reference should only provide the color palette and color scheme to apply.

BASE PRODUCT ANALYSIS: ${productAnalysis}
DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
COLOR PALETTE ANALYSIS: ${colorAnalysis}`;
      
      if (userPrompt) {
        return `${baseFullPrompt}

USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      }
      return `${baseFullPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'product_color':
      const baseColorPrompt = `Apply only the color palette and color scheme from the color reference image to the product while maintaining its original design and structure. Extract only the colors from the reference - do not copy any design patterns, textures, or visual elements. Keep all product details but transform only the colors to match the reference palette. Photorealistic.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
COLOR PALETTE ANALYSIS: ${colorAnalysis}`;
      
      if (userPrompt) {
        return `${baseColorPrompt}

USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      }
      return `${baseColorPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'product_design':
      const baseDesignPrompt = `Create a new version of the product drawing creative inspiration from the design reference. Use the design reference as inspiration for visual style, creative direction, or artistic approach - but do not directly copy or imprint the design onto the product. Maintain the product's original form and structure while creating something inspired by the reference's aesthetic sensibility. Photorealistic.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
DESIGN INSPIRATION ANALYSIS: ${designAnalysis}`;
      
      if (userPrompt) {
        return `${baseDesignPrompt}

USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      }
      return `${baseDesignPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'color_design':
      if (colorAnalysis && designAnalysis) {
        return `Create a new product design that draws color inspiration from the color reference and design inspiration from the design reference. Use the color reference only for its color palette and the design reference only for creative inspiration and stylistic direction. Generate a cohesive product that incorporates both elements thoughtfully. Photorealistic.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
COLOR PALETTE ANALYSIS: ${colorAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      } else if (colorAnalysis) {
        return `Create a product using this color palette for inspiration.

COLOR PALETTE ANALYSIS: ${colorAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      } else {
        return `Create a product drawing inspiration from this design reference.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;
      }

    case 'color_prompt':
      return `Create a new product design using this color palette as inspiration and following the user's description.

COLOR PALETTE ANALYSIS: ${colorAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'design_prompt':
      return `Create a new product design drawing creative inspiration from this design reference and following the user's description. Use the design reference for inspiration and creative direction, not for direct copying.

DESIGN INSPIRATION ANALYSIS: ${designAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'prompt_only':
      return `Create a new innovative photorealistic product design based on the provided description. Generate a photorealistic, high-quality product design.

USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    case 'product_prompt':
      return `Create a new version or variation of the provided product based on the custom description. Maintain the core product identity while incorporating the requested changes. Generate a photorealistic design.

ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
USER PROMPT: ${userPrompt}

No text or fonts allowed. ALWAYS KEEP THE PRODUCT IN THE SAME POSITION AND ORIENTATION.`;

    default:
      return userPrompt || '';
  }
}

/**
 * Sends an image URL to GPT-4 Vision to get a textual analysis.
 */
async function analyzeImageWithGPT4Vision(imageUrl: string, analysisType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this ${analysisType} image in detail for AI image generation. Describe the visual elements, colors, patterns, textures, materials, style, and any distinctive features that would be useful for recreating or referencing these qualities in a new design. Be specific and technical.`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 800,
    });

    return response.choices[0].message.content || '';
  } catch (err) {
    console.error(`Error analyzing ${analysisType} image:`, err);
    return '';
  }
}

/**
 * Converts an image URL to a base64 data URL
 */
async function urlToBase64DataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // Determine MIME type from response headers or assume JPEG
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error('Error converting URL to base64:', err);
    throw err;
  }
}

/**
 * Upload image to OpenAI Files API and return file ID
 */
async function uploadImageToFiles(imageUrl: string, filename: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a File-like object for OpenAI
    const file = new File([buffer], filename, { type: 'image/jpeg' });
    
    const uploadResponse = await openai.files.create({
      file: file,
      purpose: 'vision',
    });

    return uploadResponse.id;
  } catch (err) {
    console.error('Error uploading to OpenAI Files:', err);
    throw err;
  }
}

/**
 * Generate images using the Responses API with GPT Image
 */
async function generateWithResponsesAPI(
  prompt: string,
  options: { 
    size?: string; 
    quality?: string; 
    n?: number; 
    background?: string;
    output_format?: string;
    output_compression?: number;
    stream?: boolean;
    partial_images?: number;
  },
  imageUrls?: { product?: string; design?: string; color?: string },
  mainlineModel: string = 'gpt-4.1'
): Promise<{
  images: Array<{ type: 'url' | 'base64'; data: string }>;
  response_id?: string;
  revised_prompt?: string;
}> {
  try {
    console.log('Using Responses API with GPT Image...');

    // Prepare input content
    const inputContent: any[] = [
      {
        type: 'input_text',
        text: `Generate an image based on this prompt: ${prompt}`
      }
    ];

    // Add image inputs if provided
    if (imageUrls) {
      if (imageUrls.product) {
        try {
          const fileId = await uploadImageToFiles(imageUrls.product, 'product.jpg');
          inputContent.push({
            type: 'input_image',
            file_id: fileId
          });
        } catch (err) {
          console.warn('Failed to upload product image to Files API, skipping:', err);
        }
      }
      if (imageUrls.design) {
        try {
          const fileId = await uploadImageToFiles(imageUrls.design, 'design.jpg');
          inputContent.push({
            type: 'input_image',
            file_id: fileId
          });
        } catch (err) {
          console.warn('Failed to upload design image to Files API, skipping:', err);
        }
      }
      if (imageUrls.color) {
        try {
          const fileId = await uploadImageToFiles(imageUrls.color, 'color.jpg');
          inputContent.push({
            type: 'input_image',
            file_id: fileId
          });
        } catch (err) {
          console.warn('Failed to upload color image to Files API, skipping:', err);
        }
      }
    }

    // Prepare image generation tool options
    const imageGenTool: any = {
      type: 'image_generation',
    };

    // Add partial images for streaming if enabled
    if (options.stream && options.partial_images) {
      imageGenTool.partial_images = Math.min(Math.max(options.partial_images, 1), 3);
    }

    // Additional options for image generation
    if (options.size) imageGenTool.size = options.size;
    if (options.quality) imageGenTool.quality = options.quality;
    if (options.background) imageGenTool.background = options.background;
    if (options.output_format) imageGenTool.output_format = options.output_format;
    if (options.output_compression) imageGenTool.output_compression = options.output_compression;

    const responseParams: any = {
      model: mainlineModel,
      input: [
        {
          role: 'user',
          content: inputContent
        }
      ],
      tools: [imageGenTool],
    };

    if (options.stream) {
      responseParams.stream = true;
      
      // For streaming, we would need to handle the stream properly
      // For now, we'll fall back to non-streaming
      console.log('Streaming requested but not implemented in this version, using non-streaming...');
      responseParams.stream = false;
    }

    const response = await openai.responses.create(responseParams);

    // Extract image generation results - using any type to handle potential API changes
    const imageGenerationCalls = (response.output as any[]).filter((output: any) => output.type === 'image_generation_call');
    
    if (imageGenerationCalls.length === 0) {
      throw new Error('No image generation calls found in response');
    }

    const firstCall = imageGenerationCalls[0];
    
    // Handle different possible property names for the image data
    const imageData = firstCall.result || firstCall.b64_json || firstCall.data;
    if (!imageData) {
      throw new Error('No image data found in response');
    }

    const images = [{
      type: 'base64' as const,
      data: imageData
    }];

    return {
      images,
      response_id: response.id,
      revised_prompt: firstCall.revised_prompt || undefined
    };

  } catch (err) {
    console.error('Error with Responses API:', err);
    throw err;
  }
}

/**
 * Composes product images with GPT Image, using Responses API first, then fallback to Image API
 */
async function composeProductWithGPTImage(
  prompt: string,
  options: { 
    size: any; 
    quality: string; 
    n: number;
    background?: string;
    output_format?: string;
    output_compression?: number;
    stream?: boolean;
    partial_images?: number;
  },
  imageUrls?: { product?: string; design?: string; color?: string }
): Promise<{
  results: Array<{ type: 'url' | 'base64'; data: string }>;
  response_id?: string;
  revised_prompt?: string;
  method: 'responses_api' | 'image_api';
}> {
  try {
    // Try Responses API first if we have image inputs or streaming is requested
    if ((imageUrls && (imageUrls.product || imageUrls.design || imageUrls.color)) || options.stream) {
      try {
        const responsesResult = await generateWithResponsesAPI(prompt, options, imageUrls);
        return {
          results: responsesResult.images,
          response_id: responsesResult.response_id,
          revised_prompt: responsesResult.revised_prompt,
          method: 'responses_api'
        };
      } catch (responsesError) {
        console.log('Responses API failed, falling back to Image API:', responsesError);
      }
    }

    // Fallback to Image API
    console.log('Using Image API...');
    
    let gptImageQuality = options.quality;
    if (gptImageQuality === 'standard') gptImageQuality = 'medium';
    if (!['low', 'medium', 'high', 'auto'].includes(gptImageQuality)) {
      gptImageQuality = 'medium';
    }

    const imageParams: any = {
      model: 'gpt-image-1',
      prompt: prompt,
      size: options.size,
      quality: gptImageQuality,
      n: options.n,
    };

    // Add additional options
    if (options.background) imageParams.background = options.background;
    if (options.output_format) imageParams.output_format = options.output_format;
    if (options.output_compression) imageParams.output_compression = options.output_compression;

    const response = await openai.images.generate(imageParams);

    if (!response.data || response.data.length === 0) {
      throw new Error('No images returned from GPT Image');
    }

    const results = response.data.map(img => {
      if (img.b64_json) {
        return { type: 'base64' as const, data: img.b64_json };
      } else if (img.url) {
        return { type: 'url' as const, data: img.url };
      } else {
        throw new Error('Unexpected image format from GPT Image');
      }
    });

    return {
      results,
      method: 'image_api'
    };
  } catch (err) {
    console.error('Error composing with GPT Image:', err);
    throw err;
  }
}

/**
 * Determines which workflow to run based on presence of product/design/color images and a prompt.
 */
function determineWorkflowType(
  hasProduct: boolean,
  hasDesign: boolean,
  hasColor: boolean,
  hasPrompt: boolean
): string {
  // Product-based workflows (when we have a product image)
  if (hasProduct) {
    // 1) All three images → full_composition (prompt optional)
    if (hasDesign && hasColor) {
      return 'full_composition';
    }
    
    // 2) Product + Design only → product_design (prompt optional)
    if (hasDesign && !hasColor) {
      return 'product_design';
    }
    
    // 3) Product + Color only → product_color (prompt optional)
    if (!hasDesign && hasColor) {
      return 'product_color';
    }
    
    // 4) Product + Prompt only → product_prompt
    if (!hasDesign && !hasColor && hasPrompt) {
      return 'product_prompt';
    }
    
    // 5) Product only (no other inputs) → not supported
    if (!hasDesign && !hasColor && !hasPrompt) {
      throw new Error('Product image alone is not sufficient. Please provide either: design image, color image, or a text prompt along with the product image.');
    }
  }
  
  // Non-product workflows (when we don't have a product image)
  if (!hasProduct) {
    // 6) Design + Color + prompt → color_design
    if (hasDesign && hasColor && hasPrompt) {
      return 'color_design';
    }
    
    // 7) Design + prompt (no color) → design_prompt
    if (hasDesign && !hasColor && hasPrompt) {
      return 'design_prompt';
    }
    
    // 8) Color + prompt (no design) → color_prompt
    if (!hasDesign && hasColor && hasPrompt) {
      return 'color_prompt';
    }
    
    // 9) Prompt only → prompt_only
    if (!hasDesign && !hasColor && hasPrompt) {
      return 'prompt_only';
    }
    
    // 10) No valid combination
    if (hasDesign || hasColor) {
      throw new Error('Design or color images require a text prompt when no product image is provided.');
    }
  }

  // Fallback error for any other invalid combinations
  throw new Error(
    `Invalid input combination. Please provide one of the following:
     • Product + Design + Color (± prompt)
     • Product + Design (± prompt) 
     • Product + Color (± prompt)
     • Product + Prompt
     • Design + Color + Prompt
     • Design + Prompt
     • Color + Prompt
     • Prompt only
     
     Current inputs: product=${hasProduct}, design=${hasDesign}, color=${hasColor}, prompt=${hasPrompt}`
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // 1) Extract and validate userid
    const userid = (formData.get('userid') as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: 'error', error: 'Missing "userid" parameter' },
        { status: 400 }
      );
    }
    try {
      await getAuth().getUser(userid);
    } catch {
      return NextResponse.json(
        { status: 'error', error: 'Invalid Firebase user ID' },
        { status: 400 }
      );
    }

    // 2) Retrieve files (if any) and prompt
    const productImage = formData.get('product_image') as File | null;
    const designImage  = formData.get('design_image')  as File | null;
    const colorImage   = formData.get('color_image')   as File | null;
    const prompt       = (formData.get('prompt') as string)?.trim() || '';

    // 3) Infer workflow_type based on which inputs are present
    let workflow_type: string;
    try {
      workflow_type = determineWorkflowType(
        !!productImage,
        !!designImage,
        !!colorImage,
        !!prompt
      );
    } catch (e: any) {
      return NextResponse.json(
        { status: 'error', error: e.message },
        { status: 400 }
      );
    }

    // 4) Retrieve enhanced generation parameters
    const size = (formData.get('size') as string) || '1024x1024';
    const quality = (formData.get('quality') as string) || 'auto';
    const n = parseInt((formData.get('n') as string) || '1', 10);
    const background = (formData.get('background') as string) || 'opaque';
    const outputFormat = (formData.get('output_format') as string) || 'png';
    const outputCompression = parseInt((formData.get('output_compression') as string) || '0', 10);
    const stream = (formData.get('stream') as string) === 'true';
    const partialImages = parseInt((formData.get('partial_images') as string) || '2', 10);
    const mainlineModel = (formData.get('mainline_model') as string) || 'gpt-4.1';

    // 5) Validate that this inferred workflow is valid
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

    // 6) Upload input images to Firebase Storage and run analyses
    const inputUrls: { product?: string; design?: string; color?: string } = {};
    const analyses: { product?: string; design?: string; color?: string } = {};

    try {
      if (productImage) {
        console.log('Processing product image...');
        const productBuffer = await fileToJpegBuffer(productImage);
        const productPath = `${userid}/input/${uuidv4()}.jpg`;
        const productUrl = await uploadBufferToFirebase(productBuffer, productPath);
        inputUrls.product = productUrl;
        analyses.product = await analyzeImageWithGPT4Vision(productUrl, 'product');
        console.log('Product image processed successfully');
      }

      if (designImage) {
        console.log('Processing design image...');
        const designBuffer = await fileToJpegBuffer(designImage);
        const designPath = `${userid}/input/${uuidv4()}.jpg`;
        const designUrl = await uploadBufferToFirebase(designBuffer, designPath);
        inputUrls.design = designUrl;
        analyses.design = await analyzeImageWithGPT4Vision(designUrl, 'design reference');
        console.log('Design image processed successfully');
      }

      if (colorImage) {
        console.log('Processing color image...');
        const colorBuffer = await fileToJpegBuffer(colorImage);
        const colorPath = `${userid}/input/${uuidv4()}.jpg`;
        const colorUrl = await uploadBufferToFirebase(colorBuffer, colorPath);
        inputUrls.color = colorUrl;
        analyses.color = await analyzeImageWithGPT4Vision(colorUrl, 'color reference');
        console.log('Color image processed successfully');
      }
    } catch (error: any) {
      console.error('Error processing images:', error);
      const errorMessage = error?.message || 'Unknown error occurred while processing images';
      return NextResponse.json(
        { status: 'error', error: errorMessage },
        { status: 500 }
      );
    }

    // 7) Build the enhanced prompt
    const workflowPrompt = generateWorkflowPrompt(
      workflow_type,
      prompt || undefined,
      analyses.product,
      analyses.design,
      analyses.color
    );

    // 8) Generate the product with enhanced options
    const generationOptions = {
      size,
      quality,
      n,
      background: background !== 'opaque' ? background : undefined,
      output_format: outputFormat !== 'png' ? outputFormat : undefined,
      output_compression: outputCompression > 0 ? outputCompression : undefined,
      stream,
      partial_images: partialImages,
    };

    const generationResult = await composeProductWithGPTImage(
      workflowPrompt, 
      generationOptions,
      inputUrls
    );

    if (generationResult.results.length === 0) {
      throw new Error('GPT Image returned no images');
    }

    const firstResult = generationResult.results[0];
    let outputJpegBuffer: Buffer;

    if (firstResult.type === 'base64') {
      // Convert base64 directly to JPEG buffer
      const rawBuffer = Buffer.from(firstResult.data, 'base64');
      outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
    } else {
      // Fetch the URL, then convert to JPEG buffer
      const response = await fetch(firstResult.data);
      if (!response.ok) {
        throw new Error(`Failed to fetch GPT Image URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);
      outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
    }

    // 9) Upload the composed output to Firebase Storage
    const outputPath = `${userid}/output/${uuidv4()}.jpg`;
    const firebaseOutputUrl = await uploadBufferToFirebase(outputJpegBuffer, outputPath);

    // 10) Return enhanced success response
    const responsePayload: ComposeProductResponse = {
      status: 'success',
      firebaseInputUrls: inputUrls,
      firebaseOutputUrl,
      workflow_type,
      generated_prompt: workflowPrompt,
      revised_prompt: generationResult.revised_prompt,
      response_id: generationResult.response_id,
      model_used: 'gpt-image-1',
      generation_method: generationResult.method,
      streaming_supported: stream && generationResult.method === 'responses_api',
    };
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error('API Error:', err);
    const errorResponse: ComposeProductResponse = {
      status: 'error',
      error: err.message || 'Unknown error occurred',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}