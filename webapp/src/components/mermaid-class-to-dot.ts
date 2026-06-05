// mermaid classDiagram 코드를 graphviz dot 로 변환.
//
// #248 — mermaid v9/v10/v11 모두 classDiagram 의 박스 padding/spacing 이 과대해
// 빈 공간 90% (사용자 보고: '너무 어색'). graphviz/dot 의 record 노드는 콘텐츠에
// 자연스럽게 맞춰져 박스/콘텐츠 비율 정상.
//
// 지원하는 mermaid classDiagram syntax (현재 사이트 콘텐츠 기준):
//   classDiagram
//     class Character {                       ← 클래스 정의 (멤버 포함)
//       +Stats stats                          ← public 속성
//       -privateField                         ← private 속성
//       +Number maxHp                         ← public 속성
//       +action() Boolean                     ← public 메서드
//     }
//     class Scene                             ← 클래스 정의 (멤버 없음)
//     Character --> Scene : current           ← 관계 (label 있음)
//     Character ..> Scene                     ← 관계 (의존)
//     Character <|-- Scene                    ← 상속 (Scene extends Character)
//     Character "1" --> "*" Scene : has       ← cardinality
//
// 미지원 (콘텐츠 추가 시 확장 필요):
//   - 인터페이스 (interface), 추상 (abstract) 표시
//   - 네임스페이스 / 노트
//   - 제네릭 타입 표기

/** mermaid classDiagram 코드 → graphviz dot. */
export function mermaidClassToDot(code: string): string {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%')); // 주석/빈 줄 제거

  // 첫 줄 'classDiagram' 헤더 제거
  if (lines[0]?.toLowerCase() === 'classdiagram') lines.shift();

  // 1. 클래스 정의 추출 — `class Name { ... }` 또는 `class Name`
  const classes = new Map<string, string[]>(); // name → members (예: ['+Stats stats', '+Number hp'])
  // edges 는 출현 순서대로 보존
  const edges: Array<{ from: string; to: string; arrow: string; label?: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // class 정의
    const m1 = line.match(/^class\s+([A-Za-z_][\w$]*)\s*\{?\s*$/);
    if (m1) {
      const name = m1[1];
      const members: string[] = [];
      if (line.endsWith('{')) {
        i++;
        while (i < lines.length && lines[i] !== '}') {
          if (lines[i]) members.push(lines[i]);
          i++;
        }
      }
      classes.set(name, (classes.get(name) ?? []).concat(members));
      i++;
      continue;
    }
    // `ClassA : +memberName` (단일 멤버 추가)
    const m2 = line.match(/^([A-Za-z_][\w$]*)\s*:\s*(.+)$/);
    if (m2 && !/[-.<>|*o ]/.test(m2[1])) {
      const name = m2[1];
      classes.set(name, (classes.get(name) ?? []).concat([m2[2]]));
      i++;
      continue;
    }
    // 관계 — `A <arrow> B : label` (cardinality "1" / "*" 등은 무시)
    //   화살표 패턴: --> ..> --|> ..|> <|-- <|.. -- ..
    const rel = line.match(
      /^([A-Za-z_][\w$]*)\s*(?:"[^"]*"\s*)?([-.<>|]+|o--|--o|\*--|--\*)\s*(?:"[^"]*"\s*)?([A-Za-z_][\w$]*)\s*(?::\s*(.*))?$/
    );
    if (rel) {
      edges.push({ from: rel[1], to: rel[3], arrow: rel[2], label: rel[4] });
      // 관계만 등장하는 클래스도 노드로 잡아둔다 (정의 없이 참조된 경우)
      if (!classes.has(rel[1])) classes.set(rel[1], []);
      if (!classes.has(rel[3])) classes.set(rel[3], []);
    }
    i++;
  }

  // 2. dot 생성
  const out: string[] = [];
  out.push('digraph G {');
  out.push('  rankdir=TB');
  out.push('  bgcolor="transparent"');
  out.push(
    '  node [shape=plaintext fontname="Pretendard, sans-serif" fontsize=12 fontcolor="#1f2937"]'
  );
  out.push(
    '  edge [fontname="Pretendard, sans-serif" fontsize=10 color="#6b7280" fontcolor="#374151"]'
  );

  // 노드 — HTML-like label 의 table 로 클래스명 + 멤버 표시
  for (const [name, members] of classes) {
    const memberHtml =
      members.length === 0
        ? ''
        : `<tr><td align="left">${members
            .map((m) => escapeHtml(m).trim())
            .join('<br align="left"/>')}<br align="left"/></td></tr>`;
    out.push(
      `  ${name} [label=<<table border="1" cellborder="0" cellspacing="0" cellpadding="6" bgcolor="#eaeaf5" color="#9ca3af">` +
        `<tr><td bgcolor="#d4d4f0" align="center"><b>${escapeHtml(name)}</b></td></tr>` +
        memberHtml +
        `</table>>]`
    );
  }

  // 엣지
  for (const e of edges) {
    const { from, to, arrow, label } = e;
    // arrow 해석:
    //   --> 일반, ..> 의존(점선), <|-- 상속 (B extends A) — A 가 부모 → A 가 머리
    //   <|.. 실현, --|> 상속 reverse, ..|> 실현 reverse
    let attrs = '';
    let actualFrom = from;
    let actualTo = to;
    const dashed = arrow.includes('..');
    const inheritFromLeft = arrow.startsWith('<|'); // A <|-- B : B 가 A 를 extends → from=B to=A (parent)
    const inheritToRight = arrow.endsWith('|>'); // A --|> B : A 가 B 를 extends → from=A to=B (parent)
    if (inheritFromLeft) {
      [actualFrom, actualTo] = [to, from];
      attrs = 'arrowhead="empty"';
    } else if (inheritToRight) {
      attrs = 'arrowhead="empty"';
    } else if (arrow.includes('o')) {
      attrs = 'arrowtail="odiamond" arrowhead="vee" dir="both"';
    } else if (arrow.includes('*')) {
      attrs = 'arrowtail="diamond" arrowhead="vee" dir="both"';
    } else {
      attrs = 'arrowhead="vee"';
    }
    if (dashed) attrs += ' style="dashed"';
    if (label) attrs += ` label="${escapeAttr(label)}"`;
    out.push(`  ${actualFrom} -> ${actualTo} [${attrs}]`);
  }

  out.push('}');
  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
