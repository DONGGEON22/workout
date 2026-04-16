import { NextResponse } from "next/server";
import { WORKOUT_GOAL_PER_WEEK, WORKOUT_PHOTO_PREFIX } from "@/lib/constants";
import { requireSession } from "@/lib/auth/require-session";
import { getActiveWeekBounds } from "@/lib/week";
import { getSupabase, storagePublicUrl } from "@/lib/supabase";

function photoUrlFromStoredPath(rel: string): string {
  // Supabase Storage 공개 URL
  if (rel.startsWith("http")) return rel;
  if (rel.startsWith(`${WORKOUT_PHOTO_PREFIX}/`)) {
    return storagePublicUrl(rel);
  }
  // 레거시 로컬 경로 → 그대로 반환 (마이그레이션 전 데이터)
  const segs = rel.split("/").map((s) => encodeURIComponent(s));
  return `/api/uploads/${segs.join("/")}`;
}

/** 연속 달성 streak 계산 */
async function calcStreak(
  sb: ReturnType<typeof getSupabase>,
  memberId: string,
  weekIso: string,
): Promise<number> {
  const { data: snaps } = await sb
    .from("weekly_snapshots")
    .select("week_start, met_goal")
    .eq("member_id", memberId)
    .lt("week_start", weekIso)
    .order("week_start", { ascending: false });

  if (!snaps) return 0;
  let streak = 0;
  for (const snap of snaps) {
    if (snap.met_goal) streak++;
    else break;
  }
  return streak;
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const sb = getSupabase();
  const { weekStart, weekEnd } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  // 한국 시간 기준 오늘 00:00 (UTC) — 따봉은 당일만 집계
  const seoulDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const todaySeoulStart = new Date(seoulDate + "T00:00:00+09:00").toISOString();

  const [membersRes, completionsRes, reactionsRes, transfersRes] =
    await Promise.all([
      sb.from("members").select("id, display_name, created_at").order("display_name"),
      sb
        .from("workout_completions")
        .select("id, member_id, week_start, day_index, photo_path, transferred, workout_type, created_at")
        .eq("week_start", weekIso),
      sb
        .from("reactions")
        .select("from_member_id, to_member_id, emoji")
        .eq("week_start", weekIso)
        .gte("created_at", todaySeoulStart),
      sb
        .from("workout_transfers")
        .select(
          "from_member_id, to_member_id, created_at, members!workout_transfers_from_member_id_fkey(display_name), members!workout_transfers_to_member_id_fkey(display_name)",
        )
        .eq("week_start", weekIso)
        .order("created_at", { ascending: false }),
    ]);

  const members = membersRes.data ?? [];
  const completions = completionsRes.data ?? [];
  const reactionRows = reactionsRes.data ?? [];

  // 완료 기록 멤버별 그룹화
  const byMember = new Map<
    string,
    Array<{ id: string; dayIndex: number; photoUrl: string | null; transferred: boolean; workoutType: string | null; createdAt: string }>
  >();

  for (const row of completions) {
    const list = byMember.get(row.member_id) ?? [];
    const photoUrl =
      row.photo_path &&
      row.photo_path.startsWith(`${WORKOUT_PHOTO_PREFIX}/`)
        ? photoUrlFromStoredPath(row.photo_path)
        : null;
    list.push({
      id: row.id,
      dayIndex: row.day_index,
      photoUrl,
      transferred: row.transferred ?? false,
      workoutType: row.workout_type ?? null,
      createdAt: row.created_at,
    });
    byMember.set(row.member_id, list);
  }

  // 리액션 집계
  type ReactionItem = { emoji: string; count: number; iMine: boolean };
  const reactionsByTarget: Record<string, ReactionItem[]> = {};
  for (const r of reactionRows) {
    if (!reactionsByTarget[r.to_member_id]) reactionsByTarget[r.to_member_id] = [];
    const existing = reactionsByTarget[r.to_member_id].find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count++;
      if (r.from_member_id === session.sub) existing.iMine = true;
    } else {
      reactionsByTarget[r.to_member_id].push({
        emoji: r.emoji,
        count: 1,
        iMine: r.from_member_id === session.sub,
      });
    }
  }

  // streak 병렬 계산
  const streakEntries = await Promise.all(
    members.map(async (m) => [m.id, await calcStreak(sb, m.id, weekIso)] as const),
  );
  const streakMap = new Map(streakEntries);

  // 양도 이력 정리
  const transfers = (transfersRes.data ?? []).map((t: Record<string, unknown>) => ({
    from_member_id: t.from_member_id as string,
    to_member_id: t.to_member_id as string,
    created_at: t.created_at as string,
    from_name: (t["members!workout_transfers_from_member_id_fkey"] as { display_name: string } | null)?.display_name ?? "",
    to_name: (t["members!workout_transfers_to_member_id_fkey"] as { display_name: string } | null)?.display_name ?? "",
  }));

  const payload = members.map((m) => {
    const days = byMember.get(m.id) ?? [];
    // transferred된 기록은 횟수에서 제외 (양도한 건 인정하지만 카운트 X)
    const activeCount = days.filter((d) => !d.transferred).length;
    return {
      id: m.id,
      displayName: m.display_name,
      createdAt: m.created_at,
      completionCount: activeCount,
      metGoal: activeCount >= WORKOUT_GOAL_PER_WEEK,
      streak: streakMap.get(m.id) ?? 0,
      days,
      reactions: reactionsByTarget[m.id] ?? [],
    };
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    goalPerWeek: WORKOUT_GOAL_PER_WEEK,
    currentMemberId: session.sub,
    members: payload,
    transfers,
  });
}
