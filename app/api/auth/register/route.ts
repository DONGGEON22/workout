import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  formatZodFieldErrors,
  registerBodySchema,
} from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { getSupabase, isUniqueError } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = registerBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodFieldErrors(parsed.error) },
        { status: 400 },
      );
    }

    const { displayName, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    const id = randomUUID();

    const sb = getSupabase();
    const { error } = await sb
      .from("members")
      .insert({ id, display_name: displayName, password_hash: passwordHash });

    if (error) {
      if (isUniqueError(error)) {
        return NextResponse.json(
          { error: "이미 사용 중인 이름입니다." },
          { status: 409 },
        );
      }
      throw error;
    }

    const token = await signSession({ sub: id, name: displayName });
    await setSessionCookie(token);

    return NextResponse.json({ member: { id, displayName } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[register] unhandled", e);
    if (
      message.includes("환경 변수") ||
      message.includes("SESSION_SECRET") ||
      message.includes("CRON_SECRET")
    ) {
      return NextResponse.json(
        { error: `환경 설정: ${message}` },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? `가입 처리 오류: ${message}`
            : "가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}
