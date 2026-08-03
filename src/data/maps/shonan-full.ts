import type { MapData, MapNode, MapDecoration, NodeType, PropertyDef, RoadType } from "@/types/game";
import { windingFiller } from "@/lib/game/mapBuilder";

/**
 * 湘南すごろく 全域マップ(コンパクト版・道中分岐つき)
 *
 * 対象範囲を「湘南(藤沢)・寒川・茅ヶ崎・鎌倉・江の島」の5拠点に絞り込み、
 * 拠点間が単純な一本道(前バージョンでは最大18マス・分岐なし)にならないよう、
 * 400px四方の「街区(block)」を6つ連結して道中に実際の分岐(ループ)を作る。
 * 街区の作り方は shonan-full-cityblock.ts.bak(範囲を広く取った版)と同じ手法を再利用:
 * 街区ごとに4辺の中間点+中心を実ノードとして追加し、中心から4辺へ十字にスポークを通す。
 * 中間点は隣接する街区どうしで共有(キャッシュ)し、重複道路は作らない。
 *
 * 拠点(5、指定分): 藤沢(湘南の中心)・寒川・茅ヶ崎・鎌倉・江の島。
 * ウェイポイント(10、実在地名の街区の角): 四之宮・香川・萩園・辻堂・北鎌倉・鵠沼・羽鳥・梶原・稲村ヶ崎・腰越。
 * 街区中心(6、実在地名): 一之宮・浜之郷・円行・石川・山ノ内・鎌倉山。
 *
 * 400px四方の街区が6つ、隙間なく連結:
 *   北西(寒川-四之宮-萩園-香川, 中心=一之宮) / 西(香川-萩園-辻堂-茅ヶ崎, 中心=浜之郷) /
 *   中央(辻堂-藤沢-鵠沼-羽鳥, 中心=円行) / 中央東(藤沢-北鎌倉-梶原-鵠沼, 中心=石川) /
 *   東(北鎌倉-鎌倉-稲村ヶ崎-梶原, 中心=山ノ内) / 南(鵠沼-梶原-腰越-江の島, 中心=鎌倉山)
 *
 * これにより一本道の最長は約9マス(400px区間を中間点で2分割)。斜め道路は一切使わない。
 * 道路が交わる場所はすべて実ノード=実際に移動可能な交差点で、見た目だけの交差はない。
 *
 * このマップは「マスと移動の土台」のみを対象とし、money/card/property/eventの抽選は行わない
 * (buildRoad は windingFiller に plain: true を渡し、生成マスはすべて type: "normal")。
 */

interface NodeSpec {
  id: string;
  name: string;
  type: NodeType;
  area: string;
  x: number;
  y: number;
  propertyId?: string;
  dest?: true;
  majorHub?: true;
}

interface EdgeSpec {
  from: string;
  to: string;
  roadType: RoadType;
  requiresCardId?: string;
}

const generatedProperties: PropertyDef[] = [];
const nodeSpecs: NodeSpec[] = [];
const edgeSpecs: EdgeSpec[] = [];

interface Hub {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** 名前のある拠点・ウェイポイント・街区中心(目的地候補になる)。 */
function addHub(id: string, name: string, x: number, y: number, isMajorHub?: true): Hub {
  nodeSpecs.push({ id, name, type: "normal", area: name, x, y, dest: true, majorHub: isMajorHub });
  return { id, name, x, y };
}

/** 街区の辺の中間点(単なる交差点。目的地候補にはしない)。 */
function addJunction(id: string, name: string, x: number, y: number): Hub {
  nodeSpecs.push({ id, name, type: "normal", area: name, x, y });
  return { id, name, x, y };
}

/** y>=1600(海沿いの行、江の島・腰越)に触れる区間は coastal、それ以外は main。 */
function roadTypeFor(a: Hub, b: Hub): RoadType {
  return a.y >= 1600 || b.y >= 1600 ? "coastal" : "main";
}

/**
 * 拠点(ウェイポイント・街区中心含む)どうしを道でつなぐ。マス間隔(scale)を基準に
 * 距離から自動でマス数を決めるため区間ごとに一定間隔になる。wobble:0で完全な直線にし、
 * 道路同士の絡まりを防ぐ。plain:trueにより生成マスはすべて type: "normal"。
 * 拠点間の道の途中でフォーク&合流(自動生成の支線)は作らない。
 */
function buildRoad(a: Hub, b: Hub, roadType: RoadType, idPrefix: string, area: string) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = 22;
  const spineCount = Math.max(5, Math.round(dist / scale));

  const spine = windingFiller(
    { id: a.id, x: a.x, y: a.y },
    { id: b.id, x: b.x, y: b.y },
    { count: spineCount, roadType, area, idPrefix, wobble: 0, plain: true },
    generatedProperties,
  );
  for (const n of spine.nodes) nodeSpecs.push({ id: n.id, name: n.name, type: n.type, area: n.area, x: n.x, y: n.y, propertyId: n.propertyId });
  for (const e of spine.edges) edgeSpecs.push(e);
}

// 街区の辺(2拠点間)を中間点で2分割してつなぐ。同じ辺は2つの街区から共有されうるので、
// 一度作った中間点はキャッシュして再利用する(重複道路を作らない)。
const midpointCache = new Map<string, Hub>();
function midpoint(a: Hub, b: Hub): Hub {
  const key = [a.id, b.id].sort().join("__");
  const cached = midpointCache.get(key);
  if (cached) return cached;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mid = addJunction(`wp_mid_${key}`, `${a.name}⇄${b.name}間`, mx, my);
  midpointCache.set(key, mid);
  const rt = roadTypeFor(a, b);
  buildRoad(a, mid, rt, `r_${key}_a`, a.name);
  buildRoad(mid, b, rt, `r_${key}_b`, b.name);
  return mid;
}

