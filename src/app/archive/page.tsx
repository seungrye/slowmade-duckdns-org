import "@/app/archive/page.css"; // CSS 파일 임포트
import { getPostTimeline } from "@/lib/archive";
import { GetPostTimelineType } from "@/types/archive.d";
import YearScroller from "@/components/year-scroller";

const getClosestYearTimeline = (timeline: GetPostTimelineType[], yearParams: string | undefined): GetPostTimelineType[] => {
  const nowYear = yearParams ? parseInt(yearParams) : new Date().getFullYear();

  const closestYear = timeline.reduce((closest: number | null, item: { year: number }) => {
    const diff = Math.abs(item.year - nowYear);
    const closestDiff = closest !== null ? Math.abs(closest - nowYear) : Infinity;
    return diff < closestDiff ? item.year : closest;
  }, null);

  const filtered = timeline.filter((item: GetPostTimelineType) => item.year === closestYear);
  return filtered.sort((a: { month: number }, b: { month: number }) => a.month - b.month);
};

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ArchivePage({ searchParams }: Props) {
  const params = await searchParams;
  const timeline = await getPostTimeline();
  const year = params.year as string | undefined;
  const closestYearTimeline = getClosestYearTimeline(timeline, year);
  const uniqueYears = [...new Set(timeline.map(t => t.year))].sort((a, b) => a - b);

  return (
    <main className="container mx-auto px-4 py-6">
      <YearScroller uniqueYears={uniqueYears} focusYear={closestYearTimeline[0]?.year} />

      <section className="max-w-4xl mx-auto px-4">
        <ul className="relative border-l-4 border-gray-300 timeline-list">
          {closestYearTimeline.map((timeline) => (
            <li key={`${timeline.year}.${timeline.month}`} className="relative pl-8 mb-12">
              <div className="absolute left-[-0.85rem] top-0 w-6 h-6 bg-teal-600 border-4 border-white rounded-full reveal-dot"></div>
              <div className="reveal-from-left delay-0">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{`${timeline.year}.${timeline.month}`}</h3>
                <div className="flex flex-wrap gap-2">
                  {timeline.ids.map((id) => (
                    <div
                      key={id}
                      className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"
                    />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
