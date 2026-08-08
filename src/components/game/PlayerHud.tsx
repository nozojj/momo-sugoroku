"use client";

import type { CardDef, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { netWorth } from "@/lib/game/engine";
import { cardDefs } from "@/data/cards";
import { getPropertyDef } from "@/data/properties";
import { RARITY_BADGE_CLASS } from "@/lib/game/cardDisplay";

interface PlayerHudProps {
  player: Player;
  isActive: boolean;
  canUseCard: boolean;
  onUseCard: (cardId: string) => void;
}

function cardDef(id: string): CardDef | undefined {
  return cardDefs.find((c) => c.id === id);
}

export function PlayerHud({ player, isActive, canUseCard, onUseCard }: PlayerHudProps) {
  return (
    <div
      className={`rounded-xl border p-3 transition ${
        isActive
          ? "border-amber-400 bg-amber-50/80 shadow-md dark:bg-amber-400/10"
          : "border-black/10 bg-white/70 dark:bg-slate-800/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
            style={{ backgroundColor: player.color }}
          >
            {player.carIcon}
          </span>
          <span className="truncate font-bold">{player.name}</span>
          {isActive && <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">手番</span>}
        </div>
        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">総資産 {formatMoney(netWorth(player))}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>💰 {formatMoney(player.money)}</span>
        <span>🏠 {player.ownedPropertyIds.length}件</span>
        <span>🎯 {player.destinationsReached}回到着</span>
      </div>

      {player.ownedPropertyIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {player.ownedPropertyIds.map((propertyId) => {
            const def = getPropertyDef(propertyId);
            if (!def) return null;
            return (
              <span
                key={propertyId}
                title={`${def.category} / ${formatMoney(def.price)}`}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-400/10 dark:text-emerald-300"
              >
                {def.icon ? `${def.icon} ` : "🏠 "}
                {def.name}
              </span>
            );
          })}
        </div>
      )}

      {player.cardIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {player.cardIds.map((cardId, i) => {
            const def = cardDef(cardId);
            if (!def) return null;
            const usable = canUseCard && def.kind === "usable";
            return (
              <button
                key={`${cardId}-${i}`}
                type="button"
                disabled={!usable}
                onClick={() => usable && onUseCard(cardId)}
                title={def.description}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${RARITY_BADGE_CLASS[def.rarity]} ${
                  usable ? "ring-2 ring-fuchsia-400" : "opacity-70"
                }`}
              >
                {def.icon} {def.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
