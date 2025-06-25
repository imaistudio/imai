// User Agents - Customer-facing AI assistants
export interface UserAgent {
  id: string;
  name: string;
  type:
    | "design_assistant"
    | "style_advisor"
    | "color_expert"
    | "trend_scout"
    | "custom";
  description: string;
  capabilities: string[];
  userId: string;
  isActive: boolean;
  customPrompt?: string;
  preferences: {
    designStyle: string[];
    colorPreferences: string[];
    productTypes: string[];
  };
  conversationHistory: AgentMessage[];
  createdAt: Date;
  lastUsed: Date;
}

export interface AgentMessage {
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  images?: string[];
  actions?: AgentAction[];
}

export interface AgentAction {
  type: "generate_design" | "suggest_colors" | "find_trends" | "analyze_image";
  parameters: Record<string, any>;
  result?: any;
}

// Predefined User Agent Templates
export const USER_AGENT_TEMPLATES = {
  design_assistant: {
    name: "Design Assistant",
    description:
      "Helps you create and refine designs with personalized suggestions",
    capabilities: [
      "Generate design variations",
      "Suggest improvements",
      "Match your style preferences",
      "Create design series",
    ],
    systemPrompt: `You are a personal design assistant. Help users create beautiful designs that match their style preferences. Always consider their past designs and preferences when making suggestions.`,
  },

  style_advisor: {
    name: "Style Advisor",
    description: "Your personal fashion and design style consultant",
    capabilities: [
      "Analyze your style profile",
      "Suggest trending styles",
      "Match designs to occasions",
      "Create style guides",
    ],
    systemPrompt: `You are a style consultant specializing in fashion and design trends. Provide personalized style advice based on the user's preferences and current trends.`,
  },

  color_expert: {
    name: "Color Expert",
    description: "Specialist in color theory and palette creation",
    capabilities: [
      "Create custom color palettes",
      "Analyze color harmony",
      "Suggest seasonal colors",
      "Match colors to mood",
    ],
    systemPrompt: `You are a color theory expert. Help users understand and apply color principles to create harmonious and impactful designs.`,
  },

  trend_scout: {
    name: "Trend Scout",
    description: "Keeps you updated with the latest design trends",
    capabilities: [
      "Find trending designs",
      "Predict upcoming trends",
      "Analyze market preferences",
      "Suggest viral-worthy designs",
    ],
    systemPrompt: `You are a trend analyst with deep knowledge of current and emerging design trends. Help users create designs that are both trendy and timeless.`,
  },
};

export class UserAgentManager {
  async createAgent(
    userId: string,
    template: keyof typeof USER_AGENT_TEMPLATES,
    customization?: Partial<UserAgent>,
  ): Promise<UserAgent> {
    const template_data = USER_AGENT_TEMPLATES[template];

    const agent: UserAgent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: customization?.name || template_data.name,
      type: template,
      description: customization?.description || template_data.description,
      capabilities: template_data.capabilities,
      userId,
      isActive: true,
      customPrompt: customization?.customPrompt,
      preferences: customization?.preferences || {
        designStyle: [],
        colorPreferences: [],
        productTypes: [],
      },
      conversationHistory: [],
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Save to database/storage
    await this.saveAgent(agent);
    return agent;
  }

  async createCustomAgent(
    userId: string,
    customization: Partial<UserAgent> & { name: string; description: string },
  ): Promise<UserAgent> {
    const agent: UserAgent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: customization.name,
      type: "custom",
      description: customization.description,
      capabilities: customization.capabilities || ["Custom AI assistant"],
      userId,
      isActive: true,
      customPrompt: customization.customPrompt,
      preferences: customization.preferences || {
        designStyle: [],
        colorPreferences: [],
        productTypes: [],
      },
      conversationHistory: [],
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    await this.saveAgent(agent);
    return agent;
  }

  async chatWithAgent(
    agentId: string,
    message: string,
    images?: string[],
  ): Promise<string> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error("Agent not found");

    // Add user message to history
    agent.conversationHistory.push({
      role: "user",
      content: message,
      timestamp: new Date(),
      images,
    });

    // Generate response based on agent type and history
    const response = await this.generateAgentResponse(agent, message, images);

    // Add agent response to history
    agent.conversationHistory.push({
      role: "agent",
      content: response,
      timestamp: new Date(),
    });

    agent.lastUsed = new Date();
    await this.saveAgent(agent);

