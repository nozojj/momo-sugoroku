"use client";

import type { CharacterLine, CharacterSide } from "@/types/characterAnnouncer";
import { formatMoneyDelta } from "@/lib/format";

interface SpeechBubbleProps {
  line: CharacterLine;
  side: CharacterSide;
}

/** セリフ1行分の吹き出し/テロップ。lineが切り替わるたびkeyでanimate-arrival-popを再生する
 *  (既存のArrivalModalが使っていたポップイン演出を再利用)。 */
export function SpeechBubble({ line, side }: SpeechBubbleProps) {
  return (
    <div
      key={line.text}
      className={`animate-arrival-pop min-w-0 flex-1 rounded-2xl border border-black/10 bg-white p-3 text-sm font-bold text-slate-800 shadow-lg dark:border-white/10 dark:bg-slate-800 dark:text-white sm:max-w-sm sm:text-base ${
        side === "right" ? "mr-1" : "ml-1"
      }`}
    >
      <p>{line.text}</p>
      {line.highlight && (
        <p className="mt-1 text-xl font-black text-amber-500">
          {line.highlight.label ? `${line.highlight.label} ` : ""}
          {formatMoneyDelta(line.highlight.amount)}
        </p>
      )}
    </div>
  );
}
