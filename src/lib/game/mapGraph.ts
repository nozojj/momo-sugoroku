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
 * fromId から toId までの最短経路をBFSで求め、通ったノードIDを fromId から toId まで順に返す
 * (fromId自身・toId自身を含む)。あくまで案内表示用の情報で、移動そのものには使わない
 * (自動移動・最短強制はしない)。所持カードが無いと通れない近道(requiresCardId)は除外して
 * 計算する(実際に辿れる経路と一致させるため)。到達不能な場合はnullを返す。
 *
 * 将来「盤面上で最短ルートを光らせる」演出を追加する際は、この関数の戻り値(nodeId配列)を
 * そのままBoard.tsx側の描画対象として使える設計にしている。
 */
export function shortestPath(map: MapData, fromId: string, toId: string, ownedCardIds: string[]): string[] | null {
  if (fromId === toId) return [fromId];
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();
  let frontier = [fromId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const node = getNode(map, id);
      for (const edge of node.connections) {
        if (edge.requiresCardId && !ownedCardIds.includes(edge.requiresCardId)) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        parent.set(edge.to, id);
        if (edge.to === toId) {
          const path = [toId];
          let cur = toId;
          while (cur !== fromId) {
            cur = parent.get(cur)!;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * fromId から toId までの最短経路のマス数。shortestPath()に委譲するだけの薄いラッパーで、
 * BFSの走査条件(カードゲート・訪問済み判定)を1箇所(shortestPath)にまとめている。
 * 到達不能な場合はnullを返す。
 */
export function shortestDistance(map: MapData, fromId: string, toId: string, ownedCardIds: string[]): number | null {
  const path = shortestPath(map, fromId, toId, ownedCardIds);
  return path ? path.length - 1 : null;
}
