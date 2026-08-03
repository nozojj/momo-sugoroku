"use client";

import { useState } from "react";

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

interface DiceProps {
  diceResult: number | null;
  canRoll: boolean;
  doubleArmed: boolean;
  onRoll: () => void;
}

export function Dice({ diceResult, canRoll, doubleArmed, onRoll }: DiceProps) {
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    if (!canRoll) return;
    setSpinning(true);
    onRoll();
    window.setTimeout(() => setSpinning(false), 500);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canRoll}
        className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 bg-white text-5xl shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-700 ${
          doubleArmed ? "border-fuchsia-400" : "border-slate-300 dark:border-slate-500"
        } ${spinning ? "animate-dice-roll" : ""}`}
        aria-label="サイコロを振る"
      >
        {diceResult ? DICE_FACES[diceResult] : "🎲"}
      </button>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {canRoll ? (doubleArmed ? "出目 x2 で移動!" : "タップしてサイコロを振る") : diceResult ? `${diceResult}マス移動中…` : "-"}
      </span>
    </div>
  );
}
