import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import clsx from "clsx";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { GlobalModalProvider } from "@/contexts/GlobalModalContext";
import GlobalModal from "@/app/components/GlobalModal";
import ConditionalSidebar from "./components/ConditionalSidebar";
import { AuthProvider } from '@/contexts/AuthContext';

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});


export const metadata: Metadata = {
  title: "IMAI.studio - AI Image Generation Platform",
  description: "Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio's advanced AI technology.",
  keywords: "AI image generation, artificial intelligence, image creation, AI art, digital art, IMAI.studio",
  authors: [{ name: "IMAI.studio" }],
  creator: "IMAI.studio",
  publisher: "IMAI.studio",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://imai.studio'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://imai.studio',
    title: 'IMAI.studio - AI Image Generation Platform',
    description: 'Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio.',
    siteName: 'IMAI.studio',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'IMAI.studio - AI Image Generation Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IMAI.studio - AI Image Generation Platform',
    description: 'Creating newness through AI-powered image generation. Transform your ideas into stunning visuals with IMAI.studio.',
    images: ['/og-image.jpg'],
    creator: '@imaistudio',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    "apple-mobile-web-app-title": "IMAI.studio",
    "theme-color": "#ffffff",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        <link rel="icon" type="image/png" href="/icon1.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/icon0.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body
        className={clsx(
          "min-h-screen bg-background font-sans antialiased",
          openSans.variable
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "light" }}>
            <main>
              <AuthProvider>
              <GlobalModalProvider>
                <ConditionalSidebar>
                    {children}
                </ConditionalSidebar>
                <GlobalModal />
              </GlobalModalProvider>
              </AuthProvider>
              <SpeedInsights />
              <Analytics />
            </main>
        </Providers>
      </body>
    </html>
  );
}
