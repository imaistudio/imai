import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import clsx from "clsx";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GlobalModalProvider } from "@/contexts/GlobalModalContext";
import GlobalModal from "@/app/components/GlobalModal";
import ConditionalSidebar from "./components/ConditionalSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { GoogleTagManager } from "@/app/components/seo/GoogleTagManager";
import { AhrefsAnalytics } from "@/app/components/seo/AhrefsAnalytics";
import { SEOHead } from "@/app/components/seo/SEOHead";
import { StructuredData } from "@/app/components/seo/StructuredData";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://imai.studio"),
  title: {
    default: "IMAI.studio - AI Image Generation Platform",
    template: "%s | IMAI.studio",
  },
  description:
    "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology. Generate custom artwork, product designs, and creative visuals instantly.",
  keywords: [
    "AI image generation",
    "artificial intelligence",
    "image creation",
    "AI art",
    "digital art",
    "IMAI.studio",
    "AI design",
    "creative AI",
    "image synthesis",
    "AI artwork",
    "generative AI",
    "visual AI",
    "AI creativity",
    "digital design",
    "AI-powered art",
  ],
  authors: [{ name: "IMAI.studio", url: "https://imai.studio" }],
  creator: "IMAI.studio",
  publisher: "IMAI.studio",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://imai.studio",
    title: "IMAI.studio - AI Image Generation Platform",
    description:
      "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio.",
    siteName: "IMAI.studio",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "IMAI.studio - AI Image Generation Platform",
        type: "image/jpeg",
      },
      {
        url: "/og-image-square.jpg",
        width: 1200,
        height: 1200,
        alt: "IMAI.studio - AI Image Generation Platform",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IMAI.studio - AI Image Generation Platform",
    description:
      "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio.",
    images: ["/og-image.jpg"],
    creator: "@imaistudio",
    site: "@imaistudio",
  },
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
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  other: {
    "apple-mobile-web-app-title": "IMAI.studio",
    "application-name": "IMAI.studio",
    "theme-color": "#ffffff",
    "msapplication-TileColor": "#ffffff",
    "msapplication-config": "/browserconfig.xml",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#ffffff" },
    ],
  },
  manifest: "/manifest.json",
  category: "technology",
  classification: "AI Image Generation",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        {/* Preload critical resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://storage.googleapis.com" />
        <link rel="preconnect" href="https://analytics.ahrefs.com" />

        {/* DNS prefetch for external domains */}
        <link rel="dns-prefetch" href="//www.google-analytics.com" />
        <link rel="dns-prefetch" href="//www.googletagmanager.com" />
        <link rel="dns-prefetch" href="//analytics.ahrefs.com" />

        {/* Favicon and app icons */}
        <link rel="icon" type="image/png" href="/icon1.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/icon0.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="manifest" href="/manifest.json" />

        {/* Theme and meta tags */}
        <meta name="theme-color" content="#ffffff" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="application-name" content="IMAI.studio" />

        {/* SEO Head Component */}
        <SEOHead />

        {/* Structured Data */}
        <StructuredData />

        {/* Google Tag Manager */}
        <GoogleTagManager />

        {/* Ahrefs Analytics */}
        <AhrefsAnalytics />
      </head>
      <body
        className={clsx(
          "min-h-screen bg-background font-sans antialiased",
          openSans.variable,
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "light" }}>
          <main>
            <AuthProvider>
              <ChatProvider>
                <GlobalModalProvider>
                  <ConditionalSidebar>{children}</ConditionalSidebar>
                  <GlobalModal />
                </GlobalModalProvider>
              </ChatProvider>
            </AuthProvider>
            <SpeedInsights />
            <Analytics />
          </main>
        </Providers>
      </body>
    </html>
  );
}
