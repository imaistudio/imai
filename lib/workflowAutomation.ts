interface WorkflowStep {
  id: string;
  name: string;
  intent: string;
  endpoint: string;
  parameters: any;
  dependsOn?: string[]; // IDs of steps this depends on
  condition?: WorkflowCondition;
  retryConfig?: RetryConfig;
  timeout?: number;
}

interface WorkflowCondition {
  type: "success" | "failure" | "always" | "custom";
  customCheck?: (result: any) => boolean;
}

interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "design" | "enhancement" | "analysis" | "batch" | "custom";
  steps: WorkflowStep[];
  inputRequirements: {
    images: number;
    parameters: string[];
  };
  estimatedDuration: number; // in seconds
  tags: string[];
}

interface BatchOperation {
  id: string;
  userId: string;
  name: string;
  type:
    | "single_workflow_multiple_inputs"
    | "multiple_workflows_single_input"
    | "custom";
  inputs: BatchInput[];
  workflow: WorkflowTemplate;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: {
    total: number;
    completed: number;
    failed: number;
    currentStep?: string;
  };
  results: BatchResult[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedCompletion?: number;
}

interface BatchInput {
  id: string;
  imageUrl?: string;
  parameters: any;
  metadata?: any;
}

interface BatchResult {
  inputId: string;
  status: "success" | "failed" | "skipped";
  outputImages: string[];
  error?: string;
  executionTime: number;
  stepResults: StepResult[];
}

interface StepResult {
  stepId: string;
  status: "success" | "failed" | "skipped";
  outputImages: string[];
  metadata: any;
  executionTime: number;
  error?: string;
}

interface WorkflowExecution {
  id: string;
  batchId?: string;
  workflowId: string;
  inputId: string;
  status: "pending" | "running" | "completed" | "failed";
  currentStep?: string;
  stepResults: Map<string, StepResult>;
  startedAt: number;
  completedAt?: number;
}

class WorkflowAutomationService {
  private workflows: Map<string, WorkflowTemplate> = new Map();
  private batchOperations: Map<string, BatchOperation> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private readonly MAX_CONCURRENT_EXECUTIONS = 3;
  private runningExecutions = 0;

  constructor() {
    this.initializeBuiltInWorkflows();
  }

