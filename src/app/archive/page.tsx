import "@/app/archive/page.css"; // CSS 파일 임포트
import { getPostTimeline } from "@/lib/archive";
import { GetPostTimelineType } from "@/types/archive.d";

const getClosestYearTimeline = (timeline: GetPostTimelineType[], yearParams: string|undefined): GetPostTimelineType[] => {
  const nowYear = yearParams ? parseInt(yearParams) : new Date().getFullYear();

  // 1. 모든 항목 중 'year' 기준으로 현재 연도에 가장 가까운 항목 찾기
  const closestYear = timeline.reduce((closest: number | null, item: { year: number; }) => {
    const diff = Math.abs(item.year - nowYear);
    const closestDiff = closest !== null ? Math.abs(closest - nowYear) : Infinity;
    return diff < closestDiff ? item.year : closest;
  }, null);

  // 2. 그 year를 가진 항목들만 필터링
  const filtered = timeline.filter((item: { year: any; }) => item.year === closestYear);

  // 3. month 오름차순 정렬
  return filtered.sort((a: { month: number; }, b: { month: number; }) => a.month - b.month);
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ArchivePage({ searchParams }: Props) {
  const params = await searchParams;
  const timeline = await getPostTimeline();
  const year = params.year as string | undefined; // 쿼리 파라미터에서 year 값 가져오기

  const closestYearTimeline = getClosestYearTimeline(timeline, year)

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 */}
      <section className="text-center py-6">
        {/* TODO: https://codepen.io/Naasa21/pen/qdxKMo/ 이런 모양으로 연도 선택할수 있도록 해야 함 */}
        {/* <h1 className="text-3xl font-bold text-gray-800">🔥 최신 유머 모음</h1> */}
        {/* <p className="text-gray-600 mt-2">최근 업로드된 유머를 확인해 보세요.</p> */}

    <ul className="flex mx-auto">
      <li className="mx-4"><a href="#1984">1984</a></li>
      <li className="mx-4"><a href="#1987">1987</a></li>
      <li className="mx-4"><a href="#1991">1991</a></li>
      <li className="mx-4"><a href="#1992">1992</a></li>
      <li className="mx-4"><a href="#1993">1993</a></li>
      <li className="mx-4"><a href="#1995">1995</a></li>
      <li className="mx-4"><a href="#1996">1996</a></li>
      <li className="mx-4"><a href="#1997">1997</a></li>
      <li className="mx-4"><a href="#1998">1998</a></li>
      <li className="mx-4"><a href="#1999">1999</a></li>
      <li className="mx-4"><a href="#2000">2000</a></li>
      <li className="mx-4"><a href="#2001">2001</a></li>
      <li className="mx-4"><a href="#2002">2002</a></li>
      <li className="mx-4"><a href="#2004">2004</a></li>
      <li className="mx-4"><a href="#2006">2006</a></li>
      <li className="mx-4"><a href="#2007">2007</a></li>
      <li className="mx-4"><a href="#2009">2009</a></li>
      <li className="mx-4"><a href="#2014">2014</a></li>
      <li className="mx-4"><a href="#2015">2015</a></li>
      <li className="mx-4"><a href="#2016">2016</a></li>

    </ul>
      </section>

      <section className="max-w-4xl mx-auto px-4">
        <ul className="relative border-l-4 border-gray-300 timeline-list">
          {closestYearTimeline.map(timeline =>
            <li key={`${timeline.year}.${timeline.month}`} className="relative pl-8 mb-12">
              <div className="absolute left-[-0.85rem] top-0 w-6 h-6 bg-teal-600 border-4 border-white rounded-full reveal-dot"></div>
              <div className="reveal-from-left delay-0">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{`${timeline.year}.${timeline.month}`}</h3>
                <div className="flex flex-wrap gap-2">
                  {timeline.ids.map(id =>
                    <div key={id} className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border" />
                  )}
                </div>
              </div>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}