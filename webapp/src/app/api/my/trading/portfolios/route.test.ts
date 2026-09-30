import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-owner", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/models/trading-portfolio", () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock("@/models/trading-account", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/trading-run", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/trading-order-log", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("@/models/trading-portfolio-revision", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock("@/models/stock-trade", () => ({ default: { updateMany: vi.fn() } }));
vi.mock("@/models/portfolio-history", () => ({ default: { updateMany: vi.fn() } }));

import { POST, DELETE } from "./route";
import { requireOwner } from "@/lib/require-owner";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import TradingPortfolioRevision from "@/models/trading-portfolio-revision";
import TradingRun from "@/models/trading-run";
import TradingOrderLog from "@/models/trading-order-log";

const mockOwner = requireOwner as unknown as ReturnType<typeof vi.fn>;
const P = TradingPortfolio as unknown as Record<string, ReturnType<typeof vi.fn>>;
const A = TradingAccount as unknown as Record<string, ReturnType<typeof vi.fn>>;
const R = TradingPortfolioRevision as unknown as Record<string, ReturnType<typeof vi.fn>>;
const TR = TradingRun as unknown as Record<string, ReturnType<typeof vi.fn>>;
const OL = TradingOrderLog as unknown as Record<string, ReturnType<typeof vi.fn>>;
/** TradingRun.find().select().lean() 체인 */
const runsLean = (v: unknown[]) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(v) }) });
/** revision 모델의 findOne().sort().select().lean() 체인 */
const revLean = (v: unknown) => ({
  sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(v) }) }),
});

const ACCOUNT = "acc-1";
const body = (over: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT,
  market: "us",
  strategy: "infinite_v4",
  runAt: "09:35",
  config: { symbol: "TQQQ", principal: 1000 },
  ...over,
});

const post = (b: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/my/trading/portfolios", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  }) as never);

const lean = (v: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(v) }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner.mockResolvedValue({ email: "me@test.com" });
  P.create.mockResolvedValue({ _id: "new-1" });
  P.findOneAndUpdate.mockResolvedValue({ _id: "edit-1" });
  P.updateOne.mockResolvedValue({});
  P.countDocuments.mockResolvedValue(0);
  A.findById.mockReturnValue(lean({ envKey: "paper-50194613" }));
  R.findOne.mockReturnValue(revLean(null));
  R.create.mockResolvedValue({});
  TR.find.mockReturnValue(runsLean([]));
  OL.countDocuments.mockResolvedValue(0);
});

