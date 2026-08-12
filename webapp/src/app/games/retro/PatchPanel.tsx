"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/retro/entry";
import { MAX_PATCH_BYTES } from "@/lib/retro/patch-upload";
import type { UserPatchDto } from "@/lib/retro/rom-dto";

interface Props {
  romId: string;
  patches: UserPatchDto[];
  /** 지금 고른 패치 id. 없으면 원본. */
  selected: string | null;
  /** 지금 적용 중인 헤더 처리. undefined 면 플레이어가 알아서 판단한다. */
  stripHeader?: boolean;
}

/**
 * 「실행할 판본」 패널 (#112).
 *
 * 패치는 "이 게임을 어떻게 돌릴까" 의 문제라 라이브러리가 아니라 플레이 화면에 둔다.
 * 고르면 주소가 바뀌고(`?patch=`), iframe 은 key 가 src 라 통째로 새로 만들어진다.
 */
export default function PatchPanel({ romId, patches, selected, stripHeader }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = patches.find((p) => p.id === selected) ?? null;
  // IPS 만 토글을 보여 준다 — BPS·UPS 는 CRC 로 맞는 쪽을 플레이어가 자동으로 찾는다.
  const showHeaderToggle = current?.format === "ips";

  function go(next: { patch?: string | null; strip?: boolean | null }) {
    const params = new URLSearchParams();
    const patchId = next.patch === undefined ? selected : next.patch;
    if (patchId) params.set("patch", patchId);
    const strip = next.strip === undefined ? stripHeader : next.strip;
    if (patchId && typeof strip === "boolean") params.set("strip", strip ? "1" : "0");
    const qs = params.toString();
    router.push(`/games/retro/play/rom/${romId}${qs ? `?${qs}` : ""}`);
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_PATCH_BYTES) {
      setError(`패치가 너무 큽니다 (최대 ${Math.floor(MAX_PATCH_BYTES / (1024 * 1024))}MB).`);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("romId", romId);

    setBusy(true);
    try {
      const res = await fetch("/api/games/retro/rom-patch", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "패치를 올리지 못했습니다.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      // 올린 패치를 바로 적용해 본다 — 올려 두고 또 고르게 하는 건 군더더기다.
      go({ patch: body.data.id as string, strip: null });
      router.refresh();
    } catch {
      setError("업로드 중 문제가 생겼습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(patchId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/games/retro/roms/${romId}/patches/${patchId}`, { method: "DELETE" });
      if (res.ok) {
        if (selected === patchId) go({ patch: null, strip: null });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        실행할 판본
      </h2>

      <ul className="space-y-1.5" aria-label="판본 목록">
        <li>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="radio"
              name="patch"
              checked={!selected}
              onChange={() => go({ patch: null, strip: null })}
              disabled={busy}
            />
            <span>원본</span>
          </label>
        </li>

        {patches.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                name="patch"
                checked={selected === p.id}
                onChange={() => go({ patch: p.id, strip: null })}
                disabled={busy}
              />
              <span className="truncate" title={p.name}>{p.name}</span>
              <span className="shrink-0 rounded bg-gray-200 px-1.5 text-[10px] font-medium uppercase text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {p.format}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{formatBytes(p.size)}</span>
            </label>
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={busy}
              aria-label={`${p.name} 삭제`}
              className="shrink-0 rounded px-2 py-0.5 text-xs text-gray-500 transition hover:bg-red-600 hover:text-white disabled:opacity-50 dark:text-gray-400"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>

      {showHeaderToggle && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={stripHeader !== false}
            onChange={(e) => go({ strip: e.target.checked })}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            헤더 512바이트 떼고 적용
            {/* IPS 에는 검증값이 없어 어느 기준으로 만든 패치인지 알 수 없다.
                글자가 깨지거나 멈추면 이걸 뒤집어 본다. */}
            <span className="block text-gray-400 dark:text-gray-500">
              글자가 깨지거나 멈추면 이 항목을 반대로 바꿔 보세요. IPS 는 어느 기준으로 만든
              패치인지 파일만으로는 알 수 없습니다.
            </span>
          </span>
        </label>
      )}

      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
        <input
          ref={inputRef}
          type="file"
          accept=".ips,.bps,.ups"
          disabled={busy}
          aria-label="패치 파일"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          className="block w-full text-xs text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50 dark:text-gray-300"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          IPS·BPS·UPS 를 올릴 수 있습니다. 패치는 <strong>브라우저에서 실행할 때만</strong> 합쳐지고,
          합친 파일은 서버에 저장되지 않습니다.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
