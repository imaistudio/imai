import { NextRequest } from "next/server";
import { claudeLLM } from "@/lib/claudeLLM";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { message, userId } = await request.json();

    if (!message) {
      return new Response("Missing message parameter", { status: 400 });
    }

    console.log("🌊 Starting streaming chat response for:", message);

    // Generate streaming response from Claude
    const streamResponse = await claudeLLM.generateCasualResponseStream(
      message,
      userId,
      "I'm here to help with your image processing needs! 🎨",
    );

    if (!streamResponse.success || !streamResponse.stream) {
      // Fallback to non-streaming response
      const fallbackResponse = await claudeLLM.generateCasualResponse(
        message,
        userId,
        "I'm here to help with your image processing needs! 🎨",
      );

      // Convert to streaming format
      const fallbackStream = new ReadableStream<string>({
        start(controller) {
          const words = fallbackResponse.text.split(" ");
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

      return new Response(
        new ReadableStream({
          start(controller) {
            const reader = fallbackStream.getReader();

            function pump(): Promise<void> {
              return reader.read().then((result) => {
                if (result.done) {
                  controller.close();
                  return;
                }

                // Send as Server-Sent Events format
                const data = `data: ${JSON.stringify({ content: result.value, done: false })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
                return pump();
              });
            }

            pump();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    }

    // Stream the response as Server-Sent Events
    return new Response(
      new ReadableStream({
        start(controller) {
          const reader = streamResponse.stream!.getReader();

          function pump(): Promise<void> {
            return reader.read().then((result) => {
              if (result.done) {
                // Send final done message
                const doneData = `data: ${JSON.stringify({ content: "", done: true })}\n\n`;
                controller.enqueue(new TextEncoder().encode(doneData));
                controller.close();
                return;
              }

              // Send chunk as Server-Sent Events format
              const data = `data: ${JSON.stringify({ content: result.value, done: false })}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
              return pump();
            });
          }

          pump().catch((error) => {
            console.error("Streaming error:", error);
            const errorData = `data: ${JSON.stringify({ content: "", done: true, error: "Streaming failed" })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorData));
            controller.close();
          });
        },
      }),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  } catch (error) {
    console.error("Chat stream error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
