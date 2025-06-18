import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface InpaintResponse {
  status: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(buffer: Buffer, mimeType: string = 'image/png'): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert base64 data URL to buffer
 */
function base64DataUrlToBuffer(dataUrl: string): Buffer {
  const [, base64] = dataUrl.split(',');
  return Buffer.from(base64, 'base64');
}

/**
 * Create file in OpenAI and return file ID
 */
async function createFile(imageBuffer: Buffer, filename: string): Promise<string> {
  try {
    const file = await openai.files.create({
      file: new File([imageBuffer], filename, { type: 'image/png' }),
      purpose: 'vision',
    });
    return file.id;
  } catch (error) {
    console.error('Error creating file:', error);
    throw new Error('Failed to create file in OpenAI');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // Extract userid (required parameter)
    const userid = (formData.get('userid') as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: 'error', error: 'Missing "userid" parameter' },
        { status: 400 }
      );
    }

    // Extract prompt
    const prompt = (formData.get('prompt') as string | null)?.trim();
    if (!prompt) {
      return NextResponse.json(
        { status: 'error', error: 'Missing "prompt" parameter' },
        { status: 400 }
      );
    }

    // Handle image input (URL or base64)
    let originalImageBuffer: Buffer;
    const imageUrl = (formData.get('image_url') as string | null)?.trim();
    const base64Image = formData.get('base64Image') as string | null;

    if (imageUrl) {
      console.log('🔗 Using provided image URL:', imageUrl);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      originalImageBuffer = Buffer.from(arrayBuffer);
    } else if (base64Image) {
      console.log('📁 Using base64 image');
      const dataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
      originalImageBuffer = base64DataUrlToBuffer(dataUrl);
    } else {
      return NextResponse.json(
        { status: 'error', error: 'Either "image_url" or "base64Image" is required' },
        { status: 400 }
      );
    }

    // Handle mask input (URL or base64)
    let maskBuffer: Buffer;
    const maskUrl = (formData.get('mask_url') as string | null)?.trim();
    const base64Mask = formData.get('base64Mask') as string | null;

    if (maskUrl) {
      console.log('🔗 Using provided mask URL:', maskUrl);
      const response = await fetch(maskUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch mask: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      maskBuffer = Buffer.from(arrayBuffer);
    } else if (base64Mask) {
      console.log('📁 Using base64 mask');
      const dataUrl = base64Mask.startsWith('data:') ? base64Mask : `data:image/png;base64,${base64Mask}`;
      maskBuffer = base64DataUrlToBuffer(dataUrl);
    } else {
      return NextResponse.json(
        { status: 'error', error: 'Either "mask_url" or "base64Mask" is required' },
        { status: 400 }
      );
    }

    console.log('🎨 Starting image inpainting with OpenAI...');

    // Create files in OpenAI
    const fileId = await createFile(originalImageBuffer, 'original_image.png');
    const maskId = await createFile(maskBuffer, 'mask.png');

    console.log(`📎 Created files - Original: ${fileId}, Mask: ${maskId}`);

    // Make the inpainting request
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${originalImageBuffer.toString('base64')}`,
              },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "image_generation",
            description: "Generate or edit an image based on the input",
            parameters: {
              type: "object",
              properties: {
                quality: {
                  type: "string",
                  enum: ["standard", "hd"],
                  description: "Quality of the generated image"
                },
                input_image_mask: {
                  type: "object",
                  properties: {
                    file_id: {
                      type: "string",
                      description: "File ID of the mask image"
                    }
                  }
                }
              }
            }
          }
        }
      ],
      tool_choice: "auto",
    });

    console.log('✅ OpenAI inpainting request completed');

    // Extract the generated image
    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No image generation tool calls found in response');
    }

    // For now, we'll use OpenAI's DALL-E for inpainting as the newer API structure is different
    // Let's use the edit image endpoint instead
    const editResponse = await openai.images.edit({
      image: new File([originalImageBuffer], 'image.png', { type: 'image/png' }),
      mask: new File([maskBuffer], 'mask.png', { type: 'image/png' }),
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });

    if (!editResponse.data || editResponse.data.length === 0) {
      throw new Error('No image data returned from OpenAI');
    }

    const imageBase64 = editResponse.data[0].b64_json;
    if (!imageBase64) {
      throw new Error('No base64 image data found');
    }

    const outputBase64 = `data:image/png;base64,${imageBase64}`;

    console.log('🎉 Image inpainting completed successfully!');

    const apiResponse: InpaintResponse = {
      status: "success",
      imageUrl: outputBase64,
    };

    return NextResponse.json(apiResponse);

  } catch (error: any) {
    console.error('Error processing inpainting request:', error);

    const response: InpaintResponse = {
      status: "error",
      error: error.message || "Unknown error occurred",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Inpainting API is running",
    endpoints: {
      POST: {
        description: "Perform image inpainting using OpenAI DALL-E",
        parameters: {
          userid: "string (required) - User ID",
          prompt: "string (required) - Description of what to generate in the masked area",
          image_url: "string (optional) - URL of the original image",
          base64Image: "string (optional) - Base64 encoded original image",
          mask_url: "string (optional) - URL of the mask image (white = edit, black = keep)",
          base64Mask: "string (optional) - Base64 encoded mask image",
        },
        note: "Either image_url or base64Image is required. Either mask_url or base64Mask is required.",
      },
    },
    example_usage: {
      curl: `curl -X POST /api/inpaint \\
        -F "userid=user123" \\
        -F "prompt=add a flamingo in the pool" \\
        -F "base64Image=data:image/png;base64,..." \\
        -F "base64Mask=data:image/png;base64,..."`,
    },
  });
}
