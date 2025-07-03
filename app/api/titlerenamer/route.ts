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
  const systemPrompt = `You are a smart title generator for IMAI image platform chat sessions. Generate concise, descriptive titles (3-6 words) based on the content.

**Categories:**
- "design" - Product design, composition, creative work
- "upscale" - Image enhancement, quality improvement
- "analysis" - Image analysis, description, identification
- "reframe" - Cropping, resizing, format changes
- "conversation" - General chat, help, questions
- "workflow" - Multi-step processes, complex tasks

**Title Style:**
- Short and descriptive (3-6 words max)
- Focus on the main product/action
- Use natural language, avoid technical jargon
- Examples: "Blue Phone Case Design", "Earth Tone T-Shirt", "Contemporary Pillow Creation", "Vintage Poster Analysis"

**When analyzing generated prompts:**
- Extract the product type (t-shirt, phone case, pillow, etc.)
- Extract key descriptors (colors, style, theme)
- Focus on what was actually created
- Example: "Phone case with black/white/blue/orange color blocks" → "Contemporary Phone Case Design"

Respond with JSON only:
{
  "title": "Short descriptive title",
  "category": "design|upscale|analysis|reframe|conversation|workflow"
}`;

  try {
    let analysisContent: string;

    if (typeof input === "string") {
      // New format: Complete Final Prompt
      console.log("🎯 Analyzing Complete Final Prompt for title generation");

      // Extract key information from the generated prompt
      const prompt = input;

      // Try to extract product type
      const productMatch = prompt.match(/TARGET PRODUCT:\s*([^-\n]+)/i);
      const product = productMatch ? productMatch[1].trim() : "";

      // Try to extract color information
      const colorMatches = prompt.match(
        /(?:color|colours?)[^:]*:\s*([^\.]+)/gi,
      );
      const colors = colorMatches ? colorMatches.slice(0, 2).join(", ") : "";

      // Try to extract user prompt
      const userPromptMatch = prompt.match(/USER PROMPT:\s*([^\n]+)/i);
      const userIntent = userPromptMatch ? userPromptMatch[1].trim() : "";

      analysisContent = `
Generated Design Analysis:
- Product: ${product}
- Colors/Style: ${colors}
- User Intent: ${userIntent}

Full Generated Prompt Context:
${prompt.substring(0, 800)}...
      `.trim();
    } else {
      // Legacy format: Chat Messages
      console.log("📜 Analyzing chat messages for title generation");
      const recentMessages = input.slice(-6);
      analysisContent = recentMessages
        .map(
          (msg, index) =>
            `${index + 1}. ${msg.role}: ${msg.content.substring(0, 150)}${msg.content.length > 150 ? "..." : ""}`,
        )
        .join("\n");
    }

    const prompt = `Analyze this content and generate an appropriate title:

${analysisContent}

Generate a short, descriptive title and category for this design/conversation.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      temperature: 0.3,
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

    return {
      title: result.title || "Chat Session",
      category: result.category || "conversation",
    };
  } catch (error) {
    console.error("Error generating title:", error);

    // Fallback logic
    const inputStr =
      typeof input === "string"
        ? input
        : input.filter((m) => m.role === "user").pop()?.content || "";
    const content = inputStr.toLowerCase();

    if (content.includes("upscale") || content.includes("enhance")) {
      return { title: "Image Enhancement", category: "upscale" };
    }
    if (
      content.includes("design") ||
      content.includes("create") ||
      content.includes("phone case") ||
      content.includes("t-shirt") ||
      content.includes("pillow")
    ) {
      return { title: "Design Creation", category: "design" };
    }
    if (content.includes("analyze") || content.includes("describe")) {
      return { title: "Image Analysis", category: "analysis" };
    }
    if (content.includes("reframe") || content.includes("crop")) {
      return { title: "Image Reframing", category: "reframe" };
    }

    return { title: "Chat Session", category: "conversation" };
  }
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

    // Check if ANTHROPIC_API_KEY is available
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

    // Validate Firebase user ID if Firebase is initialized (but don't fail if validation fails)
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
        // Don't return error - continue with title generation even if user validation fails
        // This prevents title renaming from failing due to Firebase auth issues
      }
    } else {
      console.log(
        "⚠️ Skipping Firebase user validation - Firebase not initialized",
      );
    }

    // Check for new format (Complete Final Prompt)
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

    // Legacy format (Chat Messages)
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
