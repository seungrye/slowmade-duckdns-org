import type { Metadata } from 'next'
import ContentSection from "./content.section";

export const metadata: Metadata = {
  title: 'Handmade Site - Home',
  description: 'Overview of the latest posts',
};

export default function Home() {
  return (
    <main className="mx-auto px-4 py-6">
      <ContentSection />
    </main>
  );
}