describe("POST — 추가와 수정을 가른다 (#339)", () => {
  it("portfolioId 가 없으면 새로 만든다 — 기존 블록을 건드리지 않는다", async () => {
    const res = await post(body());

    expect(res.status).toBe(200);
    expect(P.create).toHaveBeenCalledOnce();
    // 예전 버그: (accountId, market) 로 upsert 해서 기존 것이 조용히 교체됐다.
    expect(P.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("portfolioId 가 오면 그 문서만 수정한다", async () => {
    P.findOne.mockReturnValue(lean({ _id: "edit-1", strategy: "infinite_v4", isDeleted: false }));

    await post(body({ portfolioId: "edit-1" }));

    expect(P.create).not.toHaveBeenCalled();
    const [filter] = P.findOneAndUpdate.mock.calls[0];
    // #515 — accountId 는 조회 키가 아니다(계좌 변경이 404 로 막히던 원인).
    expect(filter).toEqual({ _id: "edit-1" });
  });

  it("없는 portfolioId 면 404 — 엉뚱한 문서를 만들지 않는다", async () => {
    P.findOne.mockReturnValue(lean(null));

    const res = await post(body({ portfolioId: "gone" }));

    expect(res.status).toBe(404);
    expect(P.create).not.toHaveBeenCalled();
  });

  it("예약금을 저장한다 — 비우면 0(전액)", async () => {
    await post(body({ reservedCash: 30_000 }));
    expect(P.create.mock.calls[0][0]).toMatchObject({ reservedCash: 30_000 });

    P.create.mockClear();
    await post(body());
    expect(P.create.mock.calls[0][0]).toMatchObject({ reservedCash: 0 });
  });

  it("음수 예약금은 0 으로 — 마이너스 예산은 없다", async () => {
    await post(body({ reservedCash: -5 }));
    expect(P.create.mock.calls[0][0]).toMatchObject({ reservedCash: 0 });
  });

  it("새 블록은 state 를 비운 채 시작한다 — 옛 사이클을 물려받지 않는다", async () => {
    await post(body());
    expect(P.create.mock.calls[0][0]).toMatchObject({ state: {} });
  });

  it("수정이면 state 를 건드리지 않는다 — 진행 중 사이클을 지키려고", async () => {
    P.findOne.mockReturnValue(lean({ _id: "edit-1", strategy: "infinite_v4", isDeleted: false }));

    await post(body({ portfolioId: "edit-1" }));

    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty("state");
  });
});

describe("DELETE — 숨김은 마지막 블록일 때만 (#339)", () => {
  const del = () => DELETE(new Request("http://localhost/api/my/trading/portfolios?id=p1", { method: "DELETE" }) as never);

  it("형제가 남아 있으면 통화 블록을 숨기지 않는다", async () => {
    P.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ accountId: ACCOUNT, market: "us" }) }) });
    P.countDocuments.mockResolvedValue(1); // 아직 하나 남음

    const res = await del();

    expect(res.status).toBe(200);
    // 남은 블록의 매매기록이 통째로 사라지면 안 된다.
    expect(P.countDocuments).toHaveBeenCalledWith({ accountId: ACCOUNT, market: "us", isDeleted: { $ne: true } });
  });

  it("소프트 삭제한다 — 문서를 지우지 않는다", async () => {
    P.findById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ accountId: ACCOUNT, market: "us" }) }) });

    await del();

    const [, update] = P.updateOne.mock.calls[0];
    expect(update.$set.isDeleted).toBe(true);
  });
});

