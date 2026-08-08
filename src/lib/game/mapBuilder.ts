import type { NodeType, PropertyDef, PropertyGroup, RoadType } from "@/types/game";

export interface GeneratedNodeSpec {
  id: string;
  name: string;
  type: NodeType;
  area: string;
  x: number;
  y: number;
  propertyGroupId?: string;
}

export interface GeneratedEdgeSpec {
  from: string;
  to: string;
  roadType: RoadType;
  requiresCardId?: string;
}

/** 自動生成される物件・物件グループの受け皿。1件の生成物件につき1グループ(1:1)を作る。 */
export interface GeneratedPropertyPool {
  properties: PropertyDef[];
  groups: PropertyGroup[];
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ------------------------------------------------------------------
// マス同士の最小距離の確保。
// 生成される道はそれぞれ自分の始点・終点しか見ずに独立して蛇行するため、
// 何もしないと別々の道のマスが偶然重なったり、細かく交差したりする。
// 生成した点はすべてここへ登録し、既存の点に近すぎる新しい点は押し出して回避する。
// ------------------------------------------------------------------
const MIN_NODE_DIST = 24;
const placedPoints: { x: number; y: number }[] = [];

/** 既存のどの点とも最小距離を保つよう(x, y)を必要なら押し出し、登録する。 */
function claimSpacedPosition(x: number, y: number): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let attempt = 0; attempt < 8; attempt++) {
    let nearest: { x: number; y: number; d: number } | null = null;
    for (const p of placedPoints) {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < MIN_NODE_DIST && (!nearest || d < nearest.d)) nearest = { x: p.x, y: p.y, d };
    }
    if (!nearest) break;
    const dx = px - nearest.x;
    const dy = py - nearest.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = MIN_NODE_DIST - nearest.d + 1;
    px += (dx / len) * push;
    py += (dy / len) * push;
  }
  const resolved = { x: Math.round(px), y: Math.round(py) };
  placedPoints.push(resolved);
  return resolved;
}

/** 手動配置(街のハブなど)の座標を、動かさずに登録だけする。以降のマスがこの点を避けるようになる。 */
function registerFixedPosition(x: number, y: number) {
  placedPoints.push({ x, y });
}

const FILLER_TYPE_TABLE: { threshold: number; type: NodeType }[] = [
  { threshold: 44, type: "normal" },
  { threshold: 64, type: "money" },
  { threshold: 79, type: "card" },
  { threshold: 92, type: "property" },
  { threshold: 100, type: "event" },
];

function pickFillerType(seed: number): NodeType {
  const roll = seed % 100;
  for (const row of FILLER_TYPE_TABLE) {
    if (roll < row.threshold) return row.type;
  }
  return "normal";
}

