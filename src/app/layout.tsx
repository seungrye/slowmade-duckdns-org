'use client';

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import Navbar from "@/components/navbar";
import "@/app/globals.css";
import "@/styles/_keyframe-animations.scss";
import "@/styles/_variables.scss";
import Footer from "@/components/footer";

function DarkClassSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark: boolean) =>
      document.documentElement.classList.toggle('dark', dark);

    apply(mq.matches);
    mq.addEventListener('change', (e) => apply(e.matches));
    return () => mq.removeEventListener('change', (e) => apply(e.matches));
  }, []);
  return null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SessionProvider>
          <DarkClassSync />
          <Navbar />
          <main className="lg:container mx-auto lg:mt-4">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
