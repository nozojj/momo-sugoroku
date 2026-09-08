"use client";

import { useEffect } from "react";
import type { SkipTurnAnnounceInfo } from "@/types/game";

interface SkipTurnToastProps {
  info: SkipTurnAnnounceInfo;
  onDismiss: () => void;
}

/** LandingResultToastと同じ「頻出しうるイベントほど短く」の考え方。skipNextRollは1回休みという
 *  地味な効果のため、確認できる最短の時間に留める(1200〜1500msの範囲、LandingResultToastの
 *  AUTO_DISMISS_MSと揃える)。 */
const AUTO_DISMISS_MS = 1400;

/**
 * skipNextRoll(妨害系カードの「1回休み」)発動でターンがまるごと飛ばされたことを知らせる
 * 非ブロッキング通知(Polish Phase 3f)。それまではadvanceToNextTurn()(gameStore.ts)が対象
 * プレイヤーを無言で読み飛ばし、state.logにしか理由が残らなかった。LandingResultToast/
 * MonopolyToastと同じ設計(自走して自動で消える、操作をブロックしない、CharacterAnnouncer/
 * confettiは使わない、新しいGameStatusは追加しない)を踏襲する。
 *
 * LandingResultToast(top-28)/MonopolyToast(top-14)とは別のtop位置(top-40)に固定配置する:
 * advanceToNextTurn()は直前プレイヤーの着地処理(resolveLanding())の直後に同期的に呼ばれるため、
 * 直前プレイヤーのlandingResultInfoがまだ表示中のまま、このスキップ通知が続けて表示される
 * (=次のプレイヤーが実は既にスキップ済みだった)ケースが起こりうる。ゲームロジックには触れず、
 * 通知UIの配置だけで重なりを避ける。
 *
 * 文言はgameStore.ts側のログ文字列(「〜の効果でこの手番はお休みです。」)をそのまま流用せず、
 * SkipTurnAnnounceInfo(playerName/cardName)という構造化データからこのコンポーネント内で
 * 組み立てる。
 */
export function SkipTurnToast({ info, onDismiss }: SkipTurnToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-40 z-50 flex justify-center px-4">
      <div
        className="animate-landing-result-toast pop-card pointer-events-auto flex max-w-xs items-center gap-2 rounded-2xl border-b-4 border-slate-400 bg-slate-100 px-4 py-2.5 text-slate-800 dark:border-slate-500 dark:bg-slate-800/90 dark:text-slate-100"
        style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        onClick={onDismiss}
        role="status"
      >
        <span className="shrink-0 text-xl" aria-hidden="true">
          😴
        </span>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold opacity-70">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: info.playerColor }} />
            {info.playerName}さんの結果
          </p>
          <p className="truncate text-xs font-bold">
            「{info.cardName}」の効果でお休み
          </p>
        </div>
      </div>
    </div>
  );
}
