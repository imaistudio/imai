interface UserProject {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  images: ProjectImage[];
  operations: ProjectOperation[];
  styleProfile: StyleProfile;
  status: "active" | "completed" | "archived";
}

interface ProjectImage {
  id: string;
  url: string;
  type: "input" | "output" | "reference";
  operation: string;
  timestamp: number;
  metadata: {
    size?: string;
    quality?: string;
    workflow?: string;
    prompt?: string;
  };
  tags: string[];
}

interface ProjectOperation {
  id: string;
  intent: string;
  endpoint: string;
  parameters: any;
  inputImages: string[];
  outputImages: string[];
  timestamp: number;
  userMessage: string;
  success: boolean;
  executionTime?: number;
}

interface StyleProfile {
  preferredColors: string[];
  favoriteStyles: string[];
  commonKeywords: string[];
  qualityPreferences: {
    defaultSize: string;
    defaultQuality: string;
  };
  workflowPatterns: string[];
  lastUsedEndpoints: string[];
}

interface ConversationContext {
  userId: string;
  currentProject?: UserProject;
  recentProjects: UserProject[];
  sessionHistory: SessionMessage[];
  visualMemory: VisualMemory[];
  preferences: UserPreferences;
}

interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  images: string[];
  intent?: string;
  operation?: ProjectOperation;
}

interface VisualMemory {
  imageUrl: string;
  description: string;
  dominantColors: string[];
  style: string;
  associatedKeywords: string[];
  timestamp: number;
  projectId?: string;
  userRating?: number; // 1-5 stars
}

interface UserPreferences {
  defaultWorkflows: string[];
  favoriteEndpoints: string[];
  styleKeywords: string[];
  qualitySettings: {
    size: string;
    quality: string;
  };
  notificationSettings: {
    suggestions: boolean;
    completions: boolean;
    tips: boolean;
  };
}

class ConversationMemoryService {
  private userContexts: Map<string, ConversationContext> = new Map();
  private projects: Map<string, UserProject> = new Map();
  private readonly MAX_SESSION_HISTORY = 50;
  private readonly MAX_VISUAL_MEMORY = 100;
  private readonly PROJECT_INACTIVITY_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

  // Initialize or get user context
  async getUserContext(userId: string): Promise<ConversationContext> {
    if (!this.userContexts.has(userId)) {
      const context: ConversationContext = {
        userId,
        recentProjects: await this.loadRecentProjects(userId),
        sessionHistory: [],
        visualMemory: await this.loadVisualMemory(userId),
        preferences: await this.loadUserPreferences(userId),
      };
      this.userContexts.set(userId, context);
    }
    return this.userContexts.get(userId)!;
  }

  // Create or update project
  async createProject(
    userId: string,
    name: string,
    description?: string,
  ): Promise<UserProject> {
    const project: UserProject = {
      id: `proj_${userId}_${Date.now()}`,
      userId,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      images: [],
      operations: [],
      styleProfile: {
        preferredColors: [],
        favoriteStyles: [],
        commonKeywords: [],
        qualityPreferences: {
          defaultSize: "1024x1024",
          defaultQuality: "auto",
        },
        workflowPatterns: [],
        lastUsedEndpoints: [],
      },
      status: "active",
    };

    this.projects.set(project.id, project);

    const context = await this.getUserContext(userId);
    context.currentProject = project;
    context.recentProjects.unshift(project);

    // Keep only recent projects
    context.recentProjects = context.recentProjects.slice(0, 10);

    console.log(`📁 Created new project: ${name} (${project.id})`);
    return project;
  }

  // Add operation to current project
  async addOperation(
    userId: string,
    operation: Omit<ProjectOperation, "id" | "timestamp">,
  ): Promise<void> {
    const context = await this.getUserContext(userId);

    // Create project if none exists
    if (!context.currentProject) {
      const projectName = this.generateProjectName(
        operation.userMessage,
        operation.intent,
      );
      context.currentProject = await this.createProject(userId, projectName);
    }

    const fullOperation: ProjectOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    context.currentProject.operations.push(fullOperation);
    context.currentProject.updatedAt = Date.now();

    // Update style profile
    this.updateStyleProfile(context.currentProject, operation);

    // Add to visual memory if output images exist
    if (operation.outputImages.length > 0) {
      for (const imageUrl of operation.outputImages) {
        await this.addToVisualMemory(userId, imageUrl, operation);
      }
    }

    console.log(
      `📝 Added operation to project ${context.currentProject.name}: ${operation.intent}`,
    );
  }

