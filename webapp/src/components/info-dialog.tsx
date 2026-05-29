"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ── 타입 ──────────────────────────────────────────────────────────────────

export type InfoDialogVariant = "info" | "success" | "warning" | "error";

export interface InfoDialogOptions {
  /** 모달 상단 제목 (생략 시 variant 별 기본 한국어 제목). */
  title?: string;
  /** 본문 — 사용자가 선택/복사 가능한 텍스트. */
  body: string;
  /** info / success / warning / error 색조. 기본 "info". */
  variant?: InfoDialogVariant;
}

interface InfoDialogContextValue {
  showInfo: (opts: InfoDialogOptions) => void;
}

const InfoDialogContext = createContext<InfoDialogContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function InfoDialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<InfoDialogOptions | null>(null);
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => {
    setOpts(null);
    setCopied(false);
  }, []);

  const showInfo = useCallback((next: InfoDialogOptions) => {
    setOpts(next);
    setCopied(false);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    if (!opts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, close]);

  async function handleCopy() {
    if (!opts) return;
    try {
      await navigator.clipboard.writeText(opts.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 권한 없는 환경 (예: insecure context) — 사용자 직접 선택해 복사
    }
  }

  const ctx = useMemo<InfoDialogContextValue>(() => ({ showInfo }), [showInfo]);

  return (
    <InfoDialogContext.Provider value={ctx}>
      {children}
      {opts ? (
        <InfoDialogView
          opts={opts}
          onClose={close}
          onCopy={handleCopy}
          copied={copied}
        />
      ) : null}
    </InfoDialogContext.Provider>
  );
}

// ── 훅 ────────────────────────────────────────────────────────────────────

export function useInfoDialog(): InfoDialogContextValue {
  const ctx = useContext(InfoDialogContext);
  if (!ctx) {
    // Provider 가 없는 환경 (테스트 등) — fallback 으로 alert.
    return {
      showInfo: ({ title, body }) => {
        if (typeof window !== "undefined") {
          window.alert(title ? `${title}\n\n${body}` : body);
        }
      },
    };
  }
  return ctx;
}

// ── 표시 ──────────────────────────────────────────────────────────────────

function defaultTitle(variant: InfoDialogVariant): string {
  switch (variant) {
    case "success": return "완료";
    case "warning": return "경고";
    case "error":   return "오류";
    default:        return "알림";
  }
}

function variantStyles(variant: InfoDialogVariant): {
  header: string;
  badgeText: string;
} {
  switch (variant) {
    case "success":
      return { header: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300", badgeText: "성공" };
    case "warning":
      return { header: "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300", badgeText: "경고" };
    case "error":
      return { header: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300", badgeText: "오류" };
    default:
      return { header: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300", badgeText: "정보" };
  }
}

interface InfoDialogViewProps {
  opts: InfoDialogOptions;
  onClose: () => void;
  onCopy: () => void;
  copied: boolean;
}

function InfoDialogView({ opts, onClose, onCopy, copied }: InfoDialogViewProps) {
  const variant = opts.variant ?? "info";
  const title = opts.title ?? defaultTitle(variant);
  const styles = variantStyles(variant);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 rounded-t-lg ${styles.header}`}>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
              {styles.badgeText}
            </span>
            <h3 className="text-sm font-bold">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-sm opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap text-xs font-mono text-gray-800 dark:text-gray-100 select-text">
            {opts.body}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t dark:border-gray-700">
          <button
            onClick={onCopy}
            className="px-3 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500"
          >
            {copied ? "복사됨" : "복사"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
