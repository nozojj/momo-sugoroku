import type { MapData, MapNode, MapDecoration, NodeType, PropertyDef, RoadType } from "@/types/game";
import { windingFiller } from "@/lib/game/mapBuilder";

/**
 * 湘南すごろく 全域マップ(地形反映・自然な広がり版)
 *
 * 400px四方の街区を均等に敷き詰める前バージョンから離れ、実際の湘南の地形に近い配置にした。
 *
 *   - 海沿いの幹線: 平塚→茅ヶ崎→辻堂→藤沢→(鵠沼)→江の島→(腰越)→(稲村ヶ崎)→鎌倉。
 *     区間ごとに距離・向きを変え、南北の座標を緩やかに上下させることで、
 *     「実際の道路は縦横グリッドのまま」でも海岸線に沿ってカーブしているように見せている
 *     (拠点間を結ぶ道自体はわずかに傾くが、これは前バージョンの外周ジッターと同程度の範囲)。
 *   - 内陸ルート: 寒川→湘南台→大船。海沿いの幹線とは独立した北側のルート。
 *   - 海沿い⇄内陸の行き来は4箇所: 寒川⇄茅ヶ崎(香川経由)・湘南台⇄藤沢(六会経由)・
 *     大船⇄藤沢(梶原経由)・大船⇄鎌倉(北鎌倉経由)。
 *   - 藤沢は最大のハブ: 幹線2方向(辻堂・鵠沼方面)+行き来2方向(六会・梶原方面)に加えて、
 *     小さな環状道路(ロータリー、8ノードの輪+4本のスポーク)を持つ。ゲーム中もっとも
 *     分岐が多い街になる(実質8方向)。
 *   - 道路密度のメリハリ: smallLoop()で街ごとに小さな環状路を追加し、街の大きさ・
 *     ゲートの本数で密度を変えている。
 *       藤沢     ★★★★★  ロータリー(半径100・ゲート4)
 *       鎌倉     ★★★★☆  小さな環状路(半径75・ゲート2)
 *       茅ヶ崎   ★★★★☆  小さな環状路(半径75・ゲート2)
 *       辻堂     ★★★☆☆  小さな環状路(半径55・ゲート1)
 *       平塚     ★★★☆☆  小さな環状路(半径55・ゲート2、終着点で幹線側の接続が1本しかない分を補う)
 *       湘南台   ★★★☆☆  環状路なし(幹線2+行き来1の計3方向で十分な分岐がある)
 *       寒川     ★★☆☆☆  環状路なし
 *       江の島   ★★☆☆☆  環状路なし
 *
 * 斜め道路は使わない(すべての道は buildRoad で結ぶ、縦横または前バージョンと同程度の
 * ごく緩やかな傾き)。道路が交わる場所はすべて実ノード=実際に移動可能な交差点。
 *
 * このマップは「マスと移動の土台」のみを対象とし、money/card/property/eventの抽選は行わない
 * (buildRoad は windingFiller に plain: true を渡し、生成マスはすべて type: "normal")。
 *
 * ── 将来の拡張について ──
 * 駅・物件・イベント・カードマス: MapNode.type / propertyId は既存の型(src/types/game.ts)に
 *   すでにある(normal/money/card/property/event/gasStation/warp)。今は全マスをnormalで
 *   生成しているだけなので、後から特定ノードのtype・propertyIdを差し替えるだけで追加できる。
 * フェリールート: RoadType(現状 national/main/coastal/residential/shortcut)に"ferry"を
 *   追加し、海沿いの2拠点間(例: 江の島⇄鎌倉)を直接結ぶ専用エッジとして生やせる。
 * ワープイベント: NodeType.warp がすでに定義済み(現状未使用)。対象ノードのtypeを
 *   "warp"に変えるだけでよい。
 * 季節イベント・NPC移動・ボスイベント: いずれもマップデータではなくゲーム状態
 *   (gameStore.ts / engine.ts側)の関心事。マップ側のノードID・area(地区名)が
 *   安定していれば「このエリアでイベント発生」のような紐付けは後から自由に追加できる。
 * 逗子: 今回は対象外(要件により見送り)。将来追加する場合は鎌倉から東へ延伸すればよい。
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

/** 名前のある拠点・ウェイポイント(目的地候補になる)。 */
function addHub(id: string, name: string, x: number, y: number, isMajorHub?: true): Hub {
  nodeSpecs.push({ id, name, type: "normal", area: name, x, y, dest: true, majorHub: isMajorHub });
  return { id, name, x, y };
}

