import { claudeLLM } from "./claudeLLM";
import {
  conversationMemory,
  type UserProject,
  type VisualMemory,
} from "./conversationMemory";
import {
  workflowAutomation,
  type WorkflowTemplate,
} from "./workflowAutomation";

interface RecommendationContext {
  userId: string;
  currentProject?: UserProject;
  recentImages: VisualMemory[];
  userMessage?: string;
  lastOperation?: string;
  sessionDuration: number;
  userPreferences: UserPreferences;
}

interface UserPreferences {
  favoriteStyles: string[];
  preferredQuality: string;
  commonWorkflows: string[];
  timeOfDay: "morning" | "afternoon" | "evening";
  skillLevel: "beginner" | "intermediate" | "advanced";
}

interface SmartRecommendation {
  id: string;
  type: "operation" | "workflow" | "optimization" | "learning" | "creative";
  title: string;
  description: string;
  action: RecommendationAction;
  confidence: number; // 0-1
  reasoning: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  estimatedTime?: number;
  benefits: string[];
  prerequisites?: string[];
}

interface RecommendationAction {
  type:
    | "execute_operation"
    | "start_workflow"
    | "adjust_settings"
    | "learn_more"
    | "explore";
  intent?: string;
  endpoint?: string;
  parameters?: any;
  workflowId?: string;
  url?: string;
  message?: string;
}

interface RecommendationSet {
  immediate: SmartRecommendation[]; // Next logical steps
  creative: SmartRecommendation[]; // Creative suggestions
  optimization: SmartRecommendation[]; // Workflow improvements
  learning: SmartRecommendation[]; // Educational content
  contextual: SmartRecommendation[]; // Based on current context
}

class SmartRecommendationEngine {
  private userRecommendations: Map<string, SmartRecommendation[]> = new Map();
  private recommendationHistory: Map<string, string[]> = new Map();
  private readonly RECOMMENDATION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Generate comprehensive recommendations
  async generateRecommendations(
    userId: string,
    context: Partial<RecommendationContext> = {},
  ): Promise<RecommendationSet> {
    console.log(`🎯 Generating smart recommendations for user ${userId}`);

    // Build full context
    const fullContext = await this.buildRecommendationContext(userId, context);

    // Generate different types of recommendations in parallel
    const [immediate, creative, optimization, learning, contextual] =
      await Promise.all([
        this.generateImmediateRecommendations(fullContext),
        this.generateCreativeRecommendations(fullContext),
        this.generateOptimizationRecommendations(fullContext),
        this.generateLearningRecommendations(fullContext),
        this.generateContextualRecommendations(fullContext),
      ]);

    const recommendationSet: RecommendationSet = {
      immediate,
      creative,
      optimization,
      learning,
      contextual,
    };

    // Cache recommendations
    const allRecommendations = [
      ...immediate,
      ...creative,
      ...optimization,
      ...learning,
      ...contextual,
    ];
    this.userRecommendations.set(userId, allRecommendations);

    console.log(
      `✨ Generated ${allRecommendations.length} recommendations across 5 categories`,
    );
    return recommendationSet;
  }

  // Generate immediate next-step recommendations
  private async generateImmediateRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    // Based on last operation
    if (context.lastOperation) {
      const nextSteps = this.getLogicalNextSteps(context.lastOperation);
      recommendations.push(
        ...nextSteps.map((step) => ({
          id: `immediate_${step.intent}_${Date.now()}`,
          type: "operation" as const,
          title: step.title,
          description: step.description,
          action: {
            type: "execute_operation" as const,
            intent: step.intent,
            endpoint: step.endpoint,
            parameters: step.parameters,
          },
          confidence: step.confidence,
          reasoning: step.reasoning,
          priority: "high" as const,
          category: "Next Steps",
          estimatedTime: step.estimatedTime,
          benefits: step.benefits,
        })),
      );
    }

    // Based on current project state
    if (context.currentProject) {
      const projectRecommendations =
        await this.generateProjectBasedRecommendations(context.currentProject);
      recommendations.push(...projectRecommendations);
    }