/** 400px四方の街区ひとつ分。4辺の中間点を作り、街区中心から十字にスポークを通す。 */
function block(nw: Hub, ne: Hub, se: Hub, sw: Hub, centerId: string, centerName: string) {
  const top = midpoint(nw, ne);
  const right = midpoint(ne, se);
  const bottom = midpoint(sw, se);
  const left = midpoint(nw, sw);
  const cx = (nw.x + ne.x) / 2;
  const cy = (nw.y + sw.y) / 2;
  const center = addHub(centerId, centerName, cx, cy);
  buildRoad(center, top, roadTypeFor(center, top), `r_${centerId}_n`, centerName);
  buildRoad(center, right, roadTypeFor(center, right), `r_${centerId}_e`, centerName);
  buildRoad(center, bottom, roadTypeFor(center, bottom), `r_${centerId}_s`, centerName);
  buildRoad(center, left, roadTypeFor(center, left), `r_${centerId}_w`, centerName);
}

// ============================================================
// 拠点(5) + ウェイポイント(10) — 400px間隔のグリッドに配置
// ============================================================

const samukawa = addHub("hub_samukawa", "寒川", 0, 0);
const yotsunomiya = addHub("wp_yotsunomiya", "四之宮", 400, 0);

const kagawa = addHub("wp_kagawa", "香川", 0, 400);
const hagizono = addHub("wp_hagizono", "萩園", 400, 400);

const chigasaki = addHub("hub_chigasaki", "茅ヶ崎", 0, 800);
const tsujido = addHub("wp_tsujido", "辻堂", 400, 800);
const fujisawa = addHub("hub_fujisawa", "藤沢", 800, 800, true);
const kitakamakura = addHub("wp_kitakamakura", "北鎌倉", 1200, 800);
const kamakura = addHub("hub_kamakura", "鎌倉", 1600, 800);

const hatori = addHub("wp_hatori", "羽鳥", 400, 1200);
const kugenuma = addHub("wp_kugenuma", "鵠沼", 800, 1200);
const kajiwara = addHub("wp_kajiwara", "梶原", 1200, 1200);
const inamuragasaki = addHub("wp_inamuragasaki", "稲村ヶ崎", 1600, 1200);

const enoshima = addHub("hub_enoshima", "江の島", 800, 1600);
const koshigoe = addHub("wp_koshigoe", "腰越", 1200, 1600);

const decorations: MapDecoration[] = [
  { kind: "parkBlob", cx: 300, cy: 700, rx: 90, ry: 60 },
  { kind: "sea", edge: "bottom", pos: 1680 },
];

// ============================================================
// 街区(6) — それぞれ block() が「4辺の中間点+中心の十字スポーク」を自動生成する
// ============================================================

block(samukawa, yotsunomiya, hagizono, kagawa, "hub_ichinomiya", "一之宮");
block(kagawa, hagizono, tsujido, chigasaki, "hub_hamanogo", "浜之郷");
block(tsujido, fujisawa, kugenuma, hatori, "hub_engyo", "円行");
block(fujisawa, kitakamakura, kajiwara, kugenuma, "hub_ishikawa", "石川");
block(kitakamakura, kamakura, inamuragasaki, kajiwara, "hub_yamanouchi", "山ノ内");
block(kugenuma, kajiwara, koshigoe, enoshima, "hub_kamakurayama", "鎌倉山");

export function buildShonanFullMap(): { map: MapData; properties: PropertyDef[] } {
  const nodeMap = new Map<string, MapNode>();
  for (const spec of nodeSpecs) {
    if (nodeMap.has(spec.id)) {
      throw new Error(`shonan-full map: duplicate node id "${spec.id}"`);
    }
    nodeMap.set(spec.id, {
      id: spec.id,
      name: spec.name,
      type: spec.type,
      x: spec.x,
      y: spec.y,
      connections: [],
      propertyId: spec.propertyId,
      isDestinationCandidate: spec.dest,
      area: spec.area,
      isMajorHub: spec.majorHub,
    });
  }

  for (const edge of edgeSpecs) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) {
      throw new Error(`shonan-full map: edge references unknown node (${edge.from} -> ${edge.to})`);
    }
    from.connections.push({ to: to.id, roadType: edge.roadType, requiresCardId: edge.requiresCardId });
    to.connections.push({ to: from.id, roadType: edge.roadType, requiresCardId: edge.requiresCardId });
  }

  const nodes = Array.from(nodeMap.values());

  for (const node of nodes) {
    if (node.type === "property" && !node.propertyId) {
      throw new Error(`shonan-full map: property node "${node.id}" is missing propertyId`);
    }
    if (node.connections.length === 0) {
      throw new Error(`shonan-full map: node "${node.id}" is isolated (no connections)`);
    }
  }

  // 開始地点から辿れないノードがないか(バラバラに分断された部分がないか)を確認する
  const reachable = new Set<string>([fujisawa.id]);
  const queue = [fujisawa.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    for (const edge of node.connections) {
      if (!reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  const unreachable = nodes.filter((n) => !reachable.has(n.id));
  if (unreachable.length > 0) {
    throw new Error(
      `shonan-full map: ${unreachable.length} node(s) unreachable from start (e.g. "${unreachable[0].id}")`,
    );
  }

  const map: MapData = {
    id: "shonan-full",
    name: "湘南すごろく(コンパクト版)",
    nodes,
    startNodeId: fujisawa.id,
    decorations,
  };

  return { map, properties: generatedProperties };
}

const built = buildShonanFullMap();
export const shonanFullMap: MapData = built.map;
export const generatedPropertyDefs: PropertyDef[] = built.properties;
