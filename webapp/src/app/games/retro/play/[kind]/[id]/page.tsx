import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { connectToDB } from "@/lib/db";
import RetroRom from "@/models/retro-rom";
import { builtinBySlug } from "@/lib/retro/library";
import { builtinEntry, romEntry } from "@/lib/retro/entry";
import { isRomId, livePatches, type LeanPatch } from "@/lib/retro/rom-dto";
import { builtinKey, romKey } from "@/lib/retro/game-key";
import { platformById } from "@/lib/retro/platforms";
import EmulatorFrame from "../../../EmulatorFrame";
import LoginRequired from "../../../LoginRequired";
import PatchPanel from "../../../PatchPanel";
import SaveStatePanel from "../../../SaveStatePanel";

export const metadata: Metadata = {
  title: "고전 게임 플레이",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Params {
  /** builtin — 기본 제공 홈브류, rom — 내가 올린 롬. */
  kind: string;
  id: string;
}

type LeanRom = {
  _id: unknown; title: string; platform: string; core: string; size: number;
  createdAt?: Date; patches?: LeanPatch[];
};

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ patch?: string; strip?: string }>;
}) {
  const { kind, id } = await params;
  const { patch: patchId, strip } = await searchParams;

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return (
      <main className="mx-auto px-4 py-8">
        <LoginRequired what="고전 게임" />
      </main>
    );
  }

  if (kind !== "builtin" && kind !== "rom") notFound();

  const game =
    kind === "builtin" ? await loadBuiltin(id) : await loadMyRom(id, email);
  if (!game) notFound();

  const meta = platformById(game.entry.platform);

  // 고른 패치가 실제로 이 롬의 것인지 확인한다 — 주소를 손으로 고쳐도 남의 패치는 못 붙인다.
  const selectedPatch = game.patches.find((p) => p.id === patchId) ?? null;
  const patchUrl = selectedPatch
    ? `/api/games/retro/roms/${game.entry.id}/patches/${selectedPatch.id}/file`
    : undefined;
  // 지정이 없으면 undefined 로 둔다 — 플레이어가 형식에 맞게 판단한다.
  const stripHeader = strip === "1" ? true : strip === "0" ? false : undefined;

  // 세이브를 매달 키 — 기본 제공 게임과 올린 롬을 한 방식으로 다룬다 (#114).
  const gameKey = kind === "builtin" ? builtinKey(game.entry.id) : romKey(game.entry.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/games/retro"
          className="text-sm text-gray-500 transition hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        >
          ← 목록
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
          {game.entry.title}
        </h1>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {meta?.label ?? game.entry.platform}
        </span>
      </div>

      <EmulatorFrame
        core={game.core}
        rom={game.entry.romUrl}
        name={game.entry.title}
        patch={patchUrl}
        stripHeader={stripHeader}
        saveKey={gameKey}
      />

      <section className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
        {game.description && <p>{game.description}</p>}

        <SaveStatePanel gameKey={gameKey} />

        {/* 기본 제공 홈브류는 패치 대상이 아니다 — 내가 올린 롬에만 띄운다. */}
        {kind === "rom" && (
          <PatchPanel
            romId={game.entry.id}
            patches={game.patches}
            selected={selectedPatch?.id ?? null}
            stripHeader={stripHeader}
          />
        )}

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            조작
          </h2>
          <p className="text-xs leading-relaxed">
            방향키 이동 · <kbd>Z</kbd>/<kbd>X</kbd> 버튼 · <kbd>Enter</kbd> 시작 · <kbd>Shift</kbd> 선택.
            게임패드를 연결하면 자동으로 잡힙니다. 화면 아래 메뉴에서 저장·불러오기와 키 설정을 바꿀 수 있습니다.
          </p>
          <p className="mt-2 text-xs leading-relaxed">
            처음 실행할 때 에뮬레이터 코어를 몇 MB 내려받습니다 — 모바일 데이터 사용에 유의하세요.
          </p>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          {game.sourceLabel}
          {" · 에뮬레이션 "}
          <a
            href="https://github.com/EmulatorJS/EmulatorJS"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-blue-600 dark:hover:text-blue-400"
          >
            EmulatorJS
          </a>
          {" (GPL-3.0)"}
        </p>
      </section>
    </main>
  );
}

async function loadBuiltin(slug: string) {
  const game = builtinBySlug(slug);
  if (!game) return null;
  const meta = platformById(game.platform);
  if (!meta) return null;
  return {
    entry: builtinEntry(game),
    core: meta.core,
    description: game.description,
    patches: [],
    sourceLabel: `출처 ${game.source} · ${game.license}`,
  };
}

async function loadMyRom(id: string, email: string) {
  // 형식부터 본다 — 아무 문자열이나 넘기면 mongoose 가 CastError 를 던져 500 이 된다.
  if (!isRomId(id)) return null;
  await connectToDB();
  // userEmail 을 조건에 넣어 남의 롬은 애초에 걸리지 않게 한다 — 없는 것과 같은 404 가 된다.
  const doc = (await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select("title platform core size createdAt patches")
    .lean()) as LeanRom | null;
  if (!doc) return null;

  return {
    entry: romEntry({
      id: String(doc._id),
      title: doc.title,
      platform: doc.platform as never,
      size: doc.size,
      createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
    }),
    core: doc.core,
    description: undefined,
    patches: livePatches(doc),
    sourceLabel: "내가 올린 롬 — 나만 볼 수 있습니다",
  };
}
