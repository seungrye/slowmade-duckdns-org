// 엔딩 → 씬 삽화 큐 적재 (#158) — end-run(웹)·app-end-run(앱)이 공유.
//
// 회차를 끝낼 때마다 씬 하나를 무작위로 골라 큐에 넣는다. 실제 생성은 워커가 한다.
// **실패는 삼킨다** — 엔딩 종결/제출을 그림 때문에 막지 않는다(피드백 노트와 같은 원칙).

import WebAdventureSceneImage from '@/models/web-adventure-scene-image';
import WebAdventureScene from '@/models/web-adventure-scene';
import { buildScenePrompt, pickSceneForImage, type SceneLike } from './scene-image-prompt';

/** 대기/처리 중이 이 수를 넘으면 skip — 느린 단일 워커 큐 폭주 방지(피드백 노트와 같은 값). */
export const MAX_PENDING_SCENE_IMAGES = 20;

interface EnqueueOptions {
  /** 씬 추첨용 난수. 테스트에서 주입한다. */
  rand?: () => number;
}

export async function enqueueSceneImage(
  pastRun: { _id: unknown; runIndex: number; endingId: string; finalSceneId: string } | null,
  sourceUserEmail: string,
  opts: EnqueueOptions = {},
): Promise<void> {
  try {
    if (!pastRun) return;

    const pending = await WebAdventureSceneImage.countDocuments({
      status: { $in: ['queued', 'processing'] },
      isDeleted: { $ne: true },
    });
    if (pending >= MAX_PENDING_SCENE_IMAGES) return;

    const scenes = (await WebAdventureScene.find({ isDeleted: { $ne: true } })
      .select('id title body illustrations')
      .lean()) as unknown as SceneLike[];

    const scene = pickSceneForImage(scenes, { rand: opts.rand ?? Math.random });
    if (!scene) return;

    await WebAdventureSceneImage.create({
      sceneId: scene.id,
      pastRunId: pastRun._id,
      sourceUserEmail,
      endingId: pastRun.endingId,
      prompt: buildScenePrompt(scene),
      status: 'queued',
    });
  } catch (err) {
    console.error('scene image enqueue failed:', err);
  }
}
