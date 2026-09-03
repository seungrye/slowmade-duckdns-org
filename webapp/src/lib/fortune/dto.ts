/**
 * DailyFortune 문서 → 클라이언트 DTO (순수) (#388).
 *
 * 화면은 카드 표시정보(이름·방향별 키워드·이미지 URL)와 풀이·열람여부만 필요하다.
 * 이미지 URL 은 서버 env(MinIO publicHost)로 만들어 넘긴다 — 클라이언트가 버킷 주소를 몰라도 되게.
 */
import { keywordsOf, type TarotCard } from "./tarot-deck";
import { templateReading } from "./reading";

export interface FortuneDTO {
  dateKey: string;
  cardId: number;
  orientation: "up" | "rev";
  reading: string;
  readingSource: "llm" | "template";
  status: "pending" | "ready" | "failed";
  seen: boolean;
  card: { nameKr: string; nameEn: string; keywords: string[]; imageUrl: string };
}

interface FortuneDoc {
  dateKey: string;
  cardId: number;
  orientation: "up" | "rev";
  reading?: string;
  readingSource?: "llm" | "template";
  status?: "pending" | "ready" | "failed";
  seenAt?: Date | null;
}

export function fortuneDTO(doc: FortuneDoc, card: TarotCard, imageUrl: string): FortuneDTO {
  return {
    dateKey: doc.dateKey,
    cardId: doc.cardId,
    orientation: doc.orientation,
    // 안전망 — 문서에 풀이가 비어 있으면 템플릿으로 채워 빈 화면을 막는다.
    reading: doc.reading && doc.reading.trim() ? doc.reading : templateReading(card, doc.orientation),
    readingSource: doc.readingSource ?? "template",
    status: doc.status ?? "pending",
    seen: !!doc.seenAt,
    card: {
      nameKr: card.nameKr,
      nameEn: card.nameEn,
      keywords: keywordsOf(card, doc.orientation),
      imageUrl,
    },
  };
}