  // Add image to visual memory with analysis
  async addToVisualMemory(
    userId: string,
    imageUrl: string,
    operation: Omit<ProjectOperation, "id" | "timestamp">,
  ): Promise<void> {
    const context = await this.getUserContext(userId);

    const visualMemory: VisualMemory = {
      imageUrl,
      description: this.generateImageDescription(operation),
      dominantColors: await this.extractColors(imageUrl),
      style: this.inferStyle(operation),
      associatedKeywords: this.extractKeywords(operation.userMessage),
      timestamp: Date.now(),
      projectId: context.currentProject?.id,
    };

    context.visualMemory.unshift(visualMemory);

    // Keep memory size manageable
    if (context.visualMemory.length > this.MAX_VISUAL_MEMORY) {
      context.visualMemory = context.visualMemory.slice(
        0,
        this.MAX_VISUAL_MEMORY,
      );
    }

    console.log(`🖼️ Added to visual memory: ${visualMemory.description}`);
  }

  // Find relevant context for current request
  async findRelevantContext(
    userId: string,
    userMessage: string,
  ): Promise<{
    similarProjects: UserProject[];
    relatedImages: VisualMemory[];
    suggestedOperations: string[];
    contextSummary: string;
  }> {
    const context = await this.getUserContext(userId);
    const keywords = this.extractKeywords(userMessage.toLowerCase());

    // Find similar projects
    const similarProjects = context.recentProjects
      .filter(
        (project) =>
          project.tags.some((tag) => keywords.includes(tag)) ||
          project.operations.some((op) =>
            keywords.some((keyword) =>
              op.userMessage.toLowerCase().includes(keyword),
            ),
          ),
      )
      .slice(0, 3);

    // Find related images
    const relatedImages = context.visualMemory
      .filter(
        (memory) =>
          memory.associatedKeywords.some((keyword) =>
            keywords.includes(keyword),
          ) ||
          keywords.some((keyword) =>
            memory.description.toLowerCase().includes(keyword),
          ),
      )
      .slice(0, 5);

    // Suggest operations based on patterns
    const suggestedOperations = this.generateOperationSuggestions(
      context,
      userMessage,
    );

    // Create context summary
    const contextSummary = this.generateContextSummary(
      context,
      similarProjects,
      relatedImages,
    );

    return {
      similarProjects,
      relatedImages,
      suggestedOperations,
      contextSummary,
    };
  }

  // Generate smart project name
  private generateProjectName(userMessage: string, intent: string): string {
    const keywords = this.extractKeywords(userMessage);
    const intentMap: Record<string, string> = {
      design: "Design",
      upscale_image: "Enhancement",
      analyze_image: "Analysis",
      reframe_image: "Reframe",
      create_video: "Animation",
    };

    const baseIntent = intentMap[intent] || "Project";
    const mainKeyword = keywords.find((k) =>
      [
        "shirt",
        "logo",
        "poster",
        "banner",
        "product",
        "rocket",
        "plane",
        "car",
      ].includes(k),
    );

    return mainKeyword
      ? `${baseIntent} - ${mainKeyword}`
      : `${baseIntent} - ${new Date().toLocaleDateString()}`;
  }

  // Update style profile based on operations
  private updateStyleProfile(
    project: UserProject,
    operation: Omit<ProjectOperation, "id" | "timestamp">,
  ): void {
    const keywords = this.extractKeywords(operation.userMessage);

    // Update common keywords
    keywords.forEach((keyword) => {
      if (!project.styleProfile.commonKeywords.includes(keyword)) {
        project.styleProfile.commonKeywords.push(keyword);
      }
    });

    // Update last used endpoints
    if (!project.styleProfile.lastUsedEndpoints.includes(operation.endpoint)) {
      project.styleProfile.lastUsedEndpoints.unshift(operation.endpoint);
      project.styleProfile.lastUsedEndpoints =
        project.styleProfile.lastUsedEndpoints.slice(0, 5);
    }

    // Update quality preferences
    if (operation.parameters.size) {
      project.styleProfile.qualityPreferences.defaultSize =
        operation.parameters.size;
    }
    if (operation.parameters.quality) {
      project.styleProfile.qualityPreferences.defaultQuality =
        operation.parameters.quality;
    }
  }

