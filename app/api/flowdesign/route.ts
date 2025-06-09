import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function saveImageLocally(imageBuffer: Buffer, filename: string): Promise<string> {
  const publicDir = path.join(process.cwd(), 'public', 'generated');
  ensureDirectoryExists(publicDir);
  const filePath = path.join(publicDir, filename);
  await fs.promises.writeFile(filePath, imageBuffer);
  return `/generated/${filename}`;
}

async function createBlankImage(width = 500, height = 500): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();
}

async function concatenateImages(imageBuffers: Buffer[], direction: 'horizontal' | 'vertical' = 'horizontal'): Promise<Buffer> {
  if (!imageBuffers.length) throw new Error('No images provided');

  const images = await Promise.all(imageBuffers.map(buf => sharp(buf).metadata()));

  const composite: sharp.OverlayOptions[] = [];
  let width = 0, height = 0;

  if (direction === 'horizontal') {
    let x = 0;
    images.forEach((img, i) => {
      composite.push({ input: imageBuffers[i], left: x, top: 0 });
      x += img.width || 0;
    });
    width = x;
    height = Math.max(...images.map(img => img.height || 0));
  } else {
    let y = 0;
    images.forEach((img, i) => {
      composite.push({ input: imageBuffers[i], left: 0, top: y });
      y += img.height || 0;
    });
    width = Math.max(...images.map(img => img.width || 0));
    height = y;
  }

  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).composite(composite).png().toBuffer();
}

async function generateAndSaveImage(prompt: string): Promise<ArrayBuffer> {
  const apiKey = process.env.FLUX_API_KEY;
  if (!apiKey) throw new Error('FLUX_API_KEY is not set in environment variables');

  const response = await fetch('https://api.aimlapi.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model: 'flux-pro/v1.1-ultra',
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Flux API error: ${data.error?.message || response.statusText}`);

  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL found in API response');

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to download generated image: ${imageResponse.statusText}`);

  return await imageResponse.arrayBuffer();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const imageBuffers: Buffer[] = [];
    const uploadedImageUrls: string[] = [];

    const productImageUrl = formData.get('product_image_url') as string | null;
    const designImageUrl = formData.get('design_image_url') as string | null;
    const colorImageUrl = formData.get('color_image_url') as string | null;
    const prompt = formData.get('prompt') as string | null;

    const imageUrls = [productImageUrl, designImageUrl, colorImageUrl];
    const fileImages = [formData.get('image1'), formData.get('image2'), formData.get('image3')];

    for (let i = 0; i < 3; i++) {
      let buffer: Buffer | null = null;

      const imageUrl = imageUrls[i];
      if (imageUrl) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          }
        } catch (err) {
          console.error(`Failed to fetch image ${i + 1}`, err);
        }
      } else if (fileImages[i] instanceof File) {
        const file = fileImages[i] as File;
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      if (buffer) {
        const pngBuffer = await sharp(buffer).png().toBuffer();
        const url = await saveImageLocally(pngBuffer, `input_${i + 1}_${Date.now()}.png`);
        uploadedImageUrls.push(url);
        imageBuffers.push(pngBuffer);
      } else {
        const blank = await createBlankImage();
        const url = await saveImageLocally(blank, `blank_${i + 1}_${Date.now()}.png`);
        uploadedImageUrls.push(url);
        imageBuffers.push(blank);
      }
    }

    const concatenatedImage = await concatenateImages(imageBuffers, 'horizontal');
    const concatenatedImageUrl = await saveImageLocally(concatenatedImage, `concat_${Date.now()}.png`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyze the following design elements and provide a detailed description of the visual composition, color scheme, and overall aesthetic. Focus on the design principles and elements present, without mentioning specific objects or types.",
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${concatenatedImage.toString('base64')}`,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const analysis = response.choices[0].message?.content || '';
    const basePrompt = prompt || "Create a professional design composition";
    const enhancedPrompt = `i am a designer, and i create professional designs. Create a professional design based on these elements: ${analysis}. The design should be innovative and unique, incorporating the described color palette and design principles. No text, no logo, no symbol. Create a design palette.`;

    try {
      const { fal } = await import('@fal-ai/client');

      fal.config({
        credentials: process.env.FAL_KEY!,
      });

      // Fixed: Removed num_inference_steps as it's not supported by this model
      const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
        input: {
          prompt: enhancedPrompt,
          aspect_ratio: "4:3",
          seed: Math.floor(Math.random() * 1000000),
          enable_safety_checker: true,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log: any) => log.message).forEach(console.log);
          }
        },
      });

      const imageRes = await fetch(result.data.images[0].url);
      const generatedImage = await imageRes.arrayBuffer();

      const finalBuffer = await sharp(Buffer.from(generatedImage)).png().toBuffer();
      const finalImageUrl = await saveImageLocally(finalBuffer, `final_${Date.now()}.png`);

      return NextResponse.json({
        success: true,
        imageUrl: finalImageUrl,
        inputImages: uploadedImageUrls,
        concatenatedImage: concatenatedImageUrl,
        designAnalysis: analysis,
        enhancedPrompt,
        basePrompt,
      });
    } catch (falError) {
      console.error('fal.ai failed, using fallback:', falError);
      const generatedImage = await generateAndSaveImage(enhancedPrompt);
      const buffer = Buffer.from(generatedImage);
      const finalBuffer = await sharp(buffer).png().toBuffer();
      const finalImageUrl = await saveImageLocally(finalBuffer, `final_${Date.now()}.png`);

      return NextResponse.json({
        success: true,
        imageUrl: finalImageUrl,
        inputImages: uploadedImageUrls,
        concatenatedImage: concatenatedImageUrl,
        designAnalysis: analysis,
        enhancedPrompt,
        basePrompt,
      });
    }
  } catch (error: any) {
    console.error('Error in flow design generation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}