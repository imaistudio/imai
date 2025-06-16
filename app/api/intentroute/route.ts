import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface ChatResponse {
  status: "success" | "error";
  message: string;
  intent?: "text_conversation" | "image_generation";
  result?: any;
  conversation_id?: string;
  error?: string;
}

// Simple function to detect if request is image-related
function isImageGenerationRequest(
  message: string,
  formDataEntries: [string, FormDataEntryValue][]
): boolean {
  // Check if there are any images uploaded
  const hasImages = formDataEntries.some(([key, value]) => {
    const isImageField = [
      "product_image",
      "design_image", 
      "color_image",
      "image",
      "file"
    ].includes(key) || key.startsWith("image");
    
    const isValidFile = value instanceof File && value.size > 0;
    const isBase64 = typeof value === "string" && value.startsWith("data:image/");
    
    return isImageField && (isValidFile || isBase64);
  });

  // Check for preset selections
  const hasPresets = formDataEntries.some(([key, value]) => {
    return key.startsWith("preset_") && typeof value === "string" && value.trim().length > 0;
  });

  // Design-related keywords
  const designKeywords = [
    "design", "create", "make", "generate", "product", "image", "picture", 
    "photo", "art", "pattern", "color", "style", "custom", "shirt", "tshirt", 
    "t-shirt", "hoodie", "pillow", "mug", "bag", "shoes", "dress", "jean", 
    "plate", "notebook", "backpack", "lamp", "vase", "toys", "vehicle", 
    "glasses", "watch", "earrings", "scarf", "blanket", "artwork", "print",
    "mockup", "apply", "put on", "add to"
  ];

  const hasDesignKeywords = designKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  // If has images, presets, or design keywords -> image generation
  return hasImages || hasPresets || hasDesignKeywords;
}

// Handle text conversation with Claude
async function handleTextConversation(
  message: string, 
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  try {
    console.log("🗣️ Handling text conversation with Claude...");

    const systemPrompt = `You are IRIS, the friendly AI assistant for IMAI - an advanced image generation and design platform.

**Your personality:**
- Warm, helpful, and conversational
- Always introduce yourself as IRIS when greeting new users
- Enthusiastic about creativity and design
- Concise but informative (2-4 sentences max)

**IMAI Platform Capabilities you can mention:**
- 🎨 Create custom product designs and artwork
- 👕 Design for various products (t-shirts, hoodies, mugs, bags, etc.)
- 🎨 Apply designs to products with different styles and colors
- 📱 Easy-to-use interface for uploading images and selecting presets

**Response Guidelines:**
- For greetings: Welcome them warmly and introduce key capabilities
- For questions about capabilities: Explain what IMAI can do
- For general conversation: Be friendly and guide them toward trying features
- For help requests: Offer to help them create something
- Use 1-2 emojis max, keep it natural and professional
- Always be encouraging about their creative potential`;

    // Build conversation context
    const messages = [
      ...conversationHistory.slice(-4).map(msg => ({ // Keep last 4 messages for context
        role: msg.role as "user" | "assistant",
        content: msg.content
      })),
      { role: "user" as const, content: message }
    ];

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 400,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
    });

    const content = response.content[0];
    return content.type === "text" 
      ? content.text.trim() 
      : "I apologize, but I had trouble generating a response. How can I help you create something amazing today?";

  } catch (error: any) {
    console.error("❌ Error in text conversation:", error);
    return "Hi there! I'm IRIS, your AI assistant for IMAI! I can help you create stunning designs and artwork. What would you like to create today? 🎨";
  }
}

// Route to design API
async function routeToDesignAPI(
  formData: FormData,
  message: string
): Promise<any> {
  try {
    console.log("🎨 Routing to design API...");
    
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // Add the prompt to formData if not already present
    if (!formData.get("prompt")) {
      formData.set("prompt", message);
    }

    const response = await fetch(`${baseUrl}/api/design`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Design API call failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log("✅ Design API call successful");
    return result;

  } catch (error: any) {
    console.error("❌ Error calling design API:", error);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    console.log("=== Simplified Intent Route ===");

    const entries = Array.from(formData.entries());
    
    // Extract userid
    let userid = (formData.get("userid") as string | null)?.trim();
    if (!userid) {
      console.log("❌ Missing userid - using fallback");
      userid = "uTiXKRbCYbhWnBbkLFZoMdEMdgf2";
      formData.set("userid", userid);
    }

    const message = (formData.get("message") as string)?.trim() || "";
    console.log("📝 Message:", message);

    // Parse conversation history
    const conversationHistoryStr = formData.get("conversation_history") as string;
    let conversationHistory: ChatMessage[] = [];
    if (conversationHistoryStr) {
      try {
        conversationHistory = JSON.parse(conversationHistoryStr);
      } catch {
        conversationHistory = [];
      }
    }

    // Check if we have any content at all
    const hasImages = entries.some(([key, value]) => {
      const isImageField = [
        "product_image", "design_image", "color_image", "image", "file"
      ].includes(key) || key.startsWith("image");
      
      const isValidFile = value instanceof File && value.size > 0;
      const isBase64 = typeof value === "string" && value.startsWith("data:image/");
      
      return isImageField && (isValidFile || isBase64);
    });

    const hasPresets = entries.some(([key, value]) => {
      return key.startsWith("preset_") && typeof value === "string" && value.trim().length > 0;
    });

    if (!message && !hasImages && !hasPresets) {
      return NextResponse.json({
        status: "error",
        error: "Please provide a message or upload some images to get started!"
      }, { status: 400 });
    }

    // Determine intent: Image generation or text conversation
    const isImageRequest = isImageGenerationRequest(message, entries);
    console.log("🎯 Intent:", isImageRequest ? "Image Generation" : "Text Conversation");

    let responseMessage: string;
    let apiResult = null;

    if (isImageRequest) {
      // Handle image generation - route to design API
      try {
        const effectiveMessage = message || "Create a design using the uploaded content";
        formData.set("prompt", effectiveMessage);
        
        apiResult = await routeToDesignAPI(formData, effectiveMessage);
        
        if (apiResult.status === "success") {
          responseMessage = "🎉 Perfect! I've successfully created your design! Your artwork is ready to view. 🎨";
        } else {
          responseMessage = `⚠️ I encountered an issue while creating your design: ${apiResult.error || "Unknown error"}. Let's try again! 🎨`;
        }
      } catch (error: any) {
        console.error("❌ Design API error:", error);
        responseMessage = "I apologize, but I encountered an error while creating your design. Please try again or contact support if the issue persists.";
        apiResult = { status: "error", error: error.message };
      }
    } else {
      // Handle text conversation
      responseMessage = await handleTextConversation(message, conversationHistory);
    }

    const chatResponse: ChatResponse = {
      status: "success",
      message: responseMessage,
      intent: isImageRequest ? "image_generation" : "text_conversation",
      result: apiResult,
      conversation_id: `${userid}_${Date.now()}`,
    };

    console.log("✅ Response ready:", { 
      intent: chatResponse.intent, 
      hasResult: !!apiResult,
      messageLength: responseMessage.length 
    });

    return NextResponse.json(chatResponse);

  } catch (error: any) {
    console.error("❌ Intent Route Error:", error);

    const errorResponse: ChatResponse = {
      status: "error",
      message: "I encountered an error while processing your request. Please try again.",
      error: error.message || "Unknown error occurred",
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}