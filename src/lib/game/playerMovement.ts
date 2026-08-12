import type { Player } from "@/types/game";

/**
 * gameStore.tsのadvanceStep()(単一経路移動)とchooseRoute()に一字一句同一の形で
 * 重複していた、プレイヤーの「1マス前進」更新だけをそのまま切り出した純関数。
 * 責務はcurrentNodeIdの更新とmoveHistoryへの追加の2つだけに限定する。
 *
 * remainingMovesはPlayerではなくGameState側のフィールドであり、この関数の対象外。
 * 呼び出し側(gameStore.ts)が従来どおりstate.remainingMoves - 1を行う。
 */
export function movePlayerForward(player: Player, toNodeId: string): Player {
  return {
    ...player,
    moveHistory: [...player.moveHistory, toNodeId],
    currentNodeId: toNodeId,
  };
}
