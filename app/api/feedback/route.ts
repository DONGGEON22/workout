import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getSupabase } from "@/lib/supabase";

const ADMIN_EMAIL = "ehdrjs14514@gmail.com";

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { type, content } = body as { type?: string; content?: string };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }
  if (content.length > 1000) {
    return NextResponse.json({ error: "1000자 이내로 입력해주세요." }, { status: 400 });
  }

  const sb = getSupabase();

  // Supabase에 저장
  await sb.from("feedback").insert({
    id: randomUUID(),
    member_id: session.sub,
    member_name: session.name,
    type: type ?? "기능 요청",
    content: content.trim(),
  });

  // 이메일 전송 (RESEND_API_KEY가 설정된 경우)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Workout App <onboarding@resend.dev>",
          to: [ADMIN_EMAIL],
          subject: `[Workout] ${type ?? "기능 요청"} — ${session.name}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#4F46E5;margin-bottom:4px">Workout 앱 피드백</h2>
              <p style="color:#6B7280;font-size:13px;margin-top:0">새로운 ${type ?? "기능 요청"}이 도착했어요.</p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0"/>
              <p style="margin:0"><strong>작성자:</strong> ${session.name}</p>
              <p style="margin:8px 0"><strong>유형:</strong> ${type ?? "기능 요청"}</p>
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0"/>
              <p style="background:#F9FAFB;padding:16px;border-radius:8px;line-height:1.6;white-space:pre-wrap">${content.trim()}</p>
              <p style="color:#9CA3AF;font-size:12px;margin-top:24px">Workout PWA — 숭실대학교</p>
            </div>
          `,
        }),
      });
    } catch (e) {
      console.error("[feedback email]", e);
      // 이메일 실패해도 저장은 성공으로 처리
    }
  }

  return NextResponse.json({ ok: true });
}
