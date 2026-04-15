import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";

/**
 * 커피 누적 장부
 * weekly_snapshots 에서 met_goal = false 인 주간 기록을 집계
 * → 멤버별 총 커피 구매 횟수 (목표 미달 주 수)
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const sb = getSupabase();

  const [membersRes, failRes, weekCountRes] = await Promise.all([
    sb.from("members").select("id, display_name").order("display_name"),
    sb
      .from("weekly_snapshots")
      .select("member_id")
      .eq("met_goal", false),
    sb.from("weekly_snapshots").select("week_start"),
  ]);

  const members = membersRes.data ?? [];
  const failRows = failRes.data ?? [];
  const weekRows = weekCountRes.data ?? [];

  const failMap = new Map<string, number>();
  for (const r of failRows) {
    failMap.set(r.member_id, (failMap.get(r.member_id) ?? 0) + 1);
  }

  const uniqueWeeks = new Set(weekRows.map((r) => r.week_start));

  const ledger = members
    .map((m) => ({
      id: m.id,
      displayName: m.display_name,
      coffeeCount: failMap.get(m.id) ?? 0,
      isMe: m.id === session.sub,
    }))
    .sort((a, b) => b.coffeeCount - a.coffeeCount);

  return NextResponse.json({
    ledger,
    totalWeeks: uniqueWeeks.size,
  });
}
