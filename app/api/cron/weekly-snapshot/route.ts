import { NextResponse } from "next/server";
import { WORKOUT_GOAL_PER_WEEK } from "@/lib/constants";
import { getLastClosedWeekBounds } from "@/lib/week";
import { getSupabase } from "@/lib/supabase";

async function runSnapshot() {
  const sb = getSupabase();
  const { weekStart } = getLastClosedWeekBounds(new Date());
  const weekIso = weekStart.toISOString();

  const [membersRes, countRes] = await Promise.all([
    sb.from("members").select("id"),
    sb
      .from("workout_completions")
      .select("member_id")
      .eq("week_start", weekIso)
      .eq("transferred", false),
  ]);

  const memberRows = membersRes.data ?? [];
  const countRows = countRes.data ?? [];

  const countByMember = new Map<string, number>();
  for (const row of countRows) {
    countByMember.set(row.member_id, (countByMember.get(row.member_id) ?? 0) + 1);
  }

  const upsertRows = memberRows.map((m) => {
    const n = countByMember.get(m.id) ?? 0;
    return {
      week_start: weekIso,
      member_id: m.id,
      completion_count: n,
      met_goal: n >= WORKOUT_GOAL_PER_WEEK,
    };
  });

  const { error } = await sb
    .from("weekly_snapshots")
    .upsert(upsertRows, { onConflict: "week_start,member_id" });

  if (error) {
    console.error("[cron upsert]", error);
    return { error: "스냅샷 저장 실패" as const };
  }

  return {
    ok: true as const,
    weekStart: weekIso,
    inserted: memberRows.length,
  };
}

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runSnapshot();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runSnapshot();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
