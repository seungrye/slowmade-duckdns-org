// web-adventure 인라인 스크립트 파서 (순수 함수).
//
// 기존 표시 마크업(**화자** *지문* "대사" [[명사]])은 render-inline 이 담당하고,
// 여기서는 body 문단을 두 축으로 확장한다 — 둘 다 하위호환(토큰 없으면 종전과 동일):
//   1) {{변수}}  → interpolate() 로 표시 텍스트에 값 보간.
//   2) << 디렉티브 >> → parseScript() 가 "표시 텍스트 런"과 "디렉티브"의 순서열로 분해.
//      렌더러가 리빌 중 디렉티브를 제자리에서 실행한다(sfx/bgm/fx/img/wait/set).
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