    return response;
  }

  private async generateAgentResponse(
    agent: UserAgent,
    message: string,
    images?: string[],
  ): Promise<string> {
    let systemPrompt = "";

    if (agent.type === "custom") {
      systemPrompt =
        agent.customPrompt ||
        "You are a helpful AI assistant for design tasks.";
    } else {
      const template = USER_AGENT_TEMPLATES[agent.type];
      systemPrompt = template.systemPrompt;
    }

    const context = this.buildAgentContext(agent);

    // Use your existing Claude/Local LLM system
    const prompt = `${systemPrompt}
    
User Context: ${context}
Recent conversation: ${agent.conversationHistory
      .slice(-5)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}

User message: ${message}

Respond as the ${agent.name} agent, providing helpful and personalized advice.`;

    // Route to your existing LLM system
    return await this.callLLM(prompt, images);
  }

  private buildAgentContext(agent: UserAgent): string {
    return `
Preferences: ${JSON.stringify(agent.preferences)}
Agent capabilities: ${agent.capabilities.join(", ")}
Conversation history length: ${agent.conversationHistory.length}
`;
  }

  private async callLLM(prompt: string, images?: string[]): Promise<string> {
    // Integration with your existing LLM system
    // This would call your intentroute or directly to Claude/Local LLM
    const response = await fetch("/api/agents/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, images }),
    });

    const data = await response.json();
    return data.response;
  }

  private async saveAgent(agent: UserAgent): Promise<void> {
    // Save to your database (Firebase, etc.)
    console.log("Saving agent:", agent.id);
  }

  private async getAgent(agentId: string): Promise<UserAgent | null> {
    // Retrieve from your database
    console.log("Getting agent:", agentId);
    return null; // Placeholder
  }
}

// Agent Template Interface
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
  defaultSettings: Record<string, any>;
}

// Enhanced Agent Templates with Specialized AI Agents - Adding to existing templates
export const SPECIALIZED_AI_AGENTS: AgentTemplate[] = [
  // Specialized AI Agents
  {
    id: "design-agent",
    name: "Design Agent",
    description:
      "Advanced image analysis, style transfer, and composition suggestions",
    category: "ai-specialist",
    systemPrompt: `You are an advanced Design Agent with expertise in:
- Image analysis and visual composition
- Style transfer and artistic techniques
- Color theory and harmony
- Typography and layout principles
- Brand consistency and visual identity
- Trend analysis and aesthetic evaluation

Provide detailed design feedback, suggest improvements, and guide users through creative decisions. Analyze uploaded images for composition, color balance, style elements, and provide actionable recommendations.`,
    capabilities: [
      "Advanced image analysis",
      "Style transfer recommendations",
      "Composition optimization",
      "Color harmony analysis",
      "Typography suggestions",
      "Brand consistency checks",
      "Aesthetic trend evaluation",
    ],
    tools: [
      "image-analysis",
      "style-transfer",
      "color-analyzer",
      "composition-guide",
    ],
    defaultSettings: {
      analysisDepth: "comprehensive",
      stylePreferences: "adaptive",
      feedbackLevel: "detailed",
    },
  },
  {
    id: "research-agent",
    name: "Research Agent",
    description:
      "Web scraping for design trends, color palettes, and inspiration",
    category: "ai-specialist",
    systemPrompt: `You are a Research Agent specialized in:
- Design trend analysis and forecasting
- Color palette research and curation
- Inspiration gathering from multiple sources
- Market analysis and competitor research
- Cultural and seasonal trend identification
- Cross-platform content analysis

Provide comprehensive research reports, trend insights, and curated inspiration boards. Help users stay ahead of design trends and make informed creative decisions.`,
    capabilities: [
      "Trend analysis and forecasting",
      "Color palette curation",
      "Inspiration board creation",
      "Competitor analysis",
      "Cultural trend identification",
      "Market research insights",
      "Cross-platform content analysis",
    ],
    tools: [
      "web-scraper",
      "trend-analyzer",
      "palette-curator",
      "inspiration-board",
    ],
    defaultSettings: {
      researchDepth: "comprehensive",
      trendTimeframe: "6-months",
      sourceVariety: "diverse",
    },
  },
  {
    id: "file-management-agent",
    name: "File Management Agent",
    description: "Organize generated images and perform batch operations",
    category: "ai-specialist",
    systemPrompt: `You are a File Management Agent focused on:
- Intelligent file organization and categorization
- Batch processing and automation
- Asset library management
- Version control and backup strategies
- File optimization and compression
- Metadata management and tagging

Help users organize their creative assets efficiently, automate repetitive tasks, and maintain clean, searchable asset libraries.`,
    capabilities: [
      "Intelligent file organization",
      "Batch processing automation",
      "Asset library management",
      "Version control systems",
      "File optimization",
      "Metadata and tagging",
      "Backup and recovery",
    ],
    tools: [
      "file-organizer",
      "batch-processor",
      "asset-manager",
      "metadata-tagger",
    ],
    defaultSettings: {
      organizationMethod: "smart-categories",
      batchSize: 50,
      compressionLevel: "balanced",
    },
  },
  {
    id: "analytics-agent",
    name: "Analytics Agent",
    description: "Track usage patterns, popular designs, and user preferences",
    category: "ai-specialist",
    systemPrompt: `You are an Analytics Agent specialized in:
- Usage pattern analysis and insights
- Design performance metrics
- User preference identification
- Engagement tracking and optimization
- A/B testing for creative content
- ROI analysis for design investments

Provide data-driven insights to help users understand what works, optimize their creative process, and make informed decisions based on performance metrics.`,
    capabilities: [
      "Usage pattern analysis",
      "Design performance metrics",
      "User preference mapping",
      "Engagement optimization",
      "A/B testing insights",
      "ROI analysis",
      "Predictive analytics",
    ],
    tools: [
      "analytics-dashboard",
      "pattern-analyzer",
      "performance-tracker",
      "insight-generator",
    ],
    defaultSettings: {
      trackingLevel: "comprehensive",
      reportFrequency: "weekly",
      insightDepth: "actionable",
    },
  },
  {
    id: "social-media-agent",
    name: "Social Media Agent",
    description:
      "Auto-post designs and manage social media presence across platforms",
    category: "ai-specialist",
    systemPrompt: `You are a Social Media Agent expert in:
- Platform-specific content optimization
- Automated posting and scheduling
- Engagement strategies and community management
- Hashtag research and trend identification
- Cross-platform content adaptation
- Performance tracking and optimization
- Brand voice consistency

Help users maximize their social media presence, automate posting workflows, and create platform-optimized content that drives engagement.`,
    capabilities: [
      "Multi-platform posting",
      "Content optimization",
      "Automated scheduling",
      "Engagement strategies",
      "Hashtag research",
      "Performance tracking",
      "Brand voice management",
    ],
    tools: [
      "social-scheduler",
      "content-optimizer",
      "hashtag-generator",
      "engagement-tracker",
    ],
    defaultSettings: {
      postingSchedule: "optimal-times",
      contentStyle: "brand-consistent",
      engagementLevel: "active",
    },
  },
];

