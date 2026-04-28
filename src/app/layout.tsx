import type { Metadata } from "next";
import { env } from "@/lib/env";
import Providers from "@/components/providers";
import DarkClassSync from "@/components/dark-class-sync";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <DarkClassSync />
          <Navbar />
          <main className="lg:container mx-auto lg:mt-4">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
