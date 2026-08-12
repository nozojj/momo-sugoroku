"use client";

import type { Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { getPropertiesInGroup, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { getPropertyOwner, ownershipTier } from "@/lib/game/propertyOwnership";
import { calculateAnnualRevenue } from "@/lib/game/propertyRevenue";
import { PROPERTY_GENRE_BADGE_CLASS, PROPERTY_GENRE_ICON, PROPERTY_GENRE_LABEL, propertyGenreOf } from "@/lib/game/propertyDisplay";

interface PurchaseModalProps {
  groupId: string;
  player: Player;
  players: Player[];
  onBuy: (propertyId: string) => void;
  onFinish: () => void;
}

export function PurchaseModal({ groupId, player, players, onBuy, onFinish }: PurchaseModalProps) {
  const group = getPropertyGroupDef(groupId);
  const properties = getPropertiesInGroup(groupId);

  // 「あと○件で独占」判定: グループ内に他プレイヤー所有の物件が1件でもあれば、このプレイヤーは
  // 二度とそのグループを独占できない(売却は存在しないため)。その場合は「あと○件」を一切出さない。
  const ownedByOther = properties.filter((p) => {
    const owner = getPropertyOwner(p.id, players);
    return !!owner && owner.id !== player.id;
  });
  const remainingForMonopoly = properties.filter((p) => !player.ownedPropertyIds.includes(p.id));
  const monopolyAttainable = ownedByOther.length === 0 && remainingForMonopoly.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-800">
        <div className="shrink-0 border-b border-black/5 p-5 pb-3 dark:border-white/10">
          <p className="text-xs font-semibold text-pink-500">
            {group?.icon} {group?.name ?? "物件エリア"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {player.name}さんの所持金: <span className="font-bold">{formatMoney(player.money)}</span>
          </p>
          {monopolyAttainable && remainingForMonopoly.length >= 2 && (
            <p className="mt-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              あと{remainingForMonopoly.length}件で{group?.name ?? "この物件エリア"}を独占
            </p>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {properties.map((def) => {
            const owner = getPropertyOwner(def.id, players);
            // 所有済みの物件はその所有者の現在の独占状況を反映した収益、未所有は通常倍率(まだ
            // 独占が成立していないので"normal"で正しい)。判定はownershipTier()をそのまま使う。
            const tier = owner ? ownershipTier(def, owner.id, players, propertyDefs, propertyGroupDefs) : "normal";
            const expectedRevenue = calculateAnnualRevenue(def, tier);
            const canAfford = player.money >= def.price;
            const isOwnedBySelf = owner?.id === player.id;
            const isOwnedByOther = !!owner && !isOwnedBySelf;
            const purchasable = !owner && canAfford;
            const completesMonopoly =
              purchasable && monopolyAttainable && remainingForMonopoly.length === 1 && remainingForMonopoly[0].id === def.id;

            return (
              <div
                key={def.id}
                className={`rounded-xl border p-3 ${
                  isOwnedBySelf
                    ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-400/10"
                    : isOwnedByOther
                      ? "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-900/40"
                      : "border-slate-200 dark:border-slate-600"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-white">
                      {def.icon ? `${def.icon} ` : ""}
                      {def.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{def.category}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${PROPERTY_GENRE_BADGE_CLASS[propertyGenreOf(def)]}`}
                  >
                    {PROPERTY_GENRE_ICON[propertyGenreOf(def)]} {PROPERTY_GENRE_LABEL[propertyGenreOf(def)]}
                  </span>
                  {isOwnedBySelf && (
                    <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      所有中
                    </span>
                  )}
                  {isOwnedByOther && (
                    <span className="shrink-0 rounded-full bg-slate-400 px-2 py-0.5 text-[10px] font-bold text-white">
                      {owner!.name}さんの物件
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <span>価格 {formatMoney(def.price)}</span>
                  <span>収益率 {Math.round(def.revenueRate * 100)}%</span>
                  <span>予想年間収益 +{formatMoney(expectedRevenue)}</span>
                </div>

                {completesMonopoly && (
                  <p className="mt-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                    ✨ この物件を購入すると{group?.name ?? "このエリア"}を独占!
                  </p>
                )}

                {!owner && (
                  <button
                    type="button"
                    disabled={!purchasable}
                    onClick={() => purchasable && onBuy(def.id)}
                    className="mt-2 w-full rounded-lg bg-pink-500 py-2 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
                  >
                    {canAfford ? "購入する" : "所持金が足りません"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-black/5 p-4 dark:border-white/10">
          <button
            type="button"
            onClick={onFinish}
            className="w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
          >
            購入を終える
          </button>
        </div>
      </div>
    </div>
  );
}
