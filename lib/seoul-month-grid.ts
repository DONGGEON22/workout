import { TZDate } from "@date-fns/tz";
import { completionDateKeySeoul } from "@/lib/completion-date";

const SEOUL = "Asia/Seoul";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** month1: 1–12, JS Date와 동일한 일수 계산(한국 DST 없음) */
function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

export function dayKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export type SeoulMonthCell = {
  y: number;
  m: number;
  d: number;
  dateKey: string;
  /** 표시 중인 연·월과 같은 달이면 true (인접 달 끼움 날은 false) */
  inDisplayMonth: boolean;
};

/** 토요일 시작 그리드(토~금). 앞뒤로 인접 달 날짜를 채워 7의 배수로 맞춤 */
export function buildSeoulMonthGrid(year: number, month1: number): SeoulMonthCell[] {
  const dim = daysInMonth(year, month1);
  const first = new TZDate(year, month1 - 1, 1, SEOUL);
  const dow = first.getDay();
  const lead = (dow - 6 + 7) % 7;

  const cells: SeoulMonthCell[] = [];

  let py = year;
  let pm = month1 - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const dimPrev = daysInMonth(py, pm);
  for (let i = 0; i < lead; i++) {
    const d = dimPrev - lead + 1 + i;
    cells.push({
      y: py,
      m: pm,
      d,
      dateKey: dayKeyFromParts(py, pm, d),
      inDisplayMonth: false,
    });
  }

  for (let d = 1; d <= dim; d++) {
    cells.push({
      y: year,
      m: month1,
      d,
      dateKey: dayKeyFromParts(year, month1, d),
      inDisplayMonth: true,
    });
  }

  let ty = year;
  let tm = month1;
  let td = dim + 1;
  if (td > daysInMonth(ty, tm)) {
    td = 1;
    tm += 1;
    if (tm > 12) {
      tm = 1;
      ty += 1;
    }
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      y: ty,
      m: tm,
      d: td,
      dateKey: dayKeyFromParts(ty, tm, td),
      inDisplayMonth: ty === year && tm === month1,
    });
    td += 1;
    if (td > daysInMonth(ty, tm)) {
      td = 1;
      tm += 1;
      if (tm > 12) {
        tm = 1;
        ty += 1;
      }
    }
  }

  return cells;
}

/** 활성 주(week_start ISO)의 7일 → dateKey → day_index(0=토 … 6=금) */
export function activeWeekKeyToDayIndex(weekStartIso: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    m.set(completionDateKeySeoul(weekStartIso, i), i);
  }
  return m;
}

export function seoulDateKeyFromInstant(now: Date = new Date()): string {
  return new TZDate(now, SEOUL).toLocaleDateString("en-CA", { timeZone: SEOUL });
}
