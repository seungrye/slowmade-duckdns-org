/**
 * 천간·지지 라벨·오행·뜻 — **단일 출처** (#393). 순수·클라이언트 안전(서버 의존 없음).
 *
 * saju.ts(서버)가 오행/한글 맵을 여기서 가져오고, 프로필 사주 패널(클라이언트)이 한자·뜻을
 * 여기서 가져온다. 두 곳에 표를 두면 어긋난다([[single-source-facts]]).
 */
export type WuXing = "목" | "화" | "토" | "금" | "수";

/** 천간 10 — 한글·오행·뜻(음양 + 상징 이미지). */
export const GAN: Record<string, { kr: string; el: WuXing; meaning: string }> = {
  甲: { kr: "갑", el: "목", meaning: "양(陽)의 목 — 큰 나무, 곧게 뻗는 기운" },
  乙: { kr: "을", el: "목", meaning: "음(陰)의 목 — 화초·덩굴, 부드럽게 감아 오르는 기운" },
  丙: { kr: "병", el: "화", meaning: "양(陽)의 화 — 태양, 널리 비추는 기운" },
  丁: { kr: "정", el: "화", meaning: "음(陰)의 화 — 촛불·등불, 따뜻이 밝히는 기운" },
  戊: { kr: "무", el: "토", meaning: "양(陽)의 토 — 큰 산·대지, 든든히 품는 기운" },
  己: { kr: "기", el: "토", meaning: "음(陰)의 토 — 밭·정원, 촘촘히 기르는 기운" },
  庚: { kr: "경", el: "금", meaning: "양(陽)의 금 — 무쇠·바위, 단단하고 곧은 기운" },
  辛: { kr: "신", el: "금", meaning: "음(陰)의 금 — 보석·칼날, 정교하고 예리한 기운" },
  壬: { kr: "임", el: "수", meaning: "양(陽)의 수 — 큰 강·바다, 넓게 흐르는 기운" },
  癸: { kr: "계", el: "수", meaning: "음(陰)의 수 — 이슬·시냇물, 스미어 적시는 기운" },
};

/** 지지 12 — 한글·오행·뜻(띠 + 계절/시간). */
export const ZHI: Record<string, { kr: string; el: WuXing; meaning: string }> = {
  子: { kr: "자", el: "수", meaning: "쥐 · 수 — 한밤(23~01시), 겨울의 한가운데" },
  丑: { kr: "축", el: "토", meaning: "소 · 토 — 새벽 전(01~03시), 늦겨울" },
  寅: { kr: "인", el: "목", meaning: "호랑이 · 목 — 이른 아침(03~05시), 초봄" },
  卯: { kr: "묘", el: "목", meaning: "토끼 · 목 — 아침(05~07시), 봄의 한가운데" },
  辰: { kr: "진", el: "토", meaning: "용 · 토 — 오전(07~09시), 늦봄" },
  巳: { kr: "사", el: "화", meaning: "뱀 · 화 — 오전(09~11시), 초여름" },
  午: { kr: "오", el: "화", meaning: "말 · 화 — 한낮(11~13시), 여름의 한가운데" },
  未: { kr: "미", el: "토", meaning: "양 · 토 — 오후(13~15시), 늦여름" },
  申: { kr: "신", el: "금", meaning: "원숭이 · 금 — 오후(15~17시), 초가을" },
  酉: { kr: "유", el: "금", meaning: "닭 · 금 — 저녁 무렵(17~19시), 가을의 한가운데" },
  戌: { kr: "술", el: "토", meaning: "개 · 토 — 초저녁(19~21시), 늦가을" },
  亥: { kr: "해", el: "수", meaning: "돼지 · 수 — 밤(21~23시), 초겨울" },
};