describe("설정 리비전 (#350) — 값이 사라지지 않게", () => {
  // #348: 전략을 갈아타자 예전 config 가 통째로 덮여 사라졌고, 주문로그에서 역산해야 했다.
  const prevSame = {
    _id: "edit-1", isDeleted: false, market: "us", strategy: "infinite_v4", runAt: "09:35",
    weekdaysOnly: true, enabled: true, reservedCash: 0,
    config: { symbol: "TQQQ", principal: 1000 },
  };

  it("새로 만들면 추가 리비전 한 줄", async () => {
    await post(body());

    expect(R.create).toHaveBeenCalledOnce();
    const rev = R.create.mock.calls[0][0];
    expect(rev.action).toBe("create");
    expect(rev.version).toBe(1);
    expect(rev.changed).toEqual([]);
    expect(rev.snapshot.config).toEqual({ symbol: "TQQQ", principal: 1000 });
  });

  it("값을 바꿔 저장하면 바뀐 키와 그 시점 값이 남는다", async () => {
    P.findOne.mockReturnValue(lean(prevSame));

    await post(body({ portfolioId: "edit-1", runAt: "10:50", config: { symbol: "TQQQ", principal: 93300 } }));

    const rev = R.create.mock.calls[0][0];
    expect(rev.action).toBe("update");
    expect(rev.changed.sort()).toEqual(["config", "runAt"]);
    // 이 값이 남아 있었다면 #348 에서 역산할 필요가 없었다.
    expect(rev.snapshot.config).toEqual({ symbol: "TQQQ", principal: 93300 });
  });

  it("아무것도 안 바꾸고 저장하면 리비전을 안 만든다", async () => {
    // 저장 버튼만 눌러도 upsert 가 도므로, 이게 무너지면 이력이 같은 줄로 도배된다.
    P.findOne.mockReturnValue(lean(prevSame));

    const res = await post(body({ portfolioId: "edit-1" }));

    expect(res.status).toBe(200);
    expect(P.findOneAndUpdate).toHaveBeenCalledOnce(); // 저장 자체는 된다
    expect(R.create).not.toHaveBeenCalled();
  });

  it("version 은 마지막 다음 번호", async () => {
    R.findOne.mockReturnValue(revLean({ version: 4 }));
    P.findOne.mockReturnValue(lean(prevSame));

    await post(body({ portfolioId: "edit-1", runAt: "10:50" }));

    expect(R.create.mock.calls[0][0].version).toBe(5);
  });

  it("스냅샷에 state 가 절대 안 들어간다", async () => {
    // 엔진이 매 실행마다 고치는 값이라(T·cycleCash) 담으면 이력이 도배돼 쓸모없어진다.
    P.findOne.mockReturnValue(lean({ ...prevSame, state: { v4: { t: 9.28 } } }));

    await post(body({ portfolioId: "edit-1", runAt: "10:50" }));

    expect(R.create.mock.calls[0][0].snapshot).not.toHaveProperty("state");
  });

  it("리비전 기록이 터져도 설정 저장은 성공한다", async () => {
    // 이력 때문에 매매 설정을 못 바꾸면 안 된다 — 원장·메일과 같은 원칙.
    R.create.mockRejectedValue(new Error("DB 다운"));

    const res = await post(body());

    expect(res.status).toBe(200);
  });

  it("삭제하면 지워질 때의 값이 남는다", async () => {
    P.findById.mockReturnValue(lean({ ...prevSame, accountId: ACCOUNT }));

    await DELETE(new Request("http://localhost/api/my/trading/portfolios?id=p1", { method: "DELETE" }) as never);

    const rev = R.create.mock.calls[0][0];
    expect(rev.action).toBe("delete");
    // 지운 블록의 설정을 나중에 다시 볼 수 있어야 한다.
    expect(rev.snapshot.config).toEqual({ symbol: "TQQQ", principal: 1000 });
  });
});

// ── #515 계좌 이동 ─────────────────────────────────────────────────
//
// 증상: 편집 폼에서 계정을 바꿔 저장하면 404. accountId 가 **조회 키**에 있어서다.
// 그런데 그냥 키에서 빼면 감사가 잡은 함정 둘에 걸린다:
//   ① toggleEnabled 도 accountId 를 싣는다 → **모든 POST 가 이동 명령**이 된다.
//      탭 두 개 열고 토글만 눌러도 계좌가 되돌아가고 state 가 또 초기화된다.
//   ② 장중에 옮기면 사이클이 두 계좌로 쪼개진다 — 옛 계좌 익절 체결이 어느 상태에도,
//      어느 원장에도 안 잡힌다.
// 그래서 이동은 **명시 의도(moveAccount)** 로만 받고, 안전하지 않으면 거부한다.

const V4STATE = { symbol: "TQQQ", t: 3.0895, cycleCash: 81_188, lastRunDate: "20260929" };

