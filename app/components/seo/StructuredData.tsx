"use client";

import React from "react";
import Script from "next/script";

interface StructuredDataProps {
  type?: "organization" | "website" | "article" | "breadcrumb";
  data?: any;
}

export function StructuredData({ type = "organization", data }: StructuredDataProps) {
  const baseUrl = "https://imai.studio";
  
  const structuredData = {
    organization: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "IMAI.studio",
      url: baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
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
    },
    website: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "IMAI.studio",
      url: baseUrl,
      description: "AI-powered image generation platform for creating stunning visuals and artwork.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${baseUrl}/search?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      },
      publisher: {
        "@type": "Organization",
        name: "IMAI.studio",
        logo: {
          "@type": "ImageObject",
          url: `${baseUrl}/logo.png`
        }
      }
    },
    article: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "AI Image Generation with IMAI.studio",
      description: "Learn how to create stunning AI-generated images using IMAI.studio's advanced technology.",
      image: `${baseUrl}/og-image.jpg`,
      author: {
        "@type": "Organization",
        name: "IMAI.studio"
      },
      publisher: {
        "@type": "Organization",
        name: "IMAI.studio",
        logo: {
          "@type": "ImageObject",
          url: `${baseUrl}/logo.png`
        }
      },
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": baseUrl
      }
    },
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: baseUrl
        }
      ]
    }
  };

  const selectedData = data || structuredData[type];

  return (
    <Script
      id="structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(selectedData),
      }}
    />
  );
}

// Helper function to generate breadcrumb data
export function generateBreadcrumbData(paths: Array<{ name: string; url: string }>) {
  const baseUrl = "https://imai.studio";
  
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: paths.map((path, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: path.name,
      item: `${baseUrl}${path.url}`
    }))
  };
}

// Helper function to generate article data
export function generateArticleData(article: {
  title: string;
  description: string;
  image?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  url: string;
}) {
  const baseUrl = "https://imai.studio";
  
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: article.image || `${baseUrl}/og-image.jpg`,
    author: {
      "@type": "Organization",
      name: article.author || "IMAI.studio"
    },
    publisher: {
      "@type": "Organization",
      name: "IMAI.studio",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`
      }
    },
    datePublished: article.datePublished || new Date().toISOString(),
    dateModified: article.dateModified || new Date().toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}${article.url}`
    }
  };
} 