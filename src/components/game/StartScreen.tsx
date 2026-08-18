"use client";

import { useState } from "react";
import type { PlayerController } from "@/types/game";
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, CAR_ICONS, YEAR_OPTIONS, DEFAULT_TOTAL_YEARS } from "@/lib/game/engine";

interface StartScreenProps {
  onStart: (names: string[], totalYears: number, controlledBy: PlayerController[]) => void;
}

const DEFAULT_NAMES = ["プレイヤー1", "プレイヤー2", "プレイヤー3", "プレイヤー4"];
const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);
const DEFAULT_CONTROLLERS: PlayerController[] = ["human", "human", "human", "human"];

export function StartScreen({ onStart }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState<number>(MIN_PLAYERS);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [controlledBy, setControlledBy] = useState<PlayerController[]>(DEFAULT_CONTROLLERS);
  const [totalYears, setTotalYears] = useState<number>(DEFAULT_TOTAL_YEARS);

  function setName(index: number, value: string) {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function setController(index: number, value: PlayerController) {
    setControlledBy((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function handleStart() {
    const chosen = names
      .slice(0, playerCount)
      .map((n, i) => n.trim() || DEFAULT_NAMES[i]);
    onStart(chosen, totalYears, controlledBy.slice(0, playerCount));
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">湘南すごろく</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">車で走る、湘南エリアの桃鉄風すごろく(MVP)</p>
      </div>

      <div className="w-full max-w-xs rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm dark:bg-slate-800/70">
        <h2 className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">人数を選択</h2>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setPlayerCount(count)}
              className={`rounded-lg border py-2 text-sm font-bold transition ${
                playerCount === count
                  ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-300 text-slate-500 dark:border-slate-500 dark:text-slate-300"
              }`}
            >
              {count}人
            </button>
          ))}
        </div>

        <h2 className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">プレイ年数を選択</h2>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {YEAR_OPTIONS.map((years) => (
            <button
              key={years}
              type="button"
              onClick={() => setTotalYears(years)}
              className={`rounded-lg border py-2 text-sm font-bold transition ${
                totalYears === years
                  ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-300 text-slate-500 dark:border-slate-500 dark:text-slate-300"
              }`}
            >
              {years}年
            </button>
          ))}
        </div>

        <h2 className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-300">プレイヤー名・操作</h2>
        <div className="flex flex-col gap-2.5">
          {names.slice(0, playerCount).map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                style={{ backgroundColor: PLAYER_COLORS[i] }}
                title={`プレイヤー${i + 1}`}
              >
                {CAR_ICONS[i]}
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-500 dark:bg-slate-700"
                value={name}
                maxLength={12}
                onChange={(e) => setName(i, e.target.value)}
              />
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-500">
                {(["human", "cpu"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setController(i, option)}
                    aria-pressed={controlledBy[i] === option}
                    className={`px-2.5 py-2 text-xs font-bold transition ${
                      controlledBy[i] === option
                        ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                        : "bg-transparent text-slate-500 dark:text-slate-300"
                    }`}
                  >
                    {option === "human" ? "人間" : "CPU"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="mt-4 w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
        >
          ゲーム開始
        </button>
      </div>
    </div>
  );
}
