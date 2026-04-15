import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const sb = getSupabase();

  const [snapsRes, membersRes] = await Promise.all([
    sb
      .from("weekly_snapshots")
      .select("week_start, member_id, completion_count, met_goal, computed_at")
      .eq("met_goal", false)
      .order("week_start", { ascending: false })
      .limit(200),
    sb.from("members").select("id, display_name"),
  ]);

  const snaps = snapsRes.data ?? [];
  const members = membersRes.data ?? [];

  const nameById = new Map(members.map((m) => [m.id, m.display_name] as const));

  const byWeek = new Map<
    string,
    Array<{ memberId: string; displayName: string; completionCount: number }>
  >();

  for (const row of snaps) {
    const list = byWeek.get(row.week_start) ?? [];
    list.push({
      memberId: row.member_id,
      displayName: nameById.get(row.member_id) ?? "알 수 없음",
      completionCount: row.completion_count,
    });
    byWeek.set(row.week_start, list);
  }

  const items = [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(([weekStart, missed]) => ({
      weekStart,
      missedMembers: missed,
      coffeeLine: missed.map((m) => m.displayName).join(", "),
    }));

  return NextResponse.json({ items });
}
