"use client";

import type { CharacterAnnouncementTheme, CharacterLine, CharacterSide } from "@/types/characterAnnouncer";
import { formatMoneyDelta } from "@/lib/format";
import { CHARACTER_ANNOUNCER_THEME_STYLE } from "@/lib/game/characterAnnouncerTheme";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";

interface SpeechBubbleProps {
  line: CharacterLine;
  side: CharacterSide;
  theme: CharacterAnnouncementTheme;
}

/** セリフ1行分の吹き出し/テロップ。lineが切り替わるたびkeyでanimate-arrival-popを再生する
 *  (既存のArrivalModalが使っていたポップイン演出を再利用)。sideに応じてキャラクター側を
 *  向いた三角形の「しっぽ」を出す(right→吹き出し右側、left→吹き出し左側)。
 *  highlightがある行は、テキストのpopから少し遅れてhighlight-slam(「ドン」演出)を再生する。
 *  ここで扱うのはあくまでアニメーションの長さ・遅延であり、行をどれだけ長く保持するか(表示時間)は
 *  CharacterAnnouncer側のタイマーが別途管理する(両者は独立)。 */
export function SpeechBubble({ line, side, theme }: SpeechBubbleProps) {
  const themeStyle = CHARACTER_ANNOUNCER_THEME_STYLE[theme];

  return (
    <div
      key={line.text}
      className={`animate-arrival-pop relative min-w-0 flex-1 rounded-2xl border-b border-l border-r border-t-4 border-black/10 bg-white p-4 text-base font-bold text-slate-800 shadow-lg dark:border-white/10 dark:bg-slate-800 dark:text-white sm:max-w-[500px] sm:p-5 sm:text-lg ${themeStyle.accentBorderClass}`}
    >
      <p>{line.text}</p>
      {line.highlight && (
        <p
          className={`animate-highlight-slam mt-1 text-2xl font-black sm:text-3xl ${themeStyle.accentTextClass}`}
          style={{ animationDelay: `${CHARACTER_ANNOUNCER_TIMING.highlightDelayMs}ms` }}
        >
          {line.highlight.label ? `${line.highlight.label} ` : ""}
          {formatMoneyDelta(line.highlight.amount)}
        </p>
      )}
      <div
        className={`absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-8 border-y-transparent drop-shadow-sm ${
          side === "right"
            ? "-right-2 border-l-8 border-l-white dark:border-l-slate-800"
            : "-left-2 border-r-8 border-r-white dark:border-r-slate-800"
        }`}
      />
    </div>
  );
}
