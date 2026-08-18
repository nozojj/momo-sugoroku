"use client";

import type { CardDef } from "@/types/game";
import { CARD_CATEGORY_BADGE_CLASS, CARD_CATEGORY_LABEL, RARITY_BADGE_CLASS, RARITY_LABEL, cardCategoryOf } from "@/lib/game/cardDisplay";

interface CardDetailSheetProps {
  def: CardDef;
  /** このシートを開いたプレイヤーが今このカードを使えるか(自分の手番・ロール前・kind:"usable")。
   *  falseのときは「使う」ボタンの代わりに理由を表示するだけで、GameStatusには一切触れない。 */
  usable: boolean;
  onUse: () => void;
  onClose: () => void;
}

/**
 * 所持カードの詳細確認画面。PlayerHudでカードをタップすると必ずここを経由し、「使う」を押した
 * ときだけuseCard()が呼ばれる(タップ即使用はしない)。CardOverflowModal/TargetSelectOverlayと
 * 同じ「中央寄せカード・確認待ち」の構成。
 *
 * GameStatusには乗せない: 開いて閉じるだけでは手番・所持カードとも一切変化しないため、
 * セーブ/ロードやBoard.tsxのstatus分岐を巻き込む必要が無い(呼び出し元でローカルstateとして
 * 管理する)。
 */
export function CardDetailSheet({ def, usable, onUse, onClose }: CardDetailSheetProps) {
  const category = cardCategoryOf(def);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      {/* Visual Prototype 1.5: カード関連UIの役割色(フューシャ、既存のRARITY_BADGE_CLASS等と
          同じ色系統)を上部アクセントに。単色白から暖色グラデーションへ、情報構造は無変更。 */}
      <div
        className="w-full max-w-sm rounded-2xl border-t-4 border-t-fuchsia-300 bg-linear-to-b from-white to-fuchsia-50/30 p-5 text-center shadow-xl dark:border-t-fuchsia-500/50 dark:from-slate-800 dark:to-slate-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl">{def.icon}</p>
        <h2 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">{def.name}</h2>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${CARD_CATEGORY_BADGE_CLASS[category]}`}>
            {CARD_CATEGORY_LABEL[category]}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${RARITY_BADGE_CLASS[def.rarity]}`}>
            {RARITY_LABEL[def.rarity]}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{def.description}</p>

        {def.kind === "usable" ? (
          usable ? (
            <button
              type="button"
              onClick={onUse}
              className="mt-5 w-full rounded-lg border-b-4 border-fuchsia-800 bg-linear-to-b from-fuchsia-400 to-fuchsia-600 py-2.5 font-black text-white shadow-sm transition active:translate-y-0.5 active:border-b-0"
            >
              このカードを使う
            </button>
          ) : (
            <p className="mt-5 text-xs font-bold text-slate-400 dark:text-slate-500">
              今は使えません(自分の手番でサイコロを振る前だけ使えます)
            </p>
          )
        ) : (
          <p className="mt-5 text-xs font-bold text-slate-400 dark:text-slate-500">持っているだけで効果があります</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg border border-fuchsia-900/15 py-2.5 text-sm font-medium text-slate-600 dark:border-fuchsia-100/15 dark:text-slate-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
