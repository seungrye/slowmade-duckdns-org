import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { connectToDB } from "@/lib/db";
import RetroRom from "@/models/retro-rom";
import { builtinBySlug } from "@/lib/retro/library";
import { builtinEntry, romEntry } from "@/lib/retro/entry";
import { activePatch, isRomId, type LeanPatch } from "@/lib/retro/rom-dto";
import { builtinKey, romKey } from "@/lib/retro/game-key";
import { platformById } from "@/lib/retro/platforms";
import EmulatorFrame from "../../../EmulatorFrame";
import LoginRequired from "../../../LoginRequired";

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
  createdAt?: Date; patches?: LeanPatch[]; patchEnabled?: boolean;
};

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ strip?: string }>;
}) {
  const { kind, id } = await params;
  const { strip } = await searchParams;

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

  // 패치는 주소가 아니라 **롬에 저장된 설정**으로 정한다 (#116) — 카드의 체크박스가 그 값을 쥔다.
  const patchUrl = game.patch
    ? `/api/games/retro/roms/${game.entry.id}/patches/${game.patch.id}/file`
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

        {patchUrl && (
          // IPS 는 헤더 기준을 파일만으로 알 수 없다. 어긋나면 글자가 깨지는데, 이 줄이 없으면
          // 손쓸 방법이 사라진다. 패치가 걸렸을 때만 조용히 놓아 둔다.
          <p className="text-xs text-gray-400 dark:text-gray-500">
            글자가 깨지나요?{" "}
            <Link
              href={`?strip=${stripHeader === false ? "1" : "0"}`}
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              헤더 처리 바꾸기
            </Link>
          </p>
        )}

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
    patch: undefined,
    sourceLabel: `출처 ${game.source} · ${game.license}`,
  };
}

async function loadMyRom(id: string, email: string) {
  // 형식부터 본다 — 아무 문자열이나 넘기면 mongoose 가 CastError 를 던져 500 이 된다.
  if (!isRomId(id)) return null;
  await connectToDB();
  // userEmail 을 조건에 넣어 남의 롬은 애초에 걸리지 않게 한다 — 없는 것과 같은 404 가 된다.
  const doc = (await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select("title platform core size createdAt patches patchEnabled")
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
    // 적용이 꺼져 있으면 아예 없는 것으로 본다 — 플레이 화면엔 선택 UI 가 없다.
    patch: doc.patchEnabled === false ? undefined : activePatch(doc),
    sourceLabel: "내가 올린 롬 — 나만 볼 수 있습니다",
  };
}
