/**
 * 사주(四柱) 계산 — lunar-javascript 래핑 (#390). **서버 전용**(클라이언트 번들 금지).
 *
 * 실측으로 검증: 입춘 연주 경계(2000-01-15→己卯 / 2000-02-10→庚辰)·시주 반영까지 정확.
 * 오행 매핑은 라이브러리 문자열 파싱 대신 **표준 표**를 직접 둔다(이름 변화·파싱 위험 회피).
 *
 * ⚠ 한계: KST 벽시계 그대로다 — 전통 사주의 진태양시(경도 -30분)·일부 연도 서머타임(1948~88)
 * 보정은 하지 않는다. 시주 경계(자정 근처) 출생은 한 칸 어긋날 수 있다(UI 에 밝힌다).
 */
import { Solar } from "lunar-javascript";
import { todayInSeoul } from "@/lib/birthday";
import { GAN_EL, ZHI_EL, GAN_KR, ZHI_KR, type WuXing } from "./saju-labels";
import { generatePolite, type LlmMessage, type GeneratedReading } from "./reading";

export interface Pillar {
  ganzhi: string; // 干支 예: "戊午"
  gan: string; zhi: string; // 한자
  ganKr: string; zhiKr: string; // 한글 예: "무", "오"
  ganEl: WuXing; zhiEl: WuXing;
}

export interface Saju {
  pillars: { year: Pillar; month: Pillar; day: Pillar; time: Pillar | null };
  dayGan: string; // 일간 한자
  dayGanKr: string; // 일간 한글
  dayEl: WuXing; // 일간 오행 = 나의 기운
  elements: Record<WuXing, number>; // 오행 분포
}

function toPillar(ganzhi: string): Pillar {
  const gan = ganzhi.charAt(0);
  const zhi = ganzhi.charAt(1);
  return {
    ganzhi, gan, zhi,
    ganKr: GAN_KR[gan] ?? gan, zhiKr: ZHI_KR[zhi] ?? zhi,
    ganEl: GAN_EL[gan], zhiEl: ZHI_EL[zhi],
  };
}

function countElements(pillars: (Pillar | null)[]): Record<WuXing, number> {
  const c: Record<WuXing, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) {
    if (!p) continue;
    c[p.ganEl]++; c[p.zhiEl]++;
  }
  return c;
}

/**
 * 생년월일(+선택 태어난시)로 사주팔자를 계산.
 * birthday 는 'YYYY-MM-DD' 를 UTC 자정으로 저장한 Date — UTC 게터로 연·월·일을 읽는다(#326 규약).
 * 태어난시가 없으면 정오로 계산하고 **시주는 null**(날짜계 세 기둥은 시각 무관).
 */
export function computeSaju(birthday: Date, birthTime?: string | null): Saju {
  const y = birthday.getUTCFullYear();
  const m = birthday.getUTCMonth() + 1;
  const d = birthday.getUTCDate();
  let hour = 12, minute = 0;
  const hasTime = typeof birthTime === "string" && /^\d{1,2}:\d{2}$/.test(birthTime);
  if (hasTime) {
    const [hh, mm] = birthTime!.split(":").map(Number);
    hour = hh; minute = mm;
  }
  const ec = Solar.fromYmdHms(y, m, d, hour, minute, 0).getLunar().getEightChar();
  const year = toPillar(ec.getYear());
  const month = toPillar(ec.getMonth());
  const day = toPillar(ec.getDay());
  const time = hasTime ? toPillar(ec.getTime()) : null;
  return {
    pillars: { year, month, day, time },
    dayGan: day.gan,
    dayGanKr: day.ganKr,
    dayEl: day.ganEl,
    elements: countElements([year, month, day, time]),
  };
}

/** 오늘(KST)의 일진(日辰) — 하루의 기운. */
export function todayIljin(now: Date): { pillar: Pillar } {
  const { year, month, day } = todayInSeoul(now);
  const ec = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar().getEightChar();
  return { pillar: toPillar(ec.getDay()) };
}

// 오행 상생: 목→화→토→금→수→목. 상극: 목극토·토극수·수극화·화극금·금극목.
const SHENG: Record<WuXing, WuXing> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const KE: Record<WuXing, WuXing> = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };

export type RelationKey = "비화" | "식상" | "인성" | "재성" | "관성";

/** 나의 오행(mine) 기준, 상대 오행(other)과의 십성 그룹 관계 + 쉬운 뜻. */
export function elementRelation(mine: WuXing, other: WuXing): { key: RelationKey; meaning: string } {
  if (mine === other) return { key: "비화", meaning: "동료·경쟁 — 나와 결이 같은 기운" };
  if (SHENG[mine] === other) return { key: "식상", meaning: "표현·베풂·활동 — 내가 밖으로 내보내는 흐름" };
  if (SHENG[other] === mine) return { key: "인성", meaning: "도움·배움·안정 — 나를 받쳐 주는 기운" };
  if (KE[mine] === other) return { key: "재성", meaning: "재물·성취·현실 — 내가 다루어 얻는 결실" };
  return { key: "관성", meaning: "규율·책임·긴장 — 나를 다잡는 기운" }; // KE[other] === mine
}

// ── 오늘의 사주 풀이 (LLM + 존댓말 가드, reading.ts 공유) ──────────────

/** 관계 키 → 쉬운 한 줄(템플릿·프롬프트 공용). */
const RELATION_LINE: Record<RelationKey, string> = {
  비화: "나와 결이 같은 기운이 함께하는",
  식상: "내 안의 것을 밖으로 내보내기 좋은",
  인성: "나를 받쳐 주는 기운이 도는",
  재성: "차분히 다루면 결실이 잡히는",
  관성: "나를 다잡아 주는 기운이 드는",
};

