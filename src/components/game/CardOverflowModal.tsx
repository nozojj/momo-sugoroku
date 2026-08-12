"use client";

import type { CardOverflowInfo } from "@/types/game";
import { getCardDef } from "@/data/cards";
import { CARD_CATEGORY_BADGE_CLASS, CARD_CATEGORY_LABEL, RARITY_BADGE_CLASS, RARITY_LABEL, cardCategoryOf } from "@/lib/game/cardDisplay";

interface CardOverflowModalProps {
  info: CardOverflowInfo;
  onDiscardExisting: (index: number) => void;
  onKeepCurrentHand: () => void;
}

/** 所持上限到達時の整理画面。moneyRoulette/cardDrawと違い自動進行はせず、
 *  プレイヤーが明示的に選ぶまでターンを進めない(PurchaseModalと同じ「確認待ち」系)。 */
export function CardOverflowModal({ info, onDiscardExisting, onKeepCurrentHand }: CardOverflowModalProps) {
  const newDef = getCardDef(info.newCardId);
  if (!newDef) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <p className="text-xs font-semibold text-fuchsia-500">手札がいっぱいです</p>
        <h2 className="mt-1 text-base font-bold text-slate-800 dark:text-white">
          {info.playerName}さん、カードを1枚選んで捨ててください
        </h2>

        <div className="mt-3 rounded-xl border-2 border-fuchsia-400 bg-fuchsia-50/60 p-3 text-center dark:bg-fuchsia-400/10">
          <p className="text-[10px] font-bold text-fuchsia-500">今回引いたカード</p>
          <p className="mt-1 text-2xl">{newDef.icon}</p>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-white">{newDef.name}</p>
          <div className="mt-1 flex items-center justify-center gap-1">
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${CARD_CATEGORY_BADGE_CLASS[cardCategoryOf(newDef)]}`}
            >
              {CARD_CATEGORY_LABEL[cardCategoryOf(newDef)]}
            </span>
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${RARITY_BADGE_CLASS[newDef.rarity]}`}
            >
              {RARITY_LABEL[newDef.rarity]}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{newDef.description}</p>
        </div>

        <p className="mt-4 text-xs font-bold text-slate-400 dark:text-slate-500">
          既存の手札から1枚タップして入れ替える
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {info.currentCardIds.map((cardId, i) => {
            const def = getCardDef(cardId);
            if (!def) return null;
            return (
              <button
                key={`${cardId}-${i}`}
                type="button"
                onClick={() => onDiscardExisting(i)}
                className="flex flex-col items-center rounded-lg border border-slate-300 p-2 text-center active:scale-95 dark:border-slate-600"
              >
                <span className="text-xl">{def.icon}</span>
                <span className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-200">{def.name}</span>
                <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
                  <span
                    className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${CARD_CATEGORY_BADGE_CLASS[cardCategoryOf(def)]}`}
                  >
                    {CARD_CATEGORY_LABEL[cardCategoryOf(def)]}
                  </span>
                  <span
                    className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${RARITY_BADGE_CLASS[def.rarity]}`}
                  >
                    {RARITY_LABEL[def.rarity]}
                  </span>
                </span>
                <span className="mt-1 text-[10px] leading-tight text-slate-400 dark:text-slate-500">
                  {def.description}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onKeepCurrentHand}
          className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-500 dark:text-slate-200"
        >
          今回のカードを見送って、今の手札を維持する
        </button>
      </div>
    </div>
  );
}
