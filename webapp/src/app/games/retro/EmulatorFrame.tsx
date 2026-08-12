"use client";

import { useMemo } from "react";
import { buildPlayerUrl } from "@/lib/retro/player-url";

interface Props {
  core: string;
  /** 같은 출처의 절대경로 또는 blob: URL. */
  rom: string;
  name?: string;
  /** 적용할 패치 주소 (#112). 합치기는 iframe 안에서 일어난다. */
  patch?: string;
  /** SFC 512 바이트 헤더 처리 — 지정하지 않으면 플레이어가 판단한다. */
  stripHeader?: boolean;
  /** 세이브를 매달 게임 키 (#114). 주면 Save/Load 버튼이 서버를 쓴다. */
  saveKey?: string;
}

/**
 * EmulatorJS 를 담는 iframe (#109).
 *
 * 이 컴포넌트가 하는 일은 주소를 만들어 iframe 에 꽂는 것뿐이다. 에뮬레이터의 생명주기 관리는
 * 하지 않는다 — 화면을 떠나면 React 가 iframe 을 지우고, 그때 안의 전역·워커·오디오가 함께
 * 사라진다. 그게 iframe 을 쓰는 이유다.
 */
export default function EmulatorFrame({ core, rom, name, patch, stripHeader, saveKey }: Props) {
  const src = useMemo(() => {
    try {
      return buildPlayerUrl({ core, rom, name, patch, stripHeader, saveKey });
    } catch {
      return null;
    }
  }, [core, rom, name, patch, stripHeader, saveKey]);

  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        이 게임을 실행할 수 없습니다. 기종 또는 롬 주소가 올바르지 않습니다.
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black shadow-lg">
      <iframe
        // key 를 src 로 두면 다른 게임(또는 다른 패치)으로 넘어갈 때 iframe 이 새로 만들어진다.
        // 같은 iframe 을 재사용하면 EmulatorJS 가 이전 게임 상태를 물고 있다.
        key={src}
        src={src}
        title={name ?? "레트로 플레이어"}
        className="absolute inset-0 h-full w-full border-0"
        // gamepad — 이걸 안 주면 iframe 안에서 게임패드가 잡히지 않는다(Permissions Policy).
        allow="gamepad *; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
