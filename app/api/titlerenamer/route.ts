import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface TitleRequest {
  status: "success" | "error";
  title?: string;
  error?: string;
}

async function generateMeaningfulTitle(prompt: string): Promise<string> {
  if (!prompt.trim()) {
    return "New Chat Session";
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      temperature: 0.3,
      system: "Generate a meaningful, descriptive title between 50-60 characters based on the user's prompt. Make it clear and engaging. Return only the title, nothing else.",
      messages: [
        {
          role: "user",
          content: `Generate a meaningful 50-60 character title for this prompt: "${prompt}"`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let title = content.text.trim();
    
    // Ensure it's within 50-60 character range
    if (title.length < 50) {
      // If too short, fallback to original prompt handling
      return generateSimpleTitle(prompt);
    }
    
    if (title.length > 60) {
      // If too long, truncate smartly
      const truncated = title.substring(0, 60);
      const lastSpaceIndex = truncated.lastIndexOf(' ');
      
      if (lastSpaceIndex > 50) {
        return truncated.substring(0, lastSpaceIndex);
      }
      
      return truncated;
    }
    
    return title;
  } catch (error) {
    console.error("Error generating title with AI:", error);
    // Fallback to simple title generation
    return generateSimpleTitle(prompt);
  }
}

function generateSimpleTitle(prompt: string): string {
  // Remove extra whitespace and clean the prompt
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ');
  
  if (!cleanPrompt) {
    return "New Chat Session";
  }
  
  // Take first 50 characters and ensure it doesn't cut off mid-word
  if (cleanPrompt.length <= 50) {
    return cleanPrompt;
  }
  
  const truncated = cleanPrompt.substring(0, 50);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  // If there's a space within the last 10 characters, cut there
  if (lastSpaceIndex > 40) {
    return truncated.substring(0, lastSpaceIndex);
  }
  
  // Otherwise just truncate at 47 chars and add "..."
  return truncated.substring(0, 47) + "...";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    
    const prompt = (formData.get("prompt") as string | null)?.trim() || "";
    
    const title = await generateMeaningfulTitle(prompt);
    
    const response: TitleRequest = {
      status: "success",
      title,
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
