/** 달력 배지 (#328) 공용 타입. parse·catalog·cache 가 서로 import 하지 않도록 여기 모은다. */

export type EventKind = 'holiday' | 'anniversary' | 'season';

/** 캐시에 저장하는 하루치 항목. `date` 는 KST 기준 양력 'YYYY-MM-DD'. */
export type CalendarDay = {
  date: string;
  name: string;
  kind: EventKind;
};

/** 화면에 내려보내는 형태 — 이름에 아이콘·설명을 입힌 것. */
export type CalendarEvent = {
  name: string;
  kind: EventKind;
  icon: string;
  description: string;
};
