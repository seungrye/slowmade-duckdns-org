// 자동매매 dry-run 스모크(일회성) — 세션 없이 엔진을 직접 구동해 실 KIS API 검증.
//   pnpm dlx tsx scripts/trading-smoke.mts <kr|us> [universeLimit]
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.TRADING_LIVE_ALLOWED = "false"; // 스모크는 무조건 dry

const { connectToDB } = await import("../src/lib/db");
const TradingAccount = (await import("../src/models/trading-account")).default;
const TradingPortfolio = (await import("../src/models/trading-portfolio")).default;
const TradingRun = (await import("../src/models/trading-run")).default;
const { runPortfolioCycle } = await import("../src/lib/trading/engines");

const market = process.argv[2] ?? "kr";
const limit = Number(process.argv[3] ?? 0);

await connectToDB();
const account = await TradingAccount.findOne({ envKey: "paper-50194613" }).lean();
if (!account) throw new Error("계정 없음");
const portfolio = await TradingPortfolio.findOne({ accountId: account._id, market }).lean();
if (!portfolio) throw new Error(`${market} 포트폴리오 없음`);
if (limit > 0 && Array.isArray((portfolio.config as { universe?: string[] }).universe)) {
  (portfolio.config as { universe: string[] }).universe =
    (portfolio.config as { universe: string[] }).universe.slice(0, limit);
  console.log(`(스모크 — 유니버스 앞 ${limit}종목만)`);
}
const run = await TradingRun.create({
  portfolioId: portfolio._id, accountId: account._id,
  dateKey: `smoke-${Date.now()}`, phase: "main", status: "running", dryRun: true,
});
const t0 = Date.now();
try {
  const summary = await runPortfolioCycle(
    { ...account, liveEnabled: false } as never, portfolio as never, run._id as never,
    (l) => console.log("  " + l),
  );
  await TradingRun.updateOne({ _id: run._id },
    { $set: { status: "done", summary, finishedAt: new Date() } });
  console.log(`✓ ${market} 스모크 완료(${((Date.now() - t0) / 1000).toFixed(1)}s): ${summary}`);
} catch (e) {
  await TradingRun.updateOne({ _id: run._id },
    { $set: { status: "failed", error: String(e), finishedAt: new Date() } });
  console.error(`✗ ${market} 스모크 실패:`, e);
  process.exitCode = 1;
}
process.exit();
