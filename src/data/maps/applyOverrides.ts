import type { MapData, MapNode, RoadType } from "@/types/game";

/**
 * エディタ(/editor)で行った道路・交差点の追加/削除を、生成済みマップの上に
 * 差分として適用するための型。shonan-full.tsの生成ロジック自体は変更せず、
 * この差分ファイル(overrides.json)だけを編集・保存することで、
 * 手作業で作った道路網(コメント込みの生成コード)を壊さずに済ませている。
 */
export interface MapOverrides {
  addedNodes: { id: string; name: string; x: number; y: number; area?: string }[];
  addedEdges: { from: string; to: string; roadType: RoadType }[];
  removedEdges: { from: string; to: string }[];
  removedNodes: string[];
}

export const EMPTY_OVERRIDES: MapOverrides = {
  addedNodes: [],
  addedEdges: [],
  removedEdges: [],
  removedNodes: [],
};

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export function applyMapOverrides(base: MapData, overrides: MapOverrides): MapData {
  const removedNodeSet = new Set(overrides.removedNodes);
  const removedEdgeKeys = new Set(overrides.removedEdges.map((e) => edgeKey(e.from, e.to)));

  const nodes: MapNode[] = base.nodes
    .filter((n) => !removedNodeSet.has(n.id))
    .map((n) => ({
      ...n,
      connections: n.connections.filter(
        (c) => !removedNodeSet.has(c.to) && !removedEdgeKeys.has(edgeKey(n.id, c.to)),
      ),
    }));

  for (const an of overrides.addedNodes) {
    nodes.push({
      id: an.id,
      name: an.name,
      type: "normal",
      x: an.x,
      y: an.y,
      connections: [],
      area: an.area,
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const ae of overrides.addedEdges) {
    const from = byId.get(ae.from);
    const to = byId.get(ae.to);
    if (!from || !to) continue;
    if (!from.connections.some((c) => c.to === ae.to)) {
      from.connections.push({ to: ae.to, roadType: ae.roadType });
    }
    if (!to.connections.some((c) => c.to === ae.from)) {
      to.connections.push({ to: ae.from, roadType: ae.roadType });
    }
  }

  return { ...base, nodes };
}
