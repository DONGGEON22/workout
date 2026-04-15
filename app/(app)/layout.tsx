import Image from "next/image";
import MainTabBar from "@/components/MainTabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      {/* 상단 로고 헤더 */}
      <header className="flex h-14 w-full items-center border-b border-stone-100 bg-white px-5">
        <div className="relative h-8 w-44">
          <Image
            src="/brand-accent.png"
            alt="숭실대학교 Soongsil University"
            fill
            sizes="176px"
            className="object-contain object-left"
            priority
            unoptimized
          />
        </div>
      </header>
      {children}
      <MainTabBar />
    </div>
  );
}
