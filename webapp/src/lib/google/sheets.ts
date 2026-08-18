// 구글 스프레드시트 내보내기 (#181 2단계).
//
// 값 변환은 순수하고, API 호출은 `fetch` 로 REST 를 직접 부른다 — 호출이 셋뿐이라
// `googleapis` 패키지를 넣을 이유가 없다.
//
// 컬럼 정의는 CSV 와 **같은 것**(`export-datasets.ts`)을 본다. 두 내보내기의 내용이
// 어긋날 수 없다.

import type { Column } from '@/lib/trading/export-csv';
import { datasetById, type DatasetId } from '@/lib/trading/export-datasets';

const KST = 'Asia/Seoul';

/** 시트가 받는 한 칸의 값. 숫자는 숫자로 보내야 `SUM` 이 먹는다. */
export type CellValue = string | number;

function day(at: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: KST }).format(at);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: KST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d).replace('T', ' ');
}

/**
 * 행들을 시트가 받는 2차원 배열로.
 *
 * **CSV 와 갈리는 지점이 둘이다.**
 *
 * 1. 숫자를 문자열로 바꾸지 않는다 — 시트에서 합계·평균이 그대로 돼야 한다.
 * 2. 수식처럼 보이는 문자열을 건드리지 않는다. `valueInputOption=RAW` 로 쓰기 때문에
 *    시트가 값을 수식으로 해석하지 않는다(CSV 는 파일을 여는 프로그램이 해석해서 막아야 했다).
 */
export function toSheetValues<T>(rows: T[], columns: Column<T>[]): CellValue[][] {
  const cell = (v: unknown): CellValue => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? v : '';
    if (typeof v === 'boolean') return v ? '예' : '아니오';
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : formatDate(v);
    return String(v);
  };
  return [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => cell(c.value(r)))),
  ];
}

/** `매매기록 2026-08-18` — 드라이브 목록에서 언제 뽑은 것인지 바로 보이게. */
export function spreadsheetTitle(at: Date): string {
  return `매매기록 ${day(at)}`;
}

/** 탭 이름 = 데이터셋 이름(`주문로그` 등). */
export function tabTitle(id: DatasetId): string {
  return datasetById(id)?.label ?? id;
}

export interface SheetTab {
  title: string;
  values: CellValue[][];
}

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

async function callSheets(token: string, url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    // 구글이 주는 이유를 그대로 물고 올라간다 — "권한 없음"과 "API 미사용"은 대응이 다르다.
    const detail = await res.text().catch(() => '');
    throw new Error(`구글 시트 API 오류 ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * 스프레드시트를 새로 만들고 탭마다 값을 채운다. 만들어진 시트의 주소를 돌려준다.
 *
 * **매번 새로 만든다.** 기존 시트를 갱신하면 손으로 고쳐 둔 내용을 덮어쓸 수 있는데,
 * 새로 만들면 되돌릴 것이 없다.
 *
 * 탭은 생성 요청에서 한 번에 만든다(따로 만들면 왕복이 늘고 중간에 실패하면 빈 시트가 남는다).
 */
export async function createSpreadsheet(token: string, title: string, tabs: SheetTab[]): Promise<string> {
  const created = (await callSheets(token, SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: tabs.map((t) => ({ properties: { title: t.title } })),
    }),
  })) as { spreadsheetId?: string; spreadsheetUrl?: string };

  const id = created.spreadsheetId;
  if (!id) throw new Error('구글이 스프레드시트 id 를 주지 않았습니다.');

  for (const tab of tabs) {
    // `valueInputOption=RAW` — 값을 있는 그대로 저장한다. USER_ENTERED 로 두면 시트가
    // `=`로 시작하는 값을 수식으로 해석해 실행한다.
    const range = encodeURIComponent(`${tab.title}!A1`);
    await callSheets(token, `${SHEETS_API}/${id}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: tab.values }),
    });
  }

  return created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
