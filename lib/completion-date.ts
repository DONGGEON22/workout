import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";

const SEOUL = "Asia/Seoul";

/** week_start(토 00:00 KST 인스턴트) + day_index → 서울 기준 달력 날짜 YYYY-MM-DD */
export function completionDateKeySeoul(weekStartIso: string, dayIndex: number): string {
  const base = new TZDate(weekStartIso, SEOUL);
  const d = addDays(base, dayIndex);
  return d.toLocaleDateString("en-CA", { timeZone: SEOUL });
}
