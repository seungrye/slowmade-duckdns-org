import type { Metadata } from "next";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import Providers from "@/components/providers";
import ThemeSync from "@/components/dark-class-sync";
import FirebaseAnalytics from "@/components/firebase-analytics";
import FirebasePerformance from "@/components/firebase-performance";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import "@/app/globals.css";
import "@/styles/_keyframe-animations.scss";
import "@/styles/_variables.scss";

type Theme = 'light' | 'dark' | 'system';

const siteUrl = env.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Slowmade",
    template: "%s | Slowmade",
  },
  description: "느리게, 하지만 제대로 만드는 공간",
  openGraph: {
    siteName: "Slowmade",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = (cookieStore.get('theme')?.value ?? 'system') as Theme;

  return (
    <html lang="ko" className={theme === 'dark' ? 'dark' : ''}>
      <head>
        {theme === 'system' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if(window.matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark')`,
            }}
          />
        )}
        {/* #247 — Pretendard 폰트 (jsdelivr CDN). web-adventure 페이지의
            .web-adventure-page 클래스에서만 font-family 로 사용. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>
        <Providers>
          <ThemeSync initialTheme={theme} />
          <FirebaseAnalytics />
          <FirebasePerformance />
          <Navbar />
          <main className="lg:container mx-auto lg:mt-4">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
