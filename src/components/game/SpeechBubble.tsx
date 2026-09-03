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
      // Visual Prototype 1.5: 単色白から暖色グラデーションへ。役割ごとのアクセント色
      // (themeStyle.accentBorderClass、既存)はそのまま生かし、吹き出し自体に厚み・質感を足すだけ。
      className={`animate-arrival-pop relative min-w-0 flex-1 rounded-2xl border-b border-l border-r border-t-4 border-amber-900/10 bg-linear-to-b from-white to-amber-50/50 p-4 text-base font-bold text-slate-800 shadow-xl dark:border-amber-100/10 dark:from-slate-800 dark:to-slate-800/80 dark:text-white sm:max-w-[500px] sm:p-5 sm:text-lg ${themeStyle.accentBorderClass}`}
    >
      <p>{line.text}</p>
      {line.highlight && (
        <p
          className={`animate-highlight-slam mt-1 text-2xl font-black sm:text-3xl ${themeStyle.accentTextClass}`}
          style={{ animationDelay: `${CHARACTER_ANNOUNCER_TIMING.highlightDelayMs}ms` }}
        >
          {line.highlight.kind === "money" ? (
            <>
              {line.highlight.label ? `${line.highlight.label} ` : ""}
              {formatMoneyDelta(line.highlight.amount)}
            </>
          ) : (
            line.highlight.text
          )}
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
