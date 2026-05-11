import { NextResponse } from "next/server";
import { WORKOUT_GOAL_PER_WEEK } from "@/lib/constants";
import { getActiveWeekBounds } from "@/lib/week";
import { getSupabase } from "@/lib/supabase";
import { sendPushToMembers } from "@/lib/push";

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true; // CRON_SECRET 미설정 시 Vercel 크론 자체 인증에 위임
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabase();
  const { weekStart } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  const [membersRes, countRes] = await Promise.all([
    sb.from("members").select("id, display_name"),
    sb
      .from("workout_completions")
      .select("member_id")
      .eq("week_start", weekIso),
  ]);

  const members = membersRes.data ?? [];
  const countRows = countRes.data ?? [];

  const countMap = new Map<string, number>();
  for (const row of countRows) {
    countMap.set(row.member_id, (countMap.get(row.member_id) ?? 0) + 1);
  }

  const results: Array<{ name: string; remaining: number }> = [];

  for (const m of members) {
    const done = countMap.get(m.id) ?? 0;
    const remaining = WORKOUT_GOAL_PER_WEEK - done;
    if (remaining > 0) {
      results.push({ name: m.display_name, remaining });
      await sendPushToMembers([m.id], {
        title: "⏰ 오늘이 마감이에요!",
        body: `${m.display_name}님, 아직 ${remaining}회 남았어요. 오늘 꼭 하자!`,
        tag: "friday-reminder",
      });
    }
  }

  return NextResponse.json({ ok: true, reminded: results });
}

export async function POST(req: Request) {
  return GET(req);
}
