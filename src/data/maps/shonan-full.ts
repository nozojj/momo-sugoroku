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
 *       藤沢     ★★★★★  ロータリー(半径95・ゲート4)
 *       鎌倉     ★★★★☆  小さな環状路(半径85・ゲート3)
 *       茅ヶ崎   ★★★★☆  小さな環状路(半径90・ゲート3)
 *       辻堂     ★★★☆☆  小さな環状路(半径90・ゲート2)
 *       平塚     ★★★☆☆  小さな環状路(半径85・ゲート2、終着点で幹線側の接続が1本しかない分を補う)
 *       湘南台   ★★★☆☆  環状路なし(幹線2+行き来1の計3方向で十分な分岐がある)
 *       寒川     ★★☆☆☆  環状路なし
 *       江の島   ★★☆☆☆  環状路なし
 *
 * 斜め道路は使わない(すべての道は buildRoad で結ぶ、縦横または前バージョンと同程度の
 * ごく緩やかな傾き)。道路が交わる場所はすべて実ノード=実際に移動可能な交差点。
 *
 * ── ゲーム性強化 ──
 *   - 茅ヶ崎〜辻堂〜藤沢を1つの都市圏として、海沿いの幹線とは別に環状路どうしを直結する
 *     「裏道」(residential)を通した。幹線を直進するか裏道を回るか選べる。
 *   - 藤沢のロータリーの斜めの点(北東・南東)からも六会・梶原へ直接抜けられるようにし、
 *     行き来ルートに「ロータリー経由」という別ルートを追加した。
 *   - 鎌倉の環状路を強化し、西側を稲村ヶ崎に直結する裏道も追加した。
 *   - 茅ヶ崎⇄辻堂、辻堂⇄藤沢という長い一本道の途中(pickMidFillerで拾った区間の真ん中の
 *     マス)から、内陸へ抜ける近道(shortcut)を2本追加した。海沿いを直進するか、
 *     内陸へ抜けて別ルートを回るかの選択肢が生まれる。
 *
 * ── 街どうしの間隔を圧縮(今回追加) ──
 *   平塚・茅ヶ崎・辻堂・藤沢・江の島・鎌倉という主要6拠点の間隔を、前バージョンから
 *   約30〜40%短くした(例: 茅ヶ崎⇄辻堂は553px→354px、辻堂⇄藤沢は466px→314px)。
 *   浮いた分は各街の環状路(smallLoop)の半径・ゲート数を増やすことに充て、
 *   「都市間を移動するゲーム」ではなく「湘南という一つの街の中を旅するゲーム」に
 *   近づけている。稲村ヶ崎⇄鎌倉だけは、鎌倉の環状路のスペースを確保するため
 *   他区間ほど詰めていない(148px、圧縮率は控えめ)。
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
// 生成したマスの並び(a→bの順)を覚えておき、あとから「この区間のだいたい真ん中のマス」を
// 拾って新しい短い道(近道)をつなげられるようにする(区間を二重に作り直さずに分岐を増やすため)。
const chainCache = new Map<string, Hub[]>();

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

  const fillers: Hub[] = spine.nodes.map((n) => ({ id: n.id, name: n.name, x: n.x, y: n.y }));
  chainCache.set([a.id, b.id].sort().join("__"), fillers);
}

/** a⇄b の区間(すでに buildRoad 済みであること)の、だいたい真ん中のマスを1つ拾う。 */
function pickMidFiller(a: Hub, b: Hub): Hub {
  const key = [a.id, b.id].sort().join("__");
  const chain = chainCache.get(key);
  if (!chain || chain.length === 0) return a;
  return chain[Math.floor(chain.length / 2)];
}

interface LoopRing {
  n: Hub; ne: Hub; e: Hub; se: Hub; s: Hub; sw: Hub; w: Hub; nw: Hub;
}

/**
 * hubのまわりに小さな環状路(8ノードの輪)を作り、東西南北のゲートを介して
 * hub自身とつなぐ(gates本、1〜4)。ゲートが多いほど分岐が増える=街の道路密度が上がる。
 * 藤沢の「ロータリー」もこの関数(radius:100, gates:4)で作っている。
 * 戻り値の8点は、あとから他の街の環状路や幹線の途中(pickMidFiller)と直接つないで
 * 「都市圏の中の複数ルート」「抜け道」を追加するのに使う。
 */
function smallLoop(hub: Hub, radius: number, idPrefix: string, label: string, gates: number): LoopRing {
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
  return { n, ne, e, se, s, sw, w, nw };
}

// ============================================================
// 拠点(9) — 海沿いの幹線(6) + 内陸ルート(3)
// ============================================================

// 海沿いの幹線(西→東)。平塚〜鎌倉の主要6拠点の間隔を前バージョンから約30〜40%短縮し、
// 街どうしが連続しているように詰めた(南北の座標は少しずつ変え、海岸線のカーブに沿って
// 見えるようにしている)。稲村ヶ崎⇄鎌倉のみ、鎌倉の環状路(下記)のスペースを確保するため
// 他区間ほど詰めていない。
const hiratsuka = addHub("hub_hiratsuka", "平塚", 0, 700);
const chigasaki = addHub("hub_chigasaki", "茅ヶ崎", 420, 756);
const tsujido = addHub("hub_tsujido", "辻堂", 770, 700);
const fujisawa = addHub("hub_fujisawa", "藤沢", 1080, 650, true);
const kugenuma = addHub("wp_kugenuma", "鵠沼", 1080, 780);
const enoshima = addHub("hub_enoshima", "江の島", 1080, 900);
const koshigoe = addHub("wp_koshigoe", "腰越", 1320, 920);
const inamuragasaki = addHub("wp_inamuragasaki", "稲村ヶ崎", 1565, 950);
const kamakura = addHub("hub_kamakura", "鎌倉", 1565, 802);

