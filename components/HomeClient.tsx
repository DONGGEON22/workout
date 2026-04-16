"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildWeekDayCells } from "@/lib/calendar-display";
import { useToast, ToastContainer } from "@/components/Toast";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

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

type ReactionItem = { emoji: string; count: number; iMine: boolean };

type MemberRow = {
  id: string;
  displayName: string;
  completionCount: number;
  metGoal: boolean;
  streak: number;
  days: DayCompletion[];
  reactions: ReactionItem[];
};

type TransferRow = {
  from_member_id: string;
  to_member_id: string;
  from_name: string;
  to_name: string;
  created_at: string;
};

type WeekPayload = {
  weekStart: string;
  weekEnd: string;
  goalPerWeek: number;
  currentMemberId: string;
  members: MemberRow[];
  transfers: TransferRow[];
};

type NoticeItem = {
  weekStart: string;
  coffeeLine: string;
  missedMembers: { displayName: string; completionCount: number }[];
};

const THUMBS = "👍";

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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`animate-spin text-current ${small ? "h-3.5 w-3.5" : "h-5 w-5 text-indigo-400"}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function FloatEffect({ emoji, id, onDone }: { emoji: string; id: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      key={id}
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden
    >
      <span className="text-5xl" style={{ animation: "floatUp 1.2s ease-out forwards" }}>
        {emoji}
      </span>
    </div>
  );
}

function TransferReceiveEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3" aria-hidden>
      <span className="text-6xl" style={{ animation: "floatUp 2s ease-out forwards" }}>💝</span>
      <span
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        style={{ animation: "fadeInOut 2s ease-out forwards" }}
      >
        운동 1회 양도 받음!
      </span>
    </div>
  );
}

const FEEDBACK_TYPES = ["기능 요청", "버그 신고", "UI 개선", "기타"] as const;

export default function HomeClient() {
  const router = useRouter();
  const { toasts, showToast } = useToast();
  const [week, setWeek] = useState<WeekPayload | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<string>("기능 요청");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [floatEffects, setFloatEffects] = useState<Array<{ emoji: string; id: number }>>([]);
  const [showTransferEffect, setShowTransferEffect] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const effectId = useRef(0);
  const prevTransferCount = useRef<number | null>(null);
  const reactionSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWeek = useCallback(async () => {
    try {
    const res = await fetch("/api/week/current", { cache: "no-store" });
    if (res.status === 401) { router.replace("/login"); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setLoadError(typeof data.error === "string" ? data.error : `서버 오류 (${res.status})`); return; }
    setLoadError(null);
    setWeek((prev) => {
      if (prev && data.transfers) {
        const myId = data.currentMemberId;
        const newCount = data.transfers.filter((t: TransferRow) => t.to_member_id === myId).length;
        if (prevTransferCount.current !== null && newCount > prevTransferCount.current) {
          setShowTransferEffect(true);
        }
        prevTransferCount.current = newCount;
      }
      return data as WeekPayload;
    });
    } catch {
      setLoadError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
  }, [router]);

  const loadNotices = useCallback(async () => {
    const res = await fetch("/api/notices", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setNotices((data.items ?? []) as NoticeItem[]);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void loadWeek(); void loadNotices(); }, 0);
    return () => window.clearTimeout(t);
  }, [loadWeek, loadNotices]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void loadWeek(); };
    const id = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [loadWeek]);

  useEffect(() => {
    const boot = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => { window.clearTimeout(boot); window.clearInterval(id); };
  }, []);

  useEffect(() => {
    async function initPush() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      try {
        // sw-push.js를 명시적으로 등록 (push 핸들러 전용)
        await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
      } catch {}
    }
    void initPush();
  }, []);

  useEffect(() => {
    if (localStorage.getItem("install_dismissed")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = "standalone" in window && (window.navigator as Navigator & { standalone?: boolean }).standalone;
    if (isIos && !isStandalone) {
      setShowInstallBanner(true);
    }

    const installedHandler = () => setShowInstallBanner(false);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  async function togglePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      showToast("이 브라우저는 푸시 알림을 지원하지 않아요.", "error");
      return;
    }
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        showToast("알림을 껐습니다.", "info");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          showToast("알림 권한이 필요합니다.", "error");
          return;
        }
        const keyRes = await fetch("/api/push/vapid-public-key");
        if (!keyRes.ok) { showToast("서버 설정 오류", "error"); return; }
        const { key } = await keyRes.json();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        setPushEnabled(true);
        showToast("🔔 알림이 켜졌어요!", "success");
      }
    } catch (e) {
      console.error("[push toggle]", e);
      showToast("알림 설정에 실패했습니다.", "error");
    } finally {
      setPushLoading(false);
    }
  }

  function sendReaction(toMemberId: string) {
    // 낙관적 업데이트 — 즉시 카운트 +1
    setWeek((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) => {
          if (m.id !== toMemberId) return m;
          const existing = m.reactions.find((r) => r.emoji === THUMBS);
          return {
            ...m,
            reactions: existing
              ? m.reactions.map((r) => r.emoji === THUMBS ? { ...r, count: r.count + 1, iMine: true } : r)
              : [...m.reactions, { emoji: THUMBS, count: 1, iMine: true }],
          };
        }),
      };
    });

    // float 이펙트
    const id = ++effectId.current;
    setFloatEffects((p) => [...p, { emoji: THUMBS, id }]);

    // API 호출 (fire-and-forget)
    void fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_member_id: toMemberId, emoji: THUMBS }),
    });

    // 마지막 탭 후 1.5초 뒤 한 번만 서버 동기화 (연속 탭 중엔 동기화 안 함)
    if (reactionSyncTimer.current) clearTimeout(reactionSyncTimer.current);
    reactionSyncTimer.current = setTimeout(() => void loadWeek(), 1500);
  }

  async function doTransfer(toMemberId: string) {
    if (transferBusy) return;
    const target = week?.members.find((m) => m.id === toMemberId);
    if (!target) return;
    setTransferBusy(true);
    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_member_id: toMemberId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "양도 실패", "error");
        return;
      }
      showToast(`${target.displayName}님에게 1회 양도했어요! 💝`, "success");
      const id = ++effectId.current;
      setFloatEffects((p) => [...p, { emoji: "💝", id }]);
      await loadWeek();
    } finally {
      setTransferBusy(false);
      setTransferTarget(null);
    }
  }

  async function submitFeedback() {
    if (!feedbackContent.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    setFeedbackBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feedbackType, content: feedbackContent }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "전송 실패", "error"); return; }
      showToast("소중한 의견 감사합니다! 🙏", "success");
      setShowFeedback(false);
      setFeedbackContent("");
      setFeedbackType("기능 요청");
    } finally {
      setFeedbackBusy(false);
    }
  }

  const editable = nowMs === 0 ? false : !week || nowMs < new Date(week.weekEnd).getTime();
  const dayCells = useMemo(() => (week ? buildWeekDayCells(week.weekStart) : []), [week]);

  const sortedMembers = useMemo(() => {
    if (!week) return [];
    const { currentMemberId, members } = week;
    const rest = members
      .filter((m) => m.id !== currentMemberId)
      .sort((a, b) => b.completionCount - a.completionCount || a.displayName.localeCompare(b.displayName, "ko"));
    const me = members.find((m) => m.id === currentMemberId);
    return me ? [me, ...rest] : rest;
  }, [week]);

  const me = useMemo(() => week?.members.find((m) => m.id === week.currentMemberId), [week]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (loadError && !week) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <p className="text-center text-sm text-red-500">{loadError}</p>
        <button type="button" className="mt-6 text-center text-sm text-indigo-600 underline underline-offset-4" onClick={() => void loadWeek()}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!week || nowMs === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-sm tracking-wide text-stone-400">불러오는 중…</p>
      </div>
    );
  }

  const topNotice = notices[0];
  const goal = week.goalPerWeek;

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* 피드백 모달 */}
      {showFeedback && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 backdrop-blur-sm sm:items-center sm:px-6"
          onClick={() => setShowFeedback(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-stone-900">의견 보내기 💬</h3>
              <button type="button" onClick={() => setShowFeedback(false)} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-stone-400">기능 요청, 버그 신고, UI 개선 아이디어를 알려주세요!</p>

            {/* 유형 선택 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {FEEDBACK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFeedbackType(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    feedbackType === t
                      ? "bg-indigo-600 text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* 내용 입력 */}
            <textarea
              value={feedbackContent}
              onChange={(e) => setFeedbackContent(e.target.value)}
              placeholder="자유롭게 의견을 남겨주세요..."
              maxLength={1000}
              rows={5}
              className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 placeholder-stone-300 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
            <p className="mt-1 text-right text-xs text-stone-300">{feedbackContent.length}/1000</p>

            <button
              type="button"
              disabled={feedbackBusy || feedbackContent.trim().length === 0}
              onClick={() => void submitFeedback()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {feedbackBusy ? <Spinner small /> : null}
              {feedbackBusy ? "전송 중…" : "보내기"}
            </button>
          </div>
        </div>
      )}

      {/* 나가기 확인 모달 */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white px-6 py-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-semibold text-stone-900">나가지마슝 명령이다.</p>
            <p className="mt-1 text-center text-sm text-stone-500">정말 로그아웃 하시겠어요?</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                무시하지않기
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutConfirm(false); void logout(); }}
                className="flex-1 rounded-xl bg-stone-100 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-200"
              >
                무시하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 라이트박스 모달 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="운동 사진"
            className="max-h-[90dvh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* PWA 홈화면 추가 배너 */}
      {showInstallBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md bg-white px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.10)]">
          <div className="flex items-center justify-between gap-3">
            {deferredPrompt ? (
              <div className="flex flex-1 items-center gap-3">
                <span className="text-sm text-stone-700">📱 홈화면에 추가하면 앱처럼 쓸 수 있어요!</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!deferredPrompt) return;
                    await deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === "accepted") setShowInstallBanner(false);
                    setDeferredPrompt(null);
                  }}
                  className="shrink-0 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                >
                  추가하기
                </button>
              </div>
            ) : (
              <p className="flex-1 text-sm text-stone-700">
                📱 Safari에서 공유 → '홈 화면에 추가'를 눌러주세요
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("install_dismissed", "1");
                setShowInstallBanner(false);
              }}
              className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
              aria-label="닫기"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* float 이펙트 */}
      {floatEffects.map((e) => (
        <FloatEffect
          key={e.id}
          emoji={e.emoji}
          id={e.id}
          onDone={() => setFloatEffects((p) => p.filter((x) => x.id !== e.id))}
        />
      ))}
      {showTransferEffect && (
        <TransferReceiveEffect onDone={() => setShowTransferEffect(false)} />
      )}

      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-120px) scale(1.5); }
        }
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(20px); }
          20%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div className="mx-auto max-w-md px-5 pt-6">
        {/* 헤더 */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Workout
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">운동 좀 하슝!</h1>
            <p className="mt-2 text-sm leading-relaxed tracking-wide text-stone-500">
              마감 {formatDeadline(week.weekEnd)}
              {!editable ? (
                <span className="ml-1.5 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-500">기록 마감</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-200 hover:text-stone-700"
              >
                💬 의견 보내기
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="rounded-full px-3 py-2 text-sm text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                나가기
              </button>
            </div>
            <button
              type="button"
              onClick={() => void togglePush()}
              disabled={pushLoading}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                pushEnabled
                  ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {pushLoading ? <Spinner small /> : null}
              {pushEnabled ? "🔔 알림 ON" : "🔕 알림 OFF"}
            </button>
          </div>
        </header>

        {/* 커피 알림 배너 */}
        {topNotice ? (
          <div className="mb-8 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 px-4 py-4">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700/80">
              <span className="text-base leading-none">☕</span>
              지난주 커피
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-950/90">{topNotice.coffeeLine || "—"}</p>
          </div>
        ) : null}

        {/* 주간 보기 (팀 현황 + 리액션 + 양도 통합) */}
        <section className="rounded-2xl border border-stone-200/80 bg-white px-3 py-5 shadow-sm sm:px-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">이번 주</h2>
            <span className="text-[11px] text-stone-400">목표 {goal}회</span>
          </div>
          <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-2 sm:p-2.5">
            <div className="space-y-5">
              {sortedMembers.map((m) => {
                const isMe = m.id === week.currentMemberId;
                const thumbsReaction = m.reactions.find((x) => x.emoji === THUMBS);
                const thumbsCount = thumbsReaction?.count ?? 0;
                const canTransfer = !isMe && editable && (me?.completionCount ?? 0) >= 2 && !m.metGoal;
                const pct = Math.min(100, (m.completionCount / goal) * 100);

                return (
                  <div
                    key={m.id}
                    className={
                      isMe
                        ? "rounded-xl bg-white px-1.5 py-2.5 shadow-sm ring-1 ring-stone-200/80"
                        : "px-1 py-1 sm:px-1.5"
                    }
                  >
                    {/* 이름 행: 이름 + 뱃지 + 👍 + 양도 + 회차 */}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium tracking-tight text-stone-800">{m.displayName}</span>
                        {isMe ? (
                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">나</span>
                        ) : null}
                        {m.streak > 0 ? (
                          <span className="flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-500">
                            🔥{m.streak}주
                          </span>
                        ) : null}

                        {/* 👍 버튼 — 타인만, 누를수록 카운트 누적 */}
                        {!isMe ? (
                          <button
                            type="button"
                            onClick={() => sendReaction(m.id)}
                            className="flex min-h-[1.75rem] items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-sm font-medium text-stone-600 transition active:scale-95 hover:bg-amber-50 hover:text-amber-600"
                          >
                            {THUMBS}
                            {thumbsCount > 0 ? (
                              <span className="text-xs tabular-nums text-stone-500">{thumbsCount}</span>
                            ) : null}
                          </button>
                        ) : null}

                        {/* 💝 양도 버튼 */}
                        {canTransfer ? (
                          transferTarget === m.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={transferBusy}
                                onClick={() => void doTransfer(m.id)}
                                className="flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {transferBusy ? <Spinner small /> : null}
                                {transferBusy ? "처리중" : "확인"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setTransferTarget(null)}
                                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500 transition hover:bg-stone-200"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setTransferTarget(m.id)}
                              className="flex min-h-[1.75rem] items-center gap-0.5 rounded-full border border-dashed border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-500 transition hover:bg-indigo-50 active:scale-95"
                            >
                              💝 양도
                            </button>
                          )
                        ) : null}
                      </div>

                      {/* 회차 */}
                      <span className={`shrink-0 text-xs tabular-nums ${m.metGoal ? "font-semibold text-emerald-600" : "text-stone-500"}`}>
                        {m.completionCount}/{goal}회{m.metGoal ? " ✓" : ""}
                      </span>
                    </div>

                    {/* 진행률 바 */}
                    <div className="mb-2 h-1 overflow-hidden rounded-full bg-stone-100 px-0.5">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${m.metGoal ? "bg-emerald-500" : "bg-indigo-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* 요일 그리드 */}
                    <div className="grid grid-cols-7 divide-x divide-stone-200/60">
                      {dayCells.map((c) => {
                        const hit = m.days.find((d) => d.dayIndex === c.dayIndex);
                        const isTransferred = hit?.transferred === true;
                        return (
                          <div key={c.dayIndex} className="flex min-w-0 flex-col items-center gap-1 px-0.5 py-0.5 first:pl-0 last:pr-0">
                            <span className="text-[10px] font-medium leading-none text-stone-400">{c.label}</span>
                            <span className={`text-center text-xs font-semibold tabular-nums leading-tight sm:text-sm ${c.isToday ? "text-stone-900" : "text-stone-500"}`}>
                              {c.dateLabel}
                            </span>
                            {c.isToday ? <span className="h-1 w-1 shrink-0 rounded-full bg-indigo-500" /> : <span className="h-1 shrink-0" />}
                            <div className={`relative mt-0.5 flex h-10 w-full max-w-[2.85rem] shrink-0 items-center justify-center rounded-lg sm:h-11 sm:max-w-[3rem] ${
                              isTransferred
                                ? "border border-stone-200 bg-stone-100"
                                : hit
                                  ? "bg-indigo-100"
                                  : "border border-stone-100 bg-stone-50"
                            }`}>
                              {isTransferred ? (
                                <span className="text-[9px] font-medium text-stone-400">양도</span>
                              ) : hit?.photoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxUrl(hit.photoUrl!)}
                                  className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-indigo-200/50"
                                  aria-label="사진 보기"
                                >
                                  {hit.workoutType ? (
                                    <span className="text-base leading-none">{WORKOUT_EMOJI[hit.workoutType] ?? "💪"}</span>
                                  ) : (
                                    <span className="text-xs font-semibold text-indigo-600">✓</span>
                                  )}
                                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
                                </button>
                              ) : hit?.workoutType ? (
                                <span className="text-xl leading-none" title={hit.workoutType}>{WORKOUT_EMOJI[hit.workoutType] ?? "💪"}</span>
                              ) : hit ? (
                                <span className="text-xs font-semibold text-indigo-600">✓</span>
                              ) : (
                                <span className="text-[10px] text-stone-300">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 양도 이력 */}
          {week.transfers.length > 0 ? (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">이번 주 양도 이력</p>
              <ul className="space-y-1">
                {week.transfers.map((t) => (
                  <li
                    key={`${t.from_member_id}-${t.to_member_id}-${t.created_at}`}
                    className="text-xs text-stone-500"
                  >
                    <span className="font-medium text-stone-700">{t.from_name}</span>
                    {" → "}
                    <span className="font-medium text-stone-700">{t.to_name}</span>
                    {" 에게 1회 양도 💝"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* 기록·커피 */}
        <section className="mt-8 pb-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">기록 · 커피</h2>
          {notices.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">주간 마감 후 여기에 기록이 쌓여요.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notices.map((n) => {
                const coffees = n.missedMembers.map((p) => ({
                  name: p.displayName,
                  cups: 3 - p.completionCount,
                })).filter((p) => p.cups > 0);
                const totalCups = coffees.reduce((sum, p) => sum + p.cups, 0);
                return (
                  <li key={n.weekStart} className="rounded-xl border border-stone-200/80 bg-white px-3 py-3 text-sm text-stone-700 shadow-sm">
                    <p className="text-[11px] text-stone-400">
                      {new Date(n.weekStart).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </p>
                    {coffees.length > 0 ? (
                      <>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {coffees.map((p) => (
                            <span
                              key={p.name}
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                            >
                              {p.name} ☕×{p.cups}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1.5 text-xs font-semibold text-amber-700">총 {totalCups}잔</p>
                      </>
                    ) : (
                      <p className="mt-0.5 leading-relaxed text-stone-500">모두 달성! ☕ 없음</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
