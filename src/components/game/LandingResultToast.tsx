"use client";

import { useEffect } from "react";
import type { LandingResultInfo } from "@/types/game";

interface LandingResultToastProps {
  info: LandingResultInfo;
  onDismiss: () => void;
}

/** MonopolyToastより短い表示時間。money/eventマスは踏む頻度が高いため、確認できる最短の
 *  時間に留める(Phase 8/9の共通モーションルール: 頻出イベントほど短く)。 */
const AUTO_DISMISS_MS = 1700;

/**
 * money/eventマス(LandingOutcome.kind: "money")着地の非ブロッキング通知(Phase9B/P9-3)。
 * MonopolyToast.tsxと同じ設計(自走して自動で消える、操作をブロックしない、
 * CharacterAnnouncer/confetti/効果音は使わない)を踏襲する。効果音の接続はPhase 10で行う。
 *
 * MonopolyToastと同じtop-14ではなく1段下(top-28)に固定配置する: 両者はstatusに依存しない
 * 独立した一時通知同士のため、購入直後の独占達成トースト表示中に別プレイヤーがmoney/eventマスへ
 * 着地する、といった偶発的な同時表示が起こりうる。ゲームロジック(gameStore.ts)には触れず、
 * 通知UIの配置だけで重なりを避ける(PC/390×844の両方で目視確認済み)。
 */
export function LandingResultToast({ info, onDismiss }: LandingResultToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const isGain = info.kind === "moneyGain";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-50 flex justify-center px-4">
      <div
        className={`animate-arrival-pop pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border-b-4 px-4 py-3 shadow-xl ${
          isGain
            ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950/90 dark:text-sky-100"
            : "border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-400 dark:bg-rose-950/90 dark:text-rose-100"
        }`}
        onClick={onDismiss}
        role="status"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: info.playerColor }} />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold opacity-70">{info.playerName}さん</p>
          <p className="truncate text-sm font-black">{info.message}</p>
        </div>
      </div>
    </div>
  );
}