  // Extract keywords from text
  private extractKeywords(text: string): string[] {
    const commonWords = [
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "can",
      "could",
      "should",
      "would",
      "will",
      "make",
      "create",
      "generate",
      "please",
      "now",
      "good",
    ];
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.includes(word))
      .slice(0, 10);
  }

  // Generate image description
  private generateImageDescription(
    operation: Omit<ProjectOperation, "id" | "timestamp">,
  ): string {
    const intent = operation.intent.replace("_", " ");
    const keywords = this.extractKeywords(operation.userMessage)
      .slice(0, 3)
      .join(", ");
    return `${intent} result${keywords ? ` featuring ${keywords}` : ""}`;
  }

  // Infer style from operation
  private inferStyle(
    operation: Omit<ProjectOperation, "id" | "timestamp">,
  ): string {
    const message = operation.userMessage.toLowerCase();

    if (message.includes("vintage") || message.includes("retro"))
      return "vintage";
    if (message.includes("modern") || message.includes("clean"))
      return "modern";
    if (message.includes("artistic") || message.includes("creative"))
      return "artistic";
    if (message.includes("minimal") || message.includes("simple"))
      return "minimal";
    if (message.includes("bold") || message.includes("vibrant")) return "bold";

    return "general";
  }

  // Extract dominant colors (placeholder - would use actual image analysis)
  private async extractColors(imageUrl: string): Promise<string[]> {
    // This would integrate with actual color extraction
    // For now, return common colors based on context
    return ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"];
  }

  // Generate operation suggestions
  private generateOperationSuggestions(
    context: ConversationContext,
    userMessage: string,
  ): string[] {
    const recentEndpoints =
      context.currentProject?.styleProfile.lastUsedEndpoints || [];
    const suggestions = [];

    // Based on recent patterns
    if (recentEndpoints.includes("/api/design")) {
      suggestions.push("upscale_image", "reframe_image", "analyze_image");
    }
    if (recentEndpoints.includes("/api/upscale")) {
      suggestions.push("reframe_image", "analyze_image");
    }

    // Based on message content
    const message = userMessage.toLowerCase();
    if (message.includes("bigger") || message.includes("enhance")) {
      suggestions.push("upscale_image");
    }
    if (message.includes("analyze") || message.includes("describe")) {
      suggestions.push("analyze_image");
    }

    return Array.from(new Set(suggestions)).slice(0, 3);
  }

  // Generate context summary
  private generateContextSummary(
    context: ConversationContext,
    similarProjects: UserProject[],
    relatedImages: VisualMemory[],
  ): string {
    const parts = [];

    if (context.currentProject) {
      parts.push(`Currently working on: ${context.currentProject.name}`);
    }

    if (similarProjects.length > 0) {
      parts.push(
        `Similar past projects: ${similarProjects.map((p) => p.name).join(", ")}`,
      );
    }

    if (relatedImages.length > 0) {
      parts.push(
        `Related visual elements: ${relatedImages.map((img) => img.style).join(", ")}`,
      );
    }

    return parts.join(" | ") || "Starting fresh session";
  }

  // Load methods (would integrate with persistent storage)
  private async loadRecentProjects(userId: string): Promise<UserProject[]> {
    // Would load from database
    return [];
  }

  private async loadVisualMemory(userId: string): Promise<VisualMemory[]> {
    // Would load from database
    return [];
  }

  private async loadUserPreferences(userId: string): Promise<UserPreferences> {
    return {
      defaultWorkflows: [],
      favoriteEndpoints: [],
      styleKeywords: [],
      qualitySettings: {
        size: "1024x1024",
        quality: "auto",
      },
      notificationSettings: {
        suggestions: true,
        completions: true,
        tips: true,
      },
    };
  }

  // Get project by reference
  async getProjectByReference(
    userId: string,
    reference: string,
  ): Promise<UserProject | null> {
    const context = await this.getUserContext(userId);

    // Try to find by name
    const byName = context.recentProjects.find((p) =>
      p.name.toLowerCase().includes(reference.toLowerCase()),
    );
    if (byName) return byName;

    // Try to find by recent activity
    if (
      reference.includes("last") ||
      reference.includes("recent") ||
      reference.includes("previous")
    ) {
      return context.recentProjects[0] || null;
    }

    return null;
  }

  // Archive old projects
  async archiveInactiveProjects(userId: string): Promise<void> {
    const context = await this.getUserContext(userId);
    const now = Date.now();

    context.recentProjects.forEach((project) => {
      if (now - project.updatedAt > this.PROJECT_INACTIVITY_THRESHOLD) {
        project.status = "archived";
      }
    });

    // Remove archived projects from recent list
    context.recentProjects = context.recentProjects.filter(
      (p) => p.status !== "archived",
    );
  }
}

// Export singleton instance
export const conversationMemory = new ConversationMemoryService();

// Export types
export type {
  UserProject,
  ProjectImage,
  ProjectOperation,
  ConversationContext,
  VisualMemory,
  StyleProfile,
  UserPreferences,
};