/**
 * 지지 12 — 오늘의 **결** 한 줄 (#449).
 *
 * 폴백 풀이가 30일에 5가지뿐이었다. 관계(비화·식상·인성·재성·관성)로만 문장을 골랐는데
 * 그게 다섯이기 때문이다. 지지는 **매일** 한 칸씩 도므로 여기에 한 문장을 매달면
 * 5 × 12 = 60가지가 되고, 연속한 이틀은 지지가 반드시 다르니 절대 안 겹친다.
 *
 * 오행이 아니라 **글자**에 매다는 것이 요점이다. 지지 오행은 寅卯(목·목)처럼 이틀 연속
 * 같을 수 있고, 그런 날은 천간 오행도 같아(甲寅→乙卯) 문장이 도로 겹친다.
 *
 * 내용은 위 `ZHI.meaning` 의 계절·시간을 말로 푼 것이다 — 같은 사실, 읽는 결만 다르다.
 */
export const ZHI_MOOD: Record<string, string> = {
  子: "한밤처럼 고요히 가라앉는 결이 함께합니다.",
  丑: "새벽이 오기 전처럼 묵묵히 견디는 결이 함께합니다.",
  寅: "이른 아침처럼 새로 움트는 결이 함께합니다.",
  卯: "아침 볕처럼 곧게 뻗는 결이 함께합니다.",
  辰: "늦봄의 오전처럼 두루 품는 결이 함께합니다.",
  巳: "초여름 볕처럼 차분히 달아오르는 결이 함께합니다.",
  午: "한낮처럼 환히 퍼지는 결이 함께합니다.",
  未: "늦여름 오후처럼 느긋하게 익는 결이 함께합니다.",
  申: "초가을 바람처럼 결을 고르는 기운이 함께합니다.",
  酉: "저녁 무렵처럼 하루를 여미는 결이 함께합니다.",
  戌: "초저녁처럼 제자리를 지키는 결이 함께합니다.",
  亥: "밤이 깊어지듯 안으로 잦아드는 결이 함께합니다.",
};

/** 파생 맵(saju.ts 가 쓰던 것들). */
export const GAN_KR: Record<string, string> = Object.fromEntries(Object.entries(GAN).map(([k, v]) => [k, v.kr]));
export const ZHI_KR: Record<string, string> = Object.fromEntries(Object.entries(ZHI).map(([k, v]) => [k, v.kr]));
export const GAN_EL: Record<string, WuXing> = Object.fromEntries(Object.entries(GAN).map(([k, v]) => [k, v.el]));
export const ZHI_EL: Record<string, WuXing> = Object.fromEntries(Object.entries(ZHI).map(([k, v]) => [k, v.el]));

export const ELEMENTS: readonly WuXing[] = ["목", "화", "토", "금", "수"] as const;

/** 화면 오행 색(라이트/다크 공용, 사이트 톤). */
/**
 * 화면에서 쓰는 오행 색 (#461) — 테마를 타는 CSS 변수.
 *
 * `EL_COLOR` 는 밝은 배경에 맞춘 한 벌이라 inline `style` 로 넣으면 다크모드에서도 그대로
 * 쓰인다. 그래서 어두운 트랙 위에서 막대가 어디서 끝나는지 안 보였다(수는 대비 1.53:1).
 * **화면에 그리는 자리는 이 변수를 쓴다.** 실제 값은 `globals.css` 의 `:root` / `.dark`.
 *
 * `EL_COLOR` 는 남긴다 — 알파를 붙여 쓰거나(`${EL_COLOR[x]}22`) 색 자체가 필요한 자리가 있다.
 */
export const EL_VAR: Record<WuXing, string> = {
  목: "var(--el-mok)",
  화: "var(--el-hwa)",
  토: "var(--el-to)",
  금: "var(--el-geum)",
  수: "var(--el-su)",
};

export const EL_COLOR: Record<WuXing, string> = {
  목: "#2f8a63", 화: "#c14338", 토: "#b6873a", 금: "#78839a", 수: "#3a58a6",
};

/** 한자 한 글자의 뜻(천간·지지 어느 쪽이든). 모르면 빈 문자열. */
export function meaningOf(hanja: string): string {
  return GAN[hanja]?.meaning ?? ZHI[hanja]?.meaning ?? "";
}
