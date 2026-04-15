import { NextResponse } from "next/server";
import { getSessionFromCookies, type SessionPayload } from "@/lib/auth/session";

export async function requireSession(): Promise<
  SessionPayload | NextResponse
> {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return session;
}
