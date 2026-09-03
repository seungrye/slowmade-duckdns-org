/**
 * 라이더-웨이트-스미스(RWS) 타로 78장 — **단일 출처** (#388).
 *
 * 이 배열이 카드의 정본이다. 뽑기(draw)·풀이(reading)·화면·업로드 스크립트가 전부 여기서
 * id·이름·키워드를 읽는다. 목록이 두 곳에 있으면 어긋난다([[single-source-facts]] 원칙).
 *
 * 구성: 메이저 아르카나 22장(0-21) + 마이너 56장(4수트 × 14랭크). id 0-77 연속.
 * 마이너는 표준 RWS 의미를 **수트 원소 + 랭크 원형**으로 조합해 만든다 — 실제 RWS 마이너가
 * 그렇게 읽힌다(예: 컵 2 = 감정 영역의 결합). 손으로 78벌을 적는 것보다 어긋날 여지가 적다.
 *
 * 이미지 키는 `tarot/rws/{id}.jpg`(MinIO). 원화는 퍼블릭 도메인(1909, Pamela Colman Smith).
 */

export type Arcana = "major" | "wands" | "cups" | "swords" | "pentacles";
export type Orientation = "up" | "rev";

export interface TarotCard {
  id: number; // 0-77
  arcana: Arcana;
  /** 메이저는 0-21, 마이너는 1-14(에이스=1 … 킹=14). */
  num: number;
  nameEn: string;
  nameKr: string;
  keywordsUp: string[];
  keywordsRev: string[];
  /** MinIO 이미지 키. */
  image: string;
}

// ── 메이저 아르카나 22 ──────────────────────────────────────────────
const MAJOR: Omit<TarotCard, "id" | "image">[] = [
  { arcana: "major", num: 0, nameEn: "The Fool", nameKr: "바보", keywordsUp: ["새로운 시작", "순수한 모험", "가능성"], keywordsRev: ["무모함", "망설임", "헛디딤"] },
  { arcana: "major", num: 1, nameEn: "The Magician", nameKr: "마법사", keywordsUp: ["의지", "실현", "재능의 집중"], keywordsRev: ["헛된 술수", "미룸", "재능 낭비"] },
  { arcana: "major", num: 2, nameEn: "The High Priestess", nameKr: "여사제", keywordsUp: ["직관", "고요한 지혜", "내면의 소리"], keywordsRev: ["혼란", "숨겨진 진실", "직관 무시"] },
  { arcana: "major", num: 3, nameEn: "The Empress", nameKr: "여황제", keywordsUp: ["풍요", "보살핌", "결실"], keywordsRev: ["과보호", "정체", "돌봄의 지침"] },
  { arcana: "major", num: 4, nameEn: "The Emperor", nameKr: "황제", keywordsUp: ["안정", "질서", "책임"], keywordsRev: ["경직", "통제 과잉", "고집"] },
  { arcana: "major", num: 5, nameEn: "The Hierophant", nameKr: "교황", keywordsUp: ["전통", "배움", "믿음"], keywordsRev: ["관습에서 벗어남", "자기만의 길", "형식의 굴레"] },
  { arcana: "major", num: 6, nameEn: "The Lovers", nameKr: "연인", keywordsUp: ["사랑", "선택", "조화"], keywordsRev: ["갈등", "미룬 결정", "어긋난 마음"] },
  { arcana: "major", num: 7, nameEn: "The Chariot", nameKr: "전차", keywordsUp: ["전진", "의지의 승리", "방향"], keywordsRev: ["통제 상실", "산만함", "제자리"] },
  { arcana: "major", num: 8, nameEn: "Strength", nameKr: "힘", keywordsUp: ["부드러운 용기", "인내", "다스림"], keywordsRev: ["자기의심", "조급함", "소진"] },
  { arcana: "major", num: 9, nameEn: "The Hermit", nameKr: "은둔자", keywordsUp: ["성찰", "홀로의 시간", "내면의 등불"], keywordsRev: ["고립", "외로움", "회피"] },
  { arcana: "major", num: 10, nameEn: "Wheel of Fortune", nameKr: "운명의 수레바퀴", keywordsUp: ["전환점", "흐름", "행운"], keywordsRev: ["지연", "저항", "악순환"] },
  { arcana: "major", num: 11, nameEn: "Justice", nameKr: "정의", keywordsUp: ["균형", "공정", "인과"], keywordsRev: ["치우침", "회피한 책임", "불공정"] },
  { arcana: "major", num: 12, nameEn: "The Hanged Man", nameKr: "매달린 사람", keywordsUp: ["멈춤", "다른 시선", "내려놓음"], keywordsRev: ["헛된 희생", "정체", "미룸"] },
  { arcana: "major", num: 13, nameEn: "Death", nameKr: "죽음", keywordsUp: ["끝과 시작", "변형", "놓아줌"], keywordsRev: ["집착", "변화 거부", "지지부진"] },
  { arcana: "major", num: 14, nameEn: "Temperance", nameKr: "절제", keywordsUp: ["조화", "중용", "느긋한 회복"], keywordsRev: ["불균형", "과함", "성급함"] },
  { arcana: "major", num: 15, nameEn: "The Devil", nameKr: "악마", keywordsUp: ["집착", "얽매임", "욕망 직면"], keywordsRev: ["해방", "굴레를 끊음", "각성"] },
  { arcana: "major", num: 16, nameEn: "The Tower", nameKr: "탑", keywordsUp: ["갑작스러운 변화", "무너짐", "해방의 각성"], keywordsRev: ["미뤄진 붕괴", "간신히 넘김", "두려움"] },
  { arcana: "major", num: 17, nameEn: "The Star", nameKr: "별", keywordsUp: ["희망", "치유", "고요한 회복"], keywordsRev: ["낙담", "믿음의 흔들림", "메마름"] },
  { arcana: "major", num: 18, nameEn: "The Moon", nameKr: "달", keywordsUp: ["직감", "모호함", "무의식"], keywordsRev: ["안개가 걷힘", "오해 해소", "불안 완화"] },
  { arcana: "major", num: 19, nameEn: "The Sun", nameKr: "태양", keywordsUp: ["기쁨", "활력", "명료함"], keywordsRev: ["잠시 흐림", "지연된 기쁨", "과열"] },
  { arcana: "major", num: 20, nameEn: "Judgement", nameKr: "심판", keywordsUp: ["부름", "재평가", "거듭남"], keywordsRev: ["자기비판", "망설임", "미룬 결단"] },
  { arcana: "major", num: 21, nameEn: "The World", nameKr: "세계", keywordsUp: ["완성", "통합", "성취"], keywordsRev: ["미완", "마무리 지연", "다음 단계 준비"] },
];

