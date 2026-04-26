'use client';

import { SessionProvider } from "next-auth/react";
import Navbar from "@/components/navbar";
import "@/app/globals.css";
import "@/styles/_keyframe-animations.scss";
import "@/styles/_variables.scss";
import Footer from "@/components/footer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-dvh overflow-x-hidden">
        <SessionProvider>
          <Navbar />
          <main className="lg:container mx-auto lg:mt-4 flex-1 flex flex-col">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
