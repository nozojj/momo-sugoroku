"use client";

import type { SettlementInfo } from "@/types/game";
import { formatMoneyDelta } from "@/lib/format";

interface SettlementModalProps {
  info: SettlementInfo;
  onContinue: () => void;
}

/** 3月決算の演出。「今年の物件収益」をプレイヤーごと・物件ごとの内訳付きで見せる。
 *  年1回だけの情報量が多い画面なので、moneyRoulette/cardDrawと違い自動では閉じず、
 *  ArrivalModal/PurchaseModalと同じ「確認して閉じる」パターンにする。 */
export function SettlementModal({ info, onContinue }: SettlementModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-800">
        <div className="shrink-0 p-5 pb-3 text-center">
          <p className="text-4xl">🧾</p>
          <h2 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">{info.year}年目 決算</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">今年の物件収益</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {info.entries.map((entry) => (
            <div key={entry.playerId} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{entry.playerName}さん</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatMoneyDelta(entry.total)}</p>
              </div>
              {entry.propertyBreakdown.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {entry.propertyBreakdown.map((p) => (
                    <li key={p.propertyId} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{p.propertyName}</span>
                      <span className="shrink-0">{formatMoneyDelta(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">所有物件なし</p>
              )}
            </div>
          ))}
        </div>

        <div className="shrink-0 p-4">
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
          >
            つぎへ
          </button>
        </div>
      </div>
    </div>
  );
}
