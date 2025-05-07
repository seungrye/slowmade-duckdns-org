'use client';

import { SessionProvider } from "next-auth/react";
import Navbar from "./components/navbar";
import "@/app/globals.css";
import "@/styles/_keyframe-animations.scss";
import "@/styles/_variables.scss";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Navbar />
          <main className="container mx-auto mt-4">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
