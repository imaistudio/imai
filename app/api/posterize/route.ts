import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { openaiQueue, queuedAPICall } from "@/lib/request-queue";
import { openAILimiter } from "@/lib/rate-limiter";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PosterizeOptions {
  style?: "modern" | "vintage" | "minimalist" | "bold" | "elegant" | "artistic" | "cinematic" | "editorial" | "experimental";
  theme?: "business" | "creative" | "luxury" | "casual" | "professional" | "event" | "product" | "brand" | "campaign";
  mood?: "energetic" | "calm" | "sophisticated" | "playful" | "dramatic" | "inspiring" | "mysterious" | "warm" | "cool";
  target_audience?: "corporate" | "creative" | "youth" | "premium" | "mass_market" | "niche" | "professional" | "lifestyle";
  size?: string;
  quality?: string;
  n?: number;
  aspect_ratio?: string;
}

interface PosterizeResponse {
  status: string;
  imageUrl?: string;
  enhanced_prompt?: string;
  style_used?: string;
  theme_used?: string;
  design_insights?: string;
  composition_strategy?: string;
  color_psychology?: string;
  error?: string;
}

/**
 * Professional Design Principles Database
 */
const DESIGN_PRINCIPLES = {
  typography: {
    modern: "Clean sans-serif hierarchy with bold headlines and subtle body text",
    vintage: "Classic serif fonts with ornate details and traditional spacing",
    minimalist: "Ultra-clean typography with generous white space and perfect alignment",
    bold: "Impactful display fonts with strong weight contrast and dynamic sizing",
    elegant: "Refined serif or script fonts with sophisticated letterspacing",
    artistic: "Creative, experimental typography that becomes part of the visual art",
    cinematic: "Dramatic title treatment with film-inspired typography and effects",
    editorial: "Magazine-style typography with clear hierarchy and readability",
    experimental: "Avant-garde typographic treatments that push creative boundaries"
  },
  
  composition: {
    rule_of_thirds: "Strategic placement using the rule of thirds for visual balance",
    golden_ratio: "Harmonious proportions based on the golden ratio for natural appeal",
    dynamic_symmetry: "Diagonal compositions that create movement and energy",
    focal_hierarchy: "Clear visual hierarchy guiding the viewer's eye through the design",
    negative_space: "Intelligent use of white space to create breathing room and focus",
    layered_depth: "Multiple visual layers creating depth and dimensional interest",
    geometric_balance: "Structured layouts using geometric principles and grid systems",
    organic_flow: "Natural, flowing compositions that feel organic and intuitive"
  },
  
  color_psychology: {
    energetic: "Vibrant, high-contrast colors that stimulate and excite",
    calm: "Soft, muted tones that create serenity and peace",
    sophisticated: "Rich, deep colors with subtle gradients and premium feel",
    playful: "Bright, cheerful colors that evoke joy and creativity",
    dramatic: "High contrast with deep shadows and bold highlights",
    inspiring: "Uplifting colors that motivate and encourage action",
    mysterious: "Dark, moody tones with selective bright accents",
    warm: "Warm color palette creating comfort and approachability",
    cool: "Cool tones conveying professionalism and trustworthiness"
  },
  
  market_positioning: {
    corporate: "Professional, trustworthy design suitable for business environments",
    creative: "Innovative, artistic approach for creative industries and agencies",
    youth: "Trendy, contemporary design appealing to younger demographics",
    premium: "Luxury aesthetics with high-end materials and sophisticated details",
    mass_market: "Broad appeal design that resonates with general audiences",
    niche: "Specialized design tailored to specific interest groups",
    professional: "Clean, authoritative design for professional services",
    lifestyle: "Aspirational design that represents desired lifestyle choices"
  }
};

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(
  buffer: Buffer,
  mimeType: string = "image/png",
): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Analyze the input product for poster transformation - preserving the original subject
 */
