import type { Metadata } from "next";
import { auth } from "@/auth";
import { connectToDB } from "@/lib/db";
import RetroRom from "@/models/retro-rom";
import { BUILTIN_GAMES, filterExistingBuiltins, withExistingCovers } from "@/lib/retro/library";
import { toRomDto, type LeanRom } from "@/lib/retro/rom-dto";
import type { UserRomDto } from "@/lib/retro/entry";
import { emulatorAssetsInstalled, retroAssetExists } from "./assets";
import LoginRequired from "./LoginRequired";
import RetroLibrary from "./RetroLibrary";

export const metadata: Metadata = {
  title: "고전 게임",
  description: "브라우저에서 바로 즐기는 고전 게임 — 홈브류 모음과 내가 올린 롬.",
  // 로그인해야 보이는 화면이라 색인할 것이 없다.
  robots: { index: false, follow: false },
};

// 내 롬 목록이 사람마다 다르고 자산 배치 여부도 런타임에 바뀐다.
export const dynamic = "force-dynamic";

async function myRoms(email: string): Promise<UserRomDto[]> {
  await connectToDB();
  const docs = (await RetroRom.find({ userEmail: email, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .lean()) as unknown as LeanRom[];
  return docs.map(toRomDto);
}

export default async function RetroGamesPage() {
  const session = await auth();
  const email = session?.user?.email;

  return (
    <main className="mx-auto px-4 py-8">
      <section className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">고전 게임</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400">
          브라우저에서 바로 즐기는 고전 게임입니다. 자유 배포 홈브류를 모아 두었고, 가지고 있는 롬을
          올려 두면 나만 볼 수 있는 목록에 쌓입니다.
        </p>
      </section>

      {email ? (
        <RetroLibrary
          // 롬 파일이 실제로 받아진 것만 보여 준다. 커버는 없으면 카드가 폴백 타일을 그린다.
          builtins={withExistingCovers(
            filterExistingBuiltins(BUILTIN_GAMES, retroAssetExists),
            retroAssetExists,
          )}
          initialRoms={await myRoms(email)}
          assetsMissing={!emulatorAssetsInstalled()}
        />
      ) : (
        <LoginRequired what="고전 게임" />
      )}
    </main>
  );
}