describe("POST — 계좌 이동은 명시 의도로만 (#515)", () => {
  beforeEach(() => {
    P.findOne.mockReturnValue(lean({
      _id: "edit-1", accountId: ACCOUNT, market: "us", strategy: "infinite_v4",
      isDeleted: false, enabled: false, state: { v4: V4STATE },
      config: { symbol: "TQQQ", principal: 1000 },
    }));
    A.findById.mockReturnValue(lean({ _id: "acc-2", envKey: "paper-50215100", isDeleted: false }));
    P.countDocuments.mockResolvedValue(0);
  });

  it("moveAccount 없이 다른 accountId 를 보내면 계좌가 안 바뀐다 — 토글이 이동이 되면 안 된다", async () => {
    const res = await post(body({ portfolioId: "edit-1", accountId: "acc-2" }));
    expect(res.status).toBe(200);
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty("accountId");
    expect(update.$set).not.toHaveProperty("state"); // 상태도 안 건드린다
  });

  it("moveAccount 면 계좌가 바뀐다 — 이게 #515 의 본래 요구", async () => {
    const res = await post(body({ portfolioId: "edit-1", accountId: "acc-2", moveAccount: true }));
    expect(res.status).toBe(200);
    const [filter, update] = P.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "edit-1" });   // accountId 는 조회 키가 아니다
    expect(update.$set.accountId).toBe("acc-2");
  });

  it("이동하면 전략 상태를 archive 로 옮기고 비운다 — 보유 0인데 t=3.09 면 틀린 크기로 주문한다", async () => {
    await post(body({ portfolioId: "edit-1", accountId: "acc-2", moveAccount: true }));
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    const state = update.$set.state as { v4?: unknown; archive: { state: unknown }[] };
    expect(state.v4).toBeUndefined();
    expect(state.archive).toHaveLength(1);
    expect(state.archive[0].state).toEqual({ v4: V4STATE }); // 값 하나도 안 잃는다
  });

  it("같은 계좌로 이동을 요청하면 상태를 건드리지 않는다 — 실수로 눌러도 안전", async () => {
    await post(body({ portfolioId: "edit-1", accountId: ACCOUNT, moveAccount: true }));
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty("state");
  });
});

