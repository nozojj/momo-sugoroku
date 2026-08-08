import type { BuildingOverride, MapData, MapNode, NodeType, PropertyDef, RoadType } from "@/types/game";

/**
 * エディタ(/editor)で行った道路・交差点・マス種別・物件などの編集を、生成済みマップの
 * 上に差分として適用するための型。shonan-full.tsの生成ロジック自体は変更せず、
 * この差分ファイル(overrides.json)だけを編集・保存することで、
 * 手作業で作った道路網(コメント込みの生成コード)を壊さずに済ませている。
 *
 * 将来キャラクター設定などマップ以外の編集対象を追加する場合も、この型に新しい
 * トップレベルキーを追加するだけで済むように、フラットな構成にしている。
 */
export interface AddedNode {
  id: string;
  name: string;
  x: number;
  y: number;
  area?: string;
  /** 省略時は "normal" */
  type?: NodeType;
  propertyGroupId?: string;
  isDestinationCandidate?: boolean;
  isMajorHub?: boolean;
}

export type NodePatch = Partial<
  Pick<MapNode, "type" | "name" | "area" | "propertyGroupId" | "isDestinationCandidate" | "isMajorHub">
>;

export interface ModifiedNode {
  id: string;
  patch: NodePatch;
}

export interface MovedNode {
  id: string;
  x: number;
  y: number;
}

export interface AddedEdge {
  from: string;
  to: string;
  roadType: RoadType;
  requiresCardId?: string;
}

export interface ModifiedEdge {
  from: string;
  to: string;
  roadType?: RoadType;
  /** nullを渡すと既存のrequiresCardId指定を解除する */
  requiresCardId?: string | null;
}

export interface RemovedEdge {
  from: string;
  to: string;
}

export interface MapOverrides {
  addedNodes: AddedNode[];
  /** 既存(base)ノードの座標上書き。addedNodesのidは対象にならない。 */
  movedNodes: MovedNode[];
  /** 既存(base)ノードのプロパティ上書き。addedNodesのidは対象にならない。 */
  modifiedNodes: ModifiedNode[];
  removedNodes: string[];
  addedEdges: AddedEdge[];
  /** 既存の辺のroadType/requiresCardIdを変更する。 */
  modifiedEdges: ModifiedEdge[];
  removedEdges: RemovedEdge[];
  /** エディタで作成した物件定義。 */
  customProperties: PropertyDef[];
  /** 建物の個別設定(ノードごとに最大1件)。マス・物件のゲームロジックには影響しない。 */
  buildingOverrides: BuildingOverride[];
  /** ゲーム開始地点の上書き。未指定または解決不能な場合はbase.startNodeIdを使う。 */
  startNodeId?: string;
}

export const EMPTY_OVERRIDES: MapOverrides = {
  addedNodes: [],
  movedNodes: [],
  modifiedNodes: [],
  removedNodes: [],
  addedEdges: [],
  modifiedEdges: [],
  removedEdges: [],
  customProperties: [],
  buildingOverrides: [],
  startNodeId: undefined,
};

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

/**
 * 適用順序: modify → move → remove → add(node) → add/modify(edge) → startNodeId解決。
 * modifiedNodes/movedNodesは必ず「baseノードのみのマップ」に対して行うため、
 * addedNodesのidが誤ってmovedNodes/modifiedNodesに混入しても対象が見つからず
 * 無害化される(addedNodes自身のフィールドは呼び出し側が直接書き換えればよい)。
 */
export function applyMapOverrides(base: MapData, overrides: MapOverrides): MapData {
  const byId = new Map<string, MapNode>(base.nodes.map((n) => [n.id, { ...n, connections: [...n.connections] }]));

  for (const mn of overrides.modifiedNodes) {
    const node = byId.get(mn.id);
    if (!node) continue;
    Object.assign(node, mn.patch);
  }

  for (const mv of overrides.movedNodes) {
    const node = byId.get(mv.id);
    if (!node) continue;
    node.x = mv.x;
    node.y = mv.y;
  }

  const removedNodeSet = new Set(overrides.removedNodes);
  const removedEdgeKeys = new Set(overrides.removedEdges.map((e) => edgeKey(e.from, e.to)));

  const nodes: MapNode[] = [...byId.values()]
    .filter((n) => !removedNodeSet.has(n.id))
    .map((n) => ({
      ...n,
      connections: n.connections.filter(
        (c) => !removedNodeSet.has(c.to) && !removedEdgeKeys.has(edgeKey(n.id, c.to)),
      ),
    }));

  for (const me of overrides.modifiedEdges) {
    const key = edgeKey(me.from, me.to);
    if (removedEdgeKeys.has(key)) continue;
    for (const [a, b] of [
      [me.from, me.to],
      [me.to, me.from],
    ]) {
      const node = nodes.find((n) => n.id === a);
      const conn = node?.connections.find((c) => c.to === b);
      if (!conn) continue;
      if (me.roadType !== undefined) conn.roadType = me.roadType;
      if (me.requiresCardId !== undefined) {
        if (me.requiresCardId === null) delete conn.requiresCardId;
        else conn.requiresCardId = me.requiresCardId;
      }
    }
  }

  for (const an of overrides.addedNodes) {
    nodes.push({
      id: an.id,
      name: an.name,
      type: an.type ?? "normal",
      x: an.x,
      y: an.y,
      connections: [],
      area: an.area,
      propertyGroupId: an.propertyGroupId,
      isDestinationCandidate: an.isDestinationCandidate,
      isMajorHub: an.isMajorHub,
    });
  }

  const finalById = new Map(nodes.map((n) => [n.id, n]));
  for (const ae of overrides.addedEdges) {
    const from = finalById.get(ae.from);
    const to = finalById.get(ae.to);
    if (!from || !to) continue;
    if (!from.connections.some((c) => c.to === ae.to)) {
      from.connections.push({ to: ae.to, roadType: ae.roadType, requiresCardId: ae.requiresCardId });
    }
    if (!to.connections.some((c) => c.to === ae.from)) {
      to.connections.push({ to: ae.from, roadType: ae.roadType, requiresCardId: ae.requiresCardId });
    }
  }

  const startNodeId =
    overrides.startNodeId && finalById.has(overrides.startNodeId) ? overrides.startNodeId : base.startNodeId;

  const overriddenBuildingNodeIds = new Set(overrides.buildingOverrides.map((o) => o.nodeId));
  const buildingOverrides = [
    ...(base.buildingOverrides ?? []).filter((o) => !overriddenBuildingNodeIds.has(o.nodeId)),
    ...overrides.buildingOverrides,
  ];

  return { ...base, nodes, startNodeId, buildingOverrides };
}
