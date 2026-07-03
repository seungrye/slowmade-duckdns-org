// 매매 상세(SSR) 로딩 중 즉시 표시되는 스켈레톤.
// 미장처럼 매매 종목이 많으면 데이터 로드가 몇 초 걸리는데, 그 사이 빈 대기 대신
// detail 레이아웃과 비슷한 형태의 placeholder 를 보여준다(Next.js loading.tsx 규약).
export default function Loading() {
  return (
    <main className="mx-auto px-4 py-8">
      {/* 제목 자리 */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="h-7 w-56 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="h-4 w-72 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-6" />

      {/* 차트 자리 (반응형 비율 동일) */}
      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[420px] bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-8" />

      {/* 표 자리 x2 */}
      {[0, 1].map((t) => (
        <div key={t} className="mb-8">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ))}

      <p className="text-center text-sm text-gray-400 mt-4">불러오는 중…</p>
    </main>
  );
}
