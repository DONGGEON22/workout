import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("endpoint" in body) ||
    !("keys" in body) ||
    typeof (body as { endpoint: unknown }).endpoint !== "string"
  ) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const { endpoint, keys } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "keys 정보가 누락되었습니다." }, { status: 400 });
  }

  const sb = getSupabase();

  // 기존 구독 모두 삭제 후 새로 저장 (중복 방지)
  await sb.from("push_subscriptions").delete().eq("member_id", session.sub);

  const { error } = await sb.from("push_subscriptions").insert({
    id: randomUUID(),
    member_id: session.sub,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  if (error) {
    console.error("[push subscribe]", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

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

  const endpoint = (body as { endpoint?: string })?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint 누락" }, { status: 400 });

  const sb = getSupabase();
  await sb
    .from("push_subscriptions")
    .delete()
    .eq("member_id", session.sub)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
