"use client";

import { useEffect } from "react";
import type { MonopolyAchievement } from "@/types/game";
import { playSE } from "@/lib/audio/soundManager";

interface MonopolyToastProps {
  achievement: MonopolyAchievement;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3200;

/** 物件購入によって独占(グループ/地域)を達成した瞬間、画面上部に一瞬だけ出す軽量な通知。
 *  ArrivalModal等の全画面モーダルとは違い操作をブロックせず、AUTO_DISMISS_MS後に自動で消える。
 *  キャラクター演出(CharacterAnnouncer)は使わない、独立した小さなコンポーネント。 */
export function MonopolyToast({ achievement, onDismiss }: MonopolyToastProps) {
  useEffect(() => {
    playSE("monopoly_group");
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement]);

  const isRegion = achievement.kind === "region";
  const title = isRegion ? `🎉 ${achievement.name}エリアを完全独占!` : `🎉 ${achievement.name}を独占!`;
  const subtitle = `物件収益が${achievement.multiplier}倍になりました!`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
      <div
        className={`animate-arrival-pop pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl border-b-4 px-4 py-3 shadow-xl ${
          isRegion
            ? "border-sky-500 bg-sky-500 text-white"
            : "border-amber-500 bg-amber-400 text-slate-900"
        }`}
        onClick={onDismiss}
        role="status"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{title}</p>
          <p className="truncate text-xs font-bold opacity-90">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
