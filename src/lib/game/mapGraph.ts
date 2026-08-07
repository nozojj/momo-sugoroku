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

/**
 * fromId から toId までの最短経路のマス数をBFSで求める。あくまで案内表示用の情報で、
 * 移動そのものには使わない(自動移動・最短強制はしない)。
 * 所持カードが無いと通れない近道は除外して計算する(実際に辿れる距離と一致させるため)。
 * 到達不能な場合はnullを返す。
 */
export function shortestDistance(map: MapData, fromId: string, toId: string, ownedCardIds: string[]): number | null {
  if (fromId === toId) return 0;
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  let distance = 0;

  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];
    for (const id of frontier) {
      const node = getNode(map, id);
      for (const edge of node.connections) {
        if (edge.requiresCardId && !ownedCardIds.includes(edge.requiresCardId)) continue;
        if (visited.has(edge.to)) continue;
        if (edge.to === toId) return distance;
        visited.add(edge.to);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  return null;
}
