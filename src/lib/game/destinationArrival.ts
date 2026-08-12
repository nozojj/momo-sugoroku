import type { ArrivalInfo, MapData, Player } from "@/types/game";
import { getNode, pickRandomDestination } from "@/lib/game/mapGraph";
import { DESTINATION_BONUS } from "@/lib/game/engine";

export type DestinationArrivalResult =
  | { arrived: false }
  | {
      arrived: true;
      /** ボーナス加算・destinationsReached+1を反映した後のプレイヤー一覧。 */
      players: Player[];
      /** pickRandomDestination()で新しく抽選された次の目的地ノードID。 */
      destinationNodeId: string;
      arrivalInfo: ArrivalInfo;
      logMessage: string;
    };

/**
 * gameStore.tsのcheckDestinationArrival()に直接書かれていた、目的地到着時の判定・計算部分を
 * そのまま切り出した純関数。get()/set()やuseGameStoreには一切依存しない。
 *
 * 呼び出し側(checkDestinationArrival())は、remainingMoves<=0で最終停止した後にしかこの関数を
 * 呼ばないという前提を維持したまま変わらない。この関数自体は「今、目的地ノードの上にいるか」だけを
 * 見て判定するので、通過中(呼ばれない)か最終停止時(呼ばれる)かという発火タイミングの制御には
 * 一切関与しない。
 */
export function detectDestinationArrival(
  map: MapData,
  player: Player,
  players: Player[],
  destinationNodeId: string,
): DestinationArrivalResult {
  if (player.currentNodeId !== destinationNodeId) return { arrived: false };

  const arrivedNode = getNode(map, destinationNodeId);
  const playersAfterBonus = players.map((p) =>
    p.id === player.id
      ? { ...p, money: p.money + DESTINATION_BONUS, destinationsReached: p.destinationsReached + 1 }
      : p,
  );
  const nextDestinationId = pickRandomDestination(map, destinationNodeId);
  const nextDestination = getNode(map, nextDestinationId);

  return {
    arrived: true,
    players: playersAfterBonus,
    destinationNodeId: nextDestinationId,
    arrivalInfo: {
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      destinationName: arrivedNode.name,
      bonus: DESTINATION_BONUS,
      nextDestinationName: nextDestination.name,
    },
    logMessage: `${player.name}さんが目的地「${arrivedNode.name}」に到着! ボーナス+${DESTINATION_BONUS}万円。次の目的地は「${nextDestination.name}」`,
  };
}