/** 環状路の輪など、単なる交差点(目的地候補にはしない)。 */
function addJunction(id: string, name: string, x: number, y: number): Hub {
  nodeSpecs.push({ id, name, type: "normal", area: name, x, y });
  return { id, name, x, y };
}

/**
 * 拠点(ウェイポイント含む)どうしを道でつなぐ。マス間隔(scale)を基準に「距離÷間隔-1」で
 * マス数を決めるため、区間の長さに関わらずマスとマスの間隔(ピッチ)が一定になる
 * (「マス・道・マス」のリズム)。wobble:0で完全な直線にし、道路同士の絡まりを防ぐ。
 * plain:trueにより生成マスはすべて type: "normal"。拠点間の道の途中でフォーク&合流は作らない。
 */
function buildRoad(a: Hub, b: Hub, roadType: RoadType, idPrefix: string, area: string) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = 50;
  const spineCount = Math.max(1, Math.round(dist / scale) - 1);

  const spine = windingFiller(
    { id: a.id, x: a.x, y: a.y },
    { id: b.id, x: b.x, y: b.y },
    { count: spineCount, roadType, area, idPrefix, wobble: 0, plain: true },
    generatedProperties,
  );
  for (const n of spine.nodes) nodeSpecs.push({ id: n.id, name: n.name, type: n.type, area: n.area, x: n.x, y: n.y, propertyId: n.propertyId });
  for (const e of spine.edges) edgeSpecs.push(e);
}

/**
 * hubのまわりに小さな環状路(8ノードの輪)を作り、東西南北のゲートを介して
 * hub自身とつなぐ(gates本、1〜4)。ゲートが多いほど分岐が増える=街の道路密度が上がる。
 * 藤沢の「ロータリー」もこの関数(radius:100, gates:4)で作っている。
 */
function smallLoop(hub: Hub, radius: number, idPrefix: string, label: string, gates: number) {
  const n = addJunction(`${idPrefix}_n`, `${label}(北)`, hub.x, hub.y - radius);
  const ne = addJunction(`${idPrefix}_ne`, `${label}(北東)`, hub.x + radius, hub.y - radius);
  const e = addJunction(`${idPrefix}_e`, `${label}(東)`, hub.x + radius, hub.y);
  const se = addJunction(`${idPrefix}_se`, `${label}(南東)`, hub.x + radius, hub.y + radius);
  const s = addJunction(`${idPrefix}_s`, `${label}(南)`, hub.x, hub.y + radius);
  const sw = addJunction(`${idPrefix}_sw`, `${label}(南西)`, hub.x - radius, hub.y + radius);
  const w = addJunction(`${idPrefix}_w`, `${label}(西)`, hub.x - radius, hub.y);
  const nw = addJunction(`${idPrefix}_nw`, `${label}(北西)`, hub.x - radius, hub.y - radius);
  const ring = [n, ne, e, se, s, sw, w, nw];
  for (let i = 0; i < ring.length; i++) {
    buildRoad(ring[i], ring[(i + 1) % ring.length], "residential", `r_${idPrefix}_ring${i}`, label);
  }
  const gateNodes = [n, e, s, w].slice(0, gates);
  for (const g of gateNodes) {
    buildRoad(hub, g, "residential", `r_${idPrefix}_gate_${g.id}`, label);
  }
}

// ============================================================
// 拠点(9) — 海沿いの幹線(6) + 内陸ルート(3)
// ============================================================

// 海沿いの幹線(西→東。南北の座標を少しずつ変え、海岸線のカーブに沿って見えるようにしている)
const hiratsuka = addHub("hub_hiratsuka", "平塚", 0, 1000);
const chigasaki = addHub("hub_chigasaki", "茅ヶ崎", 600, 1080);
const tsujido = addHub("hub_tsujido", "辻堂", 1150, 1020);
const fujisawa = addHub("hub_fujisawa", "藤沢", 1600, 900, true);
const kugenuma = addHub("wp_kugenuma", "鵠沼", 1600, 1100);
const enoshima = addHub("hub_enoshima", "江の島", 1600, 1300);
const koshigoe = addHub("wp_koshigoe", "腰越", 1975, 1330);
const inamuragasaki = addHub("wp_inamuragasaki", "稲村ヶ崎", 2350, 1270);
const kamakura = addHub("hub_kamakura", "鎌倉", 2350, 1150);

