import type { MapData, MapNode, MapDecoration, NodeType, PropertyDef, RoadType } from "@/types/game";
import { windingFiller } from "@/lib/game/mapBuilder";

/**
 * 湘南すごろく 全域マップ(縦横グリッド レイアウト版 + 有機的アレンジ + 方角整合)
 *
 * 土台は5列×4行の格子(碁盤の目)構造(拠点20 = 既存15 + 新規5)。
 * 各拠点は基本的に「上下左右に隣接する拠点」とだけ道でつなぎ、格子そのものは崩さない。
 * その上で、以下のアレンジを加えている。
 *
 *   1. 拠点間のマス数を区間ごとに5〜18マスの幅でばらつかせる(buildRoad の cells オプションで
 *      区間ごとに明示指定。距離に対する自動計算はもう使わない)。
 *   2. 隣接しない拠点同士を1本、斜めの近道(roadType: "shortcut")としてつなぐ。
 *      藤沢-鵠沼は実際の江ノ島線ルート(藤沢→本鵠沼→鵠沼海岸)に相当し、格子本体の
 *      藤沢-羽鳥-辻堂-鵠沼(コラムC、東海道線+海沿い経由に相当)とは別ルートとして共存する。
 *      格子本体の接続は変更していない。
 *      (大船-辻堂の斜め近道は、右上エリアを縦横の道路のみにするため削除した)
 *   3. 外周の一部拠点の座標を50〜150pxずらし、キャンバス全体が完全な長方形の輪郭に
 *      ならないようにしている。内陸(interior)の拠点座標はグリッドのまま動かしていない。
 *      このジッターは「4.」の方角整合にも利用している(下記参照)。
 *   4. 実際の駅の位置関係(方角)をできるだけ反映:
 *      - 湘南台は本来「六会の西側」(南側ではない)。A2の基準座標そのままだと六会の真南に
 *        見えてしまうため、ジッターで西寄りに引っ張り、六会に対して南西寄りに見えるようにした。
 *      - 戸塚は本来「大船の北側」寄り(東海道線の並びだけを見ると東に見えるが、実際は北の
 *        成分の方が大きい)。E1は格子上すでに最北列だが、ジッターの向きを北寄りに強めた。
 *      - 江の島⇄七里ヶ浜は実際には「江の島が西、七里ヶ浜が東」(七里ヶ浜は江の島と鎌倉の
 *        あいだ)。格子上の割り当てをD4=江の島・E4=七里ヶ浜に入れ替え、行4(茅ヶ崎→鵠沼→
 *        江の島→七里ヶ浜)が実際の海沿いの並び順と一致するようにした。
 *   5. 幹線は roadType: "main"/"national"/"coastal"、近道は roadType: "shortcut" を使う。
 *      線の太さ・色・破線の有無は mapStyle.ts の ROAD_STYLE に既に定義済み
 *      (national:20px 赤 / main・coastal:15px / shortcut:11px 紫破線)なので、
 *      roadType を正しく割り当てるだけで幹線と近道の描き分けができる。
 *
 * キャンバス上の基準位置(グリッド原点、ジッター適用前の値):
 * 列 x=200,700,1200,1700,2200(間隔500) / 行 y=200,600,1000,1400(間隔400)。
 *
 *      A(列)     B         C         D         E
 *   1  六会  ―  善行  ―  藤沢★ ―  大船  ―  戸塚      (A1/B1/E1 は座標ジッター適用)
 *      |          |          |          |          |
 *   2  湘南台 ―  香川  ―  羽鳥  ―  北鎌倉 ―  岩瀬      (A2はジッターで六会の南西寄りに)
 *      |          |            |          |          |
 *   3  用田  ―  寒川  ―  辻堂  ―  鎌倉  ―  片瀬江ノ島  (E3 は座標ジッター適用。右上エリアは
 *      |          |            |          |          |   縦横の道路のみ、斜め近道なし)
 *   4  小和田 ―  茅ヶ崎 ―  鵠沼  ―  江の島 ―  七里ヶ浜  (A4/E4 は座標ジッター適用。C1-C4 縦近道のみ。
 *                                                        江の島⇄七里ヶ浜は実際の並びに合わせ入替済み)
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

function addHub(id: string, name: string, x: number, y: number, isMajorHub?: true): Hub {
  nodeSpecs.push({ id, name, type: "normal", area: name, x, y, dest: true, majorHub: isMajorHub });
  return { id, name, x, y };
}

/**
 * 拠点駅どうしを道でつなぐ。マス数(cells)は区間ごとに明示指定し、
 * わざと5〜18の幅でばらつかせる(全区間を均一な間隔にしない)。
 * wobble:0 で分割自体は決定的(乱数なし)にし、道路同士の絡まりを防ぐ。
 * bias を指定すると区間全体を弓なりに膨らませられる(近道が本線の真上に重ならないようにする用途)。
 * どちらの場合も、拠点間の道の途中でフォーク&合流は作らない。
 */
