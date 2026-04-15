import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  WORKOUT_GOAL_PER_WEEK,
  WORKOUT_PHOTO_PREFIX,
} from "@/lib/constants";
import { requireSession } from "@/lib/auth/require-session";
import { weekIsoToFileSlug, extForMime } from "@/lib/db";
import { getActiveWeekBounds, isWeekEditable } from "@/lib/week";
import { sendPushToMembers } from "@/lib/push";
import { getSupabase, storagePublicUrl } from "@/lib/supabase";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const now = new Date();
  const { weekStart } = getActiveWeekBounds();
  if (!isWeekEditable(now, weekStart)) {
    return NextResponse.json(
      { error: "이번 주 기록 마감 후에는 수정할 수 없습니다." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const dayRaw = form.get("day_index");
  const dayIndex = typeof dayRaw === "string" ? Number(dayRaw) : NaN;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return NextResponse.json({ error: "요일 인덱스가 올바르지 않습니다." }, { status: 400 });
  }

  const file = form.get("photo");
  const sb = getSupabase();
  const weekIso = weekStart.toISOString();

  const { data: existingRows } = await sb
    .from("workout_completions")
    .select("id, day_index, photo_path")
    .eq("member_id", session.sub)
    .eq("week_start", weekIso);

  const rows = existingRows ?? [];
  const existingForDay = rows.find((r) => r.day_index === dayIndex);
  const count = rows.length;

  if (!existingForDay && count >= WORKOUT_GOAL_PER_WEEK) {
    return NextResponse.json(
      { error: `이번 주는 최대 ${WORKOUT_GOAL_PER_WEEK}회까지만 기록할 수 있습니다.` },
      { status: 400 },
    );
  }

  let photoPath: string | null = existingForDay?.photo_path ?? null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "사진은 5MB 이하만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "JPEG, PNG, WebP, GIF만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    const ext = extForMime(mime);
    const weekSlug = weekIsoToFileSlug(weekIso);
    const storagePath = `${WORKOUT_PHOTO_PREFIX}/${session.sub}/${weekSlug}/${dayIndex}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await sb.storage
      .from("workout-photos")
      .upload(storagePath, buf, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) {
      console.error("[photo upload]", uploadError);
      return NextResponse.json({ error: "사진 업로드에 실패했습니다." }, { status: 500 });
    }

    // 기존 다른 경로 사진 삭제
    if (photoPath && photoPath !== storagePath && photoPath.startsWith(`${WORKOUT_PHOTO_PREFIX}/`)) {
      await sb.storage.from("workout-photos").remove([photoPath]);
    }

    photoPath = storagePath;
  }

  if (existingForDay) {
    await sb
      .from("workout_completions")
      .update({ photo_path: photoPath })
      .eq("id", existingForDay.id);
    return NextResponse.json({
      ok: true,
      id: existingForDay.id,
      photoPath,
      photoUrl: photoPath ? storagePublicUrl(photoPath) : null,
    });
  }

  const newId = randomUUID();
  const { error: insertError } = await sb.from("workout_completions").insert({
    id: newId,
    member_id: session.sub,
    week_start: weekIso,
    day_index: dayIndex,
    photo_path: photoPath,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "이미 해당 요일에 기록이 있습니다." },
        { status: 409 },
      );
    }
    console.error("[complete insert]", insertError);
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  const newCount = count + 1;

  // 목표 달성 시 팀원 전체에게 푸시
  if (newCount >= WORKOUT_GOAL_PER_WEEK) {
    const { data: me } = await sb
      .from("members")
      .select("display_name")
      .eq("id", session.sub)
      .single();

    const { data: allMembers } = await sb
      .from("members")
      .select("id")
      .neq("id", session.sub);

    void sendPushToMembers(
      (allMembers ?? []).map((m) => m.id),
      {
        title: "팀원 목표 달성! 🎉",
        body: `${me?.display_name ?? "팀원"}님이 이번 주 목표를 달성했어요!`,
        tag: "goal-achieved",
      },
    );
  }

  return NextResponse.json({
    ok: true,
    id: newId,
    photoPath,
    photoUrl: photoPath ? storagePublicUrl(photoPath) : null,
  });
}

const deleteSchema = z.object({
  day_index: z.number().int().min(0).max(6),
});

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const now = new Date();
  const { weekStart } = getActiveWeekBounds();
  if (!isWeekEditable(now, weekStart)) {
    return NextResponse.json(
      { error: "이번 주 기록 마감 후에는 수정할 수 없습니다." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
  }

  const sb = getSupabase();
  const weekIso = weekStart.toISOString();

  const { data: row } = await sb
    .from("workout_completions")
    .select("id, photo_path")
    .eq("member_id", session.sub)
    .eq("week_start", weekIso)
    .eq("day_index", parsed.data.day_index)
    .single();

  if (!row) {
    return NextResponse.json({ error: "삭제할 기록이 없습니다." }, { status: 404 });
  }

  await sb.from("workout_completions").delete().eq("id", row.id);

  // Supabase Storage 사진 삭제
  if (row.photo_path && row.photo_path.startsWith(`${WORKOUT_PHOTO_PREFIX}/`)) {
    await sb.storage.from("workout-photos").remove([row.photo_path]);
  }

  return NextResponse.json({ ok: true });
}