describe("POST — 안전하지 않은 이동은 거부한다 (#515)", () => {
  const moveBody = () => body({ portfolioId: "edit-1", accountId: "acc-2", moveAccount: true });
  const prevWith = (over: Record<string, unknown>) => lean({
    _id: "edit-1", accountId: ACCOUNT, market: "us", strategy: "infinite_v4",
    isDeleted: false, enabled: false, state: { v4: V4STATE }, ...over,
  });

  beforeEach(() => {
    P.findOne.mockReturnValue(prevWith({}));
    A.findById.mockReturnValue(lean({ _id: "acc-2", envKey: "paper-50215100", isDeleted: false }));
    P.countDocuments.mockResolvedValue(0);
  });

  it("블록이 켜져 있으면 409 — 먼저 끄고 옮기라는 뜻", async () => {
    P.findOne.mockReturnValue(prevWith({ enabled: true }));
    const res = await post(moveBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/비활성|끄/);
    expect(P.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("오늘 **접수된 주문**이 있으면 409 — 옛 계좌에 건 주문이 고아가 된다", async () => {
    TR.find.mockReturnValue(runsLean([{ _id: "run-1" }]));
    OL.countDocuments.mockResolvedValue(3); // 접수 3건
    const res = await post(moveBody());
    expect(res.status).toBe(409);
    expect(P.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("오늘 런이 있어도 **전부 거부**였으면 옮길 수 있다 — 고아가 될 주문이 없다", async () => {
    // 실측: 2026-09-30 미장 사이클은 16건 계획·접수 0건(계좌 만료로 전부 40910000).
    // 그 상태에서 막으면 계좌를 못 옮겨 문제를 고칠 수가 없다.
    TR.find.mockReturnValue(runsLean([{ _id: "run-1" }]));
    OL.countDocuments.mockResolvedValue(0);
    const res = await post(moveBody());
    expect(res.status).toBe(200);
    expect(P.findOneAndUpdate).toHaveBeenCalled();
  });

  it("대상 계정이 없으면 400 — 스케줄러가 조용히 건너뛰는 상태로 만들지 않는다", async () => {
    A.findById.mockReturnValue(lean(null));
    const res = await post(moveBody());
    expect(res.status).toBe(400);
    expect(P.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("대상 계정이 삭제됐으면 400", async () => {
    A.findById.mockReturnValue(lean({ _id: "acc-2", envKey: "x", isDeleted: true }));
    expect((await post(moveBody())).status).toBe(400);
  });

  it("거부는 상태를 남기지 않는다 — 실패했는데 archive 만 쌓이면 안 된다", async () => {
    P.findOne.mockReturnValue(prevWith({ enabled: true }));
    await post(moveBody());
    expect(P.updateOne).not.toHaveBeenCalled();
    expect(R.create).not.toHaveBeenCalled();
  });
});

describe("POST — 전략 정체성이 바뀌면 상태를 물려주지 않는다 (#515)", () => {
  // 계좌만의 문제가 아니다. symbol 을 바꾸면 보유 0인 새 종목이 옛 t=3.09 를 물려받는다.
  beforeEach(() => {
    P.findOne.mockReturnValue(lean({
      _id: "edit-1", accountId: ACCOUNT, market: "us", strategy: "infinite_v4",
      isDeleted: false, enabled: false, state: { v4: V4STATE },
      config: { symbol: "TQQQ", principal: 1000 },
    }));
  });

  it("config.symbol 이 바뀌면 상태를 archive 로 옮긴다", async () => {
    await post(body({ portfolioId: "edit-1", config: { symbol: "SOXL", principal: 1000 } }));
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect((update.$set.state as { v4?: unknown }).v4).toBeUndefined();
  });

  it("strategy 가 바뀌면 상태를 archive 로 옮긴다 — 죽은 v4 상태가 VR 밑에 남으면 안 된다", async () => {
    await post(body({
      portfolioId: "edit-1", strategy: "value_rebalancing",
      config: { symbol: "TQQQ", principal: 1000, gradient: 1 },
    }));
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect((update.$set.state as { v4?: unknown }).v4).toBeUndefined();
  });

  it("아무것도 안 바뀌면 상태를 건드리지 않는다 — 진행 중 사이클을 지킨다", async () => {
    await post(body({ portfolioId: "edit-1", config: { symbol: "TQQQ", principal: 1000 } }));
    const [, update] = P.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty("state");
  });
});

describe("POST — market 은 편집으로 못 바꾼다 (#515)", () => {
  // 예전엔 setFields 에 market 이 없어 runAt 만 저장됐다 — 미장 블록이 09:30 을 ET 로
  // 해석해 실행 시각만 조용히 옮겨지고, 리비전엔 바뀐 것처럼 거짓으로 남았다.
  beforeEach(() => {
    P.findOne.mockReturnValue(lean({
      _id: "edit-1", accountId: ACCOUNT, market: "us", strategy: "infinite_v4",
      isDeleted: false, enabled: false,
    }));
  });

  it("다른 market 으로 저장하면 400 — 조용히 무시하지 않는다", async () => {
    const res = await post(body({ portfolioId: "edit-1", market: "kr" }));
    expect(res.status).toBe(400);
    expect(P.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("같은 market 이면 통과한다", async () => {
    expect((await post(body({ portfolioId: "edit-1", market: "us" }))).status).toBe(200);
  });
});

describe("리비전 — 계좌 이동이 이력에 남는다 (#515)", () => {
  it("계좌만 바꿔도 리비전이 남는다 — 가장 위험한 변경이 감사 흔적 0건이면 안 된다", async () => {
    P.findOne.mockReturnValue(lean({
      _id: "edit-1", accountId: ACCOUNT, market: "us", strategy: "infinite_v4",
      runAt: "09:35", weekdaysOnly: true, enabled: false, reservedCash: 0,
      config: { symbol: "TQQQ", principal: 1000 }, isDeleted: false, state: {},
    }));
    A.findById.mockReturnValue(lean({ _id: "acc-2", envKey: "paper-50215100", isDeleted: false }));
    P.countDocuments.mockResolvedValue(0);

    await post(body({
      portfolioId: "edit-1", accountId: "acc-2", moveAccount: true,
      runAt: "09:35", config: { symbol: "TQQQ", principal: 1000 },
    }));

    expect(R.create).toHaveBeenCalled();
    const rev = R.create.mock.calls[0][0] as { changed: string[]; snapshot: Record<string, unknown> };
    expect(rev.changed).toContain("accountId");
    expect(rev.snapshot.accountId).toBe("acc-2");
  });
});
