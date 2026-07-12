// Next.js instrumentation — 서버 프로세스 기동 시 1회 실행(Next 15 안정 기능).
// 자동매매 스케줄러를 여기서 시작한다: 배포/재시작 직후 첫 틱이 "run 시각 경과 &
// 오늘 미실행" 사이클을 DB 기준으로 catch-up 한다(블루그린 내성은 Mongo 클레임이 보장).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTradingScheduler } = await import("@/lib/trading/scheduler");
    startTradingScheduler();
  }
}
