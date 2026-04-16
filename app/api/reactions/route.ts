import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";
import { getActiveWeekBounds } from "@/lib/week";
import { sendPushToMembers } from "@/lib/push";

const ALLOWED_EMOJIS = ["👍"];

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const sb = getSupabase();
  const { weekStart } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  const { data: rows } = await sb
    .from("reactions")
    .select("id, from_member_id, to_member_id, emoji, created_at, members!reactions_from_member_id_fkey(display_name)")
    .eq("week_start", weekIso)
    .order("created_at", { ascending: false });

  const reactions = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    from_member_id: r.from_member_id,
    to_member_id: r.to_member_id,
    emoji: r.emoji,
    created_at: r.created_at,
    from_name: (r["members!reactions_from_member_id_fkey"] as { display_name: string } | null)?.display_name ?? "",
  }));

  return NextResponse.json({ reactions });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { to_member_id, emoji } = body as { to_member_id?: string; emoji?: string };

  if (!to_member_id || !emoji) {
    return NextResponse.json({ error: "to_member_id, emoji 필요" }, { status: 400 });
  }
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "허용되지 않는 이모지" }, { status: 400 });
  }
  if (to_member_id === session.sub) {
    return NextResponse.json({ error: "자신에게 리액션할 수 없습니다." }, { status: 400 });
  }

  const sb = getSupabase();
  const { weekStart } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  const { data: target } = await sb
    .from("members")
    .select("id, display_name")
    .eq("id", to_member_id)
    .single();
  if (!target) return NextResponse.json({ error: "대상을 찾을 수 없습니다." }, { status: 404 });

  const { data: me } = await sb
    .from("members")
    .select("display_name")
    .eq("id", session.sub)
    .single();

  // 누를 때마다 새 행 추가 (카운트 누적)
  await sb.from("reactions").insert({
    id: randomUUID(),
    from_member_id: session.sub,
    to_member_id,
    week_start: weekIso,
    emoji,
  });

  // 받은 사람에게 푸시
  void sendPushToMembers([to_member_id], {
    title: "운동 응원 도착 🎉",
    body: `${me?.display_name ?? "누군가"}님이 ${emoji} 보냈어요!`,
    tag: "reaction",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { to_member_id, emoji } = body as { to_member_id?: string; emoji?: string };
  if (!to_member_id || !emoji) {
    return NextResponse.json({ error: "to_member_id, emoji 필요" }, { status: 400 });
  }

  const sb = getSupabase();
  const { weekStart } = getActiveWeekBounds();
  const weekIso = weekStart.toISOString();

  await sb
    .from("reactions")
    .delete()
    .eq("from_member_id", session.sub)
    .eq("to_member_id", to_member_id)
    .eq("week_start", weekIso)
    .eq("emoji", emoji);

  return NextResponse.json({ ok: true });
}