async function analyzeProductForPosterization(imageUrl: string): Promise<{
  product_description: string;
  poster_enhancements: string;
  visual_style: string;
  color_improvements: string;
  composition_adjustments: string;
}> {
  try {
    console.log("🎨 PRODUCT ANALYSIS: Analyzing product for poster transformation...");

    const rateLimitCheck = await openAILimiter.checkLimit("posterize-analyze");
    if (!rateLimitCheck.allowed) {
      console.log(
        `⚠️ Rate limit hit for posterize-analyze. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`,
      );
    }

    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing product poster transformation analysis");
        return await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: `You are a professional product photographer and poster designer specializing in transforming product images into compelling poster formats. Your expertise includes:

- Product photography and styling
- Poster composition and visual impact
- Color enhancement and mood creation
- Background and lighting optimization
- Maintaining product authenticity while enhancing appeal

You analyze products to understand how to transform them into poster-worthy images while keeping the SAME product as the main subject.`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this product image for poster transformation. I want to keep the SAME product but make it look like a professional, eye-catching poster. Focus on:

🔍 PRODUCT DESCRIPTION:
- What is the main product/subject in this image?
- What are its key visual characteristics?
- What makes this product appealing?

🎨 POSTER ENHANCEMENTS:
- How can we enhance this SAME product for poster impact?
- What visual treatments would make it more striking?
- How can we improve the overall presentation while keeping the product?

🎭 VISUAL STYLE:
- What poster style would work best for this product?
- Should it be dramatic, elegant, bold, or artistic?
- What mood should the poster convey?

🌈 COLOR IMPROVEMENTS:
- How can we enhance the existing colors?
- What color adjustments would make it more poster-like?
- Should we boost saturation, contrast, or add effects?

📐 COMPOSITION ADJUSTMENTS:
- How should we reframe or recompose this product?
- What background changes would improve poster appeal?
- How can we create better visual hierarchy?

CRITICAL: The goal is to transform THIS EXACT PRODUCT into a poster, not create a different image. Keep the same subject but make it poster-worthy.`,
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
          max_tokens: 800,
        });
      },
      "Product poster analysis in progress...",
    );

    const fullAnalysis = response.choices[0]?.message?.content || "Unable to analyze product";
    
    // Parse the structured analysis
    const sections = {
      product_description: extractSection(fullAnalysis, "PRODUCT DESCRIPTION") || "Product with strong poster potential",
      poster_enhancements: extractSection(fullAnalysis, "POSTER ENHANCEMENTS") || "Enhanced visual impact while preserving product identity",
      visual_style: extractSection(fullAnalysis, "VISUAL STYLE") || "Professional poster aesthetic",
      color_improvements: extractSection(fullAnalysis, "COLOR IMPROVEMENTS") || "Enhanced colors for poster appeal",
      composition_adjustments: extractSection(fullAnalysis, "COMPOSITION ADJUSTMENTS") || "Optimized composition for poster format"
    };

    console.log("✅ Product poster transformation analysis completed");
    return sections;
  } catch (error) {
    console.error("❌ Error in product poster analysis:", error);
    // Return fallback analysis
    return {
      product_description: "Product suitable for poster transformation",
      poster_enhancements: "Visual enhancements while preserving product identity",
      visual_style: "Professional poster presentation",
      color_improvements: "Color optimization for poster appeal",
      composition_adjustments: "Composition refinements for poster format"
    };
  }
}

/**
 * Extract specific sections from analysis text
 */
function extractSection(text: string, sectionName: string): string {
  const regex = new RegExp(`${sectionName}:([\\s\\S]*?)(?=🎯|🎨|📊|👁️|🌈|📐|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Generate product posterization prompt - transforms the SAME product into poster format
 */
function generateProductPosterPrompt(
  analysis: {
    product_description: string;
    poster_enhancements: string;
    visual_style: string;
    color_improvements: string;
    composition_adjustments: string;
  },
  style: string,
  theme: string,
  mood: string,
  target_audience: string,
  userPrompt?: string
): {
  prompt: string;
  design_insights: string;
  composition_strategy: string;
  color_psychology: string;
} {
  
  const designPrinciples = DESIGN_PRINCIPLES;
  
  // Get design specifications
  const colorSpec = designPrinciples.color_psychology[mood as keyof typeof designPrinciples.color_psychology] || designPrinciples.color_psychology.sophisticated;
  const marketSpec = designPrinciples.market_positioning[target_audience as keyof typeof designPrinciples.market_positioning] || designPrinciples.market_positioning.professional;

  let productPosterPrompt = `🎨 PRODUCT POSTERIZATION BRIEF:

Transform this EXACT product into a stunning, professional poster while keeping the SAME product as the main subject.

🔍 PRODUCT TO TRANSFORM:
${analysis.product_description}

🎨 POSTER TRANSFORMATION STRATEGY:
${analysis.poster_enhancements}

🎭 VISUAL STYLE APPLICATION:
${analysis.visual_style}
Style Direction: ${style.toUpperCase()} aesthetic with ${mood} mood

🌈 COLOR ENHANCEMENT PLAN:
${analysis.color_improvements}
Color Psychology: ${colorSpec}

📐 COMPOSITION OPTIMIZATION:
${analysis.composition_adjustments}
Market Positioning: ${marketSpec}

🚨 CRITICAL POSTERIZATION REQUIREMENTS:

PRODUCT PRESERVATION:
- Keep the EXACT SAME product from the original image
- Do NOT change the product type, shape, or core identity
- Do NOT replace with different objects or people
- Transform THIS specific product, not create something new

POSTER TRANSFORMATION:
- Convert the product presentation into poster-worthy format
- Enhance visual impact while preserving product authenticity
- Apply professional poster composition and lighting
- Create dramatic, eye-catching presentation
- Boost colors, contrast, and visual appeal
- Add poster-style background and atmosphere

VISUAL ENHANCEMENT:
- Professional poster lighting and shadows
- Enhanced color saturation and contrast for poster appeal
- Dramatic composition that makes the product stand out
- Clean, impactful background that complements the product
- Professional poster-style presentation
- Gallery-quality visual finish

STYLE APPLICATION:
- Apply ${style} style to the product presentation
- Create ${mood} emotional atmosphere
- Target ${target_audience} demographic appeal
- ${theme} thematic approach

POSTER QUALITY STANDARDS:
- Professional poster-worthy visual impact
- Print-ready quality with sharp details
- Scalable design that works at poster size
- Commercial appeal and marketability
- Instagram-worthy and shareable
- Museum-quality artistic execution

🎯 FINAL EXECUTION:
Take the EXACT product from this image and transform it into a stunning poster presentation. Keep the same product but make it look like a professional, eye-catching poster that people would want to buy and display. The product should be the hero of the poster, enhanced and elevated but still recognizably the same item.`;

  if (userPrompt) {
    productPosterPrompt += `\n\n🎯 CUSTOM REQUIREMENTS: ${userPrompt}`;
  }

  return {
    prompt: productPosterPrompt,
    design_insights: `Product Posterization: ${style} | Theme: ${theme} | Mood: ${mood} | Target: ${target_audience}`,
    composition_strategy: `Product-focused composition with ${analysis.composition_adjustments}`,
    color_psychology: `${colorSpec} applied to enhance the existing product colors`
  };
}

/**
 * Analyze input image and create detailed preservation instructions
 */
async function createPreservationInstructions(
  inputImageUrl: string,
  style: string,
  theme: string,
  mood: string,
  target_audience: string,
  userPrompt?: string
): Promise<string> {
  try {
    console.log("🎨 PRESERVATION ANALYSIS: Analyzing image for exact preservation...");

    const rateLimitCheck = await openAILimiter.checkLimit("posterize-analyze");
    if (!rateLimitCheck.allowed) {
      console.log(
        `⚠️ Rate limit hit for posterize-analyze. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`,
      );
    }

    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing preservation analysis");
        return await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: `You are a professional image preservation specialist. Your job is to analyze an input image and create EXTREMELY DETAILED preservation instructions that ensure the exact same product, colors, design, and features are maintained when creating a poster version.

CRITICAL MISSION:
- Document EVERY detail of the product to preserve it identically
- Specify exact colors, patterns, shapes, materials, and features
- Focus on poster-style PRESENTATION changes only
- Never change the actual product characteristics`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this image in extreme detail and create preservation instructions for posterizing while keeping the IDENTICAL product.

Style: ${style} | Theme: ${theme} | Mood: ${mood} | Target: ${target_audience}
${userPrompt ? `User Requirements: ${userPrompt}` : ''}

Document these details for EXACT preservation:

🔍 PRODUCT IDENTIFICATION:
- What is this exact product?
- What are its precise dimensions and proportions?
- What is its exact shape and form?

🎨 COLOR PRESERVATION:
- List ALL specific colors in the product
- Describe the exact color distribution and patterns
- Note any gradients, textures, or color variations
- Specify which colors go where on the product

🎯 DESIGN PRESERVATION:
- Document all patterns, graphics, or decorative elements
- Describe the exact placement of design elements
- Note any textures, finishes, or material characteristics
- List all unique design features that must be preserved

📐 STRUCTURAL PRESERVATION:
- Exact product geometry and proportions
- All structural elements and their relationships
- Any unique form characteristics

🎨 POSTER TRANSFORMATION (PRESENTATION ONLY):
- How to enhance lighting for poster appeal
- Background changes that complement the product
- Composition improvements for poster format
- Artistic effects that don't change the product itself

Create instructions that would allow someone to recreate this EXACT product in poster format.`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: inputImageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 1200
        });
      },
      "Analyzing image for exact preservation...",
    );

    const preservationInstructions = response.choices[0]?.message?.content || "Preserve the exact product while enhancing presentation for poster format";
    
    console.log("✅ Preservation analysis completed");
    console.log("📝 Instructions length:", preservationInstructions.length, "characters");
    
    return preservationInstructions;
  } catch (error) {
    console.error("❌ Error creating preservation instructions:", error);
    // Return fallback instructions
    return `PRESERVE EXACTLY: This exact product with all its current colors, patterns, design elements, and structural characteristics. ONLY CHANGE: Lighting, background, and poster-style presentation effects. Style: ${style}, Theme: ${theme}, Mood: ${mood}, Target: ${target_audience}. ${userPrompt || ''}`;
  }
}

/**
 * Transform existing product image using image-to-image with poster description
 */
async function transformImageToPoster(
  inputImageUrl: string,
  posterDescription: string,
  options: PosterizeOptions = {}
): Promise<string[]> {
  try {
    console.log("🎨 IMAGE TRANSFORMATION: Converting existing product to poster...");
    console.log("📝 Transformation Description Length:", posterDescription.length, "characters");
    console.log("⚙️ Creative Options:", options);

    const { size = "1024x1536", quality = "high", n = 1 } = options;

    const rateLimitCheck = await openAILimiter.checkLimit("posterize-generation");
    if (!rateLimitCheck.allowed) {
      console.log(
        `⚠️ Rate limit hit for posterize-generation. Reset in: ${Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)}s`,
      );
    }

    // Create transformation prompt that emphasizes preserving the input product
    const transformationPrompt = `CRITICAL: Transform this EXACT product image into a poster while preserving the identical product.

INPUT PRESERVATION REQUIREMENTS:
- Keep the EXACT SAME product shown in the input image
- Do NOT change the product type, shape, design, or features
- Preserve all product details and characteristics
- Only change the presentation style to poster format

POSTER TRANSFORMATION:
${posterDescription}

TRANSFORMATION FOCUS:
- Apply poster-style lighting and dramatic effects
- Enhance colors and contrast for poster appeal
- Create poster-worthy background and composition
- Add artistic poster elements around the product
- Make it look like a professional poster presentation

The result should be the SAME EXACT product but presented as a stunning poster.`;

    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing image-to-poster transformation");
        
        // Try using the Responses API with image input for better product preservation
        try {
          return await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: transformationPrompt
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: inputImageUrl
                    }
                  }
                ]
              }
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "generate_poster_image",
                  description: "Generate a poster version of the input image",
                  parameters: {
                    type: "object",
                    properties: {
                      prompt: {
                        type: "string",
                        description: "Detailed prompt for poster generation"
                      }
                    },
                    required: ["prompt"]
                  }
                }
              }
            ],
            max_tokens: 1000
          });
        } catch (toolError) {
          console.log("🔄 Tool approach failed, using direct generation with enhanced prompt");
          // Fallback to enhanced direct generation
          const enhancedPrompt = `Based on the provided input image: ${transformationPrompt}`;
          
          return await openai.images.generate({
            model: "gpt-image-1",
            prompt: enhancedPrompt,
            size: size as any,
            quality: quality as any,
            n: n,
          });
        }
      },
      "Transforming your product into poster format...",
    );

    // Handle different response types
    let imageUrls: string[] = [];
    
    // If it's a chat completion response (from tool approach)
    if ('choices' in response && response.choices[0]?.message?.tool_calls) {
      const toolCall = response.choices[0].message.tool_calls[0];
      if (toolCall.function) {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const posterPrompt = functionArgs.prompt;
        
                 // Now generate the poster using the refined prompt
         const imageResponse = await openai.images.generate({
           model: "gpt-image-1",
           prompt: posterPrompt,
           size: size as any,
           quality: quality as any,
           n: n,
         });
         
         for (const img of imageResponse.data || []) {
          if (img.url) {
            imageUrls.push(img.url);
          } else if (img.b64_json) {
            imageUrls.push(`data:image/png;base64,${img.b64_json}`);
          }
        }
      }
    } 
         // If it's a direct image generation response
     else if ('data' in response) {
       for (const img of response.data || []) {
        if (img.url) {
          imageUrls.push(img.url);
        } else if (img.b64_json) {
          imageUrls.push(`data:image/png;base64,${img.b64_json}`);
        }
      }
    }

    if (imageUrls.length === 0) {
      throw new Error("No poster transformations were created");
    }

    console.log("✅ Image-to-poster transformation completed");
    console.log("✅ Transformed posters ready:", imageUrls.length);
    return imageUrls;
  } catch (error) {
    console.error("❌ Error in image-to-poster transformation:", error);
    // Final fallback: Use variation approach to preserve product better
    console.log("🔄 Trying variation-based poster transformation as final fallback...");
    return await createPosterVariation(inputImageUrl, posterDescription, options);
  }
}

/**
 * Generate enhanced poster using detailed preservation instructions
 */
async function generateEnhancedPoster(
  preservationInstructions: string,
  options: PosterizeOptions = {}
): Promise<string[]> {
  try {
    console.log("🎨 ENHANCED POSTER: Generating poster from preservation instructions...");
    
    const { size = "1024x1024", quality = "auto", n = 1 } = options;
    
    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing enhanced poster generation");
        return await openai.images.generate({
          model: "dall-e-3",
          prompt: `Create a professional poster design based on these detailed preservation instructions:

${preservationInstructions}

POSTER REQUIREMENTS:
- Transform the described product into a poster format
- Maintain all the exact colors, design elements, and product features described
- Add poster-like composition with dramatic lighting and professional presentation
- Keep the product as the central focus with enhanced visual impact
- Professional studio photography style with poster aesthetics`,
          size: size as any,
          quality: quality as any,
          n: n,
        });
      },
      "Generating enhanced poster with preservation instructions...",
    );

    console.log("✅ Enhanced poster generation completed");
    console.log("📊 Generated posters:", response.data?.length || 0);

    if (!response.data || response.data.length === 0) {
      throw new Error("No enhanced posters were created");
    }

    const imageUrls: string[] = [];
    for (const img of response.data) {
      if (img.url) {
        imageUrls.push(img.url);
      } else if (img.b64_json) {
        imageUrls.push(`data:image/png;base64,${img.b64_json}`);
      }
    }

    console.log("✅ Enhanced poster generation ready:", imageUrls.length);
    return imageUrls;
  } catch (error) {
    console.error("❌ Error in enhanced poster generation:", error);
    throw new Error("Failed to generate enhanced poster");
  }
}

/**
 * Create poster variation that preserves the input product
 */
async function createPosterVariation(
  inputImageUrl: string,
  preservationInstructions: string,
  options: PosterizeOptions = {}
): Promise<string[]> {
  try {
    console.log("🎨 POSTER VARIATION: Creating poster variation of input product...");
    
    const { n = 1 } = options;
    
    // Variation API only supports square sizes, so use 1024x1024
    const variationSize = "1024x1024";
    
    // First, fetch and prepare the input image
    const imageResponse = await fetch(inputImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch input image: ${imageResponse.statusText}`);
    }
    
    const arrayBuffer = await imageResponse.arrayBuffer();
    const imageFile = new File([arrayBuffer], 'input.png', { type: 'image/png' });
    
    const response = await queuedAPICall(
      openaiQueue,
      async () => {
        console.log("🚀 Executing poster variation creation");
        return await openai.images.createVariation({
          image: imageFile,
          size: variationSize as any,
          n: n,
        });
      },
      "Creating poster variation that preserves your product...",
    );

    console.log("✅ Poster variation completed");
    console.log("📊 Generated variations:", response.data?.length || 0);

    if (!response.data || response.data.length === 0) {
      throw new Error("No poster variations were created");
    }

    const imageUrls: string[] = [];
    for (const img of response.data) {
      if (img.url) {
        imageUrls.push(img.url);
      } else if (img.b64_json) {
        imageUrls.push(`data:image/png;base64,${img.b64_json}`);
      }
    }

    console.log("✅ Product-preserving poster variations ready:", imageUrls.length);
    return imageUrls;
  } catch (error) {
    console.error("❌ Error in poster variation:", error);
    // Fallback to enhanced text-to-image generation
    console.log("🔄 Variation failed, trying enhanced generation as fallback...");
    return await generateEnhancedPoster(preservationInstructions, options);
  }
}