const MONEY_FLAVORS = ["の自販機コーナー", "商店街の一角", "のコインパーキング横", "の交差点角", "のバス停前"];
const CARD_FLAVORS = ["の掲示板前", "の交番横", "の郵便ポスト前", "の公園入口"];
const EVENT_FLAVORS = ["の工事現場", "の渋滞ポイント", "の踏切前", "の狭い路地"];
const NORMAL_FLAVORS = ["通り", "大通り", "中央通り", "南通り", "北通り", "本通り", "旧道", "新道"];
const SHOP_CATEGORIES = [
  "八百屋", "薬局", "パン工房", "花屋", "本屋", "自転車店", "定食屋", "雑貨店", "文房具店", "電器店",
  "米屋", "豆腐店", "洋品店", "時計店", "喫茶店", "惣菜店", "金物屋", "クリーニング店",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function fillerName(type: NodeType, area: string, seed: number): string {
  switch (type) {
    case "money":
      return `${area}${pick(MONEY_FLAVORS, seed)}`;
    case "card":
      return `${area}${pick(CARD_FLAVORS, seed)}`;
    case "event":
      return `${area}${pick(EVENT_FLAVORS, seed)}`;
    case "property":
      return `${area}の${pick(SHOP_CATEGORIES, seed)}`;
    default:
      return `${area}${pick(NORMAL_FLAVORS, seed)}`;
  }
}

function generatedPropertyPrice(seed: number): number {
  // 300〜650万円のあいだで、種のばらつきで値付けする(小規模な一般物件想定)
  return 300 + (seed % 8) * 50;
}

function generatedPropertyRevenueRate(seed: number): number {
  // 8%〜15%のあいだで、種のばらつきで収益率をつける
  return Math.round((0.08 + (seed % 8) * 0.01) * 100) / 100;
}

/** 自動生成の物件1件+それを1件だけ持つ物件グループ1件を作り、poolに積む。ノードのpropertyGroupIdを返す。 */
function pushGeneratedProperty(pool: GeneratedPropertyPool, nodeId: string, name: string, area: string, seed: number): string {
  const groupId = `${nodeId}_grp`;
  const propertyId = `${nodeId}_prop`;
  pool.groups.push({ id: groupId, name, region: area });
  pool.properties.push({
    id: propertyId,
    name,
    category: SHOP_CATEGORIES[seed % SHOP_CATEGORIES.length],
    price: generatedPropertyPrice(seed),
    assetValue: generatedPropertyPrice(seed),
    groupId,
    revenueRate: generatedPropertyRevenueRate(seed),
  });
  return groupId;
}

interface WindingFillerOptions {
  /** 生成するマスの数(始点・終点は含まない) */
  count: number;
  roadType: RoadType;
  /** マスの地区名(表示・フレーバー生成に使用) */
  area: string;
  /** 生成ノードidの接頭辞(マップ内で一意にすること) */
  idPrefix: string;
  requiresCardId?: string;
  /** 経路全体を弓なりに膨らませる量(px)。同じ2点を結ぶ複数ルートを見分けやすくする。 */
  bias?: number;
  /** 有機的な蛇行の強さ(px)。既定値は区間長から自動計算。 */
  wobble?: number;
  /** trueの場合、money/card/property/eventの抽選をせず、生成マスをすべて type: "normal" にする(物件・イベント機能に触れないマップ土台向け)。 */
  plain?: boolean;
}

/**
 * 2つのハブ(手動配置)のあいだを、蛇行する自動生成マスでつなぐ。
 * 直線ではなく、緩やかな弓なり(bias)+細かい蛇行(wobble)で道路らしいカーブを作る。
 */
export function windingFiller(
  from: { id: string; x: number; y: number },
  to: { id: string; x: number; y: number },
  opts: WindingFillerOptions,
  propertyPool: GeneratedPropertyPool,
): { nodes: GeneratedNodeSpec[]; edges: GeneratedEdgeSpec[] } {
  const nodes: GeneratedNodeSpec[] = [];
  const edges: GeneratedEdgeSpec[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / segLen;
  const ny = dx / segLen;
  const bias = opts.bias ?? 0;
  const wobble = opts.wobble ?? Math.min(22, segLen / (opts.count + 1) * 0.35);

  let prevId = from.id;
  for (let i = 1; i <= opts.count; i++) {
    const t = i / (opts.count + 1);
    const baseX = from.x + dx * t;
    const baseY = from.y + dy * t;
    const bow = bias * Math.sin(t * Math.PI);
    const seed = hashSeed(`${opts.idPrefix}-${i}`);
    const wob = ((seed % 200) / 100 - 1) * wobble; // -wobble..wobble
    const x = Math.round(baseX + nx * (bow + wob));
    const y = Math.round(baseY + ny * (bow + wob));

    const type = opts.plain ? "normal" : pickFillerType(seed);
    const id = `${opts.idPrefix}_${i}`;
    const name = fillerName(type, opts.area, seed);
    const propertyGroupId = type === "property" ? pushGeneratedProperty(propertyPool, id, name, opts.area, seed) : undefined;

    nodes.push({ id, name, type, area: opts.area, x, y, propertyGroupId });
    edges.push({ from: prevId, to: id, roadType: opts.roadType, requiresCardId: opts.requiresCardId });
    prevId = id;
  }
  edges.push({ from: prevId, to: to.id, roadType: opts.roadType, requiresCardId: opts.requiresCardId });

  return { nodes, edges };
}

interface ChainWithBranchesOptions {
  /** 区間全体のおおよそのマス数の目安(分岐で実際の総数は前後する) */
  totalSpan: number;
  /** 分岐と分岐の間隔の目安(小さいほど分岐が増える) */
  checkpointSpacing?: number;
  /** 分岐の各アームのマス数 */
  armSpanA?: number;
  armSpanB?: number;
  area: string;
  idPrefix: string;
  roadTypeA?: RoadType;
  roadTypeB?: RoadType;
  /** 区間全体を弓なりに膨らませる量(px)。同じ2点を結ぶ複数の大ルートを見分けやすくする。 */
  overallBias?: number;
  /** 各分岐の2本のアームを引き離す量(px) */
  forkBias?: number;
}

/**
 * 一本道ではなく、区間の途中に何度も小さな分岐(2択→合流)を挟んで道をつなぐ。
 * 「ずっと一本道」を避け、進む道を選べる交差点を旅の途中に連続して配置するための関数。
 */
export function chainWithBranches(
  from: { id: string; x: number; y: number },
  to: { id: string; x: number; y: number },
  opts: ChainWithBranchesOptions,
  propertyPool: GeneratedPropertyPool,
): { nodes: GeneratedNodeSpec[]; edges: GeneratedEdgeSpec[] } {
  const nodes: GeneratedNodeSpec[] = [];
  const edges: GeneratedEdgeSpec[] = [];

  const spacing = opts.checkpointSpacing ?? 14;
  const armA = opts.armSpanA ?? 4;
  const armB = opts.armSpanB ?? 5;
  const numCheckpoints = Math.max(1, Math.round(opts.totalSpan / spacing));

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const overallLen = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / overallLen;
  const ny = dx / overallLen;
  const overallBias = opts.overallBias ?? 0;
  const forkBias = opts.forkBias ?? 28;

  function anchorAt(t: number) {
    const bow = overallBias * Math.sin(t * Math.PI);
    return { x: from.x + dx * t + nx * bow, y: from.y + dy * t + ny * bow };
  }

  let prev = { id: from.id, x: from.x, y: from.y };
  for (let k = 1; k <= numCheckpoints; k++) {
    const t = k / (numCheckpoints + 1);
    const anchor = anchorAt(t);
    const junctionId = `${opts.idPrefix}_jct${k}`;
    const junction = { id: junctionId, x: Math.round(anchor.x), y: Math.round(anchor.y) };

    const resA = windingFiller(
      prev,
      junction,
      { count: armA, roadType: opts.roadTypeA ?? "coastal", area: opts.area, idPrefix: `${opts.idPrefix}_a${k}`, bias: forkBias },
      propertyPool,
    );
    const resB = windingFiller(
      prev,
      junction,
      { count: armB, roadType: opts.roadTypeB ?? "main", area: opts.area, idPrefix: `${opts.idPrefix}_b${k}`, bias: -forkBias },
      propertyPool,
    );

    nodes.push(...resA.nodes, ...resB.nodes);
    edges.push(...resA.edges, ...resB.edges);
    nodes.push({ id: junctionId, name: `${opts.area}交差点${k}`, type: "normal", area: opts.area, x: junction.x, y: junction.y });

    prev = junction;
  }

  const tailCount = Math.max(2, Math.round(spacing / 2));
  const tail = windingFiller(prev, to, { count: tailCount, roadType: opts.roadTypeB ?? "main", area: opts.area, idPrefix: `${opts.idPrefix}_tail` }, propertyPool);
  nodes.push(...tail.nodes);
  edges.push(...tail.edges);

  return { nodes, edges };
}

export interface RotaryGateSpec {
  /** 中心から見た角度(度)。0=東、-90=北、90=南、180=西。 */
  angle: number;
  /** ゲートの合流先が分かるような名前(例: "湘南台方面") */
  label: string;
}

export interface RotarySpurSpec {
  /** 環状路のどの角度あたりから枝道を出すか */
  fromAngle: number;
  /** 枝道の長さ(マス数、行き止まりの終点を含まない) */
  length: number;
  roadType: RoadType;
  /** 行き止まりの終点マス(実在ランドマークなど)。省略時は生成される通常の枝道マスで終わる。 */
  end?: { name: string; propertyGroupId: string; icon?: string };
}

/** 外周ロータリーの内側にもう1周作る、小さな内周ロータリー(裏通り)の指定。 */
export interface InnerLoopSpec {
  /** 内周ロータリーのマス数 */
  ringSize: number;
  radius: number;
  /** 外周⇄内周をつなぐ放射状の道(スポーク)の本数。付け根は3〜4差路になる。 */
  spokeCount: number;
}

export interface RotaryTownOptions {
  /** 環状路のマス数 */
  ringSize: number;
  radius: number;
  area: string;
  idPrefix: string;
  /** 環状路上に置く駅・中心地(このマスが目的地候補になる) */
  hubName: string;
  hubAngle?: number;
  isMajorHub?: boolean;
  /** 他の街・道路とつなぐための出入口(ここは通常マスになり、接続道路の起点として使う) */
  gates: RotaryGateSpec[];
  /** 環状路から生える行き止まりの枝道(裏通り) */
  spurs?: RotarySpurSpec[];
  /** 指定すると、外周の内側にもう1周ロータリー+スポークを追加する(主要な街向け)。 */
  innerLoop?: InnerLoopSpec;
}

/**
 * 「街」を、環状路(ロータリー)+出入口(ゲート)+行き止まりの枝道(裏通り)として作る。
 * 環状路上のマスは基本的に自動生成の重み付け(通常/お金/カード/物件/イベント)で埋め、
 * 駅とゲートだけは狙った位置(角度)に固定で配置する。
 * `innerLoop`を指定すると、外周の内側にもう1周の小さなロータリーとスポークを追加し、
 * スポークの付け根を3〜4差路の本物の交差点にする(単純な環状路は「戻れない」ルールのせいで
 * 実質一本道になってしまうため、分岐を増やす目的)。
 */
export function buildRotaryTown(
  center: { x: number; y: number },
  opts: RotaryTownOptions,
  propertyPool: GeneratedPropertyPool,
): {
  nodes: GeneratedNodeSpec[];
  edges: GeneratedEdgeSpec[];
  hubNodeId: string;
  gateNodeIds: Record<string, string>;
  spurEndNodeIds: string[];
  ringNodeIds: string[];
  innerRingNodeIds?: string[];
} {
  const nodes: GeneratedNodeSpec[] = [];
  const edges: GeneratedEdgeSpec[] = [];

  const angleToIndex = (angle: number) => {
    const step = 360 / opts.ringSize;
    return ((Math.round(angle / step) % opts.ringSize) + opts.ringSize) % opts.ringSize;
  };

  const hubIndex = angleToIndex(opts.hubAngle ?? -90);
  const gateIndices = new Map<number, RotaryGateSpec>();
  for (const gate of opts.gates) {
    let idx = angleToIndex(gate.angle);
    // 他のゲート・駅と重ならないよう、埋まっていたら隣にずらす
    let guard = 0;
    while ((idx === hubIndex || gateIndices.has(idx)) && guard < opts.ringSize) {
      idx = (idx + 1) % opts.ringSize;
      guard++;
    }
    gateIndices.set(idx, gate);
  }

  const spurIndices = new Map<number, RotarySpurSpec>();
  for (const spur of opts.spurs ?? []) {
    let idx = angleToIndex(spur.fromAngle);
    let guard = 0;
    while ((idx === hubIndex || gateIndices.has(idx) || spurIndices.has(idx)) && guard < opts.ringSize) {
      idx = (idx + 1) % opts.ringSize;
      guard++;
    }
    spurIndices.set(idx, spur);
  }

  const ringIds: string[] = [];
  let hubNodeId = "";
  const gateNodeIds: Record<string, string> = {};

  for (let i = 0; i < opts.ringSize; i++) {
    const angle = (i * 360) / opts.ringSize;
    const rad = (angle * Math.PI) / 180;
    const x = Math.round(center.x + opts.radius * Math.cos(rad));
    const y = Math.round(center.y + opts.radius * Math.sin(rad));
    const id = `${opts.idPrefix}_r${i}`;
    ringIds.push(id);

    if (i === hubIndex) {
      hubNodeId = id;
      nodes.push({ id, name: opts.hubName, type: "normal", area: opts.area, x, y });
      continue;
    }
    const gate = gateIndices.get(i);
    if (gate) {
      gateNodeIds[gate.label] = id;
      nodes.push({ id, name: `${opts.area}${gate.label}口`, type: "normal", area: opts.area, x, y });
      continue;
    }

    const seed = hashSeed(`${opts.idPrefix}-ring-${i}`);
    const type = pickFillerType(seed);
    const name = fillerName(type, opts.area, seed);
    const propertyGroupId = type === "property" ? pushGeneratedProperty(propertyPool, id, name, opts.area, seed) : undefined;
    nodes.push({ id, name, type, area: opts.area, x, y, propertyGroupId });
  }

  // 環状路を一周つなぐ
  for (let i = 0; i < opts.ringSize; i++) {
    const next = (i + 1) % opts.ringSize;
    edges.push({ from: ringIds[i], to: ringIds[next], roadType: "main" });
  }

  // 行き止まりの枝道(裏通り)
  const spurEndNodeIds: string[] = [];
  for (const [idx, spur] of spurIndices) {
    const originId = ringIds[idx];
    const originAngle = (idx * 360) / opts.ringSize;
    const originRad = (originAngle * Math.PI) / 180;
    const originX = center.x + opts.radius * Math.cos(originRad);
    const originY = center.y + opts.radius * Math.sin(originRad);
    const outX = center.x + (opts.radius + 60 * (spur.length + 1)) * Math.cos(originRad);
    const outY = center.y + (opts.radius + 60 * (spur.length + 1)) * Math.sin(originRad);

    const res = windingFiller(
      { id: originId, x: Math.round(originX), y: Math.round(originY) },
      { id: `${opts.idPrefix}_spurEnd_${idx}`, x: Math.round(outX), y: Math.round(outY) },
      { count: Math.max(0, spur.length - 1), roadType: spur.roadType, area: opts.area, idPrefix: `${opts.idPrefix}_spur${idx}` },
      propertyPool,
    );
    nodes.push(...res.nodes);
    edges.push(...res.edges);

    const endId = `${opts.idPrefix}_spurEnd_${idx}`;
    if (spur.end) {
      nodes.push({ id: endId, name: spur.end.name, type: "property", area: opts.area, x: Math.round(outX), y: Math.round(outY), propertyGroupId: spur.end.propertyGroupId });
    } else {
      const seed = hashSeed(`${opts.idPrefix}-spurend-${idx}`);
      nodes.push({ id: endId, name: fillerName("normal", opts.area, seed), type: "normal", area: opts.area, x: Math.round(outX), y: Math.round(outY) });
    }
    spurEndNodeIds.push(endId);
  }

  // 内周ロータリー+スポーク(主要な街のみ)
  let innerRingNodeIds: string[] | undefined;
  if (opts.innerLoop) {
    const { ringSize: innerSize, radius: innerRadius, spokeCount } = opts.innerLoop;
    const innerIds: string[] = [];
    for (let i = 0; i < innerSize; i++) {
      const angle = (i * 360) / innerSize;
      const rad = (angle * Math.PI) / 180;
      const x = Math.round(center.x + innerRadius * Math.cos(rad));
      const y = Math.round(center.y + innerRadius * Math.sin(rad));
      const id = `${opts.idPrefix}_i${i}`;
      innerIds.push(id);

      const seed = hashSeed(`${opts.idPrefix}-inner-${i}`);
      const type = pickFillerType(seed);
      const name = fillerName(type, opts.area, seed);
      const propertyGroupId = type === "property" ? pushGeneratedProperty(propertyPool, id, name, opts.area, seed) : undefined;
      nodes.push({ id, name, type, area: opts.area, x, y, propertyGroupId });
    }

    // 内周を一周つなぐ(裏通りらしくresidential扱い)
    for (let i = 0; i < innerSize; i++) {
      const next = (i + 1) % innerSize;
      edges.push({ from: innerIds[i], to: innerIds[next], roadType: "residential" });
    }

    // 外周⇄内周のスポーク。付け根はどちらも3〜4差路の交差点になる。
    for (let s = 0; s < spokeCount; s++) {
      const angle = (s * 360) / spokeCount;
      const outerIdx = (Math.round(angle / (360 / opts.ringSize)) % opts.ringSize + opts.ringSize) % opts.ringSize;
      const innerIdx = (Math.round(angle / (360 / innerSize)) % innerSize + innerSize) % innerSize;
      edges.push({ from: ringIds[outerIdx], to: innerIds[innerIdx], roadType: "main" });
    }

    innerRingNodeIds = innerIds;
  }

  return { nodes, edges, hubNodeId, gateNodeIds, spurEndNodeIds, ringNodeIds: ringIds, innerRingNodeIds };
}

export interface JunctionSpokeSpec {
  /** ハブから見た角度(度)。0=東、-90=北、90=南、180=西。 */
  angle: number;
  /** ハブから出入口(または行き止まり)までの距離 */
  distance: number;
  /** 途中に置くマス数(ハブ・終点は含まない) */
  length: number;
  roadType?: RoadType;
  requiresCardId?: string;
  /** 他の街・道路とつなぐための出入口にする場合の名前。省略すると行き止まりになる。 */
  label?: string;
  /** 行き止まりを実在ランドマークなどの特別な場所にする場合。labelと同時指定はしない想定。 */
  end?: { name: string; propertyGroupId: string };
}

export interface JunctionTownOptions {
  area: string;
  idPrefix: string;
  hubName: string;
  isMajorHub?: boolean;
  /** ハブから放射状に伸びる道。丸いロータリーで囲わず、ハブ1点から直接分かれる交差点にする。 */
  spokes: JunctionSpokeSpec[];
}

/**
 * 「街」を、環状路(ロータリー)ではなく、ハブ1点から道が直接分かれる交差点として作る。
 * 環状路は「戻れない」ルールのもとでは実質一本道になりがちなうえ、丸いロータリーが増えると
 * 路線図的な見た目になってしまう。かわりにハブから各方向へ直接道を伸ばし、
 * 分岐点そのものを「北・南・東・西のどちらへも進める交差点」として機能させる。
 */
export function buildJunctionTown(
  center: { x: number; y: number },
  opts: JunctionTownOptions,
  propertyPool: GeneratedPropertyPool,
): {
  nodes: GeneratedNodeSpec[];
  edges: GeneratedEdgeSpec[];
  hubNodeId: string;
  gateNodeIds: Record<string, string>;
  spurEndNodeIds: string[];
} {
  const nodes: GeneratedNodeSpec[] = [];
  const edges: GeneratedEdgeSpec[] = [];
  const hubNodeId = `${opts.idPrefix}_hub`;
  nodes.push({ id: hubNodeId, name: opts.hubName, type: "normal", area: opts.area, x: center.x, y: center.y });
  registerFixedPosition(center.x, center.y);

  const gateNodeIds: Record<string, string> = {};
  const spurEndNodeIds: string[] = [];

  // 角度が近い(狭い)スポークどうしは、蛇行(wobble)を抑えて互いに乗り上げないようにする
  function angularGapDeg(angle: number) {
    let gap = 360;
    for (const s of opts.spokes) {
      if (s.angle === angle) continue;
      const diff = Math.abs(((s.angle - angle + 540) % 360) - 180);
      if (diff < gap) gap = diff;
    }
    return gap;
  }

  opts.spokes.forEach((spoke, i) => {
    const rad = (spoke.angle * Math.PI) / 180;
    const rawEndX = center.x + spoke.distance * Math.cos(rad);
    const rawEndY = center.y + spoke.distance * Math.sin(rad);
    const { x: endX, y: endY } = claimSpacedPosition(rawEndX, rawEndY);
    const endId = `${opts.idPrefix}_sp${i}_end`;

    const gap = angularGapDeg(spoke.angle);
    const wobbleScale = gap < 20 ? 0.1 : gap < 45 ? 0.3 : gap < 70 ? 0.6 : 1;

    const res = windingFiller(
      { id: hubNodeId, x: center.x, y: center.y },
      { id: endId, x: endX, y: endY },
      {
        count: spoke.length,
        roadType: spoke.roadType ?? "residential",
        area: opts.area,
        idPrefix: `${opts.idPrefix}_sp${i}`,
        requiresCardId: spoke.requiresCardId,
        wobble: Math.min(22, spoke.distance / (spoke.length + 1) * 0.35) * wobbleScale,
      },
      propertyPool,
    );
    nodes.push(...res.nodes);
    edges.push(...res.edges);

    if (spoke.end) {
      nodes.push({ id: endId, name: spoke.end.name, type: "property", area: opts.area, x: endX, y: endY, propertyGroupId: spoke.end.propertyGroupId });
      spurEndNodeIds.push(endId);
    } else {
      const seed = hashSeed(`${opts.idPrefix}-sp${i}-end`);
      nodes.push({ id: endId, name: fillerName("normal", opts.area, seed), type: "normal", area: opts.area, x: endX, y: endY });
      if (spoke.label) gateNodeIds[spoke.label] = endId;
      else spurEndNodeIds.push(endId);
    }
  });

  return { nodes, edges, hubNodeId, gateNodeIds, spurEndNodeIds };
}
