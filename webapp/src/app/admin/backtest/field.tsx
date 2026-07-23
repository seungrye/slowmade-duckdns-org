import type { ReactNode } from "react";

/** 백테스트 옵션 폼의 라벨+힌트 래퍼. 라벨(작은 굵은 글씨) 위, 입력 가운데, 힌트(연회색) 아래.
 *  브라우저 전략 탭과 팩터 탭이 같은 폼 디자인을 공유하도록 별도 모듈로 분리. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}
