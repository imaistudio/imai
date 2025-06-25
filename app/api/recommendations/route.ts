import { NextRequest, NextResponse } from "next/server";
import { smartRecommendations } from "@/lib/smartRecommendations";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action") || "generate";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    switch (action) {
      case "generate":
        const context = searchParams.get("context");
        const lastOperation = searchParams.get("lastOperation");

        const recommendations =
          await smartRecommendations.generateRecommendations(userId, {
            userMessage: context || undefined,
            lastOperation: lastOperation || undefined,
          });

        return NextResponse.json({
          success: true,
          recommendations,
        });

      case "cached":
        const cachedRecommendations =
          await smartRecommendations.getRecommendationsForUser(userId);
        return NextResponse.json({
          success: true,
          recommendations: cachedRecommendations,
        });

      case "realtime":
        const currentContext = searchParams.get("context");
        if (!currentContext) {
          return NextResponse.json(
            {
              error: "Context is required for real-time recommendations",
            },
            { status: 400 },
          );
        }

        const realtimeRecommendation =
          await smartRecommendations.getRealTimeRecommendation(
            userId,
            currentContext,
          );

        return NextResponse.json({
          success: true,
          recommendation: realtimeRecommendation,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Recommendations API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process recommendations request",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, action } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    switch (action) {
      case "execute":
        const { recommendationId } = body;
        if (!recommendationId) {
          return NextResponse.json(
            {
              error: "Recommendation ID is required",
            },
            { status: 400 },
          );
        }

        const executed = await smartRecommendations.executeRecommendation(
          userId,
          recommendationId,
        );
        return NextResponse.json({
          success: executed,
          message: executed
            ? "Recommendation executed"
            : "Failed to execute recommendation",
        });

      case "generate-with-context":
        const { context, lastOperation, sessionDuration } = body;

        const contextualRecommendations =
          await smartRecommendations.generateRecommendations(userId, {
            userMessage: context,
            lastOperation,
            sessionDuration: sessionDuration || 0,
          });

        return NextResponse.json({
          success: true,
          recommendations: contextualRecommendations,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Recommendations API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process recommendations request",
      },
      { status: 500 },
    );
  }
}
