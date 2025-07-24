import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Firebase Admin if not already initialized
let firebaseInitialized = false;
try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  firebaseInitialized = true;
  console.log("🔥 Firebase initialized for titlerenamer route");
} catch (error) {
  console.warn(
    "⚠️ Firebase initialization failed, running in test mode:",
    error,
  );
  firebaseInitialized = false;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Validate required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY environment variable is not set");
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface TitleRequest {
  status: "success" | "error";
  title?: string;
  category?: string;
  error?: string;
}

async function generateChatTitle(
  input: ChatMessage[] | string,
): Promise<{ title: string; category: string }> {
  const systemPrompt = `You are a creative title generator for IMAI image platform chat sessions. Generate unique, descriptive titles (3-6 words) based on the content.

**Important Rules:**
- Never include "photorealistic" in the title (the platform already knows this)
- Avoid overused terms like "hyperrealistic", "ultra-detailed"
- Focus on the unique aspects of the design

**Categories:**
- "design" - Product design, composition, creative work
- "upscale" - Image enhancement, quality improvement
- "analysis" - Image analysis, description, identification
- "reframe" - Cropping, resizing, format changes
- "conversation" - General chat, help, questions
- "workflow" - Multi-step processes, complex tasks
- "art" - Artistic creations, illustrations
- "photo" - Photography enhancements or edits

**Title Styles (mix these approaches):**
1. Descriptive: "Blue Phone Case", "Earth Tone T-Shirt"
2. Creative: "Oceanic Dreams Case", "Urban Edge Concept"
3. Style-focused: "Minimalist Design", "Abstract Artwork"
4. Thematic: "Vintage Vibes", "Futuristic Tech"
5. Action-oriented: "Designing Modern Pillow", "Enhancing Sunset"
6. Feature-highlight: "Geometric Pattern", "Color Block Design"

**For Realistic Images:**
Instead of saying "photorealistic", describe:
- The subject matter ("Portrait of a Woman")
- The style ("Natural Lighting Portrait")
- The mood ("Serene Landscape")
- The technique ("Detailed Character Design")

**Guidelines:**
- Keep titles 3-6 words max
- Vary your style between different approaches
- For designs, include the product type if relevant
- Focus on unique aspects rather than generic qualities

Respond with JSON only:
{
  "title": "Unique descriptive title",
  "category": "design|upscale|analysis|reframe|conversation|workflow|art|photo"
}`;

  try {
    let analysisContent: string;

    if (typeof input === "string") {
      console.log("🎯 Analyzing Complete Final Prompt for title generation");
      
      // Add preprocessing to remove "photorealistic" mentions from the prompt
      const processedPrompt = input
        .replace(/photorealistic/gi, '')
        .replace(/hyper-?realistic/gi, '')
        .replace(/ultra-?detailed/gi, '');

      const productMatch = processedPrompt.match(/TARGET PRODUCT:\s*([^-\n]+)/i);
      const product = productMatch ? productMatch[1].trim() : "";

      const colorMatches = processedPrompt.match(
        /(?:color|colours?)[^:]*:\s*([^\.]+)/gi,
      );
      const colors = colorMatches ? colorMatches.slice(0, 2).join(", ") : "";

      const userPromptMatch = processedPrompt.match(/USER PROMPT:\s*([^\n]+)/i);
      const userIntent = userPromptMatch ? userPromptMatch[1].trim() : "";

      analysisContent = `
Generated Design Analysis:
- Product: ${product}
- Colors/Style: ${colors}
- User Intent: ${userIntent}

Full Generated Prompt Context:
${processedPrompt.substring(0, 800)}...
      `.trim();
    } else {
      console.log("📜 Analyzing chat messages for title generation");
      const recentMessages = input.slice(-6);
      analysisContent = recentMessages
        .map(
          (msg, index) =>
            `${index + 1}. ${msg.role}: ${msg.content.substring(0, 150)}${msg.content.length > 150 ? "..." : ""}`,
        )
        .join("\n");
    }

    const prompt = `Analyze this content and generate a unique, descriptive title:

${analysisContent}

Generate a creative title and category. Never use "photorealistic". Focus on unique aspects.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      temperature: 0.6, // Slightly higher for more creativity
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let jsonStr = content.text.trim();
    if (jsonStr.includes("```json")) {
      jsonStr = jsonStr.split("```json")[1].split("```")[0].trim();
    }

    const result = JSON.parse(jsonStr);

    // Post-process the title to ensure no photorealistic mentions
    const cleanTitle = result.title
      .replace(/photorealistic/gi, '')
      .replace(/hyper-?realistic/gi, '')
      .replace(/ultra-?detailed/gi, '')
      .trim();

    return {
      title: cleanTitle || generateFallbackTitle(),
      category: result.category || "conversation",
    };
  } catch (error) {
    console.error("Error generating title:", error);
    return generateFallbackTitle(input);
  }
}

