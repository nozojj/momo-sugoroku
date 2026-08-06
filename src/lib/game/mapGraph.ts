import type { MapData, MapNode, RoadEdge } from "@/types/game";

export function getNode(map: MapData, nodeId: string): MapNode {
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node id: ${nodeId}`);
  return node;
}

/**
 * あるノードから次に進める道を返す。
 * - 所持カードが足りない近道は除外する。
 * - 直前にいたノードへ戻る道は基本的に除外する(行ったり来たりの往復を避けるため)。
 *   ただしそれが行き止まりで他に道がない場合は、戻る道だけを許可する。
 */
export function getTraversableOptions(
  node: MapNode,
  previousNodeId: string | null,
  ownedCardIds: string[],
): RoadEdge[] {
  const allowedByCard = node.connections.filter(
    (edge) => !edge.requiresCardId || ownedCardIds.includes(edge.requiresCardId),
  );
  const excludingBackward = allowedByCard.filter((edge) => edge.to !== previousNodeId);
  if (excludingBackward.length > 0) return excludingBackward;
  // 行き止まり: 戻る以外に道がない
  return allowedByCard;
}

export function pickRandomDestination(map: MapData, excludeNodeId?: string): string {
  const candidates = map.nodes.filter(
    (n) => n.isDestinationCandidate && n.id !== excludeNodeId,
  );
  const byFlag = map.nodes.filter((n) => n.isDestinationCandidate);
  // 目的地候補が編集で1件も残っていない場合でもゲームが起動できるよう、
  // 全ノードから選ぶところまでフォールバックする。
  const pool = candidates.length > 0 ? candidates : byFlag.length > 0 ? byFlag : map.nodes;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked.id;
}

export function rollDice(): number {
  return 1 + Math.floor(Math.random() * 6);
}