// 内陸ルート(西→東)
const samukawa = addHub("hub_samukawa", "寒川", 700, 350);
const shonandai = addHub("hub_shonandai", "湘南台", 1350, 280);
const ofuna = addHub("hub_ofuna", "大船", 2050, 550);

// 海沿い⇄内陸の行き来ポイント(4箇所)
const kagawa = addHub("wp_kagawa", "香川", 700, 1080); // 寒川⇄茅ヶ崎
const rokkai = addHub("wp_rokkai", "六会", 1350, 900); // 湘南台⇄藤沢
const kajiwara = addHub("wp_kajiwara", "梶原", 2050, 900); // 大船⇄藤沢
const kitakamakura = addHub("wp_kitakamakura", "北鎌倉", 2350, 550); // 大船⇄鎌倉

const decorations: MapDecoration[] = [
  { kind: "parkBlob", cx: 1150, cy: 850, rx: 90, ry: 60 }, // 辻堂海浜公園イメージ
  {
    kind: "coastline",
    side: "south",
    points: [
      { x: -150, y: 1180 },
      { x: 300, y: 1230 },
      { x: 750, y: 1270 },
      { x: 1150, y: 1210 },
      { x: 1450, y: 1190 },
      { x: 1600, y: 1460 },
      { x: 1975, y: 1520 },
      { x: 2350, y: 1460 },
      { x: 2600, y: 1380 },
    ],
  },
];

// ============================================================
// 海沿いの幹線(8区間)
// ============================================================
buildRoad(hiratsuka, chigasaki, "coastal", "r_hr_cg", "平塚");
buildRoad(chigasaki, tsujido, "coastal", "r_cg_ts", "茅ヶ崎");
buildRoad(tsujido, fujisawa, "coastal", "r_ts_fj", "辻堂");
buildRoad(fujisawa, kugenuma, "coastal", "r_fj_kg", "藤沢");
buildRoad(kugenuma, enoshima, "coastal", "r_kg_en", "鵠沼");
buildRoad(enoshima, koshigoe, "coastal", "r_en_ks", "江の島");
buildRoad(koshigoe, inamuragasaki, "coastal", "r_ks_in", "腰越");
buildRoad(inamuragasaki, kamakura, "coastal", "r_in_km", "稲村ヶ崎");

// ============================================================
// 内陸ルート(2区間)
// ============================================================
buildRoad(samukawa, shonandai, "main", "r_sm_sc", "寒川");
buildRoad(shonandai, ofuna, "main", "r_sc_of", "湘南台");

// ============================================================
// 海沿い⇄内陸の行き来(4箇所、各2区間)
// ============================================================
buildRoad(samukawa, kagawa, "main", "r_sm_kg", "寒川");
buildRoad(kagawa, chigasaki, "main", "r_kg_cg", "香川");

buildRoad(shonandai, rokkai, "main", "r_sc_rk", "湘南台");
buildRoad(rokkai, fujisawa, "main", "r_rk_fj", "六会");

buildRoad(ofuna, kajiwara, "main", "r_of_kj", "大船");
buildRoad(kajiwara, fujisawa, "main", "r_kj_fj", "梶原");

buildRoad(ofuna, kitakamakura, "main", "r_of_kk", "大船");
buildRoad(kitakamakura, kamakura, "main", "r_kk_km", "北鎌倉");

// ============================================================
// 道路密度のメリハリ(小さな環状路)
// ============================================================
smallLoop(fujisawa, 100, "fjrt", "藤沢ロータリー", 4); // ★★★★★
smallLoop(kamakura, 75, "kmlp", "鎌倉小路", 2); // ★★★★☆
smallLoop(chigasaki, 75, "cglp", "茅ヶ崎小路", 2); // ★★★★☆
smallLoop(tsujido, 55, "tslp", "辻堂小路", 1); // ★★★☆☆
smallLoop(hiratsuka, 55, "hrlp", "平塚小路", 2); // ★★★☆☆(終着点のため幹線側の接続が1本しかない分を補う)
// 湘南台・寒川・江の島は環状路なし(湘南台は幹線2+行き来1で計3方向、寒川・江の島は計2方向)

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
    name: "湘南すごろく(地形反映版)",
    nodes,
    startNodeId: fujisawa.id,
    decorations,
  };

  return { map, properties: generatedProperties };
}

const built = buildShonanFullMap();
export const shonanFullMap: MapData = built.map;
export const generatedPropertyDefs: PropertyDef[] = built.properties;
