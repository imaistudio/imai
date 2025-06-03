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
    const bucket = getStorage().bucket();
    const file = bucket.file(destinationPath);

    // Save the buffer as a JPEG
    await file.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
      resumable: false,
    });

    // Generate a signed URL valid for 1 hour
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });

    return signedUrl;
  } catch (err) {
    console.error('Error uploading to Firebase Storage:', err);
    throw err;
  }
}

/**
 * Converts an input File object (from FormData) to a JPEG Buffer.
 */
async function fileToJpegBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);
  // Use sharp to convert any input image format to JPEG
  return sharp(inputBuffer).jpeg().toBuffer();
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
    if (!hasProduct || !hasColor || hasDesign || hasPrompt) {
      return { valid: false, error: 'product_color requires only product and color images' };
    }
    break;

  case 'product_design':
    if (!hasProduct || !hasDesign || hasColor || hasPrompt) {
      return { valid: false, error: 'product_design requires only product and design images' };
    }
    break;

  case 'color_design':
    if ((!hasColor && !hasDesign) || !hasPrompt || hasProduct) {
      return { valid: false, error: 'color_design requires color/design and prompt, but no product' };
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
  if (userPrompt && ['color_design', 'prompt_only', 'product_prompt'].includes(workflowType)) {
    return userPrompt;
  }

  switch (workflowType) {
    case 'full_composition':
      return `Create a photorealistic version of the original product, incorporating design elements and color palette. 
BASE PRODUCT ANALYSIS: ${productAnalysis}
DESIGN REFERENCE ANALYSIS: ${designAnalysis}
COLOR REFERENCE ANALYSIS: ${colorAnalysis}
No text or fonts allowed.`;

    case 'product_color':
      return `Apply the color palette from the reference image to the product while preserving its original design.
ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
COLOR REFERENCE ANALYSIS: ${colorAnalysis}
No text or fonts allowed.`;

    case 'product_design':
      return `Apply design patterns from the design reference to the product, maintaining its form.
ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
DESIGN REFERENCE ANALYSIS: ${designAnalysis}
No text or fonts allowed.`;

    case 'color_design':
      if (colorAnalysis && designAnalysis) {
        return `Combine this design reference and color palette to create a new product.
DESIGN REFERENCE ANALYSIS: ${designAnalysis}
COLOR REFERENCE ANALYSIS: ${colorAnalysis}
No text or fonts allowed.`;
      } else if (colorAnalysis) {
        return `Create a product using this color palette.
COLOR REFERENCE ANALYSIS: ${colorAnalysis}
No text or fonts allowed.`;
      } else {
        return `Create a product using this design reference.
DESIGN REFERENCE ANALYSIS: ${designAnalysis}
No text or fonts allowed.`;
      }

    case 'prompt_only':
      return `Generate a photorealistic product design based solely on this prompt:
USER PROMPT: ${userPrompt}
No text or fonts allowed.`;

    case 'product_prompt':
      return `Enhance this product according to the prompt:
ORIGINAL PRODUCT ANALYSIS: ${productAnalysis}
USER PROMPT: ${userPrompt}
No text or fonts allowed.`;

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
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this ${analysisType} image in detail. Describe the product's form, materials, colors, patterns, and any distinctive features. Provide a technical description.`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || '';
  } catch (err) {
    console.error(`Error analyzing ${analysisType} image:`, err);
    return '';
  }
}

/**
 * Composes product images with DALL·E, returning either base64 or URL results.
 */
