import { NextResponse } from "next/server";
import { WORKOUT_PHOTO_PREFIX } from "@/lib/constants";
import { requireSession } from "@/lib/auth/require-session";
import { storagePublicUrl } from "@/lib/supabase";

/**
 * 레거시 로컬 업로드 경로를 Supabase Storage 공개 URL로 리다이렉트
 * /api/uploads/workout-photos/... → Supabase Storage URL
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { path: segments } = await ctx.params;
  if (!segments?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rel = segments.join("/");
  if (rel.includes("..") || !rel.startsWith(`${WORKOUT_PHOTO_PREFIX}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Supabase Storage 공개 URL로 리다이렉트
  const publicUrl = storagePublicUrl(rel);
  return NextResponse.redirect(publicUrl, { status: 302 });
}
