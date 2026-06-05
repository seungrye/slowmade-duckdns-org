import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Nanum_Gothic_Coding } from "next/font/google";
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
 * #228 — post 본문(TipTap viewer) 의 blockquote 및 코드블럭(<pre>, inline <code>)
 * 에 적용할 한글 모노스페이스 폰트. next/font/google 로 self-host 하여 외부 CDN
 * 의존을 제거하고, CSS variable `--font-nanum-gothic-coding` 로 노출한다.
 * 실제 적용 셀렉터는 paragraph-node.scss / code-block-node.scss 참조.
 */
const nanumGothicCoding = Nanum_Gothic_Coding({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nanum-gothic-coding",
});

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
    <html lang="ko" className={`${nanumGothicCoding.variable} ${theme === 'dark' ? 'dark' : ''}`.trim()}>
      <head>
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
