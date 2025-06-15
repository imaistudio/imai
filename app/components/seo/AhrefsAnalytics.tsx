"use client";

import React from "react";
import Script from "next/script";

const AHREFS_KEY = process.env.NEXT_PUBLIC_AHREFS_KEY || "1TZ7wA8+FN+Xqd+svevHBw";

export function AhrefsAnalytics() {
  if (!AHREFS_KEY) {
    console.warn("Ahrefs Analytics key not found. Please set NEXT_PUBLIC_AHREFS_KEY environment variable.");
    return null;
  }

  return (
    <Script
      id="ahrefs-analytics"
      src="https://analytics.ahrefs.com/analytics.js"
      data-key={AHREFS_KEY}
      async
      strategy="afterInteractive"
    />
  );
}

// Alternative implementation for Google Tag Manager
export function AhrefsAnalyticsGTM() {
  if (!AHREFS_KEY) {
    return null;
  }

  return (
    <Script
      id="ahrefs-analytics-gtm"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          var ahrefs_analytics_script = document.createElement('script');
          ahrefs_analytics_script.async = true;
          ahrefs_analytics_script.src = 'https://analytics.ahrefs.com/analytics.js';
          ahrefs_analytics_script.setAttribute('data-key', '${AHREFS_KEY}');
          document.getElementsByTagName('head')[0].appendChild(ahrefs_analytics_script);
        `,
      }}
    />
  );
} 