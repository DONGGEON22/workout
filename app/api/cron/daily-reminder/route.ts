import { NextResponse } from "next/server";
import { WORKOUT_GOAL_PER_WEEK } from "@/lib/constants";
import { getActiveWeekBounds, isWeekEditable } from "@/lib/week";
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

  // 성 제거 (3글자 이상이면 첫 글자가 성), 아/야 처리
  function firstName(name: string) {
    return name.length >= 3 ? name.slice(1) : name;
  }
  function callName(name: string) {
    const fn = firstName(name);
    const last = fn.charCodeAt(fn.length - 1);
    const jongseong = (last - 0xAC00) % 28;
    return fn + (jongseong === 0 ? "야" : "아");
  }

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
        ? "오늘이 마감이야!"
        : `마감까지 ${daysLeft}일이야!`;

    await sendPushToMembers([m.id], {
      title: `오늘 운동 안 했네??? 언제하게 ${callName(m.display_name)}`,
      body: `${remaining}회 남았고 ${daysMsg}`,
      tag: "daily-reminder",
    });

    reminded.push({ name: m.display_name, done, remaining });
  }

  return NextResponse.json({ ok: true, reminded });
}

export async function POST(req: Request) {
  return GET(req);
}
