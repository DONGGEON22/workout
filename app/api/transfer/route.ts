import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";
import { getActiveWeekBounds, isWeekEditable } from "@/lib/week";
import { WORKOUT_GOAL_PER_WEEK } from "@/lib/constants";
import { sendPushToMembers } from "@/lib/push";

/**
 * 운동 횟수 양도
 * - 내 완료 기록 2개를 소모해 상대방에게 1회를 부여
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { to_member_id } = body as { to_member_id?: string };
  if (!to_member_id) {
    return NextResponse.json({ error: "to_member_id 필요" }, { status: 400 });
  }
  if (to_member_id === session.sub) {
    return NextResponse.json({ error: "자신에게 양도할 수 없습니다." }, { status: 400 });
  }

  const now = new Date();
  const { weekStart } = getActiveWeekBounds();
  if (!isWeekEditable(now, weekStart)) {
    return NextResponse.json({ error: "기록 마감 후에는 양도할 수 없습니다." }, { status: 403 });
  }

  const sb = getSupabase();
  const weekIso = weekStart.toISOString();

  const [targetRes, meRes, myCompRes, theirCompRes] = await Promise.all([
    sb.from("members").select("id, display_name").eq("id", to_member_id).single(),
    sb.from("members").select("display_name").eq("id", session.sub).single(),
    sb
      .from("workout_completions")
      .select("id, day_index")
      .eq("member_id", session.sub)
      .eq("week_start", weekIso)
      .order("created_at", { ascending: true }),
    sb
      .from("workout_completions")
      .select("id, day_index")
      .eq("member_id", to_member_id)
      .eq("week_start", weekIso),
  ]);

  const target = targetRes.data;
  if (!target) return NextResponse.json({ error: "대상을 찾을 수 없습니다." }, { status: 404 });

  const myCompletions = myCompRes.data ?? [];
  if (myCompletions.length < 2) {
    return NextResponse.json(
      { error: "이번 주 완료 기록이 2개 이상이어야 양도할 수 있습니다." },
      { status: 400 },
    );
  }

  const theirCompletions = theirCompRes.data ?? [];
  if (theirCompletions.length >= WORKOUT_GOAL_PER_WEEK) {
    return NextResponse.json(
      { error: `${target.display_name}님은 이미 이번 주 목표를 달성했습니다.` },
      { status: 400 },
    );
  }

  // 상대방 빈 day_index 찾기
  const theirDaySet = new Set(theirCompletions.map((c) => c.day_index));
  let freeDayIndex: number | null = null;
  for (let i = 0; i <= 6; i++) {
    if (!theirDaySet.has(i)) {
      freeDayIndex = i;
      break;
    }
  }
  if (freeDayIndex === null) {
    return NextResponse.json({ error: "상대방의 빈 요일 슬롯이 없습니다." }, { status: 400 });
  }

  const toDelete = myCompletions.slice(0, 2);

  // 내 기록 2개 삭제
  const { error: deleteError } = await sb
    .from("workout_completions")
    .delete()
    .in("id", toDelete.map((c) => c.id));

  if (deleteError) {
    console.error("[transfer delete]", deleteError);
    return NextResponse.json({ error: "양도 처리 실패" }, { status: 500 });
  }

  // 상대방 기록 1개 추가
  const { error: insertError } = await sb.from("workout_completions").insert({
    id: randomUUID(),
    member_id: to_member_id,
    week_start: weekIso,
    day_index: freeDayIndex,
    photo_path: null,
  });

  if (insertError) {
    console.error("[transfer insert]", insertError);
    return NextResponse.json({ error: "양도 처리 실패" }, { status: 500 });
  }

  // 양도 로그 기록
  const { error: logError } = await sb.from("workout_transfers").insert({
    id: randomUUID(),
    from_member_id: session.sub,
    to_member_id,
    week_start: weekIso,
  });

  if (logError) {
    console.error("[transfer log]", logError);
    // 로그 실패는 치명적이지 않으므로 계속 진행
  }

  // 양도받은 사람에게 푸시
  void sendPushToMembers([to_member_id], {
    title: "운동 횟수 양도 받음 💝",
    body: `${meRes.data?.display_name ?? "팀원"}님이 운동 1회를 양도했어요!`,
    tag: "transfer",
  });

  return NextResponse.json({ ok: true });
}

/** 이번 주 양도 이력 조회 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const sb = getSupabase();
  const { weekStart } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  const { data: rows } = await sb
    .from("workout_transfers")
    .select(
      "id, from_member_id, to_member_id, created_at, members!workout_transfers_from_member_id_fkey(display_name), members!workout_transfers_to_member_id_fkey(display_name)",
    )
    .eq("week_start", weekIso)
    .order("created_at", { ascending: false });

  const transfers = (rows ?? []).map((t: Record<string, unknown>) => ({
    id: t.id,
    from_member_id: t.from_member_id,
    to_member_id: t.to_member_id,
    created_at: t.created_at,
    from_name: (t["members!workout_transfers_from_member_id_fkey"] as { display_name: string } | null)?.display_name ?? "",
    to_name: (t["members!workout_transfers_to_member_id_fkey"] as { display_name: string } | null)?.display_name ?? "",
  }));

  return NextResponse.json({ transfers });
}
