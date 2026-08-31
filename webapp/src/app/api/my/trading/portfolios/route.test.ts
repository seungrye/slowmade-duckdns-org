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

const mockOwner = requireOwner as unknown as ReturnType<typeof vi.fn>;
const P = TradingPortfolio as unknown as Record<string, ReturnType<typeof vi.fn>>;
const A = TradingAccount as unknown as Record<string, ReturnType<typeof vi.fn>>;
const R = TradingPortfolioRevision as unknown as Record<string, ReturnType<typeof vi.fn>>;
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
    expect(filter).toEqual({ _id: "edit-1", accountId: ACCOUNT });
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
