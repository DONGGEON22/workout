import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";

const SEOUL = "Asia/Seoul";

export type WeekBounds = {
  weekStart: Date;
  weekEnd: Date;
};

/**
 * 토 00:00 KST ~ 다음 토 00:00 KST 직전까지 한 주(금요일 하루 종일 포함).
 * weekEnd는 편집 불가가 되는 시각(다음 주 토요일 0시, 배타적 상한).
 */
export function getActiveWeekBounds(now: Date = new Date()): WeekBounds {
  const kstNow = new TZDate(now, SEOUL);
  let weekStart = startOfDay(kstNow);
  const dow = weekStart.getDay();
  const daysSinceSat = (dow - 6 + 7) % 7;
  weekStart = startOfDay(addDays(weekStart, -daysSinceSat));
  let weekEnd = startOfDay(addDays(weekStart, 7));

  if (kstNow.getTime() >= weekEnd.getTime()) {
    weekStart = startOfDay(addDays(weekStart, 7));
    weekEnd = startOfDay(addDays(weekStart, 7));
  }

  return {
    weekStart: new Date(weekStart.getTime()),
    weekEnd: new Date(weekEnd.getTime()),
  };
}

/** 직전에 마감된 주(스냅샷 대상): 현재 활성 주의 바로 이전 토~금 구간 */
export function getLastClosedWeekBounds(now: Date = new Date()): WeekBounds {
  const { weekStart: activeStart } = getActiveWeekBounds(now);
  const closedStart = startOfDay(addDays(activeStart, -7));
  const closedEnd = startOfDay(addDays(closedStart, 7));
  return {
    weekStart: new Date(closedStart.getTime()),
    weekEnd: new Date(closedEnd.getTime()),
  };
}

export function isWeekEditable(now: Date, weekStart: Date): boolean {
  const { weekStart: active, weekEnd } = getActiveWeekBounds(now);
  return active.getTime() === new Date(weekStart).getTime() && now < weekEnd;
}
