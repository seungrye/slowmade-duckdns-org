// 정적 ts 씬 → mongo doc payload 변환 (순수 함수, DB 의존 없음).
//
// Phase B 의 마이그레이션 스크립트 (`scripts/migrate-web-adventure-scenes.mjs`)
// 와 단위 테스트 (`__tests__/migrate-scenes.test.ts`) 가 공유한다.
//
// 변환 규칙:
//   - Scene 타입의 모든 옵션 필드는 정의된 경우만 doc 에 포함.
//   - body / choices 는 배열 복사 (얕은 복사로 충분 — choice 객체는 plain).
//   - onEnter 는 객체 통째로 복사.

import type { Scene } from "@/types/web-adventure";

export type SceneDocPayload = {
  id: string;
  title: string;
  illustration: string;
  body: string[];
  choices: Scene["choices"];
  onEnter?: Scene["onEnter"];
  isEnding?: boolean;
  endingId?: Scene["endingId"];
};

export function buildSceneDoc(scene: Scene): SceneDocPayload {
  const doc: SceneDocPayload = {
    id: scene.id,
    title: scene.title,
    illustration: scene.illustration,
    body: [...scene.body],
    choices: scene.choices.map((c) => ({ ...c })),
  };
  if (scene.onEnter) doc.onEnter = { ...scene.onEnter };
  if (scene.isEnding !== undefined) doc.isEnding = scene.isEnding;
  if (scene.endingId !== undefined) doc.endingId = scene.endingId;
  return doc;
}

export function buildSceneDocs(scenes: Scene[]): SceneDocPayload[] {
  return scenes.map(buildSceneDoc);
}
