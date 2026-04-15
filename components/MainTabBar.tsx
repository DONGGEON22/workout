"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function MonthIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const tabs = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/check", label: "체크", Icon: CheckIcon },
  { href: "/month", label: "월간", Icon: MonthIcon },
] as const;

export default function MainTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-stone-200/80 bg-white/95 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="메인 메뉴"
    >
      <div className="mx-auto flex max-w-md justify-around px-2">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname === ""
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-12 min-w-[5rem] flex-col items-center justify-center gap-1 rounded-xl px-4 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                active ? "text-indigo-600" : "text-stone-400 hover:text-stone-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
