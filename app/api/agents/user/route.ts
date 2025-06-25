import { NextRequest, NextResponse } from "next/server";
import {
  UserAgentManager,
  USER_AGENT_TEMPLATES,
  UserAgent,
} from "@/lib/agents/userAgents";

const userAgentManager = new UserAgentManager();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      userId,
      agentId,
      template,
      customization,
      message,
      images,
    } = body;

    switch (action) {
      case "create":
        if (!userId || !template) {
          return NextResponse.json(
            { error: "Missing userId or template" },
            { status: 400 },
          );
        }

        if (template === "custom") {
          if (!customization?.name || !customization?.description) {
            return NextResponse.json(
              { error: "Custom agents require name and description" },
              { status: 400 },
            );
          }
          const agent = await userAgentManager.createCustomAgent(
            userId,
            customization,
          );
          return NextResponse.json({ agent });
        } else {
          const agent = await userAgentManager.createAgent(
            userId,
            template,
            customization,
          );
          return NextResponse.json({ agent });
        }

      case "chat":
        if (!agentId || !message) {
          return NextResponse.json(
            { error: "Missing agentId or message" },
            { status: 400 },
          );
        }

        const response = await userAgentManager.chatWithAgent(
          agentId,
          message,
          images,
        );
        return NextResponse.json({ response });

      case "list_templates":
        return NextResponse.json({ templates: USER_AGENT_TEMPLATES });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("User agent API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get user's agents (you'd implement this in UserAgentManager)
    // const agents = await userAgentManager.getUserAgents(userId);
    const agents: UserAgent[] = []; // Placeholder

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Get user agents error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