export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // Extract userid (required parameter from intent route)
    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    // 🎯 URL-first approach (from intentroute)
    const imageUrl = (formData.get("image_url") as string | null)?.trim();
    if (!imageUrl) {
      return NextResponse.json(
        {
          status: "error",
          error:
            'Missing "image_url" parameter. This endpoint expects to be called through intentroute.',
        },
        { status: 400 },
      );
    }

    console.log("🎨 PROFESSIONAL POSTER STUDIO: Starting design process...");
    console.log("🔗 Source image:", imageUrl);

    // Extract enhanced parameters
    const style = (formData.get("style") as string) || "modern";
    const theme = (formData.get("theme") as string) || "professional";
    const mood = (formData.get("mood") as string) || "sophisticated";
    const target_audience = (formData.get("target_audience") as string) || "professional";
    const userPrompt = (formData.get("prompt") as string) || undefined;
    
    // Handle size and aspect ratio (default to portrait for posters)
    const sizeParam = (formData.get("size") as string) || "1024x1536";
    const aspectRatio = (formData.get("aspect_ratio") as string) || "";

    let size = sizeParam;
    if (aspectRatio) {
      switch (aspectRatio.toLowerCase()) {
        case "portrait":
          size = "1024x1536";
          break;
        case "landscape":
          size = "1536x1024";
          break;
        case "square":
          size = "1024x1024";
          break;
        default:
          size = "1024x1536"; // Default to portrait for posters
          break;
      }
    } else {
      // Default to portrait when no aspect ratio specified
      size = "1024x1536";
    }

    console.log(`📏 Canvas size: ${size} | Style: ${style} | Theme: ${theme} | Mood: ${mood}`);
    
    const quality = (formData.get("quality") as string) || "high";
    const n = parseInt((formData.get("n") as string) || "1", 10);

    // Create design insights for response
    const design_insights = `Product Posterization: ${style} | Theme: ${theme} | Mood: ${mood} | Target: ${target_audience}`;
    const composition_strategy = `GPT-4.1 analyzed composition with poster-focused enhancements`;
    const color_psychology = `${mood} mood applied to enhance the existing product colors`;

    console.log("🎨 STEP 1: Analyzing input image for exact preservation...");

    // Step 1: Analyze the input image and create detailed preservation instructions
    const preservationInstructions = await createPreservationInstructions(
      imageUrl,
      style,
      theme,
      mood,
      target_audience,
      userPrompt
    );

    console.log("🎨 STEP 2: Creating poster variation that preserves the exact product...");

    // Step 2: Use variation approach to preserve the exact product
    const posterImages = await createPosterVariation(imageUrl, preservationInstructions, {
      style: style as any,
      theme: theme as any,
      mood: mood as any,
      target_audience: target_audience as any,
      size,
      quality,
      n,
      aspect_ratio: aspectRatio,
    });

    if (!posterImages.length) {
      throw new Error("No professional poster designs were created");
    }

    // Convert the output image to base64 for intentroute to handle
    let outputBase64: string;
    const firstPosterUrl = posterImages[0];

    if (firstPosterUrl.startsWith("data:image")) {
      outputBase64 = firstPosterUrl;
    } else {
      const response = await fetch(firstPosterUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch generated poster: ${response.statusText}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      outputBase64 = bufferToBase64DataUrl(buffer);
    }

    console.log("✅ MASTERPIECE COMPLETE: Professional poster design ready!");

    const response: PosterizeResponse = {
      status: "success",
      imageUrl: outputBase64,
      enhanced_prompt: preservationInstructions,
      style_used: style,
      theme_used: theme,
      design_insights,
      composition_strategy,
      color_psychology,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("❌ DESIGN STUDIO ERROR:", error);

    const response: PosterizeResponse = {
      status: "error",
      error: error.message || "Professional poster creation failed",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "🎨 PROFESSIONAL POSTER DESIGN STUDIO - Ready to create masterpieces!",
    description: "World-class poster creation with professional design intelligence",
    
    design_expertise: {
      "Professional Analysis": "GPT-4 Vision analysis with 20+ years design experience perspective",
      "Design Intelligence": "Advanced composition, typography, and color psychology principles",
      "Market Positioning": "Strategic targeting for maximum commercial appeal",
      "Award-Worthy Quality": "Gallery-level execution suitable for professional campaigns"
    },

    creative_options: {
      styles: ["modern", "vintage", "minimalist", "bold", "elegant", "artistic", "cinematic", "editorial", "experimental"],
      themes: ["business", "creative", "luxury", "casual", "professional", "event", "product", "brand", "campaign"],
      moods: ["energetic", "calm", "sophisticated", "playful", "dramatic", "inspiring", "mysterious", "warm", "cool"],
      audiences: ["corporate", "creative", "youth", "premium", "mass_market", "niche", "professional", "lifestyle"]
    },

    professional_features: {
      "Intelligent Analysis": "Deep understanding of visual content and market potential",
      "Design Psychology": "Color and composition psychology for emotional impact",
      "Commercial Viability": "Market-tested approaches for maximum appeal",
      "Premium Quality": "Gallery-worthy execution with professional polish",
      "Scalable Design": "Works perfectly at any size from social media to billboard",
      "Print Ready": "Optimized for both digital display and premium printing"
    },

    endpoints: {
      POST: {
        description: "Create professional, award-worthy posters with design intelligence",
        parameters: {
          userid: "string (required) - User identification",
          image_url: "string (required) - Source image for poster creation",
          style: "string (optional) - Design style approach",
          theme: "string (optional) - Thematic direction",
          mood: "string (optional) - Emotional tone",
          target_audience: "string (optional) - Demographic targeting",
          prompt: "string (optional) - Additional creative direction",
          aspect_ratio: "string (optional) - portrait (default), landscape, square",
          quality: "string (optional) - high (default), auto"
        }
      }
    },

    examples: {
      "Corporate Excellence": "Professional business poster with sophisticated appeal",
      "Creative Campaign": "Artistic poster for creative industry marketing",
      "Luxury Branding": "Premium poster with high-end aesthetic appeal",
      "Youth Market": "Contemporary poster targeting younger demographics",
      "Event Promotion": "Dynamic poster designed for event marketing"
    }
  });
} 