// Social Media Platform Configurations
export interface SocialMediaPlatform {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  maxImageSize: number;
  supportedFormats: string[];
  maxCaptionLength: number;
  hashtagLimit: number;
  aspectRatios: {
    feed: string[];
    story?: string[];
    cover?: string[];
  };
  apiEndpoint?: string;
  authRequired: boolean;
  features: string[];
}

export const SOCIAL_MEDIA_PLATFORMS: SocialMediaPlatform[] = [
  {
    id: "telegram",
    name: "telegram",
    displayName: "Telegram",
    icon: "📱",
    maxImageSize: 10 * 1024 * 1024, // 10MB
    supportedFormats: ["jpg", "jpeg", "png", "gif", "webp"],
    maxCaptionLength: 1024,
    hashtagLimit: 50,
    aspectRatios: {
      feed: ["1:1", "4:3", "16:9", "9:16"],
    },
    authRequired: true,
    features: ["channels", "groups", "bots", "inline-keyboard"],
  },
  {
    id: "linkedin",
    name: "linkedin",
    displayName: "LinkedIn",
    icon: "💼",
    maxImageSize: 5 * 1024 * 1024, // 5MB
    supportedFormats: ["jpg", "jpeg", "png", "gif"],
    maxCaptionLength: 3000,
    hashtagLimit: 30,
    aspectRatios: {
      feed: ["1.91:1", "1:1"],
      cover: ["4:1"],
    },
    authRequired: true,
    features: ["professional-network", "company-pages", "articles", "videos"],
  },
  {
    id: "pinterest",
    name: "pinterest",
    displayName: "Pinterest",
    icon: "📌",
    maxImageSize: 32 * 1024 * 1024, // 32MB
    supportedFormats: ["jpg", "jpeg", "png", "gif", "webp"],
    maxCaptionLength: 500,
    hashtagLimit: 20,
    aspectRatios: {
      feed: ["2:3", "1:1", "9:16"],
      story: ["9:16"],
    },
    authRequired: true,
    features: ["boards", "rich-pins", "story-pins", "shopping"],
  },
  {
    id: "reddit",
    name: "reddit",
    displayName: "Reddit",
    icon: "🤖",
    maxImageSize: 20 * 1024 * 1024, // 20MB
    supportedFormats: ["jpg", "jpeg", "png", "gif", "webp"],
    maxCaptionLength: 40000,
    hashtagLimit: 0, // Reddit doesn't use hashtags
    aspectRatios: {
      feed: ["1:1", "4:3", "16:9", "9:16", "21:9"],
    },
    authRequired: true,
    features: ["subreddits", "crossposting", "comments", "awards"],
  },
  {
    id: "instagram",
    name: "instagram",
    displayName: "Instagram",
    icon: "📸",
    maxImageSize: 8 * 1024 * 1024, // 8MB
    supportedFormats: ["jpg", "jpeg", "png"],
    maxCaptionLength: 2200,
    hashtagLimit: 30,
    aspectRatios: {
      feed: ["1:1", "4:5", "16:9"],
      story: ["9:16"],
      cover: ["16:9"],
    },
    authRequired: true,
    features: ["stories", "reels", "igtv", "shopping", "live"],
  },
];