export interface SajuContext {
  dayGanKr: string; dayEl: WuXing;
  iljinKr: string; iljinEl: WuXing;
  relation: { key: RelationKey; meaning: string };
}

/** 프롬프트 조립(순수). 존댓말을 예시까지 넣어 강제(타로와 동일 톤). */
export function buildSajuPrompt(ctx: SajuContext): LlmMessage[] {
  const system =
    "너는 따뜻하고 담백한 사주 상담가야. 아래 정보로 '오늘의 운세'를 한국어로 써 줘.\n" +
    "반드시 지킬 것:\n" +
    "- 3~4문장. 모든 문장을 반드시 **존댓말(~요 / ~습니다)** 로 끝맺어. 반말(~어/~야/~해/~줘/~거야)은 절대 쓰지 마.\n" +
    "- 위로 한 마디와 오늘 실천할 작은 조언 하나를 담아.\n" +
    "- 어려운 명리 용어를 나열하지 말고, 오늘의 기운을 일상 언어로 쉽게 풀어 줘.\n" +
    "문체 예시: \"오늘은 마음이 차분해지는 하루예요. 서두르기보다 한 박자 쉬어 가 보세요. 작은 정리 하나가 뜻밖의 여유를 선물할 거예요.\"";
  const user =
    `이 분은 ${ctx.dayGanKr}(日干) — ${ctx.dayEl}의 기운을 타고난 분이에요.\n` +
    `오늘의 일진은 ${ctx.iljinKr}이고, 오늘의 기운은 ${ctx.iljinEl}입니다.\n` +
    `내 기운(${ctx.dayEl})과 오늘(${ctx.iljinEl})의 관계는 '${ctx.relation.key}' — ${ctx.relation.meaning}.\n` +
    "이 흐름으로 오늘의 운세를 써 줘.";
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** LLM 실패·미생성 시 폴백(항상 존댓말). */
export function templateSajuReading(ctx: SajuContext): string {
  const line = RELATION_LINE[ctx.relation.key];
  return `오늘은 ${line} 하루예요. ${ctx.dayEl}의 기운을 타고난 분에게 오늘의 ${ctx.iljinEl} 기운이 ` +
    `${ctx.relation.meaning.split(" — ")[0]}으로 다가옵니다. 서두르기보다 한 걸음 천천히, ` +
    `오늘 할 수 있는 작은 일 하나에 마음을 두어 보세요.`;
}

/** 오늘의 사주 풀이 생성(LLM→존댓말 가드→템플릿). */
export function generateSajuReading(
  ctx: SajuContext,
  opts?: { signal?: AbortSignal; retries?: number },
): Promise<GeneratedReading> {
  return generatePolite(buildSajuPrompt(ctx), templateSajuReading(ctx), opts);
}

/** 저장된 사주 사실을 SajuContext 로 조립(순수) — API·배치 공용. */
export function sajuContext(saju: Saju, iljin: Pillar): SajuContext {
  return {
    dayGanKr: saju.dayGanKr, dayEl: saju.dayEl,
    iljinKr: `${iljin.ganKr}${iljin.zhiKr}(${iljin.ganzhi})`, iljinEl: iljin.ganEl,
    relation: elementRelation(saju.dayEl, iljin.ganEl),
  };
}

// ── 클라이언트 DTO 블록 (서버에서 조립) ──────────────────────────────
export interface SajuPillarDTO { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: WuXing; zhiEl: WuXing; }
export interface SajuBlockDTO {
  pillars: { year: SajuPillarDTO; month: SajuPillarDTO; day: SajuPillarDTO; time: SajuPillarDTO | null };
  dayGanKr: string; dayEl: WuXing; elements: Record<WuXing, number>;
  iljin: { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: WuXing };
  relation: { key: RelationKey; meaning: string };
  reading: string; readingSource: "llm" | "template";
  hasBirthTime: boolean;
}

function pillarDTO(p: Pillar): SajuPillarDTO {
  return { ganzhi: p.ganzhi, gan: p.gan, zhi: p.zhi, ganKr: p.ganKr, zhiKr: p.zhiKr, ganEl: p.ganEl, zhiEl: p.zhiEl };
}

/** 사주 사실 + 캐시된 풀이 → 클라이언트 블록(순수). 풀이 없으면 템플릿으로 즉시 채운다. */
export function sajuBlock(
  saju: Saju, iljin: Pillar,
  cached?: { sajuReading?: string; sajuSource?: "llm" | "template" },
): SajuBlockDTO {
  const ctx = sajuContext(saju, iljin);
  const reading = cached?.sajuReading && cached.sajuReading.trim() ? cached.sajuReading : templateSajuReading(ctx);
  return {
    pillars: {
      year: pillarDTO(saju.pillars.year), month: pillarDTO(saju.pillars.month),
      day: pillarDTO(saju.pillars.day), time: saju.pillars.time ? pillarDTO(saju.pillars.time) : null,
    },
    dayGanKr: saju.dayGanKr, dayEl: saju.dayEl, elements: saju.elements,
    iljin: { ganzhi: iljin.ganzhi, gan: iljin.gan, zhi: iljin.zhi, ganKr: iljin.ganKr, zhiKr: iljin.zhiKr, ganEl: iljin.ganEl },
    relation: ctx.relation,
    reading, readingSource: cached?.sajuReading && cached.sajuReading.trim() ? (cached.sajuSource ?? "template") : "template",
    hasBirthTime: saju.pillars.time !== null,
  };
}
