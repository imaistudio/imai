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
  title: "IMAI",
  description: "Generate Newness",
  other: {
    "apple-mobile-web-app-title": "IMAI",
    "theme-color": "#ffffff", 
  },
  icons: {
    icon: "/favicon.ico",
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
