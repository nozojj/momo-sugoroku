"use client";

import type { Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { netWorth } from "@/lib/game/engine";

interface GameOverModalProps {
  players: Player[];
  winnerIds: string[];
  onRestart: () => void;
}

export function GameOverModal({ players, winnerIds, onRestart }: GameOverModalProps) {
  const ranked = [...players].sort((a, b) => netWorth(b) - netWorth(a));
  const isTie = winnerIds.length > 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-800">
        <p className="text-3xl">🏆</p>
        <h2 className="mt-2 text-xl font-bold">
          {isTie ? "引き分け!" : `${players.find((p) => p.id === winnerIds[0])?.name}さんの勝ち!`}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">規定ターンが終了しました</p>

        <ul className="mt-4 space-y-2 text-left">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                winnerIds.includes(p.id) ? "border-amber-400 bg-amber-50 dark:bg-amber-400/10" : "border-black/10"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{i + 1}位</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.name}</span>
              </span>
              <span className="font-bold">{formatMoney(netWorth(p))}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onRestart}
          className="mt-5 w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
        >
          もう一度遊ぶ
        </button>
      </div>
    </div>
  );
}
