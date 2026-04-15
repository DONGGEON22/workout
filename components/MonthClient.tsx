"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
const WEEK_HEADERS = ["토", "일", "월", "화", "수", "목", "금"] as const;

type MemberMonth = {
  id: string;
  displayName: string;
  totalInMonth: number;
  dayKeys: string[];
  rank: number;
};

type MonthPayload = {
  year: number;
  month: number;
  daysInMonth: number;
  startWeekday: number;
  currentMemberId: string;
  members: MemberMonth[];
};

type LedgerItem = {
  id: string;
  displayName: string;
  coffeeCount: number;
  isMe: boolean;
};

type LedgerPayload = {
  ledger: LedgerItem[];
  totalWeeks: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKey(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function seoulYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  return { y, m };
}

function rankBadgeClass(rank: number) {
  if (rank === 1) return "bg-amber-400 text-amber-900";
  if (rank === 2) return "bg-stone-300 text-stone-700";
  if (rank === 3) return "bg-amber-700/75 text-amber-50";
  return "bg-stone-100 text-stone-500";
}

export default function MonthClient() {
  const router = useRouter();
  const [data, setData] = useState<MonthPayload | null>(null);
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => seoulYearMonth());

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/month/summary?year=${cursor.y}&month=${cursor.m}`,
          { cache: "no-store", signal: ac.signal },
        );
        if (res.status === 401) { router.replace("/login"); return; }
        const json = (await res.json()) as unknown;
        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : "불러오기 실패";
          setError(msg);
          return;
        }
        setError(null);
        setData(json as MonthPayload);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("불러오기 실패");
      }
    })();
    return () => ac.abort();
  }, [cursor.y, cursor.m, router]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/coffee/ledger", { cache: "no-store", signal: ac.signal });
        if (!res.ok) return;
        setLedger(await res.json() as LedgerPayload);
      } catch {}
    })();
    return () => ac.abort();
  }, []);

  const me = useMemo(() => {
    if (!data) return null;
    return data.members.find((x) => x.id === data.currentMemberId) ?? null;
  }, [data]);

  const mySet = useMemo(() => new Set(me?.dayKeys ?? []), [me]);

  const gridCells = useMemo(() => {
    if (!data) return [];
    const { daysInMonth, startWeekday } = data;
    const cells: Array<{ type: "empty" } | { type: "day"; d: number }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ type: "empty" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ type: "day", d });
    while (cells.length % 7 !== 0) cells.push({ type: "empty" });
    return cells;
  }, [data]);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      let y = c.y;
      let m = c.m + delta;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1) { m = 12; y -= 1; }
      return { y, m };
    });
  }

  if (error && !data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <p className="text-center text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-wide text-stone-400">불러오는 중</p>
      </div>
    );
  }

  const title = `${data.year}년 ${data.month}월`;

  return (
    <div className="mx-auto max-w-md px-5 pt-6 pb-8">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
          Workout
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">월간 정산</h1>
        <p className="mt-2 text-sm tracking-wide text-stone-500">서울 기준 달력 · 운동한 날은 진하게 표시됩니다.</p>
      </header>

      {/* 월 네비게이션 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => shiftMonth(-1)}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-50">
          이전 달
        </button>
        <p className="text-center text-base font-semibold tracking-tight text-stone-900">{title}</p>
        <button type="button" onClick={() => shiftMonth(1)}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-50">
          다음 달
        </button>
      </div>

      {/* 내 달력 */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">내 달력</h2>
        <div className="rounded-xl border border-stone-100 bg-stone-50/40 p-1">
          <div className="grid grid-cols-7 divide-x divide-stone-200/60 pb-0.5">
            {WEEK_HEADERS.map((h) => (
              <div key={h} className="py-1.5 text-center text-[10px] font-semibold tracking-wider text-stone-400">{h}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-stone-200/60 pt-0.5">
            {gridCells.map((cell, i) => {
              if (cell.type === "empty") return <div key={`e-${i}`} className="aspect-square min-h-[2.5rem]" />;
              const key = dayKey(data.year, data.month, cell.d);
              const on = mySet.has(key);
              return (
                <div key={key} className={`flex aspect-square min-h-[2.5rem] items-center justify-center rounded-xl text-sm font-medium tabular-nums tracking-tight ${on ? "bg-indigo-600 text-white shadow-sm" : "bg-stone-50 text-stone-500"}`}>
                  {cell.d}
                </div>
              );
            })}
          </div>
        </div>
        {me ? (
          <p className="mt-4 text-center text-sm tracking-wide text-stone-600">
            이번 달 <span className="font-bold tabular-nums text-indigo-600">{me.totalInMonth}</span>
            <span className="text-stone-500">회 운동</span>
          </p>
        ) : null}
      </section>

      {/* 월간 순위 */}
      <section className="mt-6 rounded-2xl border border-stone-200/80 bg-white px-4 py-5 shadow-sm">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">월간 순위</h2>
        <p className="mt-1 text-xs text-stone-400">같은 횟수는 같은 순위</p>
        <ol className="mt-4 space-y-2.5">
          {data.members.map((m) => (
            <li key={m.id}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${m.id === data.currentMemberId ? "border border-indigo-100 bg-indigo-50/60" : "border border-stone-100 bg-stone-50/50"}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${rankBadgeClass(m.rank)}`}>
                  {m.rank}
                </span>
                <span className="text-sm font-medium tracking-tight text-stone-900">
                  {m.displayName}
                  {m.id === data.currentMemberId ? (
                    <span className="ml-1.5 rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">나</span>
                  ) : null}
                </span>
              </div>
              <span className={`tabular-nums text-sm font-bold ${m.rank === 1 ? "text-amber-600" : "text-stone-700"}`}>
                {m.totalInMonth}회
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ☕ 커피 누적 장부 */}
      {ledger && (
        <section className="mt-6 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50/50 px-4 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">☕</span>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-800/80">커피 누적 장부</h2>
          </div>
          <p className="mb-4 text-xs text-amber-700/70">총 {ledger.totalWeeks}주 기준 · 목표 미달 시 커피 1회</p>
          <ol className="space-y-2">
            {ledger.ledger.map((item, idx) => (
              <li key={item.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${item.isMe ? "bg-amber-100/80 ring-1 ring-amber-300/60" : "bg-white/70"}`}>
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs font-bold text-amber-700/60 tabular-nums">{idx + 1}</span>
                  <span className="text-sm font-medium text-stone-800">
                    {item.displayName}
                    {item.isMe ? <span className="ml-1.5 text-[10px] font-semibold text-amber-700">나</span> : null}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: Math.min(item.coffeeCount, 5) }).map((_, i) => (
                    <span key={i} className="text-sm">☕</span>
                  ))}
                  {item.coffeeCount > 5 ? <span className="text-xs text-amber-700">+{item.coffeeCount - 5}</span> : null}
                  <span className="ml-1 tabular-nums text-sm font-bold text-amber-800">{item.coffeeCount}회</span>
                </div>
              </li>
            ))}
          </ol>
          {ledger.ledger.every((x) => x.coffeeCount === 0) && (
            <p className="mt-3 text-center text-xs text-amber-600">아직 커피 기록이 없어요 🎉</p>
          )}
        </section>
      )}
    </div>
  );
}
