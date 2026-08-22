"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { playSE } from "@/lib/audio/soundManager";

/**
 * dice_roll/step_moveの発火(Phase10/P10-1)。gameStore.tsからは呼ばない方針
 * (soundManager.tsのコメント参照)のため、useCpuAutoplay.tsと同じ「storeを読んで
 * 副作用だけ起こす薄いフック」として独立させる。CPU/人間は区別しない
 * (既存の車移動アニメーション・視覚演出自体がCPU/人間で区別されていないため)。
 *
 * どちらも「タイマーが発火した回数」ではなく「実際に状態が変化した回数」をrefで検知する。
 * advanceStep()(gameStore.ts)はremainingMoves<=0(着地専用tick)やoptions.length>1
 * (分岐選択待ちtick)でも呼ばれるが、これらは実際には移動していないため、そのまま
 * タイマー発火のたびに鳴らすと誤発火する。
 */
export function useGameplaySoundEffects(): void {
  const status = useGameStore((s) => s.status);
  const diceResult = useGameStore((s) => s.diceResult);
  const moveHistoryLength = useGameStore((s) => s.players[s.currentPlayerIndex]?.moveHistory.length ?? null);

  // dice_roll: diceResultがnull→非nullになった瞬間だけ発火。rollDice()が唯一の書き込み元で、
  // CPU(useCpuAutoplay.ts)・人間(Dice.tsx)どちらの呼び出しも同じset()を通るため区別なく検知できる。
  const prevDiceResultRef = useRef<number | null>(null);
  useEffect(() => {
    if (diceResult !== null && prevDiceResultRef.current === null) {
      playSE("dice_roll");
    }
    prevDiceResultRef.current = diceResult;
  }, [diceResult]);

  // step_move: status==="moving"の間にmoveHistory.lengthが直前より増えた瞬間だけ発火。
  // stepBack()(gameStore.ts)は逆に配列を縮めるので自然に除外される。
  //
  // プレイヤー交代時の誤発火について: advanceToNextTurn()(gameStore.ts)はcurrentPlayerIndexと
  // status:"rolling"を必ず同じset()呼び出し内で同時に更新するため、「currentPlayerIndexは
  // 次のプレイヤーに切り替わっているのにstatusはまだ"moving"のまま」という中間状態は
  // 構造的に発生しない。そのため次のプレイヤーの手持ちmoveHistory(前回ターンの残り、
  // 今回分より長い場合がある)がstatus==="moving"以外のレンダーで観測され、prevRefを
  // 上書きしてから初めて次のrollDice()(=moveHistory長を1にリセットしてstatus:"moving"へ)を
  // 迎えるため、誤ってstep_moveが鳴ることはない(useGameplaySoundEffects.test.tsで保証)。
  const prevMoveHistoryLenRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      status === "moving" &&
      moveHistoryLength !== null &&
      prevMoveHistoryLenRef.current !== null &&
      moveHistoryLength > prevMoveHistoryLenRef.current
    ) {
      playSE("step_move");
    }
    prevMoveHistoryLenRef.current = moveHistoryLength;
  }, [status, moveHistoryLength]);
}