  // Initialize common workflow templates
  private initializeBuiltInWorkflows(): void {
    const workflows: WorkflowTemplate[] = [
      {
        id: "design_enhance_analyze",
        name: "Design → Enhance → Analyze",
        description:
          "Create design, upscale for quality, then analyze composition",
        category: "design",
        steps: [
          {
            id: "create_design",
            name: "Create Design",
            intent: "design",
            endpoint: "/api/design",
            parameters: {
              workflow_type: "prompt_only",
              size: "1024x1024",
              quality: "auto",
            },
          },
          {
            id: "upscale_design",
            name: "Enhance Quality",
            intent: "upscale_image",
            endpoint: "/api/upscale",
            parameters: { quality: "auto" },
            dependsOn: ["create_design"],
            condition: { type: "success" },
          },
          {
            id: "analyze_result",
            name: "Analyze Composition",
            intent: "analyze_image",
            endpoint: "/api/analyzeimage",
            parameters: {},
            dependsOn: ["upscale_design"],
            condition: { type: "success" },
          },
        ],
        inputRequirements: { images: 0, parameters: ["prompt"] },
        estimatedDuration: 90,
        tags: ["design", "enhancement", "analysis"],
      },
      {
        id: "multi_format_export",
        name: "Multi-Format Export",
        description: "Create design in multiple aspect ratios",
        category: "batch",
        steps: [
          {
            id: "create_base_design",
            name: "Create Base Design",
            intent: "design",
            endpoint: "/api/design",
            parameters: {
              workflow_type: "prompt_only",
              size: "1024x1024",
              quality: "auto",
            },
          },
          {
            id: "create_landscape",
            name: "Landscape Version",
            intent: "reframe_image",
            endpoint: "/api/reframe",
            parameters: { imageSize: "landscape" },
            dependsOn: ["create_base_design"],
          },
          {
            id: "create_portrait",
            name: "Portrait Version",
            intent: "reframe_image",
            endpoint: "/api/reframe",
            parameters: { imageSize: "portrait" },
            dependsOn: ["create_base_design"],
          },
          {
            id: "create_square",
            name: "Square Version",
            intent: "reframe_image",
            endpoint: "/api/reframe",
            parameters: { imageSize: "square_hd" },
            dependsOn: ["create_base_design"],
          },
        ],
        inputRequirements: { images: 0, parameters: ["prompt"] },
        estimatedDuration: 120,
        tags: ["batch", "formats", "reframe"],
      },
      {
        id: "quality_enhancement_suite",
        name: "Quality Enhancement Suite",
        description: "Comprehensive image enhancement pipeline",
        category: "enhancement",
        steps: [
          {
            id: "clarity_enhance",
            name: "Clarity Enhancement",
            intent: "clarity_upscale",
            endpoint: "/api/clarityupscaler",
            parameters: { upscaleFactor: 2, creativity: 0.35 },
          },
          {
            id: "standard_upscale",
            name: "Standard Upscale",
            intent: "upscale_image",
            endpoint: "/api/upscale",
            parameters: { quality: "auto" },
            dependsOn: ["clarity_enhance"],
          },
          {
            id: "final_analysis",
            name: "Quality Analysis",
            intent: "analyze_image",
            endpoint: "/api/analyzeimage",
            parameters: {},
            dependsOn: ["standard_upscale"],
          },
        ],
        inputRequirements: { images: 1, parameters: [] },
        estimatedDuration: 75,
        tags: ["enhancement", "quality", "upscale"],
      },
      {
        id: "design_variations",
        name: "Design Variations Generator",
        description: "Create multiple design variations with different styles",
        category: "design",
        steps: [
          {
            id: "base_design",
            name: "Base Design",
            intent: "design",
            endpoint: "/api/design",
            parameters: {
              workflow_type: "prompt_only",
              size: "1024x1024",
              quality: "auto",
            },
          },
          {
            id: "vintage_variation",
            name: "Vintage Style",
            intent: "design",
            endpoint: "/api/design",
            parameters: { workflow_type: "prompt_only", style: "vintage" },
            dependsOn: ["base_design"],
          },
          {
            id: "modern_variation",
            name: "Modern Style",
            intent: "design",
            endpoint: "/api/design",
            parameters: { workflow_type: "prompt_only", style: "modern" },
            dependsOn: ["base_design"],
          },
          {
            id: "artistic_variation",
            name: "Artistic Style",
            intent: "design",
            endpoint: "/api/design",
            parameters: { workflow_type: "prompt_only", style: "artistic" },
            dependsOn: ["base_design"],
          },
        ],
        inputRequirements: { images: 0, parameters: ["prompt"] },
        estimatedDuration: 150,
        tags: ["design", "variations", "styles"],
      },
    ];

    workflows.forEach((workflow) => {
      this.workflows.set(workflow.id, workflow);
    });

    console.log(`🔧 Initialized ${workflows.length} built-in workflows`);
  }

  // Create custom workflow
  async createWorkflow(
    userId: string,
    name: string,
    description: string,
    steps: Omit<WorkflowStep, "id">[],
    category: WorkflowTemplate["category"] = "custom",
  ): Promise<WorkflowTemplate> {
    const workflow: WorkflowTemplate = {
      id: `custom_${userId}_${Date.now()}`,
      name,
      description,
      category,
      steps: steps.map((step, index) => ({
        ...step,
        id: `step_${index + 1}`,
      })),
      inputRequirements: this.analyzeInputRequirements(steps),
      estimatedDuration: this.estimateWorkflowDuration(steps),
      tags: ["custom"],
    };

    this.workflows.set(workflow.id, workflow);
    console.log(`✨ Created custom workflow: ${name} (${workflow.id})`);
    return workflow;
  }

  // Start batch operation
  async startBatchOperation(
    userId: string,
    workflowId: string,
    inputs: Omit<BatchInput, "id">[],
    name?: string,
  ): Promise<BatchOperation> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const batchInputs: BatchInput[] = inputs.map((input, index) => ({
      ...input,
      id: `input_${index + 1}`,
    }));

