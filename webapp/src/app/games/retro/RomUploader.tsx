"use client";

import { useRef, useState } from "react";
import { PLATFORMS } from "@/lib/retro/platforms";
import { MAX_ROM_BYTES, validateRomUpload } from "@/lib/retro/rom-upload";
import { classifyRomSet } from "@/lib/retro/romset";
import { formatBytes, type UserRomDto } from "@/lib/retro/entry";

interface Props {
  onUploaded: (rom: UserRomDto) => void;
}

/**
 * 내 롬 올리기 (#109).
 *
 * 올린 롬은 **올린 사람만** 보고 실행할 수 있다. 검사는 서버가 다시 하지만
 * (`api/games/retro/roms`), 같은 순수 함수를 여기서도 돌려 **보내기 전에** 알려 준다 —
 * 20MB 짜리를 다 올리고 나서 "너무 큽니다" 를 보는 건 시간 낭비다.
 */
export default function RomUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    setError(null);
    setNotice(null);

    // 아케이드 분할 셋은 부모·클론을 함께 고른다 (#143). 무엇이 게임인지는 이름으로 가른다.
    const picked = classifyRomSet(files.map((f) => f.name));
    const main = files.find((f) => f.name === picked.game) ?? files[0];

    const check = validateRomUpload({ filename: main.name, size: main.size, platform: platform || undefined });
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    if (files.length > 1) setNotice(picked.summary);

    const form = new FormData();
    // 게임을 먼저, 부모를 뒤에 — 서버도 이름으로 다시 가리지만 순서를 맞춰 둔다.
    form.append("file", main);
    for (const f of files) if (f !== main) form.append("file", f);
    if (platform) form.set("platform", platform);

    setBusy(true);
    try {
      const res = await fetch("/api/games/retro/rom-upload", { method: "POST", body: form });
      if (!res.ok) {
        // nginx 가 막으면 본문이 JSON 이 아니라 HTML 이다 — 파싱을 시도하다 죽지 않게 감싼다.
        const message = await res
          .json()
          .then((b) => b?.message as string | undefined)
          .catch(() => undefined);
        setError(
          message ??
            (res.status === 413
              ? `파일이 너무 큽니다 (최대 ${Math.floor(MAX_ROM_BYTES / (1024 * 1024))}MB).`
              : "업로드에 실패했습니다."),
        );
        return;
      }
      const body = await res.json();
      onUploaded(body.data as UserRomDto);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("업로드 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">내 롬 올리기</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        올린 롬은 나만 볼 수 있습니다. 최대 {formatBytes(MAX_ROM_BYTES)}.
      </p>

      <div className="mt-3 space-y-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          disabled={busy}
          aria-label="기종"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">기종 자동 인식 (확장자)</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>

        <input
          ref={inputRef}
          type="file"
          multiple
          // accept 를 걸지 않는다 (#145). 안드로이드는 `.sfc`·`.smc` 같은 확장자를 MIME 으로
          // 바꾸지 못해 제한된 선택기로 떨어지고, 거기선 **다중 선택이 막힌다**. 롬 확장자는
          // 기종마다 제각각이라 걸러 봐야 이득도 적다 — 형식 검사는 어차피 올린 뒤에 한다.
          disabled={busy}
          aria-label="롬 파일"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void handleFiles(files);
          }}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50 dark:text-gray-300"
        />
      </div>

      {busy && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">올리는 중…</p>}
      {notice && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{notice}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
        {/* .bin 은 여러 기종이 함께 쓰는 확장자라 자동 인식이 안 된다. */}
        <code>.bin</code> 처럼 기종을 알 수 없는 파일은 위에서 직접 골라 주세요.
        아케이드 분할 셋은 <strong>부모와 클론을 함께</strong> 고르면 됩니다 — 어느 쪽이 게임인지는
        이름으로 알아서 가립니다.
      </p>
    </div>
  );
}
