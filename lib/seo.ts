// SEO utility functions for IMAI.studio

export interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
  position: number;
}

// Generate canonical URL
export function generateCanonicalUrl(path: string): string {
  const baseUrl = 'https://imai.studio';
  return `${baseUrl}${path}`;
}

// Generate Open Graph data
export function generateOpenGraphData(config: SEOConfig) {
  const baseUrl = 'https://imai.studio';
  
  return {
    title: config.title,
    description: config.description,
    url: config.url ? `${baseUrl}${config.url}` : baseUrl,
    siteName: 'IMAI.studio',
    images: config.image ? [
      {
        url: config.image.startsWith('http') ? config.image : `${baseUrl}${config.image}`,
        width: 1200,
        height: 630,
        alt: config.title,
      }
    ] : undefined,
    locale: 'en_US',
    type: config.type || 'website',
    ...(config.publishedTime && { publishedTime: config.publishedTime }),
    ...(config.modifiedTime && { modifiedTime: config.modifiedTime }),
    ...(config.author && { author: config.author }),
  };
}

// Generate Twitter Card data
export function generateTwitterCardData(config: SEOConfig) {
  const baseUrl = 'https://imai.studio';
  
  return {
    card: 'summary_large_image',
    title: config.title,
    description: config.description,
    images: config.image ? [config.image.startsWith('http') ? config.image : `${baseUrl}${config.image}`] : undefined,
    site: '@imaistudio',
    creator: '@imaistudio',
  };
}

// Generate structured data for organization
export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "IMAI.studio",
    url: "https://imai.studio",
    logo: {
      "@type": "ImageObject",
      url: "https://imai.studio/logo.png",
      width: 512,
      height: 512
    },
    description: "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology.",
    foundingDate: "2024",
    sameAs: [
      "https://twitter.com/imaistudio",
      "https://linkedin.com/company/imaistudio"
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "support@imai.studio"
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "US"
    }
  };
}

// Generate structured data for website
export function generateWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "IMAI.studio",
    url: "https://imai.studio",
    description: "AI-powered image generation platform for creating stunning visuals and artwork.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://imai.studio/search?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    },
    publisher: {
      "@type": "Organization",
      name: "IMAI.studio",
      logo: {
        "@type": "ImageObject",
        url: "https://imai.studio/logo.png"
      }
    }
  };
}

// Generate breadcrumb structured data
export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  const baseUrl = 'https://imai.studio';
  
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(item => ({
      "@type": "ListItem",
      position: item.position,
      name: item.name,
      item: `${baseUrl}${item.url}`
    }))
  };
}

// Generate article structured data
export function generateArticleSchema(config: SEOConfig) {
  const baseUrl = 'https://imai.studio';
  
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: config.title,
    description: config.description,
    image: config.image ? (config.image.startsWith('http') ? config.image : `${baseUrl}${config.image}`) : `${baseUrl}/og-image.jpg`,
    author: {
      "@type": "Organization",
      name: config.author || "IMAI.studio"
    },
    publisher: {
      "@type": "Organization",
      name: "IMAI.studio",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`
      }
    },
    datePublished: config.publishedTime || new Date().toISOString(),
    dateModified: config.modifiedTime || new Date().toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": config.url ? `${baseUrl}${config.url}` : baseUrl
    }
  };
}

// Generate product structured data
export function generateProductSchema(config: SEOConfig) {
  const baseUrl = 'https://imai.studio';
  
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: config.title,
    description: config.description,
    image: config.image ? (config.image.startsWith('http') ? config.image : `${baseUrl}${config.image}`) : `${baseUrl}/og-image.jpg`,
    brand: {
      "@type": "Brand",
      name: "IMAI.studio"
    },
    manufacturer: {
      "@type": "Organization",
      name: "IMAI.studio"
    },
    category: "AI Image Generation",
    offers: {
      "@type": "Offer",
      url: config.url ? `${baseUrl}${config.url}` : baseUrl,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock"
    }
  };
}

// Sanitize text for meta descriptions
export function sanitizeDescription(text: string, maxLength: number = 160): string {
  // Remove HTML tags
  const cleanText = text.replace(/<[^>]*>/g, '');
  
  // Remove extra whitespace
  const trimmedText = cleanText.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long
  if (trimmedText.length <= maxLength) {
    return trimmedText;
  }
  
  // Truncate at word boundary
  const truncated = trimmedText.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

// Generate keywords from text
export function generateKeywords(text: string, maxKeywords: number = 10): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const wordCount: { [key: string]: number } = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// Validate URL format
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Generate sitemap entry
export function generateSitemapEntry(
  path: string,
  lastModified: Date = new Date(),
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' = 'monthly',
  priority: number = 0.5
) {
  return {
    url: `https://imai.studio${path}`,
    lastModified: lastModified.toISOString(),
    changeFrequency,
    priority,
  };
} 