// Social Media Context Templates
export interface SocialMediaContext {
  platform: string;
  contextType:
    | "professional"
    | "creative"
    | "casual"
    | "promotional"
    | "educational";
  toneOfVoice:
    | "formal"
    | "friendly"
    | "enthusiastic"
    | "informative"
    | "humorous";
  targetAudience: string;
  callToAction?: string;
  hashtagStrategy:
    | "trending"
    | "niche"
    | "branded"
    | "mixed"
    | "professional"
    | "industry-specific"
    | "none";
}

export const SOCIAL_MEDIA_CONTEXTS: Record<string, SocialMediaContext[]> = {
  telegram: [
    {
      platform: "telegram",
      contextType: "casual",
      toneOfVoice: "friendly",
      targetAudience: "community members",
      hashtagStrategy: "mixed",
    },
    {
      platform: "telegram",
      contextType: "educational",
      toneOfVoice: "informative",
      targetAudience: "design enthusiasts",
      callToAction: "Join our design channel",
      hashtagStrategy: "niche",
    },
  ],
  linkedin: [
    {
      platform: "linkedin",
      contextType: "professional",
      toneOfVoice: "formal",
      targetAudience: "professionals and businesses",
      callToAction: "Connect with me",
      hashtagStrategy: "professional",
    },
    {
      platform: "linkedin",
      contextType: "educational",
      toneOfVoice: "informative",
      targetAudience: "industry professionals",
      callToAction: "Share your thoughts",
      hashtagStrategy: "industry-specific",
    },
  ],
  pinterest: [
    {
      platform: "pinterest",
      contextType: "creative",
      toneOfVoice: "enthusiastic",
      targetAudience: "creative enthusiasts",
      callToAction: "Save for inspiration",
      hashtagStrategy: "trending",
    },
    {
      platform: "pinterest",
      contextType: "promotional",
      toneOfVoice: "friendly",
      targetAudience: "potential customers",
      callToAction: "Check out our designs",
      hashtagStrategy: "branded",
    },
  ],
  reddit: [
    {
      platform: "reddit",
      contextType: "casual",
      toneOfVoice: "friendly",
      targetAudience: "subreddit community",
      hashtagStrategy: "none",
    },
    {
      platform: "reddit",
      contextType: "educational",
      toneOfVoice: "informative",
      targetAudience: "community members",
      callToAction: "What do you think?",
      hashtagStrategy: "none",
    },
  ],
  instagram: [
    {
      platform: "instagram",
      contextType: "creative",
      toneOfVoice: "enthusiastic",
      targetAudience: "followers and design lovers",
      callToAction: "Double tap if you love it!",
      hashtagStrategy: "trending",
    },
    {
      platform: "instagram",
      contextType: "promotional",
      toneOfVoice: "friendly",
      targetAudience: "potential customers",
      callToAction: "DM for custom designs",
      hashtagStrategy: "mixed",
    },
  ],
};

// Social Media Agent Functions
export class SocialMediaHandler {
  static generateCaption(
    imageUrl: string,
    platform: string,
    context: SocialMediaContext,
    customPrompt?: string,
  ): string {
    const platformConfig = SOCIAL_MEDIA_PLATFORMS.find(
      (p) => p.id === platform,
    );
    if (!platformConfig) throw new Error(`Platform ${platform} not supported`);

    // This would integrate with your AI system to generate platform-specific captions
    const basePrompt =
      customPrompt || "Check out this amazing design I created!";

    // Platform-specific formatting
    switch (platform) {
      case "linkedin":
        return this.formatLinkedInCaption(basePrompt, context);
      case "instagram":
        return this.formatInstagramCaption(basePrompt, context);
      case "pinterest":
        return this.formatPinterestCaption(basePrompt, context);
      case "reddit":
        return this.formatRedditCaption(basePrompt, context);
      case "telegram":
        return this.formatTelegramCaption(basePrompt, context);
      default:
        return basePrompt;
    }
  }