function buildRoad(
  a: Hub,
  b: Hub,
  roadType: RoadType,
  idPrefix: string,
  area: string,
  opts: { cells: number; bias?: number },
) {
  const spine = windingFiller(
    { id: a.id, x: a.x, y: a.y },
    { id: b.id, x: b.x, y: b.y },
    { count: opts.cells, roadType, area, idPrefix, wobble: 0, bias: opts.bias },
    generatedProperties,
  );
  for (const n of spine.nodes) nodeSpecs.push({ id: n.id, name: n.name, type: n.type, area: n.area, x: n.x, y: n.y, propertyId: n.propertyId });
  for (const e of spine.edges) edgeSpecs.push(e);
}

// ============================================================
// 拠点駅(20 = 既存15 + 新規5) — 5列 x 4行の格子が基準位置。
// 外周の一部(コメント参照)は50〜150pxジッターを加えた座標にしている。
// ============================================================

// Row1 (基準 y=200)
const rokkai = addHub("hub_rokkai", "六会", 140, 120); // 基準(200,200)から(-60,-80)
const zengyo = addHub("hub_zengyo", "善行", 700, 110); // 基準(700,200)から(0,-90)
const fujisawa = addHub("hub_fujisawa", "藤沢", 1200, 200, true);
const ofuna = addHub("hub_ofuna", "大船", 1700, 200);
const totsuka = addHub("hub_totsuka", "戸塚", 2230, 70); // 基準(2200,200)から(+30,-130)。北寄りを強めて大船の北側を表現

// Row2 (y=600、湘南台のみジッターあり)
const shonandai = addHub("hub_shonandai", "湘南台", 90, 520); // 基準(200,600)から(-110,-80)。六会の南西寄りにして「西側」を表現
const kagawa = addHub("hub_kagawa", "香川", 700, 600);
const hatori = addHub("hub_hatori", "羽鳥", 1200, 600);
const kitakamakura = addHub("hub_kitakamakura", "北鎌倉", 1700, 600);
const iwase = addHub("hub_iwase", "岩瀬", 2200, 600);

// Row3 (基準 y=1000)
const youda = addHub("hub_youda", "用田", 200, 1000);
const samukawa = addHub("hub_samukawa", "寒川", 700, 1000);
const tsujido = addHub("hub_tsujido", "辻堂", 1200, 1000);
const kamakura = addHub("hub_kamakura", "鎌倉", 1700, 1000);
const katase = addHub("hub_katase", "片瀬江ノ島", 2330, 1000); // 基準(2200,1000)から(+130,0)

// Row4 (基準 y=1400, 海岸沿い)
const kowada = addHub("hub_kowada", "小和田", 130, 1480); // 基準(200,1400)から(-70,+80)
const chigasaki = addHub("hub_chigasaki", "茅ヶ崎", 700, 1400);
const kugenuma = addHub("hub_kugenuma", "鵠沼", 1200, 1400);
const enoshima = addHub("hub_enoshima", "江の島", 1700, 1400); // D4、ジッターなし(実際は七里ヶ浜より西側のため)
const shichirigahama = addHub("hub_shichirigahama", "七里ヶ浜", 2310, 1455); // E4、基準(2200,1400)から(+110,+55)。実際は江の島より東側

const decorations: MapDecoration[] = [
  { kind: "parkBlob", cx: 620, cy: 520, rx: 110, ry: 90 },
  { kind: "sea", edge: "bottom", pos: 1560 },
];

// ============================================================
// 接続関係 — 格子本体31本(横16本+縦15本、cellsは5〜18でばらつかせる) + 近道1本
// ============================================================

