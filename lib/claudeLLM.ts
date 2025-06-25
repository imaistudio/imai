import Anthropic from "@anthropic-ai/sdk";

interface ClaudeLLMConfig {
  model: string;
  timeout: number;
  maxRetries: number;
}

interface ClaudeLLMResponse {
  success: boolean;
  text: string;
  error?: string;
  usedFallback?: boolean;
}

interface ClaudeLLMStreamResponse {
  success: boolean;
  stream?: ReadableStream<string>;
  error?: string;
  usedFallback?: boolean;
}

interface SuggestedNextStep {
  id: string;
  action: string;
  intent: string;
  endpoint: string;
  parameters: any;
  description: string;
  timestamp: number;
  userId?: string;
}

interface SuggestionContext {
  lastSuggestion?: SuggestedNextStep;
  pendingConfirmations: Map<string, SuggestedNextStep>;
}

class ClaudeLLMService {
  private config: ClaudeLLMConfig;
  private anthropic: Anthropic;
  private suggestionContext: Map<string, SuggestionContext> = new Map();

  constructor(config?: Partial<ClaudeLLMConfig>) {
    this.config = {
      model:
        config?.model || process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      timeout:
        config?.timeout || parseInt(process.env.CLAUDE_TIMEOUT || "30000"),
      maxRetries:
        config?.maxRetries || parseInt(process.env.CLAUDE_MAX_RETRIES || "2"),
      ...config,
    };

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }

  // Store suggested next step for a user
  storeSuggestedNextStep(
    userId: string,
    suggestion: Omit<SuggestedNextStep, "id" | "timestamp" | "userId">,
  ): string {
    const suggestionId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullSuggestion: SuggestedNextStep = {
      ...suggestion,
      id: suggestionId,
      timestamp: Date.now(),
      userId,
    };

    if (!this.suggestionContext.has(userId)) {
      this.suggestionContext.set(userId, {
        pendingConfirmations: new Map(),
      });
    }

    const context = this.suggestionContext.get(userId)!;
    context.lastSuggestion = fullSuggestion;
    context.pendingConfirmations.set(suggestionId, fullSuggestion);

    // Clean up old suggestions (older than 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    context.pendingConfirmations.forEach((suggestion, id) => {
      if (suggestion.timestamp < cutoff) {
        context.pendingConfirmations.delete(id);
      }
    });

    return suggestionId;
  }

  // Check if user message is confirming a suggested next step
  checkForConfirmation(
    userId: string,
    userMessage: string,
  ): SuggestedNextStep | null {
    const context = this.suggestionContext.get(userId);
    if (!context?.lastSuggestion) return null;

    const message = userMessage.toLowerCase().trim();

    // Don't treat specific requests as confirmations
    const isSpecificRequest =
      message.includes("landscape") ||
      message.includes("portrait") ||
      message.includes("square") ||
      message.includes("make it") ||
      message.includes("can you") ||
      message.includes("generate") ||
      message.includes("create") ||
      message.includes("design") ||
      message.includes("with") ||
      message.includes("at") ||
      message.includes("resolution") ||
      message.includes("format") ||
      message.includes("size") ||
      message.length > 20; // Longer messages are likely specific requests, not confirmations

    if (isSpecificRequest) {
      return null; // Don't treat specific requests as confirmations
    }

    const confirmationWords = [
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "proceed",
      "go ahead",
      "do it",
      "let's do it",
      "continue",
      "please",
      "yes please",
    ];

    const isConfirmation = confirmationWords.some(
      (word) =>
        message === word ||
        message.startsWith(word + " ") ||
        message.endsWith(" " + word) ||
        message.includes(" " + word + " "),
    );

    if (isConfirmation && context.lastSuggestion) {
      // Check if suggestion is still valid (within 10 minutes)
      const isValid =
        Date.now() - context.lastSuggestion.timestamp < 10 * 60 * 1000;
      if (isValid) {
        return context.lastSuggestion;
      }
    }

    return null;
  }

  // Clear pending confirmations for a user
  clearPendingConfirmations(userId: string) {
    const context = this.suggestionContext.get(userId);
    if (context) {
      context.pendingConfirmations.clear();
      context.lastSuggestion = undefined;
    }
  }

  // Generate streaming response using Claude
  async generateStreamingResponse(
    prompt: string,
    systemPrompt?: string,
    fallbackMessage?: string,
  ): Promise<ClaudeLLMStreamResponse> {
    try {
      console.log("🌊 Starting streaming response from Claude");

      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 2000,
        temperature: 0.7,
        system:
          systemPrompt ||
          "You are a helpful AI assistant for an image processing platform. Be conversational, helpful, and encouraging.",
        messages,
        stream: true,
      });

      // Create a ReadableStream that processes Claude's streaming response
      const stream = new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const chunk of response) {
              if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
              ) {
                controller.enqueue(chunk.delta.text);
              }
            }
            controller.close();
          } catch (error) {
            console.error("Streaming error:", error);
            controller.error(error);
          }
        },
      });

      return {
        success: true,
        stream,
      };
    } catch (error) {
      console.error("❌ Claude streaming error:", error);

      // Return fallback streaming response
      const fallbackText =
        fallbackMessage ||
        "I'm here to help with your image processing needs! 🎨";
      const fallbackStream = new ReadableStream<string>({
        start(controller) {
          const words = fallbackText.split(" ");
          let index = 0;

          const sendNextWord = () => {
            if (index < words.length) {
              controller.enqueue(words[index] + " ");
              index++;
              setTimeout(sendNextWord, 50);
            } else {
              controller.close();
            }
          };

          sendNextWord();
        },
      });

      return {
        success: false,
        stream: fallbackStream,
        error: error instanceof Error ? error.message : "Unknown error",
        usedFallback: true,
      };
    }
  }

  // Generate non-streaming response
  async generateResponse(
    prompt: string,
    systemPrompt?: string,
    fallbackMessage?: string,
  ): Promise<ClaudeLLMResponse> {
    try {
      console.log("🤖 Generating response from Claude");

      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 2000,
        temperature: 0.7,
        system:
          systemPrompt ||
          "You are a helpful AI assistant for an image processing platform. Be conversational, helpful, and encouraging.",
        messages,
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      return {
        success: true,
        text: content.text,
      };
    } catch (error) {
      console.error("❌ Claude response error:", error);

      return {
        success: false,
        text:
          fallbackMessage ||
          "I'm here to help with your image processing needs! 🎨",
        error: error instanceof Error ? error.message : "Unknown error",
        usedFallback: true,
      };
    }
  }

  // Generate casual conversation response with streaming
  async generateCasualResponseStream(
    userMessage: string,
    userId?: string,
    fallbackMessage?: string,
  ): Promise<ClaudeLLMStreamResponse> {
    const systemPrompt = `You are a friendly AI assistant for IMAI, an image processing platform. 

Key guidelines:
- Be warm, conversational, and encouraging
- Keep responses concise but helpful (2-3 sentences max)
- Use relevant emojis to make responses feel more human
- If the user seems stuck, gently suggest they try uploading an image or exploring features
- Focus on being helpful while maintaining a casual, friendly tone
- Don't be overly technical unless specifically asked

Current user message: "${userMessage}"`;

    return this.generateStreamingResponse(
      userMessage,
      systemPrompt,
      fallbackMessage,
    );
  }

  // Generate casual conversation response (non-streaming)
  async generateCasualResponse(
    userMessage: string,
    userId?: string,
    fallbackMessage?: string,
  ): Promise<ClaudeLLMResponse> {
    const systemPrompt = `You are a friendly AI assistant for IMAI, an image processing platform. 

Key guidelines:
- Be warm, conversational, and encouraging
- Keep responses concise but helpful (2-3 sentences max)
- Use relevant emojis to make responses feel more human
- If the user seems stuck, gently suggest they try uploading an image or exploring features
- Focus on being helpful while maintaining a casual, friendly tone
- Don't be overly technical unless specifically asked

Current user message: "${userMessage}"`;

    return this.generateResponse(userMessage, systemPrompt, fallbackMessage);
  }

  // Generate success response with suggestions
  async generateSuccessResponseWithSuggestions(
    userId: string,
    userMessage: string,
    intentAnalysis: any,
    apiResult: any,
    fallbackMessage?: string,
  ): Promise<ClaudeLLMResponse & { suggestedNextSteps?: SuggestedNextStep[] }> {
    const response = await this.generateSuccessResponse(
      intentAnalysis.intent || "operation",
      userMessage,
      !!apiResult?.imageUrl || !!apiResult?.output_url,
    );

    // Generate next step suggestions
    const suggestions = this.generateNextStepSuggestions(
      intentAnalysis,
      apiResult,
    );
    const suggestedNextSteps = suggestions.map((suggestion) => ({
      ...suggestion,
      id: this.storeSuggestedNextStep(userId, suggestion),
      timestamp: Date.now(),
      userId,
    }));

    return {
      ...response,
      suggestedNextSteps,
    };
  }

  // Generate success response
  async generateSuccessResponse(
    operation: string,
    userMessage?: string,
    hasOutput: boolean = true,
  ): Promise<ClaudeLLMResponse> {
    const successPrompts = [
      `Perfect! I've successfully completed the ${operation} operation${hasOutput ? " and generated your result" : ""}! ✨`,
      `Great news! Your ${operation} request has been processed${hasOutput ? " and the result is ready" : ""}! 🎉`,
      `Done! I've handled your ${operation} request${hasOutput ? " and created the output for you" : ""}! 🚀`,
      `Success! Your ${operation} operation is complete${hasOutput ? " with results generated" : ""}! ⭐`,
    ];

    const randomSuccess =
      successPrompts[Math.floor(Math.random() * successPrompts.length)];

    return {
      success: true,
      text: randomSuccess,
    };
  }

  // Generate error response
  async generateErrorResponse(
    operation: string,
    error: string,
    userMessage?: string,
  ): Promise<ClaudeLLMResponse> {
    const errorPrompts = [
      `I encountered an issue with the ${operation} operation. ${error} Let me try a different approach! 🔧`,
      `Oops! There was a problem with ${operation}. ${error} Don't worry, we can work through this! 💪`,
      `Sorry about that! The ${operation} request hit a snag: ${error}. Let's try again! 🛠️`,
    ];

    const randomError =
      errorPrompts[Math.floor(Math.random() * errorPrompts.length)];

    return {
      success: true,
      text: randomError,
    };
  }

  // Generate next step suggestions
  private generateNextStepSuggestions(
    intentAnalysis: any,
    apiResult: any,
  ): Omit<SuggestedNextStep, "id" | "timestamp" | "userId">[] {
    const suggestions: Omit<
      SuggestedNextStep,
      "id" | "timestamp" | "userId"
    >[] = [];

    // Add suggestions based on the operation type
    if (intentAnalysis.endpoint === "/api/design") {
      suggestions.push({
        action: "upscale",
        intent: "upscale the generated design",
        endpoint: "/api/upscale",
        parameters: { upscale_factor: 2 },
        description: "Enhance the resolution of your design",
      });
    }

    if (apiResult?.imageUrl || apiResult?.output_url) {
      suggestions.push({
        action: "variant",
        intent: "create a variant of this result",
        endpoint: intentAnalysis.endpoint,
        parameters: { ...intentAnalysis.parameters, variant: true },
        description: "Generate a different version with similar style",
      });
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  // Check health/availability
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      return true;
    } catch (error) {
      console.error("Claude health check failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const claudeLLM = new ClaudeLLMService();
