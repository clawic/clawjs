import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppBootstrapProvider } from "@/components/app-bootstrap-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/sidebar-context";
import { LayoutSidebar } from "@/components/layout-sidebar";
import { getUserConfig } from "@/lib/user-config";
import { defaultLocale } from "@/lib/i18n/messages";
import { localized } from "@/lib/i18n/localized";
import { getClawJSLocalSettings } from "@/lib/local-settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export function generateMetadata(): Metadata {
  const locale = (() => {
    try {
      return getUserConfig().locale;
    } catch {
      return defaultLocale;
    }
  })();

  return {
    title: "ClawJS",
    description: localized(locale, {
      en: "A connected AI assistant that actually knows your context",
      es: "Un asistente de IA conectado que de verdad conoce tu contexto",
      fr: "Un assistant IA connecté qui connaît vraiment votre contexte",
      it: "Un assistente IA connesso che conosce davvero il tuo contesto",
      de: "Ein vernetzter KI-Assistent, der deinen Kontext wirklich kennt",
      pt: "Um assistente de IA ligado que conhece mesmo o teu contexto",
    }),
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "any" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: ["/favicon.ico"],
    },
    openGraph: {
      images: [{ url: "https://clawjs.ai/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: ["https://clawjs.ai/og-image.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = (() => {
    try {
      return getUserConfig().locale;
    } catch {
      return defaultLocale;
    }
  })();

  const initialTheme = (() => {
    try {
      return getClawJSLocalSettings().theme ?? "system";
    } catch {
      return "system" as const;
    }
  })();

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("clawjs-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider initialTheme={initialTheme}>
          <LocaleProvider initialLocale={initialLocale}>
            <AppBootstrapProvider>
              <SidebarProvider>
                <main className="flex h-screen overflow-hidden">
                  <LayoutSidebar />
                  <div className="flex-1 min-w-0 min-h-0">{children}</div>
                </main>
              </SidebarProvider>
            </AppBootstrapProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