// 横方向(行ごと)
buildRoad(rokkai, zengyo, "main", "r_A1_B1", "六会", { cells: 9 });
buildRoad(zengyo, fujisawa, "main", "r_B1_C1", "善行", { cells: 14 });
buildRoad(fujisawa, ofuna, "main", "r_C1_D1", "藤沢", { cells: 6 });
buildRoad(ofuna, totsuka, "main", "r_D1_E1", "大船", { cells: 17 });

buildRoad(shonandai, kagawa, "main", "r_A2_B2", "湘南台", { cells: 12 });
buildRoad(kagawa, hatori, "main", "r_B2_C2", "香川", { cells: 5 });
buildRoad(hatori, kitakamakura, "main", "r_C2_D2", "羽鳥", { cells: 16 });
buildRoad(kitakamakura, iwase, "main", "r_D2_E2", "北鎌倉", { cells: 8 });

buildRoad(youda, samukawa, "main", "r_A3_B3", "用田", { cells: 15 });
buildRoad(samukawa, tsujido, "main", "r_B3_C3", "寒川", { cells: 7 });
buildRoad(tsujido, kamakura, "main", "r_C3_D3", "辻堂", { cells: 11 });
buildRoad(kamakura, katase, "main", "r_D3_E3", "鎌倉", { cells: 18 });

buildRoad(kowada, chigasaki, "coastal", "r_A4_B4", "小和田", { cells: 6 });
buildRoad(chigasaki, kugenuma, "coastal", "r_B4_C4", "茅ヶ崎", { cells: 13 });
buildRoad(kugenuma, enoshima, "coastal", "r_C4_D4", "鵠沼", { cells: 9 });
buildRoad(enoshima, shichirigahama, "coastal", "r_D4_E4", "江の島", { cells: 16 });

// 縦方向(列ごと)
buildRoad(rokkai, shonandai, "main", "r_A1_A2", "六会", { cells: 10 });
buildRoad(shonandai, youda, "main", "r_A2_A3", "湘南台", { cells: 5 });
buildRoad(youda, kowada, "main", "r_A3_A4", "用田", { cells: 14 });

buildRoad(zengyo, kagawa, "main", "r_B1_B2", "善行", { cells: 8 });
buildRoad(kagawa, samukawa, "main", "r_B2_B3", "香川", { cells: 17 });
buildRoad(samukawa, chigasaki, "main", "r_B3_B4", "寒川", { cells: 6 });

buildRoad(fujisawa, hatori, "national", "r_C1_C2", "藤沢", { cells: 12 }); // 国道467号沿いの縦軸
buildRoad(hatori, tsujido, "national", "r_C2_C3", "羽鳥", { cells: 9 });
buildRoad(tsujido, kugenuma, "national", "r_C3_C4", "辻堂", { cells: 15 });

buildRoad(ofuna, kitakamakura, "main", "r_D1_D2", "大船", { cells: 7 });
buildRoad(kitakamakura, kamakura, "main", "r_D2_D3", "北鎌倉", { cells: 16 });
buildRoad(kamakura, enoshima, "main", "r_D3_D4", "鎌倉", { cells: 5 });

buildRoad(totsuka, iwase, "main", "r_E1_E2", "戸塚", { cells: 13 });
buildRoad(iwase, katase, "main", "r_E2_E3", "岩瀬", { cells: 10 });
buildRoad(katase, shichirigahama, "main", "r_E3_E4", "片瀬江ノ島", { cells: 8 });

// 斜めの近道(1本のみ)。格子本体の接続は変更しない、あくまで追加のバイパス。
// 右上エリアの大船-辻堂の斜め近道は削除し、右上エリアの拠点間は縦横の道路のみにした。
buildRoad(fujisawa, kugenuma, "shortcut", "r_short_fj_kh", "藤沢", { cells: 10, bias: 150 }); // 藤沢-鵠沼(羽鳥・辻堂をバイパスする縦の近道。列Cの本線と重ならないよう弓なりにする)

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
    name: "湘南すごろく(縦横グリッドレイアウト)",
    nodes,
    startNodeId: fujisawa.id,
    decorations,
  };

  return { map, properties: generatedProperties };
}

const built = buildShonanFullMap();
export const shonanFullMap: MapData = built.map;
export const generatedPropertyDefs: PropertyDef[] = built.properties;
