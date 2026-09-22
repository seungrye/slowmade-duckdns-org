import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import Providers from "@/components/providers";
import ThemeSync from "@/components/dark-class-sync";
import FirebaseAnalytics from "@/components/firebase-analytics";
import FirebasePerformance from "@/components/firebase-performance";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import "@/app/globals.css";
import "@/styles/_keyframe-animations.scss";
import "@/styles/_variables.scss";

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

// 사이트가 light/dark 를 모두 지원한다고 브라우저에 명시(<meta name="color-scheme">).
// CSS 보다 먼저 파싱되어 모바일 크롬 자동 다크(force-dark)를 확실히 비활성화한다.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT 가 hydration 전에 html.dark 를 바꾸므로
    // 서버(테마 미상)와 클라이언트의 class 불일치 경고를 억제한다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* FOUC 방지 — localStorage 테마를 hydration 전에 동기 적용(light/dark/system 3분기). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Pretendard 폰트는 여기서 CDN 을 부르지 않는다 — globals.css 의 @font-face 가
            /fonts/pretendard-variable.woff2 를 자체 호스팅으로 로드한다 (#477). */}
      </head>
      <body>
        <Providers>
          <ThemeSync />
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
