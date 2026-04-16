"use client";

import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activeWeekKeyToDayIndex,
  buildSeoulMonthGrid,
  seoulDateKeyFromInstant,
} from "@/lib/seoul-month-grid";
import { useToast, ToastContainer } from "@/components/Toast";

const SEOUL = "Asia/Seoul";
const WEEK_HEADERS = ["토", "일", "월", "화", "수", "목", "금"] as const;

const WORKOUT_TYPES = ["헬스", "러닝", "수영", "자전거", "요가", "클라이밍", "홈트", "기타"] as const;
const WORKOUT_EMOJI: Record<string, string> = {
  헬스: "🏋️", 러닝: "🏃", 수영: "🏊", 자전거: "🚴",
  요가: "🧘", 클라이밍: "🧗", 홈트: "💪", 기타: "⚡",
};

type DayCompletion = {
  id: string;
  dayIndex: number;
  photoUrl: string | null;
  transferred: boolean;
  workoutType: string | null;
  createdAt: string;
};

type MemberRow = {
  id: string;
  displayName: string;
  completionCount: number;
  metGoal: boolean;
  days: DayCompletion[];
};

type WeekPayload = {
  weekStart: string;
  weekEnd: string;
  goalPerWeek: number;
  currentMemberId: string;
  members: MemberRow[];
};

