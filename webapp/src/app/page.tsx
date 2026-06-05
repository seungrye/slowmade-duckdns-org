import type { Metadata } from 'next'
import ContentSection from "./content.section";
import WebAdventureCard from "@/components/web-adventure-card";

export const metadata: Metadata = {
  title: 'Handmade Site - Home',
  description: 'Overview of the latest posts',
};

export default function Home() {
  return (
    <main className="mx-auto px-4 py-6">
      {/* #246 — Web Adventure 진입 카드 (홈 상단). */}
      <WebAdventureCard />
      <ContentSection />
    </main>
  );
}