// ── 마이너 아르카나 — 수트 원소 + 랭크 원형 ──────────────────────────
const SUITS: { key: Exclude<Arcana, "major">; kr: string; flavor: string }[] = [
  { key: "wands", kr: "완드", flavor: "열정·행동" },
  { key: "cups", kr: "컵", flavor: "감정·관계" },
  { key: "swords", kr: "소드", flavor: "생각·소통" },
  { key: "pentacles", kr: "펜타클", flavor: "현실·재물" },
];

const RANKS: { num: number; en: string; kr: string; up: string[]; rev: string[] }[] = [
  { num: 1, en: "Ace", kr: "에이스", up: ["새 씨앗", "순수한 시작"], rev: ["망설이는 출발", "때가 이름"] },
  { num: 2, en: "Two", kr: "2", up: ["균형", "선택·결합"], rev: ["망설임", "어긋남"] },
  { num: 3, en: "Three", kr: "3", up: ["첫 결실", "함께함"], rev: ["엇박자", "지연"] },
  { num: 4, en: "Four", kr: "4", up: ["안정", "잠시 쉼"], rev: ["정체", "권태"] },
  { num: 5, en: "Five", kr: "5", up: ["도전", "결핍의 시험"], rev: ["회복의 실마리", "화해"] },
  { num: 6, en: "Six", kr: "6", up: ["회복", "주고받음"], rev: ["불균형", "미련"] },
  { num: 7, en: "Seven", kr: "7", up: ["점검", "인내의 시기"], rev: ["조급함", "방향 재조정"] },
  { num: 8, en: "Eight", kr: "8", up: ["속도", "몰입"], rev: ["지체", "흩어짐"] },
  { num: 9, en: "Nine", kr: "9", up: ["거의 다다름", "결실 직전"], rev: ["불안", "마무리 부담"] },
  { num: 10, en: "Ten", kr: "10", up: ["완결", "무르익음"], rev: ["과부하", "짐을 내려놓을 때"] },
  { num: 11, en: "Page", kr: "시종", up: ["호기심", "배우는 마음"], rev: ["서투름", "산만함"] },
  { num: 12, en: "Knight", kr: "기사", up: ["추진", "움직임"], rev: ["성급함", "멈칫함"] },
  { num: 13, en: "Queen", kr: "여왕", up: ["성숙한 품", "너그러움"], rev: ["소진", "감정 과잉"] },
  { num: 14, en: "King", kr: "왕", up: ["숙련", "이끎"], rev: ["경직", "독단"] },
];

function buildDeck(): TarotCard[] {
  const cards: Omit<TarotCard, "id" | "image">[] = [...MAJOR];
  for (const s of SUITS) {
    for (const r of RANKS) {
      cards.push({
        arcana: s.key,
        num: r.num,
        nameEn: `${r.en} of ${cap(s.key)}`,
        nameKr: `${s.kr} ${r.kr}`,
        // 수트 성격을 랭크 원형에 얹는다 — 마지막에 수트 결을 한 조각 더한다.
        keywordsUp: [...r.up, s.flavor],
        keywordsRev: [...r.rev],
      });
    }
  }
  return cards.map((c, id) => ({ ...c, id, image: `tarot/rws/${id}.jpg` }));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 78장 정본. 인덱스 = id. */
export const TAROT_DECK: readonly TarotCard[] = buildDeck();

export const DECK_SIZE = TAROT_DECK.length; // 78

export function cardById(id: number): TarotCard | undefined {
  return TAROT_DECK[id];
}

/** 화면·풀이가 쓰는 방향별 키워드. */
export function keywordsOf(card: TarotCard, orientation: Orientation): string[] {
  return orientation === "up" ? card.keywordsUp : card.keywordsRev;
}
