export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center text-stone-600">
      <h1 className="text-lg font-semibold text-stone-900">오프라인</h1>
      <p className="max-w-xs text-sm leading-relaxed text-stone-500">
        연결 후 다시 열어 주세요. 기록은 온라인일 때만 맞춰집니다.
      </p>
    </div>
  );
}
