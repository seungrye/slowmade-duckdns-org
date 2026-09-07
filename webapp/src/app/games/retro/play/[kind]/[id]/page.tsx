import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { connectToDB } from "@/lib/db";
import RetroRom from "@/models/retro-rom";
import { builtinBySlug } from "@/lib/retro/library";
import { builtinEntry, romEntry } from "@/lib/retro/entry";
import { activeLeanPatch, activePatch, isRomId, type LeanPatch } from "@/lib/retro/rom-dto";
import { builtinKey, romKey } from "@/lib/retro/game-key";
import { platformById } from "@/lib/retro/platforms";
import EmulatorFrame from "../../../EmulatorFrame";
import LoginRequired from "../../../LoginRequired";
import { env } from "@/lib/env";
import { contentKeyOf } from "@/lib/retro/content-hash";

export const metadata: Metadata = {
  title: "고전 게임 플레이",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Params {
  /** builtin - bundled homebrew; rom - my uploaded ROM. */
  kind: string;
  id: string;
}

type LeanRom = {
  _id: unknown; title: string; platform: string; core: string; size: number;
  createdAt?: Date; filename?: string; patches?: LeanPatch[]; patchEnabled?: boolean;
  parentSets?: { name: string; size: number; objectKey: string; sha256?: string }[];
  /** The file content's sha256 (#188) - the basis for separating netplay rooms. Older documents lack it. */
  sha256?: string;
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
  // It only means anything with the signalling server running, so the entry is hidden when it is off.

  // The patch is decided by **the setting stored on the ROM**, not the address (#116) - the card's checkbox holds that value.
  const patchUrl = game.patch
    ? `/api/games/retro/roms/${game.entry.id}/patches/${game.patch.id}/file`
    : undefined;
  // Unset it stays undefined - the player decides based on the format.
  const stripHeader = strip === "1" ? true : strip === "0" ? false : undefined;

  // The key the save hangs on - bundled games and uploaded ROMs are handled the same way (#114).
  const gameKey = kind === "builtin" ? builtinKey(game.entry.id) : romKey(game.entry.id);

  // Without a content key (a document from before the hash backfill) netplay is not offered - joining the wrong
  // room and silently desyncing is worse than not connecting. Bundled games are all the same file and need no key.
  const netplayKey = kind === "builtin" ? gameKey : game.netplayKey ?? null;
  const netplayEnabled = env.netplay.enabled && !!netplayKey;


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
        parents={game.entry.parentUrls}
        legacySave={game.entry.legacySave}
        netplay={netplayEnabled}
        gameKeyForNetplay={netplayKey ?? gameKey}
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

        {netplayEnabled && (
          // Kept in the same shape as the controls box - explained rather than a toggle on screen (#192).
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              함께 하기
            </h2>
            <p className="text-xs leading-relaxed">
              화면 아래 메뉴의 <b>Netplay</b> 에서 방을 만들면 다른 사람이 들어올 수 있습니다.
              상대는 <b>같은 롬</b>을 <b>같은 패치 설정</b>으로 열어야 같은 방에 나타납니다 —
              설정이 다르면 방이 갈려 서로 보이지 않습니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              내 다른 기기와 할 때는 같은 계정으로 로그인해 이 주소를 그대로 열면 됩니다.
              방에 비밀번호를 걸면 아는 사람만 들어옵니다.
            </p>
          </div>
        )}

        {patchUrl && (
          // IPS cannot say from the file alone what header convention it assumes. Getting it wrong mangles the text, and
          // without this line there would be no recourse. It is left alone quietly, only when a patch is applied.
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
    // A bundled game serves the same file from the repo and so needs no content key (#188).
    netplayKey: null as string | null,
  };
}

async function loadMyRom(id: string, email: string) {
  // The format is checked first - any old string makes mongoose throw a CastError and return 500.
  if (!isRomId(id)) return null;
  await connectToDB();
  // userEmail goes into the condition so someone else's ROM never matches - giving the same 404 as an absent one.
  const doc = (await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select("title platform core size createdAt filename patches patchEnabled parentSets sha256")
    .lean()) as LeanRom | null;
  if (!doc) return null;

  // With applying switched off it is treated as absent - the play screen has no selection UI.
  const patchInUse = doc.patchEnabled === false ? undefined : activePatch(doc);

  return {
    entry: romEntry({
      id: String(doc._id),
      title: doc.title,
      platform: doc.platform as never,
      size: doc.size,
      createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
      // **Without this, arcade cannot find the game** (#141) - the zip's name is the ROM set's name, so omitting it
      // makes the address `<id>.zip`, the core cannot recognise the contents, and only the RetroArch menu appears.
      filename: doc.filename,
      parentSets: (doc.parentSets ?? []).map((p) => p.name),
    }),
    core: doc.core,
    description: undefined,
    // With applying switched off it is treated as absent - the play screen has no selection UI.
    patch: doc.patchEnabled === false ? undefined : activePatch(doc),
    sourceLabel: "내가 올린 롬 — 나만 볼 수 있습니다",
    // The key that separates netplay rooms (#188). It is tied to **the bytes the core actually reads**, not the document id -
    // that is what puts the same ROM uploaded by another account in the same room, while differing patch settings never meet.
    // Without a hash yet it is null, and netplay's entry is then hidden.
    netplayKey: contentKeyOf({
      romHash: doc.sha256,
      patchHash: patchInUse ? activeLeanPatch(doc)?.sha256 : undefined,
      hasPatch: !!patchInUse,
      parentHashes: (doc.parentSets ?? []).map((ps) => ps.sha256 ?? ''),
    }),
  };
}
