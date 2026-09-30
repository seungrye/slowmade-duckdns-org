/**
 * 전략 영속 상태 초기화 — 계좌를 갈아탈 때 쓴다 (#513).
 *
 * v4·VR 상태는 **포트폴리오**(`TradingPortfolio.state`)에 붙어 있어서, 계정의 자격증명만 새
 * 계좌로 바꾸면 브로커 보유는 0인데 상태는 옛 계좌 이력 그대로 남는다. `reconcileDay` 는
 * 매도 체결이 있을 때만 사이클을 리셋하므로 자동으로는 안 풀린다 — 보유 0인데 `t=3.09` 인
 * 채로 **첫 사이클이 틀린 크기로 주문한다.**
 *
 * 지우지 않고 `state.archive` 로 옮긴다(소프트 삭제). 판단은 전부 순수 모듈에 있다
 * (`src/lib/trading/state-reset.ts` — 테스트는 `state-reset.test.ts`).
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/reset-strategy-state.ts                    # 미리보기
 *   pnpm dlx tsx --env-file=.env.local scripts/reset-strategy-state.ts --apply
 *   … --portfolio <id>            해당 블록만 (기본: 삭제되지 않은 전 블록)
 *   … --reason "계좌 교체 50215100"  archive 에 남길 사유
 *
 * ⚠ 스케줄러가 도는 중에 돌리지 말 것 — 사이클 한가운데서 상태가 바뀌면 그 날 계산이 섞인다.
 *   장 시간 밖에서 돌리고, 계좌 교체와 같은 창에서 끝내라.
 */
import { connectToDB } from "../src/lib/db";
import TradingPortfolio from "../src/models/trading-portfolio";
import { describeReset, planStateReset } from "../src/lib/trading/state-reset";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const onlyId = flag("--portfolio");
const reason = flag("--reason") ?? "계좌 교체";
const at = new Date().toISOString();

await connectToDB();

const q: Record<string, unknown> = { isDeleted: { $ne: true } };
if (onlyId) q._id = onlyId;
const portfolios = await TradingPortfolio.find(q).lean();

if (!portfolios.length) {
  console.log("대상 포트폴리오가 없습니다.");
  process.exit(0);
}

let changed = 0;
for (const p of portfolios) {
  const label = `${String(p._id)} ${p.market}/${p.strategy}`
    + ((p.config as { symbol?: string } | undefined)?.symbol
      ? ` ${(p.config as { symbol?: string }).symbol}` : "");
  const plan = planStateReset(p.state as Record<string, unknown> | undefined, { at, reason });
  console.log(describeReset(label, plan));
  if (!plan.patch) continue;
  // 무엇이 사라지는지 값까지 보여 준다 — 되돌릴 일이 생겼을 때 이 출력이 근거가 된다.
  console.log(`  버릴 값: ${JSON.stringify(plan.cleared.reduce(
    (a, k) => ({ ...a, [k]: (p.state as Record<string, unknown>)[k] }), {}))}`);
  changed++;
  if (APPLY) {
    await TradingPortfolio.updateOne({ _id: p._id }, { $set: plan.patch });
    console.log("  → 적용됨");
  }
}

console.log(APPLY
  ? `\n적용 완료 — ${changed}개 블록 초기화(원본은 state.archive 에 있습니다).`
  : `\n미리보기입니다 — ${changed}개 블록이 바뀝니다. 실제로 적용하려면 --apply 를 붙이세요.`);
process.exit(0);