    return recommendations.slice(0, 3); // Top 3 immediate recommendations
  }

  // Generate creative exploration recommendations
  private async generateCreativeRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    // Use local LLM for creative suggestions
    if (context.recentImages.length > 0) {
      const creativePrompt = this.buildCreativePrompt(context);
      const llmResponse = await claudeLLM.generateCasualResponse(
        creativePrompt,
        context.userId,
      );

      if (llmResponse.success) {
        const creativeSuggestions = this.parseCreativeSuggestions(
          llmResponse.text,
        );
        recommendations.push(...creativeSuggestions);
      }
    }

    // Style exploration based on preferences
    const unexploredStyles = this.findUnexploredStyles(context.userPreferences);
    recommendations.push(
      ...unexploredStyles.map((style) => ({
        id: `creative_style_${style}_${Date.now()}`,
        type: "creative" as const,
        title: `Explore ${style} Style`,
        description: `Try creating designs with ${style} aesthetic to expand your creative range`,
        action: {
          type: "execute_operation" as const,
          intent: "design",
          endpoint: "/api/design",
          parameters: { style, workflow_type: "prompt_only" },
        },
        confidence: 0.7,
        reasoning: `You haven't explored ${style} style recently`,
        priority: "medium" as const,
        category: "Style Exploration",
        estimatedTime: 30,
        benefits: [
          `Discover new ${style} aesthetics`,
          "Expand creative toolkit",
          "Learn new techniques",
        ],
      })),
    );

    return recommendations.slice(0, 4);
  }

  // Generate workflow optimization recommendations
  private async generateOptimizationRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    // Analyze user patterns for workflow suggestions
    if (
      context.currentProject &&
      context.currentProject.operations.length >= 3
    ) {
      const patterns = this.analyzeOperationPatterns(
        context.currentProject.operations,
      );

      if (patterns.repeatingSequence) {
        const suggestedWorkflow = this.findMatchingWorkflow(
          patterns.repeatingSequence,
        );
        if (suggestedWorkflow) {
          recommendations.push({
            id: `workflow_${suggestedWorkflow.id}_${Date.now()}`,
            type: "workflow",
            title: `Use ${suggestedWorkflow.name} Workflow`,
            description: `Automate your common sequence: ${patterns.repeatingSequence.join(" → ")}`,
            action: {
              type: "start_workflow",
              workflowId: suggestedWorkflow.id,
            },
            confidence: 0.85,
            reasoning:
              "Detected repeating operation pattern that matches this workflow",
            priority: "high",
            category: "Workflow Optimization",
            estimatedTime: suggestedWorkflow.estimatedDuration,
            benefits: [
              "Save time on repetitive tasks",
              "Ensure consistent quality",
              "Reduce manual steps",
            ],
          });
        }
      }
    }

    // Batch processing suggestions
    if (context.recentImages.length >= 3) {
      recommendations.push({
        id: `batch_processing_${Date.now()}`,
        type: "optimization",
        title: "Batch Process Similar Images",
        description:
          "Process multiple images with the same workflow to save time",
        action: {
          type: "start_workflow",
          workflowId: "quality_enhancement_suite",
        },
        confidence: 0.75,
        reasoning:
          "Multiple similar images detected that could benefit from batch processing",
        priority: "medium",
        category: "Efficiency",
        estimatedTime: 180,
        benefits: [
          "Process multiple images simultaneously",
          "Consistent results",
          "Time savings",
        ],
      });
    }

    return recommendations;
  }

  // Generate learning recommendations
  private async generateLearningRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    // Skill-based learning suggestions
    const skillGaps = this.identifySkillGaps(context);
    recommendations.push(
      ...skillGaps.map((gap) => ({
        id: `learning_${gap.skill}_${Date.now()}`,
        type: "learning" as const,
        title: `Learn ${gap.skill}`,
        description: gap.description,
        action: {
          type: "learn_more" as const,
          url: gap.resourceUrl,
          message: gap.actionMessage,
        },
        confidence: gap.confidence,
        reasoning: gap.reasoning,
        priority: "low" as const,
        category: "Skill Development",
        benefits: gap.benefits,
      })),
    );

    // Feature discovery
    const unusedFeatures = this.findUnusedFeatures(context);
    recommendations.push(...unusedFeatures.slice(0, 2));

    return recommendations;
  }

  // Generate contextual recommendations
  private async generateContextualRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    // Time-based recommendations
    const timeRecommendations = this.generateTimeBasedRecommendations(context);
    recommendations.push(...timeRecommendations);

    // Seasonal/trending recommendations
    const trendingRecommendations =
      await this.generateTrendingRecommendations(context);
    recommendations.push(...trendingRecommendations);

    return recommendations;
  }

  // Helper methods
  private async buildRecommendationContext(
    userId: string,
    partialContext: Partial<RecommendationContext>,
  ): Promise<RecommendationContext> {
    const memoryContext = await conversationMemory.getUserContext(userId);

    return {
      userId,
      currentProject:
        partialContext.currentProject || memoryContext.currentProject,
      recentImages:
        partialContext.recentImages || memoryContext.visualMemory.slice(0, 5),
      userMessage: partialContext.userMessage,
      lastOperation:
        partialContext.lastOperation ||
        memoryContext.currentProject?.operations[
          memoryContext.currentProject.operations.length - 1
        ]?.intent,
      sessionDuration: partialContext.sessionDuration || 0,
      userPreferences: partialContext.userPreferences || {
        favoriteStyles:
          memoryContext.currentProject?.styleProfile.favoriteStyles || [],
        preferredQuality:
          memoryContext.currentProject?.styleProfile.qualityPreferences
            .defaultQuality || "auto",
        commonWorkflows:
          memoryContext.currentProject?.styleProfile.lastUsedEndpoints || [],
        timeOfDay: this.getTimeOfDay(),
        skillLevel: "intermediate", // Would be determined from user behavior
      },
    };
  }

  private getLogicalNextSteps(lastOperation: string): Array<{
    intent: string;
    endpoint: string;
    title: string;
    description: string;
    parameters: any;
    confidence: number;
    reasoning: string;
    estimatedTime: number;
    benefits: string[];
  }> {
    const nextStepsMap: Record<string, any[]> = {
      design: [
        {
          intent: "upscale_image",
          endpoint: "/api/upscale",
          title: "Enhance Quality",
          description: "Upscale your design for better resolution and clarity",
          parameters: { quality: "auto" },
          confidence: 0.9,
          reasoning: "New designs often benefit from quality enhancement",
          estimatedTime: 15,
          benefits: [
            "Higher resolution",
            "Better print quality",
            "Enhanced details",
          ],
        },
      ],
      upscale_image: [
        {
          intent: "analyze_image",
          endpoint: "/api/analyzeimage",
          title: "Analyze Result",
          description: "Get detailed analysis of your enhanced image",
          parameters: {},
          confidence: 0.7,
          reasoning: "Analysis helps understand enhancement results",
          estimatedTime: 10,
          benefits: [
            "Quality assessment",
            "Composition analysis",
            "Improvement suggestions",
          ],
        },
      ],
    };

    return nextStepsMap[lastOperation] || [];
  }

  private async generateProjectBasedRecommendations(
    project: UserProject,
  ): Promise<SmartRecommendation[]> {
    const recommendations: SmartRecommendation[] = [];

    if (project.operations.length >= 5 && project.status === "active") {
      recommendations.push({
        id: `complete_project_${project.id}`,
        type: "optimization",
        title: "Complete Project",
        description: `Your project "${project.name}" has multiple iterations. Consider finalizing it.`,
        action: {
          type: "adjust_settings",
          message: "Mark project as completed and start fresh",
        },
        confidence: 0.6,
        reasoning:
          "Project has multiple operations and might benefit from completion",
        priority: "low",
        category: "Project Management",
        benefits: [
          "Organize workspace",
          "Start fresh",
          "Archive completed work",
        ],
      });
    }

    return recommendations;
  }

  private buildCreativePrompt(context: RecommendationContext): string {
    const recentStyles = context.recentImages
      .map((img) => img.style)
      .join(", ");
    const recentKeywords = context.recentImages
      .flatMap((img) => img.associatedKeywords)
      .slice(0, 10)
      .join(", ");

    return `Based on recent creative work involving ${recentStyles} styles and elements like ${recentKeywords}, suggest 3 creative directions that would be interesting to explore.`;
  }

  private parseCreativeSuggestions(llmResponse: string): SmartRecommendation[] {
    const suggestions = llmResponse
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, 3);

    return suggestions.map((suggestion, index) => ({
      id: `creative_llm_${Date.now()}_${index}`,
      type: "creative" as const,
      title: `Creative Direction ${index + 1}`,
      description: suggestion,
      action: {
        type: "execute_operation" as const,
        intent: "design",
        endpoint: "/api/design",
        parameters: { workflow_type: "prompt_only", prompt: suggestion },
      },
      confidence: 0.7,
      reasoning: "AI-generated creative suggestion based on your recent work",
      priority: "medium" as const,
      category: "AI Creativity",
      estimatedTime: 30,
      benefits: [
        "Explore new directions",
        "AI-powered creativity",
        "Expand artistic range",
      ],
    }));
  }

  private findUnexploredStyles(preferences: UserPreferences): string[] {
    const allStyles = ["vintage", "modern", "artistic", "minimal", "bold"];
    const exploredStyles = preferences.favoriteStyles;
    return allStyles
      .filter((style) => !exploredStyles.includes(style))
      .slice(0, 2);
  }

  private analyzeOperationPatterns(operations: any[]): {
    repeatingSequence?: string[];
  } {
    if (operations.length < 3) return {};

    const recentOps = operations.slice(-6).map((op) => op.intent);
    const commonPatterns = [
      ["design", "upscale_image", "analyze_image"],
      ["design", "reframe_image", "upscale_image"],
    ];

    for (const pattern of commonPatterns) {
      if (this.sequenceContainsPattern(recentOps, pattern)) {
        return { repeatingSequence: pattern };
      }
    }

    return {};
  }

  private sequenceContainsPattern(
    sequence: string[],
    pattern: string[],
  ): boolean {
    for (let i = 0; i <= sequence.length - pattern.length; i++) {
      if (pattern.every((p, idx) => sequence[i + idx] === p)) {
        return true;
      }
    }
    return false;
  }

  private findMatchingWorkflow(pattern: string[]): WorkflowTemplate | null {
    const workflows = workflowAutomation.getWorkflows();

    return (
      workflows.find((workflow) =>
        workflow.steps.some((step) => pattern.includes(step.intent)),
      ) || null
    );
  }

  private identifySkillGaps(context: RecommendationContext): Array<{
    skill: string;
    description: string;
    resourceUrl: string;
    actionMessage: string;
    confidence: number;
    reasoning: string;
    benefits: string[];
  }> {
    return [
      {
        skill: "Image Reframing",
        description: "Learn to create different aspect ratios and compositions",
        resourceUrl: "/docs/reframing",
        actionMessage:
          "Try the reframe tool to create landscape, portrait, and square versions",
        confidence: 0.8,
        reasoning: "User has not used reframing functionality",
        benefits: [
          "Multiple format options",
          "Better compositions",
          "Social media optimization",
        ],
      },
    ];
  }

  private findUnusedFeatures(
    context: RecommendationContext,
  ): SmartRecommendation[] {
    return [
      {
        id: `feature_discovery_${Date.now()}`,
        type: "learning",
        title: "Discover Batch Processing",
        description: "Process multiple images at once with automated workflows",
        action: {
          type: "explore",
          message: "Try batch processing to handle multiple images efficiently",
        },
        confidence: 0.6,
        reasoning: "User has not explored batch processing capabilities",
        priority: "low",
        category: "Feature Discovery",
        benefits: [
          "Time savings",
          "Consistent processing",
          "Workflow automation",
        ],
      },
    ];
  }

  private generateTimeBasedRecommendations(
    context: RecommendationContext,
  ): SmartRecommendation[] {
    if (context.userPreferences.timeOfDay === "morning") {
      return [
        {
          id: `morning_creativity_${Date.now()}`,
          type: "creative",
          title: "Morning Creative Session",
          description: "Start your day with a fresh design exploration",
          action: {
            type: "execute_operation",
            intent: "design",
            endpoint: "/api/design",
            parameters: { workflow_type: "prompt_only", creativity: "high" },
          },
          confidence: 0.7,
          reasoning: "Morning is often the most creative time of day",
          priority: "medium",
          category: "Timing",
          estimatedTime: 20,
          benefits: [
            "Fresh perspective",
            "High creativity",
            "Productive start",
          ],
        },
      ];
    }
    return [];
  }

  private async generateTrendingRecommendations(
    context: RecommendationContext,
  ): Promise<SmartRecommendation[]> {
    return [
      {
        id: `trending_${Date.now()}`,
        type: "creative",
        title: "Try Minimalist Design",
        description: "Minimalist aesthetics are trending in design",
        action: {
          type: "execute_operation",
          intent: "design",
          endpoint: "/api/design",
          parameters: { style: "minimal" },
        },
        confidence: 0.6,
        reasoning: "Minimalist design is currently trending",
        priority: "low",
        category: "Trends",
        estimatedTime: 25,
        benefits: [
          "Stay current",
          "Learn trending styles",
          "Modern aesthetics",
        ],
      },
    ];
  }

  private getTimeOfDay(): "morning" | "afternoon" | "evening" {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  }

  // Public methods
  async getRecommendationsForUser(
    userId: string,
  ): Promise<SmartRecommendation[]> {
    return this.userRecommendations.get(userId) || [];
  }

  async executeRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<boolean> {
    const recommendations = this.userRecommendations.get(userId) || [];
    const recommendation = recommendations.find(
      (r) => r.id === recommendationId,
    );

    if (!recommendation) return false;

    const history = this.recommendationHistory.get(userId) || [];
    history.push(recommendationId);
    this.recommendationHistory.set(userId, history);

    console.log(`✅ Executed recommendation: ${recommendation.title}`);
    return true;
  }

  async getRealTimeRecommendation(
    userId: string,
    currentContext: string,
  ): Promise<SmartRecommendation | null> {
    const context = await this.buildRecommendationContext(userId, {
      userMessage: currentContext,
    });
    const immediate = await this.generateImmediateRecommendations(context);

    return immediate[0] || null;
  }
}

export const smartRecommendations = new SmartRecommendationEngine();

export type {
  SmartRecommendation,
  RecommendationSet,
  RecommendationContext,
  RecommendationAction,
};