    const batch: BatchOperation = {
      id: `batch_${userId}_${Date.now()}`,
      userId,
      name: name || `${workflow.name} - Batch`,
      type: "single_workflow_multiple_inputs",
      inputs: batchInputs,
      workflow,
      status: "pending",
      progress: {
        total: batchInputs.length,
        completed: 0,
        failed: 0,
      },
      results: [],
      createdAt: Date.now(),
      estimatedCompletion:
        Date.now() + workflow.estimatedDuration * batchInputs.length * 1000,
    };

    this.batchOperations.set(batch.id, batch);
    console.log(
      `🚀 Started batch operation: ${batch.name} (${batch.inputs.length} inputs)`,
    );

    // Start processing
    this.processBatch(batch.id);
    return batch;
  }

  // Process batch operation
  private async processBatch(batchId: string): Promise<void> {
    const batch = this.batchOperations.get(batchId);
    if (!batch) return;

    batch.status = "running";
    batch.startedAt = Date.now();

    console.log(
      `⚡ Processing batch ${batch.name} with ${batch.inputs.length} inputs`,
    );

    // Process inputs with concurrency control
    const concurrentLimit = Math.min(
      this.MAX_CONCURRENT_EXECUTIONS,
      batch.inputs.length,
    );
    const inputQueue = [...batch.inputs];
    const activePromises: Promise<void>[] = [];

    while (inputQueue.length > 0 || activePromises.length > 0) {
      // Start new executions up to the limit
      while (activePromises.length < concurrentLimit && inputQueue.length > 0) {
        const input = inputQueue.shift()!;
        const promise = this.executeWorkflowForInput(batch, input);
        activePromises.push(promise);
      }

      // Wait for at least one to complete
      if (activePromises.length > 0) {
        await Promise.race(activePromises);

        // Remove completed promises
        for (let i = activePromises.length - 1; i >= 0; i--) {
          const promise = activePromises[i];
          if (await this.isPromiseResolved(promise)) {
            activePromises.splice(i, 1);
          }
        }
      }
    }

    // Finalize batch
    batch.status = batch.progress.failed > 0 ? "failed" : "completed";
    batch.completedAt = Date.now();

    console.log(
      `✅ Batch completed: ${batch.progress.completed}/${batch.progress.total} successful`,
    );
  }

  // Execute workflow for single input
  private async executeWorkflowForInput(
    batch: BatchOperation,
    input: BatchInput,
  ): Promise<void> {
    const execution: WorkflowExecution = {
      id: `exec_${batch.id}_${input.id}`,
      batchId: batch.id,
      workflowId: batch.workflow.id,
      inputId: input.id,
      status: "running",
      stepResults: new Map(),
      startedAt: Date.now(),
    };

    this.executions.set(execution.id, execution);

    try {
      const result = await this.executeWorkflow(
        execution,
        batch.workflow,
        input,
      );

      batch.results.push(result);
      batch.progress.completed++;

      if (result.status === "failed") {
        batch.progress.failed++;
      }

      execution.status = "completed";
      execution.completedAt = Date.now();
    } catch (error: any) {
      const failedResult: BatchResult = {
        inputId: input.id,
        status: "failed",
        outputImages: [],
        error: error.message,
        executionTime: Date.now() - execution.startedAt,
        stepResults: [],
      };

      batch.results.push(failedResult);
      batch.progress.failed++;
      execution.status = "failed";
    }

    // Update batch progress
    batch.progress.currentStep = undefined;
    console.log(
      `📊 Batch progress: ${batch.progress.completed + batch.progress.failed}/${batch.progress.total}`,
    );
  }