/** weekEnd는 다음 토 0시(배타)이므로 1ms 빼서 금요일 밤으로 표시 */
function formatDeadline(weekEnd: string) {
  const t = new Date(weekEnd).getTime() - 1;
  return new Date(t).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

async function celebrate() {
  const { default: confetti } = await import("canvas-confetti");
  const z = 3000;
  void confetti({ particleCount: 100, spread: 70, origin: { y: 0.72 }, zIndex: z });
  void confetti({ particleCount: 45, angle: 60, spread: 55, origin: { x: 0, y: 0.68 }, zIndex: z });
  void confetti({ particleCount: 45, angle: 120, spread: 55, origin: { x: 1, y: 0.68 }, zIndex: z });
}

/** 로딩 스피너 */
function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function CheckClient() {
  const router = useRouter();
  const { toasts, showToast } = useToast();
  const [week, setWeek] = useState<WeekPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewYm, setViewYm] = useState<{ y: number; m: number } | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ dayIndex: number } | null>(null);
  const [photoSheet, setPhotoSheet] = useState<{ dayIndex: number } | null>(null);
  const [workoutSheet, setWorkoutSheet] = useState<{ dayIndex: number } | null>(null);
  const galleryInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const loadWeek = useCallback(async () => {
    try {
      const res = await fetch("/api/week/current", { cache: "no-store" });
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : `서버 오류 (${res.status})`);
        return;
      }
      setLoadError(null);
      setWeek(data as WeekPayload);
    } catch {
      setLoadError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
  }, [router]);

  useEffect(() => {
    const t = window.setTimeout(() => { void loadWeek(); }, 0);
    return () => window.clearTimeout(t);
  }, [loadWeek]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void loadWeek(); };
    const id = window.setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [loadWeek]);

  useEffect(() => {
    const boot = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => { window.clearTimeout(boot); window.clearInterval(id); };
  }, []);

  const weekStartIso = week?.weekStart;

  useEffect(() => {
    if (!weekStartIso) return;
    const ws = new TZDate(weekStartIso, SEOUL);
    setViewYm({ y: ws.getFullYear(), m: ws.getMonth() + 1 });
  }, [weekStartIso]);

  // nowMs === 0이면 아직 초기화 안 됨 → 로딩 완료 후 실제 weekEnd와 비교
  const editable =
    nowMs === 0 ? false : !week || nowMs < new Date(week.weekEnd).getTime();

  const me = useMemo(() => {
    if (!week) return null;
    return week.members.find((m) => m.id === week.currentMemberId) ?? null;
  }, [week]);

  const keyToDayIndex = useMemo(() => {
    if (!weekStartIso) return new Map<string, number>();
    return activeWeekKeyToDayIndex(weekStartIso);
  }, [weekStartIso]);

  const todayKey = useMemo(() => {
    if (nowMs === 0) return "";
    return seoulDateKeyFromInstant(new Date(nowMs));
  }, [nowMs]);

  const monthCells = useMemo(() => {
    if (!viewYm) return [];
    return buildSeoulMonthGrid(viewYm.y, viewYm.m);
  }, [viewYm]);

  async function doDelete(dayIndex: number) {
    if (!week || !me) return;
    setBusy(true);
    try {
      const res = await fetch("/api/week/complete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_index: dayIndex }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "취소 실패", "error");
        return;
      }
      showToast("기록을 취소했습니다.", "info");
      await loadWeek();
    } finally {
      setBusy(false);
      setDeleteConfirm(null);
    }
  }

  async function toggleDay(dayIndex: number, has: boolean) {
    if (!week || !editable || !me) return;
    if (has) {
      // 삭제는 확인 모달로
      setDeleteConfirm({ dayIndex });
      return;
    }
    // 운동 종류 먼저 선택
    setWorkoutSheet({ dayIndex });
  }

  async function submitDayWithType(dayIndex: number, workoutType: string, file?: File) {
    if (!week || !editable || !me) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("day_index", String(dayIndex));
      fd.set("workout_type", workoutType);
      if (file) fd.set("photo", file);
      const res = await fetch("/api/week/complete", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "기록 실패", "error");
        return;
      }
      showToast(file ? "사진이 저장됐어요! 📸" : `${WORKOUT_EMOJI[workoutType] ?? "💪"} ${workoutType} 기록 완료!`, "success");
      void celebrate();
      await loadWeek();
    } finally {
      setBusy(false);
    }
  }

  async function submitDayWithPhoto(dayIndex: number, file: File) {
    if (!week || !editable || !me) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("day_index", String(dayIndex));
      fd.set("photo", file);
      const res = await fetch("/api/week/complete", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "사진 저장 실패", "error");
        return;
      }
      showToast("사진이 저장됐어요! 📸", "success");
      void celebrate();
      await loadWeek();
    } finally {
      setBusy(false);
    }
  }

  function onCellActivate(dateKey: string) {
    const dayIndex = keyToDayIndex.get(dateKey);
    if (dayIndex === undefined) {
      showToast("이번 주(토~금)에 해당하는 날만 기록할 수 있어요.", "info");
      return;
    }
    if (!editable) {
      showToast("이번 주 기록 마감 시간이 지났어요.", "info");
      return;
    }
    if (!me || busy) return;
    const hit = me.days.find((d) => d.dayIndex === dayIndex);
    // 양도된 기록은 취소 불가
    if (hit?.transferred) {
      showToast("양도한 기록은 취소할 수 없어요.", "info");
      return;
    }
    void toggleDay(dayIndex, Boolean(hit));
  }

  function shiftMonth(delta: number) {
    setViewYm((c) => {
      if (!c) return c;
      let y = c.y;
      let m = c.m + delta;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1) { m = 12; y -= 1; }
      return { y, m };
    });
  }

  if (loadError && !week) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <p className="text-center text-sm tracking-wide text-red-500">{loadError}</p>
        <button
          type="button"
          className="mt-6 text-center text-sm tracking-wide text-indigo-600 underline decoration-indigo-200 underline-offset-4"
          onClick={() => void loadWeek()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!week || !me || !viewYm || nowMs === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-sm tracking-wide text-stone-400">불러오는 중…</p>
      </div>
    );
  }

  const goal = week.goalPerWeek;
  const title = `${viewYm.y}년 ${viewYm.m}월`;
  const weekStartTz = new TZDate(week.weekStart, SEOUL);
  const weekStartLabel = weekStartTz.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });
  const weekEndTz = addDays(weekStartTz, 6);
  const weekEndLabel = weekEndTz.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white px-6 py-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-semibold text-stone-900">기록을 취소할까요?</p>
            <p className="mt-1 text-center text-sm text-stone-500">해당 날짜의 운동 기록이 삭제돼요.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-xl bg-stone-100 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-200"
              >
                아니요
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doDelete(deleteConfirm.dayIndex)}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 운동 종류 선택 시트 */}
      {workoutSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setWorkoutSheet(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white pb-10 pt-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />
            <p className="mb-4 text-center text-sm font-semibold text-stone-700">오늘 뭐 했어요?</p>
            <div className="grid grid-cols-4 gap-2 px-5">
              {WORKOUT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-stone-50 px-2 py-3 text-xs font-medium text-stone-700 transition active:bg-indigo-50 active:text-indigo-700 hover:bg-stone-100 disabled:opacity-50"
                  onClick={() => {
                    const idx = workoutSheet.dayIndex;
                    setWorkoutSheet(null);
                    void submitDayWithType(idx, type);
                  }}
                >
                  <span className="text-2xl">{WORKOUT_EMOJI[type]}</span>
                  {type}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mx-5 mt-3 w-[calc(100%-2.5rem)] rounded-xl bg-stone-100 py-3 text-sm text-stone-500 transition active:bg-stone-200"
              onClick={() => setWorkoutSheet(null)}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 사진 액션시트 */}
      {photoSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setPhotoSheet(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white pb-8 pt-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />
            <p className="mb-3 text-center text-sm font-semibold text-stone-700">사진 추가</p>
            <div className="flex flex-col gap-2 px-5">
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-4 text-sm font-medium text-stone-700 transition active:bg-stone-100"
                onClick={() => {
                  galleryInputs.current[photoSheet.dayIndex]?.click();
                  setPhotoSheet(null);
                }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-lg">🖼️</span>
                앨범에서 선택
              </button>
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-4 text-sm font-medium text-stone-700 transition active:bg-stone-100"
                onClick={() => {
                  cameraInputs.current[photoSheet.dayIndex]?.click();
                  setPhotoSheet(null);
                }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-lg">📷</span>
                카메라로 찍기
              </button>
              <button
                type="button"
                className="mt-1 rounded-xl bg-stone-100 py-3.5 text-sm font-medium text-stone-500 transition active:bg-stone-200"
                onClick={() => setPhotoSheet(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md px-5 pt-6">
        <header className="mb-6">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Workout
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">운동 체크</h1>
          <p className="mt-2 text-sm leading-relaxed tracking-wide text-stone-500">
            한 주는{" "}
            <span className="font-medium text-stone-700">토요일 0시~금요일 밤(다음 토 0시 직전)</span>
            이며, 그때마다 자동으로 넘어갑니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed tracking-wide text-stone-500">
            마감 {formatDeadline(week.weekEnd)}
            {!editable ? (
              <span className="ml-1.5 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-500">기록 마감</span>
            ) : null}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold tabular-nums tracking-tight ${me.metGoal ? "text-emerald-600" : "text-indigo-600"}`}>
                {me.completionCount}
              </span>
              <span className="text-sm text-stone-400">/ {goal}회</span>
            </div>
            {me.metGoal ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-emerald-600">
                목표 달성 ✓
              </span>
            ) : (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium tracking-wide text-indigo-500">
                {goal - me.completionCount}회 남음
              </span>
            )}
            {busy && <Spinner />}
          </div>

          <p className="mt-2 text-xs tracking-wide text-stone-400">
            이번 주: {weekStartLabel} ~ {weekEndLabel} · 파란 테두리 날만 체크 가능
          </p>
        </header>

        <section className="rounded-2xl border border-stone-200/80 bg-white px-3 py-5 shadow-sm sm:px-4">
          <p className="mb-3 text-center text-sm font-semibold tracking-tight text-stone-800">
            {me.displayName}
          </p>

          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium tracking-wide text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 active:scale-95"
            >
              이전 달
            </button>
            <p className="text-center text-sm font-semibold tracking-tight text-stone-900">{title}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium tracking-wide text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 active:scale-95"
            >
              다음 달
            </button>
          </div>

          <div className="rounded-xl border border-stone-100 bg-stone-50/40 p-1">
            <div className="grid grid-cols-7 divide-x divide-stone-200/60 pb-0.5">
              {WEEK_HEADERS.map((h) => (
                <div key={h} className="py-1 text-center text-[10px] font-semibold tracking-wider text-stone-400">
                  {h}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-stone-200/60 pt-0.5">
              {monthCells.map((cell) => {
                const inActiveWeek = keyToDayIndex.has(cell.dateKey);
                const dayIndex = keyToDayIndex.get(cell.dateKey);
                const hit = dayIndex !== undefined ? me.days.find((d) => d.dayIndex === dayIndex) : undefined;
                const isTransferred = hit?.transferred === true;
                const isToday = todayKey !== "" && cell.dateKey === todayKey;
                const canTapWeek = inActiveWeek && editable && !busy;

                const baseCell =
                  "flex aspect-square min-h-[2.6rem] flex-col items-center justify-center rounded-xl text-xs font-medium tabular-nums tracking-tight transition";

                let cellClass = baseCell;
                if (!cell.inDisplayMonth) cellClass += " text-stone-300";
                else cellClass += " text-stone-600";

                if (inActiveWeek) {
                  if (isTransferred) {
                    // 양도된 날: 회색 테두리 + 취소선
                    cellClass += " border-2 border-stone-300 bg-stone-100 text-stone-400 line-through decoration-stone-300";
                    if (canTapWeek) cellClass += " cursor-pointer active:scale-[0.93]";
                  } else if (hit) {
                    cellClass += " border-2 border-indigo-600 bg-indigo-600 text-white shadow-sm cursor-pointer active:scale-[0.93]";
                  } else {
                    cellClass += " border-2 border-indigo-400 bg-indigo-50/70 text-indigo-700";
                    if (canTapWeek) cellClass += " cursor-pointer active:scale-[0.93]";
                  }
                } else {
                  cellClass += hit
                    ? " border border-stone-200 bg-stone-100 text-stone-500 line-through decoration-stone-300"
                    : " border border-transparent bg-stone-50/40 text-stone-400";
                }

                if (isToday && !(inActiveWeek && hit)) cellClass += " ring-1 ring-indigo-400 ring-offset-1";

                return (
                  <div key={cell.dateKey} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onCellActivate(cell.dateKey)}
                      className={`${cellClass} cursor-pointer`}
                      aria-label={
                        inActiveWeek
                          ? isTransferred
                            ? `${cell.m}월 ${cell.d}일 양도됨`
                            : `${cell.m}월 ${cell.d}일 ${hit ? "운동 기록 취소" : "운동 완료 기록"}`
                          : `${cell.m}월 ${cell.d}일`
                      }
                    >
                      {/* 운동 이모지 or 날짜 */}
                      {hit && !isTransferred && hit.workoutType ? (
                        <span className="text-base leading-none">{WORKOUT_EMOJI[hit.workoutType] ?? "💪"}</span>
                      ) : (
                        <span>{cell.d}</span>
                      )}
                      {isTransferred ? (
                        <span className="mt-0.5 text-[8px] leading-none text-stone-400">양도</span>
                      ) : hit && !isTransferred && hit.workoutType ? (
                        <span className="text-[8px] leading-none text-indigo-200">{cell.d}</span>
                      ) : inActiveWeek && hit?.photoUrl ? (
                        <span className="mt-0.5 h-1 w-1 rounded-full bg-sky-300" title="사진 있음" />
                      ) : (
                        <span className="h-1" />
                      )}
                    </button>

                    {/* 사진/+사진 버튼 — 액션시트로 앨범·카메라 선택 */}
                    {inActiveWeek && dayIndex !== undefined && canTapWeek && (hit && !isTransferred || !hit) ? (
                      <>
                        {/* 앨범 선택 input */}
                        <input
                          ref={(el) => { galleryInputs.current[dayIndex] = el; }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void submitDayWithPhoto(dayIndex, f);
                          }}
                        />
                        {/* 카메라 input */}
                        <input
                          ref={(el) => { cameraInputs.current[dayIndex] = el; }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void submitDayWithPhoto(dayIndex, f);
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="min-h-[2rem] w-full text-center text-[10px] font-medium tracking-wide text-indigo-500 underline decoration-indigo-200 underline-offset-2 disabled:opacity-40"
                          onClick={() => setPhotoSheet({ dayIndex })}
                        >
                          {hit ? "사진" : "+사진"}
                        </button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {!editable ? (
            <p className="mt-5 text-center text-xs tracking-wide text-stone-400">
              이번 주 기록이 마감되었습니다.
            </p>
          ) : (
            <p className="mt-5 text-center text-xs leading-relaxed tracking-wide text-stone-400">
              파란 테두리 칸을 눌러 기록하세요. 이미 체크된 날을 누르면 취소 확인창이 나타나요.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
