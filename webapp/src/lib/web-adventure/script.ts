// web-adventure 인라인 스크립트 파서 (순수 함수).
//
// 기존 표시 마크업(**화자** *지문* "대사" [[명사]])은 render-inline 이 담당하고,
// 여기서는 body 문단을 두 축으로 확장한다 — 둘 다 하위호환(토큰 없으면 종전과 동일):
//   1) {{변수}}  → interpolate() 로 표시 텍스트에 값 보간.
//   2) << 디렉티브 >> → parseScript() 가 "표시 텍스트 런"과 "디렉티브"의 순서열로 분해.
//      렌더러가 리빌 중 디렉티브를 제자리에서 실행한다(sfx/bgm/fx/img).
//      wait/set 은 렌더러가 아니라 여기서 **문단 단위로 미리 계산**한다 (#321) —
//      씬을 받은 순간 본문에 다 적혀 있어 상태가 필요 없다:
//        varsByParagraph()  문단별 <<set>> 누적    revealSchedule()  <<wait>> 반영 열림 시각
//
// 디렉티브 문법(공백 구분): <<cmd arg1 arg2 …>>  예) <<sfx 문소리>> <<bgm play harbor 500>>
//                                           <<fx fadeout 800>> <<img 매복 impact>> <<wait 600>>

export type ScriptSegment =
  | { kind: "text"; text: string }
  | { kind: "directive"; cmd: string; args: string[]; raw: string };

/**
 * `{{변수}}` 를 vars 값으로 치환. 미정의 변수는 원문 유지(작가 오탈자를 감추지 않기 위함).
 *
 * 변수명에 **한글을 허용한다** (#370). 처음엔 `\w` 였는데 그건 ASCII 만 매치해서
 * `{{침식_손}}` 같은 이름이 조용히 원문으로 남았다. 한국어로 쓰는 이야기에서 변수명만
 * 영문이어야 할 이유가 없다. 바꿀 때 기존 콘텐츠에 쓰인 변수는 하나도 없어 회귀 위험도 없었다.
 */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{([\p{L}\p{N}_]+)\}\}/gu, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

const DIRECTIVE_RE = /<<([^>]*?)>>/g;

/**
 * 한 문단을 표시 텍스트 런과 << >> 디렉티브의 순서열로 분해한다.
 * - 표시 텍스트는 interpolate 로 {{변수}} 치환.
 * - 빈 텍스트 런(디렉티브 사이·앞뒤)은 넣지 않는다. 빈 <<>> 는 무시.
 */
export function parseScript(paragraph: string, vars?: Record<string, string | number>): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  DIRECTIVE_RE.lastIndex = 0;
  const pushText = (s: string) => {
    if (s) out.push({ kind: "text", text: interpolate(s, vars) });
  };
  while ((m = DIRECTIVE_RE.exec(paragraph)) !== null) {
    pushText(paragraph.slice(last, m.index));
    const raw = m[1].trim();
    if (raw) {
      const parts = raw.split(/\s+/);
      out.push({ kind: "directive", cmd: parts[0], args: parts.slice(1), raw });
    }
    last = m.index + m[0].length;
  }
  pushText(paragraph.slice(last));
  return out;
}

/**
 * 문단 i 가 보간에 쓸 변수 묶음을 문단마다 하나씩 돌려준다.
 *
 * - 문단 i 의 값 = `base` 에 문단 0..i 의 `<<set …>>` 를 순서대로 얹은 것.
 * - `set` 이 든 문단 **자신부터** 새 값이다(문단 안 어디에 적혀 있든 문단 전체가 새 값을 본다).
 * - 반환 길이는 `body.length`. 각 원소는 서로 독립된 객체이며 `base` 를 변형하지 않는다.
 * - `<<set 키 값…>>` — 남은 인자를 공백 하나로 이어 **문자열로** 담는다(숫자로 바꾸지 않는다:
 *   `interpolate` 가 `String()` 으로 찍으므로 결과가 같고, 바꾸면 `"007"` 이 `7` 이 된다).
 *   값이 없는 `<<set 키>>`·`<<set>>` 은 무시. 같은 키는 뒤엣것이 이긴다.
 */
export function varsByParagraph(
  body: string[],
  base?: Record<string, string | number>,
): Array<Record<string, string | number>> {
  // 누적본을 하나 들고 문단마다 **복사본**을 남긴다 — 원소끼리 참조를 공유하면 한 문단을
  // 고쳤을 때 다른 문단이 같이 바뀐다.
  let 누적: Record<string, string | number> = { ...(base ?? {}) };
  return body.map((문단) => {
    for (const seg of parseScript(문단)) {
      if (seg.kind !== "directive" || seg.cmd !== "set") continue;
      const [키, ...나머지] = seg.args;
      // 값 없는 <<set 키>> 와 <<set>> 은 키를 만들지 않는다 — 빈 값을 넣으면
      // interpolate 가 원문 대신 빈 문자열을 찍어 작가의 오탈자를 감춘다.
      if (!키 || 나머지.length === 0) continue;
      // 문자열로 담는다. 숫자로 바꾸면 "007" 이 7 이 된다.
      누적 = { ...누적, [키]: 나머지.join(" ") };
    }
    return { ...누적 };  // set 이 문단 끝에 있어도 그 문단부터 새 값이다
  });
}

/**
 * 문단 i 가 열릴 시각(씬 진입 기준 ms)을 문단마다 하나씩 돌려준다.
 *
 * - 문단 0 은 항상 `0`, 문단 i = `i * stepMs + (문단 0..i-1 의 wait 합)`.
 * - 반환 길이는 `body.length`.
 * - `<<wait 값>>` — 유한한 양수만 더한다(인자 없음·비수치·음수·Infinity 는 0). 한 문단에
 *   여럿이면 전부 더한다. 마지막 문단의 wait 은 뒤에 열릴 문단이 없어 쓰이지 않는다(오류 아님).
 */
export function revealSchedule(body: string[], stepMs: number): number[] {
  const out: number[] = [];
  let 밀린시간 = 0;
  for (let i = 0; i < body.length; i++) {
    out.push(i * stepMs + 밀린시간);
    // 이 문단의 wait 은 **다음** 문단부터 밀어 준다.
    for (const seg of parseScript(body[i])) {
      if (seg.kind !== "directive" || seg.cmd !== "wait") continue;
      const ms = Number(seg.args[0]);
      // 유한한 양수만. 인자 없음·비수치·음수·Infinity 는 0 으로 본다 —
      // 작가 오타 하나로 본문이 영영 안 열리면 안 된다.
      if (Number.isFinite(ms) && ms > 0) 밀린시간 += ms;
    }
  }
  return out;
}
