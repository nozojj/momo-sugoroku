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

/**
 * ぶっとび系カードのワープ先として着地させてよいノードか。
 * - 接続0件(孤立ノード)は理論上存在しないが防御的に除外する。
 * - type:"warp"(将来の固定ワープマス用に予約された種別。現状マップ上に使用例は無い)は
 *   カードのランダムワープ先としては意味が衝突しうるので除外する。
 * - 全ての出口がカード必須(requiresCardId)で、かつそのカードを持っていない場合は、
 *   着地後そのプレイヤーが身動き取れなくなる(現状マップ上にそのようなノードは無いが、
 *   将来requiresCardId付きの道が追加されても詰まないようにする防御)。
 */
export function isWarpCandidate(node: MapNode, ownedCardIds: string[]): boolean {
  if (node.type === "warp") return false;
  if (node.connections.length === 0) return false;
  return node.connections.some((e) => !e.requiresCardId || ownedCardIds.includes(e.requiresCardId));
}

/**
 * 与えられたノード列(呼び出し側が既に絞り込んだ候補プール)から、構造的に着地させてよいもの
 * (isWarpCandidate)だけを対象にランダムに1件選ぶ。有効な候補が1件も無ければ(理論上ほぼ
 * 発生しないが)元のプール全体にフォールバックする。
 *
 * ぶっとび系(pickWarpTarget)・場所指定系(targetSelectEffects.tsのregion/propertyGroup)の
 * どちらも最終的にはここへ合流する: 「基準ノードを候補に含めるか除外するか」は呼び出し側が
 * 渡すノード列そのもので制御し、この関数自身は一切除外ロジックを持たない。
 */
export function pickWarpTargetAmong(nodes: MapNode[], ownedCardIds: string[]): string {
  const valid = nodes.filter((n) => isWarpCandidate(n, ownedCardIds));
  const pool = valid.length > 0 ? valid : nodes;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** "nearby"スコープの近傍判定に使う半径(ボード座標系のpx)。MapNode.areaは598ノード中45件が
 *  未設定・大半が1ノードだけのシングルトン値で「同じ街」判定に使えなかったため、座標ベースの
 *  地理的近さで代替する。実測: この半径なら最悪でも17件・中央値54件の候補が確保できる。
 *  調整用定数。実機確認後はこの1箇所だけ変更すればよい。 */
export const NEARBY_WARP_RADIUS = 250;

/**
 * ぶっとび系カード(scope: "anywhere" | "nearby")のワープ先を1つ選ぶ。
 * destinationスコープ(現在の目的地マスへ直行)はstate.destinationNodeIdをそのまま使えばよく、
 * 候補選定が不要なのでこの関数の対象外(warpEffects.tsのWARP_HANDLERS側で直接返す)。
 *
 * ここでは「現在地(fromNodeId)自身は候補から除外する」(その場に留まるだけの結果を避けるため)。
 * 場所指定系(地域を選ぶ等)のように基準ノード自体を候補に含めたい場合は、この関数を使わず
 * pickWarpTargetAmong()に直接、基準ノードを含めたノード列を渡す(targetSelectEffects.ts参照)。
 */
export function pickWarpTarget(
  map: MapData,
  scope: "anywhere" | "nearby",
  fromNodeId: string,
  ownedCardIds: string[],
): string {
  const origin = getNode(map, fromNodeId);
  const excludingOrigin = map.nodes.filter((n) => n.id !== fromNodeId);
  const nearbyPool = excludingOrigin.filter((n) => Math.hypot(n.x - origin.x, n.y - origin.y) <= NEARBY_WARP_RADIUS);
  const pool = scope === "nearby" && nearbyPool.length > 0 ? nearbyPool : excludingOrigin;
  return pickWarpTargetAmong(pool, ownedCardIds);
}

/** 目的地候補として扱ってよいノード一覧。isDestinationCandidateが1件も無ければ全ノードへ
 *  フォールバックする(マップ編集で目的地候補が消えてもゲームが起動できるようにする防御)。
 *  pickRandomDestination()の候補プールと、station/region選択系カードの選択肢一覧が
 *  同じ考え方を共有できるよう1箇所にまとめてある。 */
export function destinationCandidateNodes(map: MapData): MapNode[] {
  const flagged = map.nodes.filter((n) => n.isDestinationCandidate);
  return flagged.length > 0 ? flagged : map.nodes;
}

export function pickRandomDestination(map: MapData, excludeNodeId?: string): string {
  const basePool = destinationCandidateNodes(map);
  const excludingCurrent = basePool.filter((n) => n.id !== excludeNodeId);
  const pool = excludingCurrent.length > 0 ? excludingCurrent : basePool;
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
