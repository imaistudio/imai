import { NextRequest, NextResponse } from "next/server";

// 🧪 EXPERIMENTAL: Dev agents (MCP servers moved to "ideas to be done")
import {
  devAgentManager,
  DEV_AGENT_CONFIGS,
  DevAgentType,
} from "@/lib/agents/devAgents";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, agentType, agentId, capability, parameters } = body;

    // Check admin authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 401 },
      );
    }

    switch (action) {
      case "initialize":
        if (!agentType) {
          return NextResponse.json(
            { error: "Missing agentType" },
            { status: 400 },
          );
        }

        console.log(`🧪 EXPERIMENTAL: Initializing ${agentType} agent...`);
        const agent = await devAgentManager.initializeAgent(
          agentType as DevAgentType,
        );
        return NextResponse.json({
          agent,
          experimental: true,
          warning:
            'This is a mock implementation. Real MCP servers moved to "ideas to be done" folder.',
        });

      case "call":
        if (!agentId || !capability || !parameters) {
          return NextResponse.json(
            { error: "Missing agentId, capability, or parameters" },
            { status: 400 },
          );
        }

        console.log(
          `🧪 EXPERIMENTAL: Calling ${capability} on agent ${agentId}...`,
        );
        const result = await devAgentManager.callAgent(
          agentId,
          capability,
          parameters,
        );
        return NextResponse.json({
          result,
          experimental: true,
          timestamp: new Date().toISOString(),
        });

      case "health_check":
        // const healthStatus = await devAgentManager.healthCheck();
        // return NextResponse.json({ healthStatus: Object.fromEntries(healthStatus) });
        return NextResponse.json(
          { message: 'MCP servers moved to "ideas to be done" folder' },
          { status: 501 },
        );

      case "metrics":
        if (!agentId) {
          return NextResponse.json(
            { error: "Missing agentId" },
            { status: 400 },
          );
        }

        // const metrics = devAgentManager.getAgentMetrics(agentId);
        // return NextResponse.json({ metrics });
        return NextResponse.json(
          { message: 'MCP servers moved to "ideas to be done" folder' },
          { status: 501 },
        );

      case "shutdown":
        if (!agentId) {
          return NextResponse.json(
            { error: "Missing agentId" },
            { status: 400 },
          );
        }

        // await devAgentManager.shutdownAgent(agentId);
        // return NextResponse.json({ success: true });
        return NextResponse.json(
          { message: 'MCP servers moved to "ideas to be done" folder' },
          { status: 501 },
        );

      case "list_configs":
        return NextResponse.json({
          configs: DEV_AGENT_CONFIGS,
          experimental: true,
          warning:
            'These are mock implementations. Real MCP servers moved to "ideas to be done" folder.',
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Dev agent API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check admin authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      message: 'MCP servers moved to "ideas to be done" folder',
      agents: [],
    });
  } catch (error) {
    console.error("Get dev agents error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