// 内陸ルート(西→東)
const samukawa = addHub("hub_samukawa", "寒川", 420, 200);
const shonandai = addHub("hub_shonandai", "湘南台", 1080, 150);
const ofuna = addHub("hub_ofuna", "大船", 1320, 350);

// 海沿い⇄内陸の行き来ポイント(4箇所)
const kagawa = addHub("wp_kagawa", "香川", 420, 500); // 寒川⇄茅ヶ崎
const rokkai = addHub("wp_rokkai", "六会", 1080, 400); // 湘南台⇄藤沢
const kajiwara = addHub("wp_kajiwara", "梶原", 1320, 650); // 大船⇄藤沢
const kitakamakura = addHub("wp_kitakamakura", "北鎌倉", 1565, 350); // 大船⇄鎌倉

const decorations: MapDecoration[] = [
  { kind: "parkBlob", cx: 770, cy: 820, rx: 70, ry: 45 }, // 辻堂海浜公園イメージ
  {
    kind: "coastline",
    side: "south",
    points: [
      { x: -100, y: 850 },
      { x: 300, y: 920 },
      { x: 650, y: 880 },
      { x: 950, y: 830 },
      { x: 1080, y: 1080 },
      { x: 1320, y: 1150 },
      { x: 1565, y: 1120 },
      { x: 1750, y: 1050 },
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
// 街どうしの間隔を詰めた分、環状路の半径・ゲート数を前バージョンより一回り大きくし、
// 「都市間を移動する」よりも「街の中で分岐して遊ぶ」比重を増やしている。
// (鎌倉だけは稲村ヶ崎との間隔が元々狭いため、半径は据え置いてゲート数のみ維持)
const fujisawaRing = smallLoop(fujisawa, 95, "fjrt", "藤沢ロータリー", 4); // ★★★★★
const kamakuraRing = smallLoop(kamakura, 85, "kmlp", "鎌倉小路", 3); // ★★★★☆
const chigasakiRing = smallLoop(chigasaki, 90, "cglp", "茅ヶ崎小路", 3); // ★★★★☆(半径75→90、ゲート2→3)
const tsujidoRing = smallLoop(tsujido, 90, "tslp", "辻堂小路", 2); // ★★★☆☆(半径55→90、ゲート1→2)
smallLoop(hiratsuka, 85, "hrlp", "平塚小路", 2); // ★★★☆☆(半径55→85。終着点のため幹線側の接続が1本しかない分を補う)
// 湘南台・寒川・江の島は環状路なし(湘南台は幹線2+行き来1で計3方向、寒川・江の島は計2方向)

// ============================================================
// ゲーム性強化: 茅ヶ崎〜辻堂〜藤沢を1つの都市圏として道路を増やす、
// 藤沢をさらに分岐の多いハブにする、鎌倉周辺を強化する、
// 長い一本道の途中に内陸へ抜ける近道を作る
// ============================================================

// 茅ヶ崎⇄辻堂、辻堂⇄藤沢: 海沿いの幹線とは別に、環状路どうしを直接つなぐ「裏道」を通す。
// 幹線(coastal)を通るか、街なかの裏道(residential)を通るか、プレイヤーが選べるようになる。
buildRoad(chigasakiRing.e, tsujidoRing.w, "residential", "r_local_cg_ts", "茅ヶ崎");
buildRoad(tsujidoRing.e, fujisawaRing.w, "residential", "r_local_ts_fj", "辻堂");

// 藤沢: ロータリーの斜めの点からも六会・梶原へ直接抜けられるようにし、
// 「幹線→藤沢中心→行き来ルート」以外に「ロータリー経由」でも同じ場所へ行けるようにする。
buildRoad(fujisawaRing.ne, rokkai, "residential", "r_fj_ne_rk", "藤沢ロータリー");
buildRoad(fujisawaRing.se, kajiwara, "residential", "r_fj_se_kj", "藤沢ロータリー");

// 鎌倉: 環状路の西側を稲村ヶ崎に直結し、稲村ヶ崎⇄鎌倉が海沿い幹線+この裏道の2ルートになる。
buildRoad(kamakuraRing.w, inamuragasaki, "residential", "r_km_w_in", "鎌倉小路");

// 長い一本道(茅ヶ崎⇄辻堂、辻堂⇄藤沢)の途中から、内陸ルートへ抜ける近道を2本追加。
// 海沿いを直進するか、内陸へ抜けて別ルートを回るか、の選択肢が生まれる。
buildRoad(pickMidFiller(chigasaki, tsujido), kagawa, "shortcut", "r_short_cgts_kg", "茅ヶ崎"); // 茅ヶ崎-辻堂の中間→香川(寒川方面)
buildRoad(pickMidFiller(tsujido, fujisawa), rokkai, "shortcut", "r_short_tsfj_rk", "辻堂"); // 辻堂-藤沢の中間→六会(湘南台方面)

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
