import { NextResponse } from "next/server";
import { TZDate } from "@date-fns/tz";
import { completionDateKeySeoul } from "@/lib/completion-date";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";

const SEOUL = "Asia/Seoul";

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  let year = Number(url.searchParams.get("year"));
  let month = Number(url.searchParams.get("month"));

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new TZDate(new Date(), SEOUL);
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const dim = daysInMonth(year, month);
  const first = new TZDate(year, month - 1, 1, SEOUL);
  /** 월요일 1열 기준, 앞쪽 빈 칸 개수 (0~6) */
  const startWeekday = (first.getDay() - 6 + 7) % 7;

  const sb = getSupabase();

  const [membersRes, completionsRes] = await Promise.all([
    sb.from("members").select("id, display_name").order("display_name"),
    sb.from("workout_completions").select("member_id, week_start, day_index"),
  ]);

  const memberRows = membersRes.data ?? [];
  const completionRows = completionsRes.data ?? [];

  const daySets = new Map<string, Set<string>>();
  for (const m of memberRows) {
    daySets.set(m.id, new Set());
  }

  for (const row of completionRows) {
    const key = completionDateKeySeoul(row.week_start, row.day_index);
    if (!key.startsWith(prefix)) continue;
    const set = daySets.get(row.member_id);
    if (set) set.add(key);
  }

  const totals = memberRows.map((m) => ({
    id: m.id,
    displayName: m.display_name,
    totalInMonth: daySets.get(m.id)?.size ?? 0,
    dayKeys: [...(daySets.get(m.id) ?? [])].sort(),
  }));

  totals.sort((a, b) => {
    if (b.totalInMonth !== a.totalInMonth) return b.totalInMonth - a.totalInMonth;
    return a.displayName.localeCompare(b.displayName, "ko");
  });

  const ranked = totals.map((m) => ({
    ...m,
    rank: totals.filter((t) => t.totalInMonth > m.totalInMonth).length + 1,
  }));

  return NextResponse.json({
    year,
    month,
    daysInMonth: dim,
    startWeekday,
    currentMemberId: session.sub,
    members: ranked,
  });
}
