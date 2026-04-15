"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, password }),
      });
      const raw = await res.text();
      let data: { error?: unknown } = {};
      try {
        data = raw ? (JSON.parse(raw) as { error?: unknown }) : {};
      } catch {
        setError("서버 응답을 처리하지 못했습니다.");
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "가입에 실패했습니다.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16" />
          <circle cx="4" cy="6.5" r="1.5" fill="white" stroke="none" />
          <circle cx="20" cy="6.5" r="1.5" fill="white" stroke="none" />
          <circle cx="4" cy="17.5" r="1.5" fill="white" stroke="none" />
          <circle cx="20" cy="17.5" r="1.5" fill="white" stroke="none" />
        </svg>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">Workout</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-stone-900">가입</h1>
      <p className="mt-1.5 text-sm text-stone-500">모임에서 쓸 이름만 정하면 됩니다.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-semibold tracking-wide text-stone-500">
            이름 (2글자 이상)
          </label>
          <input
            id="name"
            name="displayName"
            autoComplete="nickname"
            placeholder="홍길동"
            className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-stone-900 outline-none ring-indigo-500/20 transition focus:border-indigo-300 focus:ring-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            maxLength={32}
          />
        </div>
        <div>
          <label htmlFor="pw" className="mb-1.5 block text-xs font-semibold tracking-wide text-stone-500">
            비밀번호 (숫자 4자리)
          </label>
          <input
            id="pw"
            name="password"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            placeholder="••••"
            className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 tracking-[0.35em] text-stone-900 outline-none ring-indigo-500/20 transition focus:border-indigo-300 focus:ring-2"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-indigo-600 text-sm font-semibold tracking-wide text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? "잠시만요…" : "가입하고 시작"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-stone-500">
        계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-4">
          로그인
        </Link>
      </p>
    </div>
  );
}
