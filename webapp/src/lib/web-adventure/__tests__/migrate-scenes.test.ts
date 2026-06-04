// 18 정적 씬 → mongo upsert 마이그레이션 보조 함수 단위 테스트.
//
// 마이그레이션 *스크립트* 자체는 .mjs 라 jiti 로 mongoose 모듈을 로드하기 때문에
// 실제 DB 없이는 직접 import 가 어렵다.
// 그래서 같은 정합성 검사를 *순수 함수* 로 분리해두고, 그 함수를 테스트한다:
//
//   - buildSceneDocs(staticScenes) → 18 개의 mongo doc payload
//   - 각 doc 은 id / title / illustration / body / choices 가 비어있지 않아야 함
//   - choices.length 정합성 보존
//   - 정적 씬 카운트 (=18) 보존

import { describe, it, expect } from 'vitest';
import { scenes as staticScenes } from '@/lib/web-adventure/engine/sceneRegistry';
import { buildSceneDocs } from '@/lib/web-adventure/migrate-scenes';

describe('buildSceneDocs — 정적 씬 → mongo doc 정합성', () => {
  const list = Object.values(staticScenes);

  it('정적 씬은 18 개', () => {
    expect(list).toHaveLength(18);
  });

  it('buildSceneDocs 가 정확히 같은 개수 (18) 의 mongo doc 을 만든다', () => {
    const docs = buildSceneDocs(list);
    expect(docs).toHaveLength(18);
  });

  it('각 doc 은 id / title / illustration / body / choices 를 보존한다', () => {
    const docs = buildSceneDocs(list);
    for (const doc of docs) {
      expect(typeof doc.id).toBe('string');
      expect(doc.id.length).toBeGreaterThan(0);
      expect(typeof doc.title).toBe('string');
      expect(doc.title.length).toBeGreaterThan(0);
      expect(typeof doc.illustration).toBe('string');
      expect(Array.isArray(doc.body)).toBe(true);
      expect(Array.isArray(doc.choices)).toBe(true);
    }
  });

  it('각 doc 의 choices.length 가 원본과 동일', () => {
    const docs = buildSceneDocs(list);
    const byId = new Map(docs.map((d) => [d.id, d]));
    for (const scene of list) {
      const doc = byId.get(scene.id);
      expect(doc).toBeDefined();
      expect(doc!.choices.length).toBe(scene.choices.length);
    }
  });

  it('엔딩 씬의 isEnding / endingId 가 보존된다', () => {
    const docs = buildSceneDocs(list);
    const endingMain = docs.find((d) => d.id === 'ending_main');
    expect(endingMain?.isEnding).toBe(true);
    expect(endingMain?.endingId).toBe('main');
  });
});
