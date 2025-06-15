"use client";

import React from "react";
import Script from "next/script";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export function GoogleTagManager() {
  if (!GTM_ID) {
    console.warn("Google Tag Manager ID not found. Please set NEXT_PUBLIC_GTM_ID environment variable.");
    return null;
  }

  return (
    <>
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `,
        }}
      />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  );
}

// Data layer push function for custom events
export function pushToDataLayer(data: any) {
  if (typeof window !== "undefined" && (window as any).dataLayer) {
    (window as any).dataLayer.push(data);
  }
}

// Common event tracking functions
export const trackEvent = {
  pageView: (page: string) => {
    pushToDataLayer({
      event: "page_view",
      page_title: page,
      page_location: window.location.href,
    });
  },
  
  userSignUp: (method: string) => {
    pushToDataLayer({
      event: "sign_up",
      method: method,
    });
  },
  
  userLogin: (method: string) => {
    pushToDataLayer({
      event: "login",
      method: method,
    });
  },
  
  imageGeneration: (workflowType: string, promptLength: number) => {
    pushToDataLayer({
      event: "image_generation",
      workflow_type: workflowType,
      prompt_length: promptLength,
    });
  },
  
  featureUsage: (feature: string) => {
    pushToDataLayer({
      event: "feature_usage",
      feature_name: feature,
    });
  },
  
  conversion: (value: number, currency: string = "USD") => {
    pushToDataLayer({
      event: "conversion",
      value: value,
      currency: currency,
    });
  },
}; 