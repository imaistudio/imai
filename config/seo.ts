// SEO Configuration for IMAI.studio

export const SEO_CONFIG = {
  // Site Information
  site: {
    name: "IMAI.studio",
    url: "https://imai.studio",
    description:
      "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology.",
    language: "en",
    region: "US",
    timezone: "America/New_York",
  },

  // Social Media
  social: {
    twitter: {
      handle: "@imaistudio",
      site: "@imaistudio",
      cardType: "summary_large_image",
    },
    facebook: {
      appId: "", // Add if you have a Facebook app
    },
    linkedin: {
      company: "imaistudio",
    },
    instagram: {
      handle: "imaistudio",
    },
  },

  // Analytics
  analytics: {
    googleTagManager: {
      id: process.env.NEXT_PUBLIC_GTM_ID || "GTM-XXXXXXX",
    },
    ahrefs: {
      key: process.env.NEXT_PUBLIC_AHREFS_KEY || "1TZ7wA8+FN+Xqd+svevHBw",
    },
    googleSearchConsole: {
      verification:
        process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
        "google6db09e8c742fe3a5",
    },
  },

  // Default Images
  images: {
    default: "/og-image.jpg",
    square: "/og-image-square.jpg",
    logo: "/logo.png",
    favicon: "/favicon.ico",
    appleTouchIcon: "/apple-touch-icon.png",
  },

  // SEO Settings
  seo: {
    defaultTitle: "IMAI.studio - AI Image Generation Platform",
    titleTemplate: "%s | IMAI.studio",
    defaultDescription:
      "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology.",
    maxDescriptionLength: 160,
    maxTitleLength: 60,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  },

  // Keywords by category
  keywords: {
    primary: [
      "AI image generation",
      "artificial intelligence",
      "image creation",
      "AI art",
      "digital art",
      "IMAI.studio",
    ],
    secondary: [
      "AI design",
      "creative AI",
      "image synthesis",
      "AI artwork",
      "generative AI",
      "visual AI",
    ],
    longTail: [
      "AI image generation platform",
      "create AI art online",
      "AI-powered image creation",
      "generate images with AI",
      "AI art generator",
      "digital art creation tool",
    ],
    technical: [
      "machine learning art",
      "neural network art",
      "AI illustration",
      "AI graphics",
      "AI visual design",
      "generative adversarial networks",
    ],
  },

  // Page-specific configurations
  pages: {
    home: {
      title: "IMAI.studio - AI Image Generation Platform",
      description:
        "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology.",
      keywords: [
        "AI image generation",
        "artificial intelligence",
        "image creation",
        "AI art",
      ],
      priority: 1.0,
      changeFrequency: "daily" as const,
    },
    about: {
      title: "About IMAI.studio",
      description:
        "Learn about IMAI.studio's mission to democratize AI-powered image generation and make creative tools accessible to everyone.",
      keywords: ["about", "mission", "company", "AI image generation"],
      priority: 0.8,
      changeFrequency: "monthly" as const,
    },
    pricing: {
      title: "Pricing - IMAI.studio",
      description:
        "Choose the perfect plan for your AI image generation needs. Affordable pricing with powerful features for creators and businesses.",
      keywords: [
        "pricing",
        "plans",
        "subscription",
        "AI image generation cost",
      ],
      priority: 0.9,
      changeFrequency: "weekly" as const,
    },
    contact: {
      title: "Contact Us - IMAI.studio",
      description:
        "Get in touch with the IMAI.studio team. We're here to help with your AI image generation needs and answer any questions.",
      keywords: ["contact", "support", "help", "customer service"],
      priority: 0.7,
      changeFrequency: "monthly" as const,
    },
    privacy: {
      title: "Privacy Policy - IMAI.studio",
      description:
        "Learn how IMAI.studio protects your privacy and handles your data when using our AI image generation platform.",
      keywords: ["privacy", "data protection", "security", "privacy policy"],
      priority: 0.5,
      changeFrequency: "monthly" as const,
    },
    terms: {
      title: "Terms of Service - IMAI.studio",
      description:
        "Read IMAI.studio's terms of service to understand the rules and guidelines for using our AI image generation platform.",
      keywords: ["terms", "terms of service", "legal", "agreement"],
      priority: 0.5,
      changeFrequency: "monthly" as const,
    },
    library: {
      title: "Image Library - IMAI.studio",
      description:
        "Browse and manage your AI-generated images in the IMAI.studio library. Organize, download, and share your creations.",
      keywords: ["library", "gallery", "images", "AI art collection"],
      priority: 0.8,
      changeFrequency: "daily" as const,
    },
    explore: {
      title: "Explore AI Art - IMAI.studio",
      description:
        "Discover amazing AI-generated artwork created by the IMAI.studio community. Get inspired and explore the possibilities of AI art.",
      keywords: ["explore", "discover", "AI art", "community", "inspiration"],
      priority: 0.8,
      changeFrequency: "daily" as const,
    },
  },

  // Structured Data
  structuredData: {
    organization: {
      name: "IMAI.studio",
      url: "https://imai.studio",
      logo: "https://imai.studio/logo.png",
      description: "AI-powered image generation platform",
      foundingDate: "2024",
      contactPoint: {
        contactType: "customer service",
        email: "support@imai.studio",
      },
      address: {
        addressCountry: "US",
      },
      sameAs: [
        "https://twitter.com/imaistudio",
        "https://linkedin.com/company/imaistudio",
      ],
    },
  },

  // Performance
  performance: {
    preload: [
      "/fonts/open-sans-latin-400-normal.woff2",
      "/fonts/open-sans-latin-600-normal.woff2",
    ],
    dnsPrefetch: [
      "//fonts.googleapis.com",
      "//fonts.gstatic.com",
      "//storage.googleapis.com",
      "//www.google-analytics.com",
      "//www.googletagmanager.com",
      "//analytics.ahrefs.com",
    ],
    preconnect: [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://storage.googleapis.com",
      "https://analytics.ahrefs.com",
    ],
  },

  // Security
  security: {
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  },
};

// Helper function to get page configuration
export function getPageConfig(pageName: keyof typeof SEO_CONFIG.pages) {
  return SEO_CONFIG.pages[pageName];
}

// Helper function to get all keywords
export function getAllKeywords(): string[] {
  return [
    ...SEO_CONFIG.keywords.primary,
    ...SEO_CONFIG.keywords.secondary,
    ...SEO_CONFIG.keywords.longTail,
    ...SEO_CONFIG.keywords.technical,
  ];
}

// Helper function to validate SEO configuration
export function validateSEOConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!SEO_CONFIG.site.url) {
    errors.push("Site URL is required");
  }

  if (
    !SEO_CONFIG.analytics.googleTagManager.id ||
    SEO_CONFIG.analytics.googleTagManager.id === "GTM-XXXXXXX"
  ) {
    errors.push("Google Tag Manager ID is not configured");
  }

  if (
    !SEO_CONFIG.analytics.ahrefs.key ||
    SEO_CONFIG.analytics.ahrefs.key === "1TZ7wA8+FN+Xqd+svevHBw"
  ) {
    errors.push("Ahrefs Analytics key is not configured");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
