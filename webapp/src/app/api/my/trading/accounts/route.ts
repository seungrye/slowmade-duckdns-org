import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import TradingPortfolio from "@/models/trading-portfolio";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";
import { encryptSecret } from "@/lib/trading/crypto";
import { maskedCreds } from "@/lib/trading/settings-data";

export const dynamic = "force-dynamic";

/**
 * 자동매매 계정 CRUD — 마이페이지>설정. owner 전용.
 * 보안: credentials 는 AES-256-GCM 암호화 저장, GET 은 마스킹 값만 반환(평문 미노출).
 */

const CRED_FIELDS: Record<string, string[]> = {
  kis: ["appKey", "appSecret", "accountNo"],
  toss: ["clientId", "clientSecret", "accountSeq"],
};

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  await connectToDB();
  const accounts = await TradingAccount.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean();
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: String(a._id),
      broker: a.broker,
      env: a.env,
      name: a.name,
      envKey: a.envKey,
      liveEnabled: a.liveEnabled,
      memo: a.memo,
      credentials: maskedCreds(a.credentials as Record<string, string>),
    })),
    liveAllowed: process.env.TRADING_LIVE_ALLOWED === "true",
  });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const broker = String(body.broker ?? "");
  if (!["kis", "toss"].includes(broker)) {
    return NextResponse.json({ error: "broker 는 kis|toss" }, { status: 400 });
  }
  const env = broker === "toss" ? "toss" : String(body.env ?? "paper");
  if (broker === "kis" && !["paper", "real"].includes(env)) {
    return NextResponse.json({ error: "kis env 는 paper|real" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name(라벨) 필수" }, { status: 400 });

  const credentials: Record<string, string> = {};
  for (const f of CRED_FIELDS[broker]) {
    const v = String(body[f] ?? "").trim();
    if (!v && f !== "accountSeq") {
      return NextResponse.json({ error: `${f} 필수` }, { status: 400 });
    }
    if (v) credentials[f] = encryptSecret(v);
  }
  await connectToDB();
  const envKey = `${env}-${name}`;
  // envKey 는 unique — 소프트 삭제된 같은 envKey 문서가 있으면 재사용(undelete), 살아있으면 409.
  const dup = await TradingAccount.findOne({ envKey });
  if (dup && !dup.isDeleted) {
    return NextResponse.json({ error: `envKey 중복: ${envKey}` }, { status: 409 });
  }
  if (dup) {
    dup.set({
      ownerEmail: owner.email, broker, env, name, credentials,
      liveEnabled: false, memo: String(body.memo ?? ""), isDeleted: false, deletedAt: null,
    });
    dup.markModified("credentials");
    await dup.save();
    return NextResponse.json({ id: String(dup._id), envKey });
  }
  const doc = await TradingAccount.create({
    ownerEmail: owner.email, broker, env, name, envKey, credentials,
    liveEnabled: false, memo: String(body.memo ?? ""),
  });
  return NextResponse.json({ id: String(doc._id), envKey });
}

export async function PUT(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const id = String(body.id ?? "");
  await connectToDB();
  const acct = await TradingAccount.findById(id);
  if (!acct) return NextResponse.json({ error: "계정 없음" }, { status: 404 });
  if (typeof body.liveEnabled === "boolean") acct.liveEnabled = body.liveEnabled;
  if (typeof body.memo === "string") acct.memo = body.memo;
  // 자격증명 갱신은 전달된 필드만 덮어쓴다(마스킹 값 재전송 방지를 위해 빈 값 무시).
  for (const f of CRED_FIELDS[acct.broker] ?? []) {
    const v = body[f];
    if (typeof v === "string" && v.trim() && !v.includes("…")) {
      (acct.credentials as Record<string, string>)[f] = encryptSecret(v.trim());
      acct.markModified("credentials");
    }
  }
  await acct.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const id = String(new URL(req.url).searchParams.get("id") ?? "");
  await connectToDB();
  const acct = await TradingAccount.findById(id);
  if (!acct) return NextResponse.json({ error: "계정 없음" }, { status: 404 });
  const now = new Date();
  // 소프트 삭제 — 하드 삭제 없이 숨긴다. 실행/주문 로그(runs/orderlogs)는 그대로 보존한다.
  await Promise.all([
    TradingPortfolio.updateMany({ accountId: acct._id }, { $set: { isDeleted: true, deletedAt: now } }),
    // 이 계정(envKey)의 매매 차트도 함께 숨김(양 통화).
    StockTrade.updateMany({ env: acct.envKey }, { $set: { hidden: true } }),
    PortfolioHistory.updateMany({ env: acct.envKey }, { $set: { hidden: true } }),
  ]);
  await TradingAccount.updateOne({ _id: acct._id }, { $set: { isDeleted: true, deletedAt: now } });
  return NextResponse.json({ ok: true });
}
