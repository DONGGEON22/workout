import { NextResponse } from "next/server";
import {
  formatZodFieldErrors,
  loginBodySchema,
} from "@/lib/auth/credentials";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = loginBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { displayName, password } = parsed.data;
  const sb = getSupabase();

  const { data: member } = await sb
    .from("members")
    .select("id, display_name, password_hash")
    .eq("display_name", displayName)
    .single();

  if (!member) {
    return NextResponse.json(
      { error: "이름 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const ok = await verifyPassword(password, member.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "이름 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const token = await signSession({
    sub: member.id,
    name: member.display_name,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    member: { id: member.id, displayName: member.display_name },
  });
}
