"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MoneyRouletteInfo } from "@/types/game";
import { formatMoneyDelta } from "@/lib/format";

interface MoneyRouletteModalProps {
  info: MoneyRouletteInfo;
  onContinue: () => void;
}

/** 演出タイミング(調整用定数)。金額計算・季節変動・年数インフレのロジックには一切関与しない。
 *  プラス/マイナスマスは踏む頻度が高いため、タップ待ちにせず自動で進む。 */
const SPIN_DURATION_MS = 1000; // 減速しながら金額が確定するまでの時間(目安800〜1200ms)
const SPIN_STEP_COUNT = 9; // 確定前に切り替わる回数
const HOLD_DURATION_MS = 500; // 確定額を強調表示してから閉じるまでの時間(目安400〜600ms)

/** 後半ほど間隔が長くなる(減速していく)スピン間隔を、合計がtotalMsになるよう生成する。 */
function buildSpinIntervals(totalMs: number, steps: number): number[] {
  const weights = Array.from({ length: steps }, (_, i) => Math.pow((i + 1) / steps, 1.8));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(30, Math.round((w / weightSum) * totalMs)));
}

export function MoneyRouletteModal({ info, onContinue }: MoneyRouletteModalProps) {
  const isGain = info.kind === "moneyGain";

  // 表示用の系列: 候補額をランダムな順で並べて数周させ、最後だけ確定額(info.amount)にする。
  const sequence = useMemo(() => {
    const pool = info.candidates.length > 0 ? info.candidates : [info.amount];
    const seq: number[] = [];
    for (let i = 0; i < SPIN_STEP_COUNT; i++) {
      seq.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    seq.push(info.amount);
    return seq;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const intervals = useMemo(() => buildSpinIntervals(SPIN_DURATION_MS, sequence.length - 1), [sequence.length]);

  const [step, setStep] = useState(0);
  const spinning = step < sequence.length - 1;
  const settled = !spinning;

  // スピン中: 次の目へ切り替える(減速するintervalsに沿って進む)。
  useEffect(() => {
    if (step >= sequence.length - 1) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), intervals[step]);
    return () => window.clearTimeout(timer);
  }, [step, sequence.length, intervals]);

  // 確定後: 強調表示をHOLD_DURATION_MSだけ見せてから自動で次へ進む。
  // firedRefで二重発火を防ぐ(cleanupでの取り消しに加え、念のための保険)。
  const firedRef = useRef(false);
  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onContinue();
    }, HOLD_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [settled, onContinue]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Visual Prototype 1.5: プラス/マイナスの既存アクセント色(sky/rose)を上部アクセントにも
          反映。単色白から暖色グラデーションへ。 */}
      <div
        className={`w-full max-w-sm rounded-2xl border-t-4 bg-linear-to-b from-white to-amber-50/30 p-6 text-center shadow-xl dark:from-slate-800 dark:to-slate-800/80 ${
          isGain ? "border-t-sky-300 dark:border-t-sky-500/50" : "border-t-rose-300 dark:border-t-rose-500/50"
        }`}
      >
        <p className="text-4xl">🎰</p>
        <h2 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">
          {isGain ? "プラスマス" : "マイナスマス"}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {info.playerName}さん「{info.nodeName}」
        </p>

        <div
          key={settled ? "settled" : "spinning"}
          className={`mt-5 rounded-xl border-2 py-4 text-3xl font-black tabular-nums ${
            settled ? "animate-arrival-pop" : ""
          } ${
            spinning
              ? "border-slate-200 text-slate-400 dark:border-slate-600 dark:text-slate-500"
              : isGain
                ? "border-sky-400 text-sky-600 dark:text-sky-300"
                : "border-rose-400 text-rose-600 dark:text-rose-300"
          }`}
        >
          {formatMoneyDelta(sequence[step])}
        </div>
      </div>
    </div>
  );
}
