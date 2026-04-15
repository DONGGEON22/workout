import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { DAY_LABELS_KO } from "@/lib/constants";

export type WeekDayCell = {
  dayIndex: number;
  label: string;
  /** 표시용 월/일 */
  dateLabel: string;
  isToday: boolean;
};

/** 서버에서 받은 week_start(토 00:00 KST 인스턴트) 기준 7일 칸 */
export function buildWeekDayCells(weekStartIso: string): WeekDayCell[] {
  const start = new TZDate(weekStartIso, "Asia/Seoul");
  const now = new Date();
  const todayKey = now.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  return DAY_LABELS_KO.map((label, dayIndex) => {
    const d = addDays(start, dayIndex);
    const key = d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const dateLabel = d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
    });
    return {
      dayIndex,
      label,
      dateLabel,
      isToday: key === todayKey,
    };
  });
}
