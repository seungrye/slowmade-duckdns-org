/**
 * A DailyFortune document -> the client DTO (pure) (#388).
 *
 * The UI needs only the card's display information (name, per-orientation keywords, image URL) plus the reading and
 * whether it has been opened. The image URL is built from the server env (MinIO publicHost) and passed down, so the
 * client need not know the bucket address.
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
    // A safety net - an empty reading in the document is filled from the template to avoid a blank screen.
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
