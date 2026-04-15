"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}

let _id = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function showToast(msg: string, type: ToastType = "info") {
    const id = ++_id;
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id));
    }, 3000);
  }

  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="pointer-events-none fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 마운트 직후 fade-in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const bg =
    toast.type === "error"
      ? "bg-red-500"
      : toast.type === "success"
        ? "bg-emerald-500"
        : "bg-stone-800";

  return (
    <div
      className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-xl transition-all duration-300 ${bg} ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {toast.msg}
    </div>
  );
}
