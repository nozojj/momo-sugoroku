"use client";

import type { TargetSelectInfo } from "@/types/game";

interface TargetSelectOverlayProps {
  info: TargetSelectInfo;
  onSelect: (optionId: string) => void;
  onCancel: () => void;
}

/**
 * 場所指定系カード(station/region/propertyGroup)共通の行き先選択画面。CardOverflowModalと
 * 同じ「中央寄せカード・確認待ち」の構成を踏襲する(RouteChoiceOverlayの方角グリッドは2〜4択向けで、
 * 8〜17択には向かないため採用しない)。
 *
 * selectKind(駅/地域/物件グループ)の意味は一切知らない完全に汎用な部品。TargetSelectOption
 * (optionId/label/icon)だけを受け取ってボタンを並べるだけなので、将来targetSelectEffects.tsに
 * 選択肢の種類を増やしても、このコンポーネント自体は変更不要。
 */
export function TargetSelectOverlay({ info, onSelect, onCancel }: TargetSelectOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <p className="text-xs font-semibold text-fuchsia-500">{info.cardName}</p>
        <h2 className="mt-1 text-base font-bold text-slate-800 dark:text-white">
          {info.playerName}さん、行き先を選んでください
        </h2>

        <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {info.options.map((opt) => (
            <button
              key={opt.optionId}
              type="button"
              onClick={() => onSelect(opt.optionId)}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-2 text-center active:scale-95 dark:border-fuchsia-500/40 dark:bg-fuchsia-400/10"
            >
              {opt.icon && <span className="text-xl">{opt.icon}</span>}
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{opt.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-500 dark:text-slate-200"
        >
          やめる(カードは手札に残ります)
        </button>
      </div>
    </div>
  );
}
