"use client";

import type { ArrivalInfo } from "@/types/game";
import { formatMoney } from "@/lib/format";

interface ArrivalModalProps {
  arrivalInfo: ArrivalInfo;
  onContinue: () => void;
}

const CONFETTI = ["🎉", "🎊", "✨", "🎉", "✨", "🎊"];

export function ArrivalModal({ arrivalInfo, onContinue }: ArrivalModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-800">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-3 text-2xl">
          {CONFETTI.map((emoji, i) => (
            <span
              key={i}
              className="animate-confetti-fall inline-block"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {emoji}
            </span>
          ))}
        </div>

        <p className="animate-arrival-pop text-4xl">🏁</p>
        <h2 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">目的地到着!</h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: arrivalInfo.playerColor }} />
          <span className="font-bold">{arrivalInfo.playerName}</span>さんが「{arrivalInfo.destinationName}」に到着!
        </p>

        <p className="mt-4 text-lg font-black text-amber-500">
          到着ボーナス +{formatMoney(arrivalInfo.bonus)}
        </p>

        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">
          <p className="text-xs text-slate-400 dark:text-slate-500">次の目的地</p>
          <p className="mt-1 text-base font-bold text-slate-800 dark:text-white">🎯 {arrivalInfo.nextDestinationName}</p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
        >
          つぎへ
        </button>
      </div>
    </div>
  );
}