  private static formatLinkedInCaption(
    prompt: string,
    context: SocialMediaContext,
  ): string {
    const hashtags = this.generateHashtags(
      context.platform,
      context.hashtagStrategy,
      5,
    );
    return `${prompt}

What are your thoughts on this design approach?

${hashtags.join(" ")}

#Design #Creative #Innovation #DigitalArt #IMAI`;
  }

  private static formatInstagramCaption(
    prompt: string,
    context: SocialMediaContext,
  ): string {
    const hashtags = this.generateHashtags(
      context.platform,
      context.hashtagStrategy,
      15,
    );
    return `${prompt} ✨

${context.callToAction || "What do you think?"} 💭

${hashtags.join(" ")}

#CreatedWithIMAI #DesignLife #ArtisticVision`;
  }

  private static formatPinterestCaption(
    prompt: string,
    context: SocialMediaContext,
  ): string {
    const hashtags = this.generateHashtags(
      context.platform,
      context.hashtagStrategy,
      10,
    );
    return `${prompt}

Perfect for: Home decor, Office inspiration, Creative projects

${hashtags.join(" ")}`;
  }

  private static formatRedditCaption(
    prompt: string,
    context: SocialMediaContext,
  ): string {
    // Reddit doesn't use hashtags, focus on engaging discussion
    return `${prompt}

Created using AI-powered design tools. What improvements would you suggest?

Tools used: IMAI Design Platform
Time spent: ~5 minutes
Feedback welcome!`;
  }

  private static formatTelegramCaption(
    prompt: string,
    context: SocialMediaContext,
  ): string {
    const hashtags = this.generateHashtags(
      context.platform,
      context.hashtagStrategy,
      8,
    );
    return `${prompt}

${context.callToAction || "Join our creative community!"} 🎨

${hashtags.join(" ")}`;
  }

  private static generateHashtags(
    platform: string,
    strategy: string,
    count: number,
  ): string[] {
    // This would integrate with trending hashtag APIs
    const commonHashtags = {
      design: ["#design", "#creative", "#art", "#digitalart", "#graphics"],
      trending: ["#viral", "#trending", "#popular", "#new", "#hot"],
      niche: [
        "#aidesign",
        "#generativeart",
        "#designtools",
        "#creativity",
        "#innovation",
      ],
      branded: [
        "#IMAI",
        "#AIDesign",
        "#CreatedWithIMAI",
        "#DesignPlatform",
        "#ArtificialIntelligence",
      ],
    };

    // Mix based on strategy
    let selectedHashtags: string[] = [];

    switch (strategy) {
      case "trending":
        selectedHashtags = [
          ...commonHashtags.trending,
          ...commonHashtags.design,
        ];
        break;
      case "niche":
        selectedHashtags = [...commonHashtags.niche, ...commonHashtags.design];
        break;
      case "branded":
        selectedHashtags = [
          ...commonHashtags.branded,
          ...commonHashtags.design,
        ];
        break;
      default: // mixed
        selectedHashtags = [
          ...commonHashtags.design.slice(0, 2),
          ...commonHashtags.trending.slice(0, 2),
          ...commonHashtags.niche.slice(0, 2),
          ...commonHashtags.branded.slice(0, 2),
        ];
    }

    return selectedHashtags.slice(0, count);
  }

  static optimizeImageForPlatform(
    imageUrl: string,
    platform: string,
    postType: "feed" | "story" | "cover" = "feed",
  ): {
    optimizedUrl: string;
    aspectRatio: string;
    size: { width: number; height: number };
  } {
    const platformConfig = SOCIAL_MEDIA_PLATFORMS.find(
      (p) => p.id === platform,
    );
    if (!platformConfig) throw new Error(`Platform ${platform} not supported`);

    const aspectRatios =
      platformConfig.aspectRatios[postType] || platformConfig.aspectRatios.feed;
    const preferredRatio = aspectRatios[0];

    // This would integrate with your image processing API
    return {
      optimizedUrl: imageUrl, // Would be processed URL
      aspectRatio: preferredRatio,
      size: this.calculateDimensions(preferredRatio, platform),
    };
  }

  private static calculateDimensions(
    aspectRatio: string,
    platform: string,
  ): { width: number; height: number } {
    const [w, h] = aspectRatio.split(":").map(Number);
    const baseWidth = platform === "pinterest" ? 735 : 1080;
    const width = baseWidth;
    const height = Math.round((baseWidth * h) / w);

    return { width, height };
  }
}
