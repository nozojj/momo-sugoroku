"use client";

import type { PropertyDef, PropertyGroup } from "@/types/game";
import { formatMoney, formatMoneyDelta } from "@/lib/format";
import { PROPERTY_GENRE_BADGE_CLASS, PROPERTY_GENRE_ICON, PROPERTY_GENRE_LABEL, propertyGenreOf } from "@/lib/game/propertyDisplay";

interface PropertyDetailSheetProps {
  def: PropertyDef;
  group: PropertyGroup | undefined;
  /** 決算と同じownershipTier()の結果を呼び出し側が渡す(このシート自体は独占判定をしない)。 */
  annualRevenue: number;
  isMonopoly: boolean;
  onClose: () => void;
}

/**
 * 所有物件の詳細確認画面。PlayerHudの所有物件ピルをタップすると必ずここを経由する
 * (CardDetailSheetと同じ構成)。表示専用で、開いて閉じるだけでは所有権・収益とも
 * 一切変化しない(購入/売却の操作はここには置かない)。
 *
 * 年間収益はここでは計算せず、呼び出し側がpropertyRevenue.tsのcalculateAnnualRevenue()と
 * propertyOwnership.tsのownershipTier()を使って渡した値をそのまま表示するだけ
 * (ゲームロジックと表示の分離を維持する)。
 */
export function PropertyDetailSheet({ def, group, annualRevenue, isMonopoly, onClose }: PropertyDetailSheetProps) {
  const genre = propertyGenreOf(def);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl">{def.icon ?? "🏠"}</p>
        <h2 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">{def.name}</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500">{def.category}</p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {group && (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              📍 {group.region}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${PROPERTY_GENRE_BADGE_CLASS[genre]}`}>
            {PROPERTY_GENRE_ICON[genre]} {PROPERTY_GENRE_LABEL[genre]}
          </span>
          {isMonopoly && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">✨ 独占中</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/40">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">価格</p>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white">{formatMoney(def.price)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/40">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">収益率</p>
            <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white">{Math.round(def.revenueRate * 100)}%</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-400/10">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">年間収益</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatMoneyDelta(annualRevenue)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-500 dark:text-slate-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