async function composeProductWithDALLE(
  prompt: string,
  options: { size: any; quality: string; n: number }
): Promise<Array<{ type: 'url' | 'base64'; data: string }>> {
  try {
    let dalleQuality = options.quality;
    if (dalleQuality === 'standard') dalleQuality = 'medium';
    if (!['low', 'medium', 'high', 'auto'].includes(dalleQuality)) {
      dalleQuality = 'medium';
    }

    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: options.size,
      quality: dalleQuality as any,
      n: options.n,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No images returned from DALL·E');
    }

    return response.data.map(img => {
      if (img.b64_json) {
        return { type: 'base64', data: img.b64_json };
      } else if (img.url) {
        return { type: 'url', data: img.url };
      } else {
        throw new Error('Unexpected image format from DALL·E');
      }
    });
  } catch (err) {
    console.error('Error composing with DALL·E:', err);
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
  // 1) All three images → full_composition
  if (hasProduct && hasDesign && hasColor && !hasPrompt) {
    return 'full_composition';
  }

  // 2) Product + Color only → product_color
  if (hasProduct && !hasDesign && hasColor && !hasPrompt) {
    return 'product_color';
  }

  // 3) Product + Design only → product_design
  if (hasProduct && hasDesign && !hasColor && !hasPrompt) {
    return 'product_design';
  }

  // 4) (Design or Color) + prompt (but not product) → color_design
  if (!hasProduct && (hasDesign || hasColor) && hasPrompt) {
    return 'color_design';
  }

  // 5) Prompt only → prompt_only
  if (!hasProduct && !hasDesign && !hasColor && hasPrompt) {
    return 'prompt_only';
  }

  // 6) Product + Prompt only → product_prompt
  if (hasProduct && !hasDesign && !hasColor && hasPrompt) {
    return 'product_prompt';
  }

  // Any other combination is not supported
  throw new Error(
    `Cannot infer a valid workflow for these inputs:
     product_image=${hasProduct}, design_image=${hasDesign}, color_image=${hasColor}, prompt=${hasPrompt}`
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

    // 4) Retrieve other optional params (size, quality, n)
    const size    = (formData.get('size') as string)    || '1024x1024';
    const quality = (formData.get('quality') as string) || 'standard';
    const n       = parseInt((formData.get('n') as string) || '1', 10);

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

    if (productImage) {
      const productBuffer = await fileToJpegBuffer(productImage);
      const productPath = `${userid}/input/${uuidv4()}.jpg`;
      const productUrl = await uploadBufferToFirebase(productBuffer, productPath);
      inputUrls.product = productUrl;
      analyses.product = await analyzeImageWithGPT4Vision(productUrl, 'product');
    }

    if (designImage) {
      const designBuffer = await fileToJpegBuffer(designImage);
      const designPath = `${userid}/input/${uuidv4()}.jpg`;
      const designUrl = await uploadBufferToFirebase(designBuffer, designPath);
      inputUrls.design = designUrl;
      analyses.design = await analyzeImageWithGPT4Vision(designUrl, 'design reference');
    }

    if (colorImage) {
      const colorBuffer = await fileToJpegBuffer(colorImage);
      const colorPath = `${userid}/input/${uuidv4()}.jpg`;
      const colorUrl = await uploadBufferToFirebase(colorBuffer, colorPath);
      inputUrls.color = colorUrl;
      analyses.color = await analyzeImageWithGPT4Vision(colorUrl, 'color reference');
    }

    // 7) Build the enhanced prompt
    const workflowPrompt = generateWorkflowPrompt(
      workflow_type,
      prompt || undefined,
      analyses.product,
      analyses.design,
      analyses.color
    );

    // 8) Call DALL·E to generate the product
    const dalleResults = await composeProductWithDALLE(workflowPrompt, { size, quality, n });
    if (dalleResults.length === 0) {
      throw new Error('DALL·E returned no images');
    }
    const firstResult = dalleResults[0];
    let outputJpegBuffer: Buffer;

    if (firstResult.type === 'base64') {
      // Convert base64 directly to JPEG buffer
      const rawBuffer = Buffer.from(firstResult.data, 'base64');
      outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
    } else {
      // Fetch the URL, then convert to JPEG buffer
      const response = await fetch(firstResult.data);
      if (!response.ok) {
        throw new Error(`Failed to fetch DALL·E image URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);
      outputJpegBuffer = await sharp(rawBuffer).jpeg().toBuffer();
    }

    // 9) Upload the composed output to Firebase Storage
    const outputPath = `${userid}/output/${uuidv4()}.jpg`;
    const firebaseOutputUrl = await uploadBufferToFirebase(outputJpegBuffer, outputPath);

    // 10) Return success including input URLs, output URL, inferred workflow, and prompt
    const responsePayload: ComposeProductResponse = {
      status: 'success',
      firebaseInputUrls: inputUrls,
      firebaseOutputUrl,
      workflow_type,
      generated_prompt: workflowPrompt,
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
