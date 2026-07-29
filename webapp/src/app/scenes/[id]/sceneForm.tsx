"use client";

import { useState } from "react";
import type { Scene } from "@/types/web-adventure";

// #253 〈에테르니아〉 — CMS 의 endingId 드롭다운.
const ENDING_IDS: NonNullable<Scene["endingId"]>[] = [
  "ascension",
  "revolution",
  "harmony",
  "fall",
  "petrification",
  "sylvan_bond",
];

const inputCls = "w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800";

interface Props {
  scene: Scene;
  onChange: (s: Scene) => void;
}

export function SceneForm({ scene, onChange }: Props) {
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newItemId, setNewItemId] = useState("");
  const [bgmUploading, setBgmUploading] = useState(false);
  const [bgmError, setBgmError] = useState<string | null>(null);

  const titleMissing = !scene.title.trim();
  const bodyMissing = !scene.body || scene.body.length === 0;
  const endingIdMissing = scene.isEnding === true && !scene.endingId;

  const setFlagsEntries = Object.entries(scene.onEnter?.setFlags ?? {});
  const addItems = scene.onEnter?.addItems ?? [];

  function patchOnEnter(patch: Partial<NonNullable<Scene["onEnter"]>>) {
    const next: NonNullable<Scene["onEnter"]> = { ...(scene.onEnter ?? {}), ...patch };
    // setFlags / addItems 가 빈 객체/배열이면 정리
    if (next.setFlags && Object.keys(next.setFlags).length === 0) delete next.setFlags;
    if (next.addItems && next.addItems.length === 0) delete next.addItems;
    const hasAny = (next.setFlags && Object.keys(next.setFlags).length > 0)
      || (next.addItems && next.addItems.length > 0);
    onChange({ ...scene, onEnter: hasAny ? next : undefined });
  }

  function handleAddFlag() {
    if (!newFlagKey.trim()) return;
    const setFlags = { ...(scene.onEnter?.setFlags ?? {}), [newFlagKey.trim()]: true };
    patchOnEnter({ setFlags });
    setNewFlagKey("");
  }

  function handleToggleFlag(key: string, value: boolean) {
    const setFlags = { ...(scene.onEnter?.setFlags ?? {}), [key]: value };
    patchOnEnter({ setFlags });
  }

  function handleRemoveFlag(key: string) {
    const setFlags = { ...(scene.onEnter?.setFlags ?? {}) };
    delete setFlags[key];
    patchOnEnter({ setFlags });
  }

  function handleAddItem() {
    if (!newItemId.trim()) return;
    if (addItems.includes(newItemId.trim())) return;
    patchOnEnter({ addItems: [...addItems, newItemId.trim()] });
    setNewItemId("");
  }

  function handleRemoveItem(itemId: string) {
    patchOnEnter({ addItems: addItems.filter((x) => x !== itemId) });
  }

  // ── 배경음(BGM) ─────────────────────────────────────────────────────────
  function updateBgm(next: NonNullable<Scene["bgm"]> | undefined) {
    onChange({ ...scene, bgm: next });
  }
  function handleBgmSrc(src: string) {
    if (!src.trim()) return updateBgm(undefined); // 비우면 제거
    updateBgm({ ...scene.bgm, src });
  }
  function handleBgmLoop(loop: boolean) {
    if (!scene.bgm) return;
    updateBgm({ ...scene.bgm, loop });
  }
  async function handleBgmUpload(file: File) {
    setBgmUploading(true);
    setBgmError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/web-adventure/audio/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      const url = json?.data?.url as string | undefined;
      if (!res.ok || !url) throw new Error(json?.message ?? "업로드 실패");
      updateBgm({ ...scene.bgm, src: url });
    } catch (e) {
      setBgmError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBgmUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 기본 필드 */}
      <div className="space-y-2">
        <label className="block">
          <span className="block text-xs text-gray-500 mb-0.5">씬 ID</span>
          <input
            aria-label="씬 ID"
            value={scene.id}
            onChange={(e) => onChange({ ...scene, id: e.target.value })}
            placeholder="예: scene_intro"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-0.5">제목</span>
          <input
            aria-label="제목"
            value={scene.title}
            onChange={(e) => onChange({ ...scene, title: e.target.value })}
            placeholder="씬 제목"
            className={inputCls}
          />
          {titleMissing && <p className="text-xs text-red-500 mt-0.5">제목 은 필수입니다.</p>}
        </label>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-0.5">일러스트 (이미지 URL 또는 path)</span>
          <input
            aria-label="일러스트"
            value={scene.illustration}
            onChange={(e) => onChange({ ...scene, illustration: e.target.value })}
            placeholder="예: scene/intro.png"
            className={inputCls}
          />
          <span className="block text-[10px] text-gray-400 mt-0.5">
            painter-bot 으로 생성된 이미지는 path 만 입력하면 자동 매핑됩니다.
          </span>
        </label>

        {/* 배리에이션 이미지 리스트뷰 — illustrations[] (없으면 illustration 단일). */}
        {(() => {
          const imgs =
            scene.illustrations && scene.illustrations.length > 0
              ? scene.illustrations
              : scene.illustration
                ? [scene.illustration]
                : [];
          if (imgs.length === 0) return null;
          return (
            <div className="block">
              <span className="block text-xs text-gray-500 mb-1">
                이미지{" "}
                {scene.illustrations && scene.illustrations.length > 0
                  ? `(배리에이션 ${scene.illustrations.length}장)`
                  : "(단일)"}
              </span>
              <div className="flex gap-2 flex-wrap">
                {imgs.map((url, i) => (
                  <a
                    key={`${url}-${i}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative block w-24 h-24 rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-blue-400"
                    title={`배리에이션 ${i + 1} (새 탭)`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`배리에이션 ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {url === scene.illustration && (
                      <span className="absolute bottom-0 left-0 bg-black/60 text-white text-[9px] px-1 rounded-tr">
                        대표
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 배경음(BGM) — URL 직접 입력 또는 오디오 파일 업로드(→ MinIO public URL). */}
        <div className="block">
          <span className="block text-xs text-gray-500 mb-0.5">배경음 (BGM, 선택)</span>
          <div className="flex items-center gap-2">
            <input
              aria-label="BGM URL"
              value={scene.bgm?.src ?? ""}
              onChange={(e) => handleBgmSrc(e.target.value)}
              placeholder="오디오 URL 또는 파일 업로드"
              className={inputCls}
            />
            <label className="shrink-0 text-xs text-blue-600 hover:text-blue-800 cursor-pointer whitespace-nowrap">
              {bgmUploading ? "업로드 중…" : "파일 업로드"}
              <input
                type="file"
                accept="audio/*"
                aria-label="BGM 파일 업로드"
                className="hidden"
                disabled={bgmUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBgmUpload(f);
                }}
              />
            </label>
          </div>
          {scene.bgm?.src && (
            <label className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
              <input
                type="checkbox"
                aria-label="BGM 반복"
                checked={scene.bgm?.loop ?? false}
                onChange={(e) => handleBgmLoop(e.target.checked)}
              />
              반복 재생 (loop)
            </label>
          )}
          {bgmError && <p className="text-xs text-red-500 mt-0.5">{bgmError}</p>}
          <span className="block text-[10px] text-gray-400 mt-0.5">
            mp3/ogg/wav 등. 중간 제어(정지·재개)는 본문의 {"<<bgm …>>"} 디렉티브.
          </span>
        </div>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-0.5">본문 (한 줄당 한 문단)</span>
          <textarea
            aria-label="본문"
            value={(scene.body ?? []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n");
              // 후행 빈 줄 1개는 입력 중 자연스러운 상태, 그러나 모두 빈 줄은 빈 배열
              const cleaned = lines.filter((l) => l.length > 0);
              onChange({ ...scene, body: cleaned });
            }}
            rows={4}
            placeholder="씬 본문..."
            className={`${inputCls} font-mono`}
          />
          {bodyMissing && <p className="text-xs text-red-500 mt-0.5">본문 은 한 줄 이상 입력해야 합니다.</p>}
        </label>
      </div>

      {/* onEnter — setFlags */}
      <fieldset className="border rounded p-3 space-y-2">
        <legend className="text-xs text-gray-500 px-1">진입 시 효과 (onEnter)</legend>

        <div className="space-y-1">
          <span className="text-xs text-gray-600 dark:text-gray-300">플래그 (setFlags)</span>
          {setFlagsEntries.length === 0 && (
            <p className="text-[11px] text-gray-400">설정된 플래그 없음</p>
          )}
          {setFlagsEntries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="font-mono w-40 truncate" title={key}>{key}</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => handleToggleFlag(key, e.target.checked)}
                />
                {value ? "true" : "false"}
              </label>
              <button
                type="button"
                onClick={() => handleRemoveFlag(key)}
                aria-label={`플래그 ${key} 삭제`}
                className="text-red-500 hover:text-red-700"
              >
                삭제
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <input
              value={newFlagKey}
              onChange={(e) => setNewFlagKey(e.target.value)}
              placeholder="새 flag 키"
              className="border rounded px-2 py-0.5 text-xs flex-1 bg-white dark:bg-gray-800"
            />
            <button
              type="button"
              onClick={handleAddFlag}
              className="text-blue-500 hover:text-blue-700"
            >
              + 플래그
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-gray-600 dark:text-gray-300">아이템 지급 (addItems)</span>
          {addItems.length === 0 && (
            <p className="text-[11px] text-gray-400">설정된 아이템 없음</p>
          )}
          {addItems.map((itemId) => (
            <div key={itemId} className="flex items-center gap-2 text-xs">
              <span className="font-mono w-40 truncate" title={itemId}>{itemId}</span>
              <button
                type="button"
                onClick={() => handleRemoveItem(itemId)}
                aria-label={`아이템 ${itemId} 삭제`}
                className="text-red-500 hover:text-red-700"
              >
                삭제
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <input
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
              placeholder="새 itemId"
              className="border rounded px-2 py-0.5 text-xs flex-1 bg-white dark:bg-gray-800"
            />
            <button
              type="button"
              onClick={handleAddItem}
              className="text-blue-500 hover:text-blue-700"
            >
              + 아이템
            </button>
          </div>
        </div>
      </fieldset>

      {/* isEnding */}
      <fieldset className="border rounded p-3 space-y-2">
        <legend className="text-xs text-gray-500 px-1">엔딩 설정</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scene.isEnding === true}
            onChange={(e) => {
              const isEnding = e.target.checked;
              onChange({ ...scene, isEnding, endingId: isEnding ? scene.endingId : undefined });
            }}
          />
          엔딩 씬 (isEnding)
        </label>
        {scene.isEnding && (
          <label className="block">
            <span className="block text-xs text-gray-500 mb-0.5">엔딩 ID</span>
            <select
              aria-label="엔딩 ID"
              value={scene.endingId ?? ""}
              onChange={(e) =>
                onChange({ ...scene, endingId: (e.target.value || undefined) as Scene["endingId"] })
              }
              className={inputCls}
            >
              <option value="">(선택)</option>
              {ENDING_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {endingIdMissing && <p className="text-xs text-red-500 mt-0.5">엔딩 ID 는 필수입니다.</p>}
          </label>
        )}
      </fieldset>
    </div>
  );
}
