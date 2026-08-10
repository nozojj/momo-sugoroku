"use client";

import { useState } from "react";

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

interface DiceProps {
  diceResult: number | null;
  /** 直近にロールしたサイコロの内訳(表示専用)。ロール前やdiceCount<=1のときはnullでよい。 */
  diceFaces?: number[] | null;
  /** 次に振る(または直近に振った)サイコロの個数。既定1。急行系カード使用中のみ2以上になる。 */
  diceCount?: number;
  canRoll: boolean;
  doubleArmed: boolean;
  onRoll: () => void;
}

export function Dice({ diceResult, diceFaces, diceCount = 1, canRoll, doubleArmed, onRoll }: DiceProps) {
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    if (!canRoll) return;
    setSpinning(true);
    onRoll();
    window.setTimeout(() => setSpinning(false), 500);
  }

  // diceCount<=1のときは既存の単一ダイス表示をそのまま使う(見た目・挙動を一切変えない)。
  if (diceCount <= 1) {
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

  // diceCount>1: 急行系カード使用中。ロール前はN個振る旨を、ロール後は内訳+合計を表示する。
  const rolled = diceFaces && diceFaces.length > 0 ? diceFaces : null;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canRoll}
        className={`flex items-center gap-1 rounded-2xl border-2 border-fuchsia-400 bg-white px-3 py-4 shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-700 ${
          spinning ? "animate-dice-roll" : ""
        }`}
        aria-label={`サイコロ${diceCount}個を振る`}
      >
        {rolled
          ? rolled.map((face, i) => (
              <span key={i} className="text-3xl">
                {DICE_FACES[face]}
              </span>
            ))
          : Array.from({ length: diceCount }, (_, i) => (
              <span key={i} className="text-3xl">
                🎲
              </span>
            ))}
      </button>
      <span className="text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">
        {canRoll
          ? `タップしてサイコロ${diceCount}個を振る!`
          : rolled
            ? `${rolled.join("+")}=${diceResult} マス移動中…`
            : "-"}
      </span>
    </div>
  );
}
