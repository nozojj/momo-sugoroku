"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Polish Phase 3b: 今回のロールの合計移動マス数(moveTempo.tsのgetStepAnimationMs()が
 * 必要とするtotalSteps)を保持する薄いフック。Phase 3aのuseDiceRevealPhase.tsと同じ
 * 「diceResultのnull→非null遷移だけを見る、storeへは一切書き込まない」設計を踏襲する。
 *
 * diceResult(サイコロの見た目の出目、rawSum)ではなく、rollDice()直後のremainingMoves
 * (doubleMove等の修飾を適用済みの実際の移動マス数)を1回だけキャプチャする
 * (diceResultとremainingMovesの初期値はdoubleMove/halveDiceのようなカード効果でズレることが
 * あるため、diceResultはtotalStepsの代わりに使えない)。
 *
 * 分岐(status:"selectingRoute")中もchooseRoute()/stepBack()はdiceResultを一切書き換えない
 * ため、この値は分岐をまたいでも保持され続ける(=分岐後に「再発進」扱いにしない、という
 * Phase 3b調査のA案をこのフック側の変更なしに実現できる)。
 */
export function useMoveTotalSteps(diceResult: number | null, remainingMoves: number): number | null {
  const [totalSteps, setTotalSteps] = useState<number | null>(null);
  // undefinedは「まだ一度もdiceResultを観測していない(=mount直後)」を表す特別な初期値で、
  // null(=「前回は未ロール状態だった」)とは区別する。useDiceRevealPhase.tsと同じ理由
  // (永続化された保存データの復元直後などdiceResultが最初からnon-nullで始まるケースで、
  // mount直後に誤って古いremainingMovesをtotalStepsとしてキャプチャしないようにするため)。
  const prevDiceResultRef = useRef<number | null | undefined>(undefined);

  // 新しいロールが始まった瞬間(diceResult null→非null)だけ、このロールの合計移動マス数を
  // 1回だけキャプチャする。
  useEffect(() => {
    const prev = prevDiceResultRef.current;
    prevDiceResultRef.current = diceResult;
    if (diceResult !== null && prev === null) setTotalSteps(remainingMoves);
  }, [diceResult, remainingMoves]);

  // 手番送り(advanceToNextTurn())等でdiceResultがnullへリセットされたら、次のロールまでは
  // 明示的にnullへ戻しておく(古い値が意味なく残り続けないようにする)。
  useEffect(() => {
    if (diceResult === null) setTotalSteps(null);
  }, [diceResult]);

  return totalSteps;
}
