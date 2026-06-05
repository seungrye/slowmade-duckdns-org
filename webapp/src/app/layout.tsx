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

/**
 * #230 — post 본문(TipTap viewer) 의 blockquote / 코드블럭(<pre>, inline <code>)
 * 에 적용할 한글 모노스페이스 폰트 *Nanum Gothic Coding* 은 *Google Fonts CDN*
 * 으로 직접 link 한다. (#228 의 `next/font/google` self-host 는 Next.js 의 자동
 * `<link rel="preload" .../>` 로 응답 헤더가 폭주 → nginx 502 → 사이트 트래픽
 * 낭비. 사용자 의도 = "클라이언트에서 구글에 접속해서 폰트 서빙 받으면 되잖아.")
 * 적용 셀렉터는 paragraph-node.scss / code-block-node.scss 의 font-family
 * 스택 1순위에 "Nanum Gothic Coding" 폰트명을 직접 명시.
 */

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding:wght@400;700&display=swap"
          rel="stylesheet"
        />
        {theme === 'system' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if(window.matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark')`,
            }}
          />
        )}
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