// Helper function for more varied fallback titles
function generateFallbackTitle(input?: ChatMessage[] | string): { title: string; category: string } {
  const designTitles = [
    "Creative Design", "Product Concept", "Visual Creation", 
    "Style Exploration", "Form Study", "Aesthetic Design"
  ];
  
  const photoTitles = [
    "Image Capture", "Composition Study", "Lighting Exploration",
    "Scene Setting", "Moment Captured", "Visual Narrative"
  ];

  const artTitles = [
    "Artistic Vision", "Creative Illustration", "Expressive Work",
    "Style Experiment", "Visual Art", "Conceptual Piece"
  ];

  // If we have input, try to make a slightly more informed fallback
  if (input) {
    const inputStr = typeof input === "string"
      ? input
      : input.filter((m) => m.role === "user").pop()?.content || "";
    const content = inputStr.toLowerCase();

    if (content.includes("upscale") || content.includes("enhance")) {
      const variants = [
        "Image Quality Boost",
        "Detail Refinement",
        "Resolution Upgrade",
        "Clarity Enhancement"
      ];
      return {
        title: variants[Math.floor(Math.random() * variants.length)],
        category: "upscale"
      };
    }
    if (content.includes("design") || content.includes("create")) {
      return {
        title: designTitles[Math.floor(Math.random() * designTitles.length)],
        category: "design"
      };
    }
    if (content.includes("photo") || content.includes("photograph")) {
      return {
        title: photoTitles[Math.floor(Math.random() * photoTitles.length)],
        category: "photo"
      };
    }
    if (content.includes("art") || content.includes("illustration")) {
      return {
        title: artTitles[Math.floor(Math.random() * artTitles.length)],
        category: "art"
      };
    }
  }

  // Random fallback if we can't determine context
  const allTitles = [...designTitles, ...photoTitles, ...artTitles];
  return {
    title: allTitles[Math.floor(Math.random() * allTitles.length)],
    category: "conversation"
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("📥 Titlerenamer API called");
    console.log("  - Firebase initialized:", firebaseInitialized);
    console.log(
      "  - Anthropic API key available:",
      !!process.env.ANTHROPIC_API_KEY,
    );
    console.log("  - Node environment:", process.env.NODE_ENV);

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("❌ ANTHROPIC_API_KEY environment variable is missing");
      return NextResponse.json(
        {
          status: "error",
          error: "ANTHROPIC_API_KEY environment variable is not configured",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();

    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 },
      );
    }

    if (firebaseInitialized) {
      try {
        await getAuth().getUser(userid);
        console.log(
          "✅ Firebase user ID validated successfully for titlerenamer",
        );
      } catch (error) {
        console.warn(
          "⚠️ Firebase user validation failed (continuing anyway):",
          error,
        );
      }
    } else {
      console.log(
        "⚠️ Skipping Firebase user validation - Firebase not initialized",
      );
    }

    const promptStr = formData.get("prompt") as string;
    if (promptStr) {
      console.log("🎯 Using Complete Final Prompt for title generation");
      const { title, category } = await generateChatTitle(promptStr);

      const response: TitleRequest = {
        status: "success",
        title,
        category,
      };

      return NextResponse.json(response);
    }

    const messagesStr = formData.get("messages") as string;
    if (!messagesStr) {
      return NextResponse.json(
        { status: "error", error: 'Missing "messages" or "prompt" parameter' },
        { status: 400 },
      );
    }

    let messages: ChatMessage[];
    try {
      messages = JSON.parse(messagesStr);
    } catch {
      return NextResponse.json(
        { status: "error", error: "Invalid JSON format for messages" },
        { status: 400 },
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { status: "error", error: "Messages must be a non-empty array" },
        { status: 400 },
      );
    }

    console.log("📜 Using legacy chat messages for title generation");
    const { title, category } = await generateChatTitle(messages);

    const response: TitleRequest = {
      status: "success",
      title,
      category,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Title Renamer API Error:", error);

    const errorResponse: TitleRequest = {
      status: "error",
      error: error.message || "Unknown error occurred",
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}