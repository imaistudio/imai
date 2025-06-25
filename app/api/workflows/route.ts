import { NextRequest, NextResponse } from "next/server";
import { workflowAutomation } from "@/lib/workflowAutomation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    const userId = searchParams.get("userId");

    switch (action) {
      case "list":
        const category = searchParams.get("category");
        const workflows = category
          ? workflowAutomation.getWorkflowsByCategory(category as any)
          : workflowAutomation.getWorkflows();

        return NextResponse.json({
          success: true,
          workflows: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            category: w.category,
            estimatedDuration: w.estimatedDuration,
            tags: w.tags,
            inputRequirements: w.inputRequirements,
            steps: w.steps.map((s) => ({
              id: s.id,
              name: s.name,
              intent: s.intent,
              dependsOn: s.dependsOn,
            })),
          })),
        });

      case "batch-status":
        const batchId = searchParams.get("batchId");
        if (!batchId) {
          return NextResponse.json(
            { error: "Batch ID is required" },
            { status: 400 },
          );
        }

        const batch = workflowAutomation.getBatchOperation(batchId);
        if (!batch) {
          return NextResponse.json(
            { error: "Batch operation not found" },
            { status: 404 },
          );
        }

        return NextResponse.json({
          success: true,
          batch: {
            id: batch.id,
            name: batch.name,
            status: batch.status,
            progress: batch.progress,
            createdAt: batch.createdAt,
            startedAt: batch.startedAt,
            completedAt: batch.completedAt,
            estimatedCompletion: batch.estimatedCompletion,
            results: batch.results,
          },
        });

      case "user-batches":
        if (!userId) {
          return NextResponse.json(
            { error: "User ID is required" },
            { status: 400 },
          );
        }

        const userBatches = workflowAutomation.getUserBatchOperations(userId);
        return NextResponse.json({
          success: true,
          batches: userBatches.map((b) => ({
            id: b.id,
            name: b.name,
            status: b.status,
            progress: b.progress,
            createdAt: b.createdAt,
            estimatedCompletion: b.estimatedCompletion,
          })),
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Workflows API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process workflows request",
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
      case "create-workflow":
        const { name, description, steps, category } = body;
        if (!name || !steps) {
          return NextResponse.json(
            {
              error: "Workflow name and steps are required",
            },
            { status: 400 },
          );
        }

        const workflow = await workflowAutomation.createWorkflow(
          userId,
          name,
          description || "",
          steps,
          category,
        );

        return NextResponse.json({
          success: true,
          workflow,
        });

      case "start-batch":
        const { workflowId, inputs, batchName } = body;
        if (!workflowId || !inputs) {
          return NextResponse.json(
            {
              error: "Workflow ID and inputs are required",
            },
            { status: 400 },
          );
        }

        const batch = await workflowAutomation.startBatchOperation(
          userId,
          workflowId,
          inputs,
          batchName,
        );

        return NextResponse.json({
          success: true,
          batch: {
            id: batch.id,
            name: batch.name,
            status: batch.status,
            progress: batch.progress,
            estimatedCompletion: batch.estimatedCompletion,
          },
        });

      case "cancel-batch":
        const { batchId } = body;
        if (!batchId) {
          return NextResponse.json(
            { error: "Batch ID is required" },
            { status: 400 },
          );
        }

        const cancelled =
          await workflowAutomation.cancelBatchOperation(batchId);
        return NextResponse.json({
          success: cancelled,
          message: cancelled
            ? "Batch operation cancelled"
            : "Failed to cancel batch operation",
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Workflows API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process workflows request",
      },
      { status: 500 },
    );
  }
}