  // Execute individual workflow
  private async executeWorkflow(
    execution: WorkflowExecution,
    workflow: WorkflowTemplate,
    input: BatchInput,
  ): Promise<BatchResult> {
    const result: BatchResult = {
      inputId: input.id,
      status: "success",
      outputImages: [],
      executionTime: 0,
      stepResults: [],
    };

    const startTime = Date.now();
    let currentImages = input.imageUrl ? [input.imageUrl] : [];

    // Execute steps in dependency order
    const executedSteps = new Set<string>();
    const stepQueue = [...workflow.steps];

    while (stepQueue.length > 0) {
      const readySteps = stepQueue.filter(
        (step) =>
          !step.dependsOn ||
          step.dependsOn.every((dep) => executedSteps.has(dep)),
      );

      if (readySteps.length === 0) {
        throw new Error("Circular dependency detected in workflow");
      }

      // Execute ready steps (can be parallel if no dependencies between them)
      for (const step of readySteps) {
        stepQueue.splice(stepQueue.indexOf(step), 1);

        try {
          const stepResult = await this.executeStep(
            step,
            currentImages,
            input.parameters,
          );
          execution.stepResults.set(step.id, stepResult);
          result.stepResults.push(stepResult);

          if (
            stepResult.status === "success" &&
            stepResult.outputImages.length > 0
          ) {
            currentImages = stepResult.outputImages;
          }

          executedSteps.add(step.id);
          execution.currentStep = step.name;
        } catch (error: any) {
          const failedStepResult: StepResult = {
            stepId: step.id,
            status: "failed",
            outputImages: [],
            metadata: {},
            executionTime: 0,
            error: error.message,
          };

          execution.stepResults.set(step.id, failedStepResult);
          result.stepResults.push(failedStepResult);
          result.status = "failed";
          break;
        }
      }

      if (result.status === "failed") break;
    }

    result.outputImages = currentImages;
    result.executionTime = Date.now() - startTime;
    return result;
  }

  // Execute individual step (would integrate with actual API routes)
  private async executeStep(
    step: WorkflowStep,
    inputImages: string[],
    parameters: any,
  ): Promise<StepResult> {
    const startTime = Date.now();

    // This would call the actual API endpoint
    // For now, simulate the execution
    console.log(`🔄 Executing step: ${step.name} (${step.endpoint})`);

    // Simulate processing time
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000),
    );

    // Simulate success/failure
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      return {
        stepId: step.id,
        status: "success",
        outputImages: [`simulated_output_${step.id}_${Date.now()}.png`],
        metadata: { simulatedStep: true },
        executionTime: Date.now() - startTime,
      };
    } else {
      throw new Error(`Step ${step.name} failed: Simulated failure`);
    }
  }

  // Utility methods
  private analyzeInputRequirements(
    steps: Omit<WorkflowStep, "id">[],
  ): WorkflowTemplate["inputRequirements"] {
    const imageRequired = steps.some((step) =>
      ["upscale_image", "analyze_image", "reframe_image"].includes(step.intent),
    );

    return {
      images: imageRequired ? 1 : 0,
      parameters: ["prompt"], // Basic requirement
    };
  }

  private estimateWorkflowDuration(steps: Omit<WorkflowStep, "id">[]): number {
    const baseDuration = steps.length * 15; // 15 seconds per step base
    const complexityMultiplier = steps.some((step) => step.intent === "design")
      ? 1.5
      : 1;
    return Math.round(baseDuration * complexityMultiplier);
  }

  private async isPromiseResolved(promise: Promise<any>): Promise<boolean> {
    try {
      await Promise.race([
        promise,
        new Promise((resolve) => setTimeout(resolve, 0)),
      ]);
      return true;
    } catch {
      return true; // Even if rejected, it's resolved
    }
  }

  // Public query methods
  getWorkflows(): WorkflowTemplate[] {
    return Array.from(this.workflows.values());
  }

  getWorkflowsByCategory(
    category: WorkflowTemplate["category"],
  ): WorkflowTemplate[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.category === category,
    );
  }

  getBatchOperation(batchId: string): BatchOperation | undefined {
    return this.batchOperations.get(batchId);
  }

  getUserBatchOperations(userId: string): BatchOperation[] {
    return Array.from(this.batchOperations.values()).filter(
      (b) => b.userId === userId,
    );
  }

  async cancelBatchOperation(batchId: string): Promise<boolean> {
    const batch = this.batchOperations.get(batchId);
    if (!batch || batch.status === "completed") return false;

    batch.status = "cancelled";
    console.log(`❌ Cancelled batch operation: ${batch.name}`);
    return true;
  }
}

// Export singleton instance
export const workflowAutomation = new WorkflowAutomationService();

// Export types
export type {
  WorkflowTemplate,
  WorkflowStep,
  BatchOperation,
  BatchInput,
  BatchResult,
  WorkflowExecution,
};
