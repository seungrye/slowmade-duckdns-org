// mermaid classDiagram → dot 변환 테스트.
//
// #248 — graphviz/dot 로 대체. 현재 사이트의 post 콘텐츠가 실제로 작성한
// classDiagram syntax 를 모두 처리할 수 있어야.

import { describe, it, expect } from 'vitest';
import { mermaidClassToDot } from './mermaid-class-to-dot';

describe('mermaidClassToDot', () => {
  it('단일 클래스 + 멤버 → record table 노드', () => {
    const code = `classDiagram
class Character {
  +Stats stats
  +Number hp
}`;
    const dot = mermaidClassToDot(code);
    expect(dot).toMatch(/Character \[label=<<table/);
    expect(dot).toContain('<b>Character</b>');
    expect(dot).toContain('+Stats stats');
    expect(dot).toContain('+Number hp');
  });

  it('관계: A --> B : label', () => {
    const code = `classDiagram
class A
class B
A --> B : current`;
    const dot = mermaidClassToDot(code);
    expect(dot).toMatch(/A -> B \[arrowhead="vee" label="current"\]/);
  });

  it('점선 의존 관계: A ..> B', () => {
    const code = `classDiagram
A ..> B`;
    const dot = mermaidClassToDot(code);
    expect(dot).toMatch(/A -> B \[.*style="dashed"\]/);
  });

  it('상속 A <|-- B → A 가 부모 (B → A 방향 + arrowhead empty)', () => {
    const code = `classDiagram
A <|-- B`;
    const dot = mermaidClassToDot(code);
    // <|-- 는 B 가 A 를 extends → dot 에서 B -> A 의 화살표가 부모(A) 쪽
    expect(dot).toMatch(/B -> A \[arrowhead="empty"\]/);
  });

  it('cardinality 표기 "1" "*" 는 무시하고 관계만 추출', () => {
    const code = `classDiagram
Scene "1" --> "*" Choice : has`;
    const dot = mermaidClassToDot(code);
    expect(dot).toMatch(/Scene -> Choice \[arrowhead="vee" label="has"\]/);
  });

  it('관계만 등장한 클래스도 노드로 등록', () => {
    const code = `classDiagram
A --> B`;
    const dot = mermaidClassToDot(code);
    expect(dot).toContain('A [label=');
    expect(dot).toContain('B [label=');
  });

  it('실제 사이트 post 콘텐츠 (Character/Scene/Choice) 변환 — 노드 3개 + 엣지 2개', () => {
    const code = `classDiagram
class Character {
  +Stats stats
  +Number hp
  +Number maxHp
  +String ability
  +String[] inventory
  +Flags flags
}
class Scene {
  +String id
  +String title
  +String illustration
  +String[] body
  +Choice[] choices
  +OnEnter onEnter
  +Boolean isEnding
  +String endingId
}
class Choice {
  +String kind
  +String id
  +String label
  +String to
}
Character --> Scene : current
Scene --> Choice : has many`;
    const dot = mermaidClassToDot(code);
    expect(dot).toContain('<b>Character</b>');
    expect(dot).toContain('<b>Scene</b>');
    expect(dot).toContain('<b>Choice</b>');
    expect(dot).toMatch(/Character -> Scene \[arrowhead="vee" label="current"\]/);
    expect(dot).toMatch(/Scene -> Choice \[arrowhead="vee" label="has many"\]/);
    // 멤버 표시
    expect(dot).toContain('+Stats stats');
    expect(dot).toContain('+OnEnter onEnter');
  });

  it('HTML 특수문자 escape (+List&lt;Item&gt;)', () => {
    const code = `classDiagram
class X {
  +List<Item> items
}`;
    const dot = mermaidClassToDot(code);
    expect(dot).toContain('+List&lt;Item&gt; items');
  });

  it('빈 코드 → digraph 만', () => {
    const dot = mermaidClassToDot('classDiagram');
    expect(dot).toMatch(/^digraph G \{/);
    expect(dot).toMatch(/\}$/);
  });

  // #250 — theme 인자에 따라 색상 변경 (사이트 브랜드 보라 톤).
  it('theme="light" 기본: 사이트 brand color 50/100/200 톤 (#efeeff / #dedbff)', () => {
    const dot = mermaidClassToDot('classDiagram\nclass A');
    expect(dot).toContain('#efeeff'); // bgNode = brand-50
    expect(dot).toContain('#dedbff'); // bgHeader = brand-100
    expect(dot).toContain('#c3bdff'); // border = brand-200
    expect(dot).toContain('#171717'); // text = site foreground
  });

  it('theme="dark": 어두운 보라 톤 + brand-200 보더 액센트 (#1f1a35 / #2e2549)', () => {
    const dot = mermaidClassToDot('classDiagram\nclass A', 'dark');
    expect(dot).toContain('#1f1a35'); // bgNode (dark 보라)
    expect(dot).toContain('#2e2549'); // bgHeader
    expect(dot).toContain('#ededed'); // text = site foreground
    expect(dot).not.toContain('#efeeff'); // light bgNode 안 들어가야
  });
});
