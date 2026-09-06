"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Polish Phase 3a: サイコロ演出(フェイクロール→本当の出目)のフェーズ管理。
 * 「idle」(演出なし)→「rolling」(Dice.tsx側でランダムな面を切り替えて見せる、表示専用)→
 * 「settling」(本当のdiceResultを見せて短くバウンドさせる)→「idle」の順で1往復する。
 * ゲームロジック(gameStore.tsのrollDice()/resolveDiceRoll())の乱数決定には一切関与しない、
 * 純粋な表示タイミングだけを管理する薄いフック(useGameplaySoundEffects.ts/useBgmController.tsと
 * 同じ「storeの値を読んで、副作用/ローカルstateだけを持つ」設計)。新しいGameStatusは追加せず、
 * このフックが返すローカルなDiceRevealPhaseだけで完結させる。
 */
export type DiceRevealPhase = "idle" | "rolling" | "settling";

export const DICE_FAKE_ROLL_MS = 450;
export const DICE_SETTLE_MS = 180;

/**
 * diceResultがnull→非nullになった瞬間(=rollDice()が実行された瞬間。CPU/人間どちらの経路でも
 * 同じstate変化を通るため区別しない)を検知して"rolling"へ入り、時間経過だけで
 * "settling"→"idle"へ自動的に戻る。FinalRaceSequence.tsxのeliminationStage
 * (holding→departing→settled)と同じ「ガード+setTimeoutを1つのeffectにまとめ、次の段階への
 * state遷移だけを行う」設計を踏襲する。
 */
export function useDiceRevealPhase(diceResult: number | null): DiceRevealPhase {
  const [phase, setPhase] = useState<DiceRevealPhase>("idle");
  // undefinedは「まだ一度もdiceResultを観測していない(=mount直後)」を表す特別な初期値で、
  // null(=「前回は未ロール状態だった」)とは区別する。これにより、永続化された保存データの
  // 復元直後などdiceResultが最初からnon-nullで始まるケースでも、mount直後に誤って
  // "rolling"へ入らない(そのターンは既にロール済みなので、いまさらフェイクロールを
  // 見せる必要が無い)。
  const prevDiceResultRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevDiceResultRef.current;
    prevDiceResultRef.current = diceResult;
    if (diceResult !== null && prev === null) setPhase("rolling");
  }, [diceResult]);

  useEffect(() => {
    if (phase !== "rolling") return;
    const timer = window.setTimeout(() => setPhase("settling"), DICE_FAKE_ROLL_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "settling") return;
    const timer = window.setTimeout(() => setPhase("idle"), DICE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return phase;
}
