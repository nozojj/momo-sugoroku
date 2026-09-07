"use client";

import { useEffect, useState } from "react";
import type { GameStatus } from "@/types/game";

/**
 * Polish Phase 3c: 「最後の1マスへの視覚transitionが完了してから、マス効果(resolveLanding())が
 * 発生するまで」の短い着地演出フェーズ。Phase3a(useDiceRevealPhase)/Phase3b
 * (useMoveTotalSteps)と同じ「storeの値を読んで、副作用/ローカルstateだけを持つ薄いフック」
 * 設計を踏襲する。gameStore.ts・GameState・GameStatusには一切変更を加えず、このフックが
 * 返すローカルなLandingSettlePhaseだけで完結させる。
 *
 * "idle": 演出なし(移動中、または着地tick以外)。
 * "settling": remainingMoves===0(=着地マスに到達し、あとはresolveLanding()を呼ぶだけの状態)に
 *   なってからtransitionMs(=最後の1マスの視覚transition時間、moveTempo.tsのgetStepTransitionMs()
 *   から算出済みの値をGameScreen.tsxが渡す)が経過した後だけtrueになる。
 *   「車が完全に止まった後の短い間」だけを表す値で、実際にresolveLanding()をいつ呼ぶか
 *   (=GameScreen.tsx側の別のuseEffect)には関与しない。
 */
export type LandingSettlePhase = "idle" | "settling";

/** transition完了後、resolveLanding()が呼ばれるまでの着地settle時間(ms)。
 *  「跳ねる」というより「ピタッと止まったときの軽い反動」程度に留める、
 *  何十回見ても邪魔にならない短さ。 */
export const LANDING_SETTLE_MS = 150;

export function useLandingSettlePhase(status: GameStatus, remainingMoves: number, transitionMs: number): LandingSettlePhase {
  // 「着地マスに到達し、あとはresolveLanding()を呼ぶだけ」の状態かどうか。advanceStep()が
  // resolveLanding()を呼ぶと必ずstatusが"moving"以外へ変わる(gameStore.ts既存仕様)ため、
  // resolveLanding()が実行された瞬間にこの値が確実にfalseへ戻る。
  const isAtLandingTick = status === "moving" && remainingMoves === 0;
  const [phase, setPhase] = useState<LandingSettlePhase>("idle");

  // 着地tickを離れた瞬間(=resolveLanding()が呼ばれた、または移動が再開した)に即座にidleへ戻す。
  useEffect(() => {
    if (!isAtLandingTick) setPhase("idle");
  }, [isAtLandingTick]);

  // 着地tickに入ってからtransitionMs(=最後の1マスの視覚transitionが完了するまでの時間)
  // 経過後だけ"settling"にする。FinalRaceSequence.tsxのeliminationStageと同じ
  // 「ガード+setTimeoutを1つのeffectにまとめる」設計。
  useEffect(() => {
    if (!isAtLandingTick) return;
    const timer = window.setTimeout(() => setPhase("settling"), transitionMs);
    return () => window.clearTimeout(timer);
  }, [isAtLandingTick, transitionMs]);

  return phase;
}
