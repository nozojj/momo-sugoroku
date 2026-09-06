"use client";

import { useEffect, useRef, useState } from "react";

/** Polish Phase 3a: 手番が切り替わった瞬間だけ、現在プレイヤー表示へ既存の
 *  animate-highlight-slam(FinalRaceSequence.tsx等で使用済みの「一発ポップして収束する」
 *  keyframe、480ms both)を短時間だけ付与する。新しいkeyframeは追加しない。 */
const TURN_HIGHLIGHT_MS = 480;

interface GameHudProps {
  /** 手番交代の検知だけに使う安定id。名前・色が同じプレイヤーがいても交代を正しく検知できる。 */
  currentPlayerId: string;
  currentPlayerName: string;
  currentPlayerColor: string;
  destinationName: string;
  calendarText: string;
  onOpenDrawer: () => void;
  /** 現在の年度イベント(「今年の湘南」)の表示。YearEventAnnounceModalの演出が終わった後も、
   *  ここで常時確認できるようにする。省略時(データ未解決)はバッジ自体を出さない。 */
  yearEvent?: { icon: string; label: string; description: string } | null;
  /** rolling(サイコロを振る前)〜moving/selectingRoute(移動中)の間、目的地までの最短マス数を
   *  追加表示する。remainingMovesはmoving/selectingRouteのときだけ値を持ち(rolling中はnull)、
   *  その場合は残りマス数の行を出さない。 */
  movementInfo?: { remainingMoves: number | null; distanceToDestination: number | null };
}

/** マップ上部に常時表示する最小限のHUD。手番・目的地・年月・今年の年度イベントだけを見せる。 */
export function GameHud({
  currentPlayerId,
  currentPlayerName,
  currentPlayerColor,
  destinationName,
  calendarText,
  onOpenDrawer,
  yearEvent,
  movementInfo,
}: GameHudProps) {
  // Polish Phase 3a: 「○○さんの番」表示を、手番が実際に別プレイヤーへ切り替わった瞬間
  // だけ一瞬強調する。初回mount(prevRefがまだnull)では発火させない(誤発火防止、
  // useGameplaySoundEffects.tsのprevDiceResultRefと同じ考え方)。
  const [justChanged, setJustChanged] = useState(false);
  const prevPlayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPlayerIdRef.current;
    prevPlayerIdRef.current = currentPlayerId;
    if (prev === null || prev === currentPlayerId || currentPlayerId === "") return;
    setJustChanged(true);
    const timer = window.setTimeout(() => setJustChanged(false), TURN_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [currentPlayerId]);

  return (
    <div
      // ノッチ/Dynamic Island(上)とホームインジケーター寄りの左右エッジを想定し、
      // env(safe-area-inset-*)を最小余白として確保する。PCではenv()が0なのでmax()の
      // 結果が既存の値と一致し、レイアウトは変わらない。
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 border-b border-amber-900/10 bg-linear-to-b from-amber-50/90 to-white/75 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))] shadow-sm backdrop-blur-sm dark:border-amber-100/10 dark:from-slate-900/85 dark:to-slate-900/70 sm:pt-[max(0.625rem,env(safe-area-inset-top,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pb-2.5 sm:pl-[max(1rem,env(safe-area-inset-left,0px))]"
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs sm:text-sm">
          <span
            className={`flex min-w-0 items-center gap-1.5 font-bold text-slate-800 dark:text-white ${justChanged ? "animate-highlight-slam" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: currentPlayerColor }} />
            <span className="truncate">{currentPlayerName}さんの番</span>
          </span>
          <span className="text-slate-300 dark:text-slate-600">・</span>
          <span className="truncate text-slate-600 dark:text-slate-300">🎯 {destinationName}</span>
          <span className="text-slate-300 dark:text-slate-600">・</span>
          <span className="shrink-0 font-mono text-slate-500 dark:text-slate-400">{calendarText}</span>
          {yearEvent && (
            <>
              <span className="text-slate-300 dark:text-slate-600">・</span>
              <span
                className="shrink-0 truncate font-semibold text-slate-700 dark:text-slate-200"
                title={yearEvent.description}
              >
                {yearEvent.icon} {yearEvent.label}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="メニューを開く"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-900/15 bg-amber-50/90 text-lg shadow-sm dark:border-amber-100/10 dark:bg-slate-800 dark:text-white sm:h-9 sm:w-9"
        >
          ☰
        </button>
      </div>

      {movementInfo && (
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
          {movementInfo.remainingMoves !== null && <span>🎲 あと{movementInfo.remainingMoves}マス</span>}
          {movementInfo.distanceToDestination !== null && (
            <span>🎯 目的地まであと{movementInfo.distanceToDestination}マス</span>
          )}
        </div>
      )}
    </div>
  );
}
