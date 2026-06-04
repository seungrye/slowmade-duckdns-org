"use client";

import { useState } from "react";
import type { Scene } from "@/types/web-adventure";

const ENDING_IDS: NonNullable<Scene["endingId"]>[] = [
  "main",
  "spirit",
  "fail",
  "shopkeeper",
  "goblin_friend",
  "wizard_apprentice",
];

const inputCls = "w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800";

interface Props {
  scene: Scene;
  onChange: (s: Scene) => void;
}

export function SceneForm({ scene, onChange }: Props) {
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newItemId, setNewItemId] = useState("");

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
