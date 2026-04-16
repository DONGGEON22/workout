import { NextResponse } from "next/server";
import { WORKOUT_GOAL_PER_WEEK } from "@/lib/constants";
import { getActiveWeekBounds, isWeekEditable } from "@/lib/week";
import { getSupabase } from "@/lib/supabase";
import { sendPushToMembers } from "@/lib/push";

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret) return process.env.NODE_ENV === "development";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const { weekStart, weekEnd } = getActiveWeekBounds();

  // 마감된 주라면 발송 안 함
  if (!isWeekEditable(now, weekStart)) {
    return NextResponse.json({ ok: true, skipped: "week closed" });
  }

  const weekIso = weekStart.toISOString();
  const sb = getSupabase();

  const [membersRes, completionsRes] = await Promise.all([
    sb.from("members").select("id, display_name"),
    sb
      .from("workout_completions")
      .select("member_id, transferred")
      .eq("week_start", weekIso),
  ]);

  const members = membersRes.data ?? [];
  const completions = completionsRes.data ?? [];

  // 유효 완료 수 (transferred 제외)
  const countMap = new Map<string, number>();
  for (const row of completions) {
    if (!row.transferred) {
      countMap.set(row.member_id, (countMap.get(row.member_id) ?? 0) + 1);
    }
  }

  // 마감까지 남은 날 계산 (한국 시간 기준)
  const msLeft = new Date(weekEnd).getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  const reminded: Array<{ name: string; done: number; remaining: number }> = [];

  for (const m of members) {
    const done = countMap.get(m.id) ?? 0;
    const remaining = WORKOUT_GOAL_PER_WEEK - done;

    // 이미 목표 달성했으면 스킵
    if (remaining <= 0) continue;

    // 오늘 이미 했으면 스킵 (오늘 한국 기준 체크 여부)
    const seoulDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
    const todayStart = new Date(seoulDate + "T00:00:00+09:00").toISOString();
    const { data: todayRows } = await sb
      .from("workout_completions")
      .select("id")
      .eq("member_id", m.id)
      .eq("week_start", weekIso)
      .eq("transferred", false)
      .gte("created_at", todayStart)
      .limit(1);

    if ((todayRows ?? []).length > 0) continue;

    const daysMsg =
      daysLeft <= 1
        ? "오늘이 마감이에요!"
        : `마감까지 ${daysLeft}일 남았어요`;

    await sendPushToMembers([m.id], {
      title: "💪 오늘 운동 안 하셨어요!",
      body: `${remaining}회 남았어요. ${daysMsg}`,
      tag: "daily-reminder",
    });

    reminded.push({ name: m.display_name, done, remaining });
  }

  return NextResponse.json({ ok: true, reminded });
}

export async function POST(req: Request) {
  return GET(req);
}
