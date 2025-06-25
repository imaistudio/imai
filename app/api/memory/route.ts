import { NextRequest, NextResponse } from "next/server";
import { conversationMemory } from "@/lib/conversationMemory";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action") || "context";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    switch (action) {
      case "context":
        const context = await conversationMemory.getUserContext(userId);
        return NextResponse.json({
          success: true,
          context: {
            currentProject: context.currentProject,
            recentProjects: context.recentProjects.slice(0, 5),
            visualMemory: context.visualMemory.slice(0, 10),
            preferences: context.preferences,
          },
        });

      case "projects":
        const userContext = await conversationMemory.getUserContext(userId);
        return NextResponse.json({
          success: true,
          projects: userContext.recentProjects,
        });

      case "visual-memory":
        const memoryContext = await conversationMemory.getUserContext(userId);
        return NextResponse.json({
          success: true,
          visualMemory: memoryContext.visualMemory,
        });

      case "relevant-context":
        const message = searchParams.get("message");
        if (!message) {
          return NextResponse.json(
            { error: "Message is required for relevant context" },
            { status: 400 },
          );
        }

        const relevantContext = await conversationMemory.findRelevantContext(
          userId,
          message,
        );
        return NextResponse.json({
          success: true,
          relevantContext,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Memory API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process memory request",
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
      case "create-project":
        const { name, description } = body;
        if (!name) {
          return NextResponse.json(
            { error: "Project name is required" },
            { status: 400 },
          );
        }

        const project = await conversationMemory.createProject(
          userId,
          name,
          description,
        );
        return NextResponse.json({
          success: true,
          project,
        });

      case "add-operation":
        const { operation } = body;
        if (!operation) {
          return NextResponse.json(
            { error: "Operation data is required" },
            { status: 400 },
          );
        }

        await conversationMemory.addOperation(userId, operation);
        return NextResponse.json({
          success: true,
          message: "Operation added to project",
        });

      case "archive-inactive":
        await conversationMemory.archiveInactiveProjects(userId);
        return NextResponse.json({
          success: true,
          message: "Inactive projects archived",
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Memory API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process memory request",
      },
      { status: 500 },
    );
  }
}
