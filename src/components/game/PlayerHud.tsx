"use client";

import type { CardDef, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { netWorth } from "@/lib/game/engine";
import { cardDefs } from "@/data/cards";
import { getPropertyDef, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { isGroupMonopolized, isRegionMonopolized } from "@/lib/game/propertyOwnership";
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

/** このプレイヤーが所有する物件から、独占中のグループ/地域だけを抜き出す。
 *  地域を完全独占している場合は、その地域に属する個別グループのバッジは出さず
 *  地域バッジ1つにまとめる(バッジが大量に並ぶのを防ぐ)。
 *
 *  isGroupMonopolized/isRegionMonopolizedはplayers配列から対象プレイヤーを
 *  見つけて「そのプレイヤー自身の所有状況」だけを見る実装のため、[player]という
 *  1要素配列を渡せば十分(全プレイヤー配列をpropsで受け取る必要が無い)。 */
function monopolyBadges(player: Player): { key: string; label: string; region: boolean }[] {
  const ownedGroupIds = [...new Set(player.ownedPropertyIds.map((id) => getPropertyDef(id)?.groupId).filter((id): id is string => !!id))];
  const ownedGroups = ownedGroupIds.map((id) => getPropertyGroupDef(id)).filter((g): g is NonNullable<typeof g> => !!g);

  const monopolizedRegions = [...new Set(ownedGroups.map((g) => g.region))].filter((region) =>
    isRegionMonopolized(region, player.id, [player], propertyDefs, propertyGroupDefs),
  );

  const regionBadges = monopolizedRegions.map((region) => ({ key: `region_${region}`, label: `🌐 ${region}エリア 完全独占`, region: true }));

  const groupBadges = ownedGroups
    .filter((g) => !monopolizedRegions.includes(g.region))
    .filter((g) => isGroupMonopolized(g.id, player.id, [player], propertyDefs))
    .map((g) => ({ key: `group_${g.id}`, label: `✨ ${g.name} 独占`, region: false }));

  return [...regionBadges, ...groupBadges];
}

export function PlayerHud({ player, isActive, canUseCard, onUseCard }: PlayerHudProps) {
  const badges = monopolyBadges(player);

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

      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${badge.region ? "bg-sky-500" : "bg-amber-500"}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

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
