"use client";

import type { PropertyDef, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";

interface PurchaseModalProps {
  property: PropertyDef;
  player: Player;
  onBuy: () => void;
  onSkip: () => void;
}

export function PurchaseModal({ property, player, onBuy, onSkip }: PurchaseModalProps) {
  const canAfford = player.money >= property.price;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <p className="text-xs font-semibold text-pink-500">{property.category} ・ {property.area}</p>
        <h2 className="mt-1 text-lg font-bold">{property.name}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          購入価格: <span className="font-bold">{formatMoney(property.price)}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {player.name}さんの所持金: {formatMoney(player.money)}
        </p>
        {!canAfford && <p className="mt-2 text-xs font-semibold text-red-500">所持金が足りません</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 dark:border-slate-500 dark:text-slate-200"
          >
            見送る
          </button>
          <button
            type="button"
            onClick={onBuy}
            disabled={!canAfford}
            className="flex-1 rounded-lg bg-pink-500 py-2.5 font-bold text-white disabled:opacity-40"
          >
            購入する
          </button>
        </div>
      </div>
    </div>
  );
}
