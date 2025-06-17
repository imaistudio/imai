import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  messages: ChatMessage[]
): Promise<{ title: string; category: string }> {
  const systemPrompt = `You are a smart title generator for IMAI image platform chat sessions. Generate concise, descriptive titles (3-6 words) based on the conversation content.

**Categories:**
- "design" - Product design, composition, creative work
- "upscale" - Image enhancement, quality improvement
- "analysis" - Image analysis, description, identification
- "reframe" - Cropping, resizing, format changes
- "conversation" - General chat, help, questions
- "workflow" - Multi-step processes, complex tasks

**Title Style:**
- Short and descriptive (3-6 words max)
- Focus on the main action/topic
- Use natural language, avoid technical jargon
- Examples: "Blue sky design", "Product upscaling", "Logo analysis", "Vintage poster creation"

**Examples:**
- User uploads product + design images → "Product design composition"
- User asks to upscale image → "Image enhancement request"  
- User greets and asks about features → "Platform introduction chat"
- User analyzes logo → "Logo design analysis"
- User creates vintage poster → "Vintage poster creation"

Respond with JSON only:
{
  "title": "Short descriptive title",
  "category": "design|upscale|analysis|reframe|conversation|workflow"
}`;

  try {
    const recentMessages = messages.slice(-6);
    const conversationSummary = recentMessages
      .map(
        (msg, index) =>
          `${index + 1}. ${msg.role}: ${msg.content.substring(0, 150)}${msg.content.length > 150 ? "..." : ""}`
      )
      .join("\n");

    const prompt = `Analyze this chat conversation and generate an appropriate title:

${conversationSummary}

Generate a short, descriptive title and category for this conversation.`;

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

    const lastUserMessage =
      messages.filter((m) => m.role === "user").pop()?.content || "";
    const messageContent = lastUserMessage.toLowerCase();

    if (
      messageContent.includes("upscale") ||
      messageContent.includes("enhance")
    ) {
      return { title: "Image Enhancement", category: "upscale" };
    }
    if (
      messageContent.includes("design") ||
      messageContent.includes("create")
    ) {
      return { title: "Design Creation", category: "design" };
    }
    if (
      messageContent.includes("analyze") ||
      messageContent.includes("describe")
    ) {
      return { title: "Image Analysis", category: "analysis" };
    }
    if (messageContent.includes("reframe") || messageContent.includes("crop")) {
      return { title: "Image Reframing", category: "reframe" };
    }

    return { title: "Chat Session", category: "conversation" };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    const userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      return NextResponse.json(
        { status: "error", error: 'Missing "userid" parameter' },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "development") {
      try {
        await getAuth().getUser(userid);
      } catch {
        return NextResponse.json(
          { status: "error", error: "Invalid Firebase user ID" },
          { status: 400 }
        );
      }
    }

    const messagesStr = formData.get("messages") as string;
    if (!messagesStr) {
      return NextResponse.json(
        { status: "error", error: 'Missing "messages" parameter' },
        { status: 400 }
      );
    }

    let messages: ChatMessage[];
    try {
      messages = JSON.parse(messagesStr);
    } catch {
      return NextResponse.json(
        { status: "error", error: "Invalid JSON format for messages" },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { status: "error", error: "Messages must be a non-empty array" },
        { status: 400 }
      );
    }

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
