import InfinitPostList from "@/components/infinite-post";

export default async function Home() {
  return (
    <main className="container mx-auto px-4 py-6">
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">🔥 최신 유머</h2>
        <InfinitPostList />
      </section>
    </main>
  );
}
