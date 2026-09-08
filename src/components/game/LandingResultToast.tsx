"use client";

import { useEffect } from "react";
import type { LandingResultInfo } from "@/types/game";
import { playSE } from "@/lib/audio/soundManager";
import { formatMoneyDelta } from "@/lib/format";

interface LandingResultToastProps {
  info: LandingResultInfo;
  onDismiss: () => void;
}

/** MonopolyToastより短い表示時間。money/eventマスは踏む頻度が高いため、確認できる最短の
 *  時間に留める(Phase 8/9の共通モーションルール: 頻出イベントほど短く)。
 *  Polish Phase 3e: 調査の結果、CPU戦ではCPU_ACTION_DELAY_MS(650ms)後に次CPUが行動を
 *  開始するため、従来の1700msだと次プレイヤーの行動と長く重なっていた。読めるだけの
 *  時間を残しつつ、次プレイヤーの行動へ長く居座らないよう1400msへ短縮する
 *  (1200〜1500msの範囲で実ブラウザ確認済み)。 */
const AUTO_DISMISS_MS = 1400;

/**
 * money/eventマス(LandingOutcome.kind: "money")着地の非ブロッキング通知(Phase9B/P9-3)。
 * MonopolyToast.tsxと同じ設計(自走して自動で消える、操作をブロックしない、
 * CharacterAnnouncer/confettiは使わない)を踏襲する。効果音(money_gain/money_loss)は
 * Phase10/P10-1でMonopolyToast.tsxと同じ「マウントeffect本体で直接playSE()」パターンにより接続した。
 *
 * MonopolyToastと同じtop-14ではなく1段下(top-28)に固定配置する: 両者はstatusに依存しない
 * 独立した一時通知同士のため、購入直後の独占達成トースト表示中に別プレイヤーがmoney/eventマスへ
 * 着地する、といった偶発的な同時表示が起こりうる。ゲームロジック(gameStore.ts)には触れず、
 * 通知UIの配置だけで重なりを避ける(PC/390×844の両方で目視確認済み)。
 *
 * Polish Phase 3e: gameStore側は着地確定と同時に同期的に次プレイヤーへ手番を渡すため
 * (endTurn timingは変更しない)、このトーストが表示されている間、GameHudは既に次プレイヤーを
 * 指している。そのため「これは前プレイヤーに起きた結果である」ことを、GameHudの現在手番表示
 * (「○○さんの番」)とは明確に違う言い回し(「○○さんの結果」)・色以外の視覚手がかり
 * (収入/支出ラベル+矢印アイコン)・金額を最も大きく見せる情報階層、の3点で担保する。
 */
export function LandingResultToast({ info, onDismiss }: LandingResultToastProps) {
  useEffect(() => {
    playSE(info.kind === "moneyGain" ? "money_gain" : "money_loss");
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const isGain = info.kind === "moneyGain";
  const label = isGain ? "収入" : "支出";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-50 flex justify-center px-4">
      <div
        className={`animate-landing-result-toast pop-card pointer-events-auto flex max-w-xs flex-col gap-1 rounded-2xl border-b-4 px-4 py-2.5 ${
          isGain
            ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950/90 dark:text-sky-100"
            : "border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-400 dark:bg-rose-950/90 dark:text-rose-100"
        }`}
        // Polish Phase 3e: pop in→短時間表示→fade outをCSS animationの尺(%)だけで表現する
        // ため、実際のdurationはAUTO_DISMISS_MS(=このコンポーネントの自動消滅タイマーと同じ値)
        // をインラインで渡して同期させる(globals.cssの.animate-landing-result-toastは
        // デフォルト値を持つのみ)。JS側の追加state machineは持たない。
        style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        onClick={onDismiss}
        role="status"
      >
        {/* 小: 誰の結果か。GameHudの「○○さんの番」(現在手番)と混同しないよう、
            あえて「番」ではなく「結果」という言葉を使う。 */}
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold opacity-70">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: info.playerColor }} />
          <span className="truncate">{info.playerName}さんの結果</span>
        </div>

        {/* 中〜大: 収入/支出ラベル+矢印アイコン(色だけに依存しない区別)と、amount単体の
            視覚要素としての金額(message文字列内の符号ではなく、formatMoneyDelta(info.amount)を
            直接使う)。金額はこのトースト内で最も大きい文字にし、最速で認識できるようにする。 */}
        <div className="flex items-center gap-2">
          <TrendArrowIcon up={isGain} />
          <span className="shrink-0 text-[11px] font-bold">{label}</span>
          <span className="text-pop text-xl font-black tabular-nums">{formatMoneyDelta(info.amount)}</span>
        </div>

        {/* 小: 既存message(マス名・理由等の補足)。主役はあくまで上の金額。 */}
        <p className="truncate text-[10px] opacity-60">{info.message}</p>
      </div>
    </div>
  );
}

/** moneyGain/moneyLossを色以外でも区別するための矢印アイコン。Lucide等の外部icon libraryは
 *  未導入のプロジェクトのため新規依存を増やさず、同等の見た目(縦棒+シェブロン)をinline SVGで
 *  自前描画する。stroke="currentColor"で親要素のテキスト色(sky-900/rose-900等)をそのまま継承する。 */
function TrendArrowIcon({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {up ? <path d="M10 15V5M5 10l5-5 5 5" /> : <path d="M10 5v10M5 10l5 5 5-5" />}
    </svg>
  );
}
