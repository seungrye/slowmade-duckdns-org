// Ending -> queueing a scene illustration (#158) - shared by end-run (web) and app-end-run (the app).
//
// Each time a run ends, one scene is picked at random and queued. The worker does the actual generation.
// **Failures are swallowed** - a picture must never block ending or submitting a run (the same principle as the feedback note).

import WebAdventureSceneImage from '@/models/web-adventure-scene-image';
import WebAdventureScene from '@/models/web-adventure-scene';
import { buildScenePrompt, pickSceneForImage, type SceneLike } from './scene-image-prompt';

/** Skipped once queued and processing exceed this - preventing a flood on the slow single-worker queue (the same value as the feedback note). */
export const MAX_PENDING_SCENE_IMAGES = 20;

interface EnqueueOptions {
  /** The randomness for drawing a scene. Injected in tests. */
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
