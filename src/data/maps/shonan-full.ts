import type { MapData, MapNode, MapDecoration, NodeType, PropertyDef, RoadType } from "@/types/game";
import { windingFiller } from "@/lib/game/mapBuilder";

/**
 * 湘南すごろく 全域マップ(地形反映・自然な広がり版)
 *
 * 400px四方の街区を均等に敷き詰める前バージョンから離れ、実際の湘南の地形に近い配置にした。
 *
 *   - 海沿いの幹線: 平塚→茅ヶ崎→辻堂→藤沢→(鵠沼)→(腰越)→(稲村ヶ崎)→鎌倉。
 *     区間ごとに距離・向きを変え、南北の座標を緩やかに上下させることで、
 *     「実際の道路は縦横グリッドのまま」でも海岸線に沿ってカーブしているように見せている
 *     (拠点間を結ぶ道自体はわずかに傾くが、これは前バージョンの外周ジッターと同程度の範囲)。
 *   - 江の島は幹線の通過点ではなく、鵠沼から橋(roadType: national)を渡った先の
 *     行き止まりの島。島の中には小さな参道の輪(smallLoop)がある。
 *   - 内陸ルート: 寒川→湘南台→大船。海沿いの幹線とは独立した北側のルート
 *     (大船は経由地で、目的地候補ではない)。
 *   - 海沿い⇄内陸の行き来は4箇所: 寒川⇄茅ヶ崎(香川経由)・湘南台⇄藤沢(六会経由)・
 *     大船⇄藤沢(梶原経由)・大船⇄鎌倉(北鎌倉経由)。
 *   - 藤沢は最大のハブ: 幹線2方向(辻堂・鵠沼方面)+行き来2方向(六会・梶原方面)に加えて、
 *     二重の環状道路(ロータリー、外周8ノード+内周8ノード)を持つ。ゲーム中もっとも
 *     分岐が多い街になる。
 *   - 目的地候補(主要駅)はゲームの分かりやすさのため8駅だけに絞っている:
 *     平塚・茅ヶ崎・辻堂・藤沢・湘南台・寒川・鎌倉・江の島。それ以外(大船・鵠沼・腰越・
 *     稲村ヶ崎・香川・六会・梶原・北鎌倉・各海岸・小町通りなど)は経由地・行き止まりの
 *     観光スポットとして地図上に存在するが、目的地には選ばれない。
 *   - 道路密度のメリハリ: smallLoop()で街ごとに小さな環状路を追加し、街の大きさ・
 *     ゲートの本数で密度を変えている。
 *       藤沢     ★★★★★  二重ロータリー(外周半径95・ゲート4 + 内周半径45)
 *       鎌倉     ★★★★☆  小さな環状路(半径70/90・ゲート3・蛇行あり)+小町通りの曲がり角
 *       茅ヶ崎   ★★★★☆  小さな環状路(半径100/70・ゲート3)+海岸沿いの小さな輪
 *       平塚     ★★★★☆  西側最大都市として環状路を拡大(半径105/90・ゲート3)
 *       辻堂     ★★★☆☆  小さな環状路(半径65/100・ゲート2)
 *       湘南台   ★★★☆☆  環状路なし(幹線2+行き来1の計3方向で十分な分岐がある)
 *       寒川     ★★☆☆☆  環状路なし
 *       江の島   ★★☆☆☆  島の中に小さな参道の輪のみ(行き止まりの観光地)
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
 * ── 移動の楽しさをさらに強化(今回追加) ──
 *   - 藤沢: 外周ロータリーの内側に、もう一回り小さな内周ロータリー(半径45、外周と4本の
 *     放射状の道でつながる)を追加。実在の大きな環状交差点のような二重構造にし、
 *     マップ最大の都市らしく道路の総量を大きく増やした。
 *   - 茅ヶ崎〜辻堂〜藤沢の都市圏: 各街の環状路どうしをつなぐ裏道を計5本(茅ヶ崎⇄辻堂2本、
 *     辻堂⇄藤沢3本)に増やし、海沿い幹線とあわせてどのルートを通るか選べる幅を広げた。
 *   - 寒川⇄湘南台の一本道の1/3・2/3地点から、それぞれ香川・六会へ抜ける近道を追加した。
 *   - 鎌倉の観光地らしさを出すため、周辺の北鎌倉・稲村ヶ崎にも小さな環状路を追加した。
 *   - 海沿い幹線(茅ヶ崎・辻堂・稲村ヶ崎)から、行き止まりの観光スポット(茅ヶ崎海岸・
 *     辻堂海岸・由比ヶ浜)へ寄り道できる短い枝道を追加した(意図した行き止まり)。
 *   - 街ごとに環状路の形(円/横長の楕円/縦長の楕円)を変え、同じ形の街が続かないようにした。
 *
 * ── 仕上げ: 湘南らしさと分かりやすさ(今回追加、道路量は増やさず調整が中心) ──
 *   - 江の島: 幹線の通過点から、鵠沼から橋(national)を渡って入る行き止まりの島に変更。
 *     幹線自体は鵠沼から直接 腰越 へ抜けるようにした。
 *   - 鎌倉: 環状路(kamakuraRing)・北鎌倉小路・稲村ヶ崎小路にわずかな蛇行(wobble)を入れ、
 *     寺社の多い古い街並みらしい曲がりくねった路地の雰囲気にした。さらに2回曲がって
 *     着く小さな通り(小町通りイメージ)を追加し、まっすぐ着かない古い商店街らしさを出した。
 *   - 平塚: 西側最大の都市として環状路を鎌倉・茅ヶ崎と同格まで拡大した(半径85→105・
 *     ゲート2→3)。
 *   - 茅ヶ崎: 海側の行き止まり(茅ヶ崎海岸)にも、さらに海側へ寄る小さな輪を追加した。
 *   - 内陸ルート(寒川⇄湘南台⇄大船、および海沿い⇄内陸の行き来4箇所)にわずかな蛇行を
 *     入れ、香川・六会・梶原・北鎌倉の座標も格子から少しずらして、内陸が完全な
 *     縦横グリッドに見えすぎないようにした。
 *   - 目的地候補(主要駅)を8駅(平塚・茅ヶ崎・辻堂・藤沢・湘南台・寒川・鎌倉・江の島)に
 *     絞り込んだ。大船・鵠沼・腰越・稲村ヶ崎・香川・六会・梶原・北鎌倉・各海岸・小町通りは
 *     addHubではなくaddJunctionに変更し、地図上には存在するが目的地には選ばれないように
 *     した(ゲームとしての分かりやすさを優先)。
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
 *
 * マス数の下限は0(=マスを1つも挟まず、2点を直接1本の道でつなぐ)にしている。
 * 昔は下限1だったため、半径の小さい環状路(小さな輪)の1辺のように区間そのものが
 * 短い場合に、無理にマスを1つ詰め込んでしまい他の区間よりマス間隔が狭く見える
 * 問題があった。下限を0にすることで、短い区間はマスなしの1本道になり、他の区間と
 * 同じ「マス・道・マス」のピッチが保たれる。今後、環状路や近道を追加するときも
 * この関数(buildRoad)を通して作ればこのルールが自動的に適用される。
 */
// 生成したマスの並び(a→bの順)を覚えておき、あとから「この区間のだいたい真ん中のマス」を
// 拾って新しい短い道(近道)をつなげられるようにする(区間を二重に作り直さずに分岐を増やすため)。
const chainCache = new Map<string, Hub[]>();

function buildRoad(a: Hub, b: Hub, roadType: RoadType, idPrefix: string, area: string, wobble: number = 0) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = 50;
  const spineCount = Math.max(0, Math.round(dist / scale) - 1);

  const spine = windingFiller(
    { id: a.id, x: a.x, y: a.y },
    { id: b.id, x: b.x, y: b.y },
    { count: spineCount, roadType, area, idPrefix, wobble, plain: true },
    generatedProperties,
  );
  for (const n of spine.nodes) nodeSpecs.push({ id: n.id, name: n.name, type: n.type, area: n.area, x: n.x, y: n.y, propertyId: n.propertyId });
  for (const e of spine.edges) edgeSpecs.push(e);

  const fillers: Hub[] = spine.nodes.map((n) => ({ id: n.id, name: n.name, x: n.x, y: n.y }));
  chainCache.set([a.id, b.id].sort().join("__"), fillers);
}

/** a⇄b の区間(すでに buildRoad 済みであること)の、だいたい真ん中のマスを1つ拾う。 */
function pickMidFiller(a: Hub, b: Hub): Hub {
  return pickFillerAt(a, b, 0.5);
}

/** a⇄b の区間(すでに buildRoad 済みであること)の、a側から数えて t(0〜1)の位置のマスを1つ拾う。 */
function pickFillerAt(a: Hub, b: Hub, t: number): Hub {
  const key = [a.id, b.id].sort().join("__");
  const chain = chainCache.get(key);
  if (!chain || chain.length === 0) return a;
  const idx = Math.min(chain.length - 1, Math.max(0, Math.floor(chain.length * t)));
  return chain[idx];
}

interface LoopRing {
  n: Hub; ne: Hub; e: Hub; se: Hub; s: Hub; sw: Hub; w: Hub; nw: Hub;
}

/**
 * hubのまわりに小さな環状路(8ノードの輪)を作り、東西南北のゲートを介して
 * hub自身とつなぐ(gates本、1〜4)。ゲートが多いほど分岐が増える=街の道路密度が上がる。
 * radiusX/radiusYを変えると円(正方形)ではなく楕円(長方形)の輪になり、
 * 街ごとに道路の形を変えて同じ形の街が続かないようにできる。
 * 藤沢の「ロータリー」もこの関数(radiusX/Y:95, gates:4)で作っている。
 * 戻り値の8点は、あとから他の街の環状路や幹線の途中(pickMidFiller/pickFillerAt)と直接つないで
 * 「都市圏の中の複数ルート」「抜け道」を追加するのに使う。
 */
function smallLoop(hub: Hub, radiusX: number, idPrefix: string, label: string, gates: number, radiusY: number = radiusX, wobble: number = 0): LoopRing {
  const n = addJunction(`${idPrefix}_n`, `${label}(北)`, hub.x, hub.y - radiusY);
  const ne = addJunction(`${idPrefix}_ne`, `${label}(北東)`, hub.x + radiusX, hub.y - radiusY);
  const e = addJunction(`${idPrefix}_e`, `${label}(東)`, hub.x + radiusX, hub.y);
  const se = addJunction(`${idPrefix}_se`, `${label}(南東)`, hub.x + radiusX, hub.y + radiusY);
  const s = addJunction(`${idPrefix}_s`, `${label}(南)`, hub.x, hub.y + radiusY);
  const sw = addJunction(`${idPrefix}_sw`, `${label}(南西)`, hub.x - radiusX, hub.y + radiusY);
  const w = addJunction(`${idPrefix}_w`, `${label}(西)`, hub.x - radiusX, hub.y);
  const nw = addJunction(`${idPrefix}_nw`, `${label}(北西)`, hub.x - radiusX, hub.y - radiusY);
  const ring = [n, ne, e, se, s, sw, w, nw];
  for (let i = 0; i < ring.length; i++) {
    buildRoad(ring[i], ring[(i + 1) % ring.length], "residential", `r_${idPrefix}_ring${i}`, label, wobble);
  }
  const gateNodes = [n, e, s, w].slice(0, gates);
  for (const g of gateNodes) {
    buildRoad(hub, g, "residential", `r_${idPrefix}_gate_${g.id}`, label, wobble);
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
// 主要駅(目的地候補になる8駅)は addHub、それ以外の経由地・行き止まりの観光スポットは
// addJunction(目的地候補にしない)で統一している。8駅=平塚・茅ヶ崎・辻堂・藤沢・
// 湘南台・寒川・鎌倉・江の島。ゲームの分かりやすさのため、目的地はこの8駅だけに絞った。
const hiratsuka = addHub("hub_hiratsuka", "平塚", 0, 700);
const chigasaki = addHub("hub_chigasaki", "茅ヶ崎", 420, 756);
const tsujido = addHub("hub_tsujido", "辻堂", 770, 700);
const fujisawa = addHub("hub_fujisawa", "藤沢", 1080, 650, true);
const kugenuma = addJunction("wp_kugenuma", "鵠沼", 1080, 780); // 江の島大橋の起点(片瀬側)
const enoshima = addHub("hub_enoshima", "江の島", 1080, 950); // 鵠沼から橋を渡った先の島。海沿い幹線の通過点ではなく行き止まりの島にする
const koshigoe = addJunction("wp_koshigoe", "腰越", 1345, 900); // 江の島を経由せず鵠沼から直接つながる本土側のルート
const inamuragasaki = addJunction("wp_inamuragasaki", "稲村ヶ崎", 1565, 950);
const kamakura = addHub("hub_kamakura", "鎌倉", 1565, 802);

// 内陸ルート(西→東)。四角いグリッドに見えすぎないよう、寒川⇄湘南台・湘南台⇄大船の
// 道にわずかな蛇行(wobble)を入れている(海沿いの都会的な直線グリッドとの対比)。
const samukawa = addHub("hub_samukawa", "寒川", 420, 200);
const shonandai = addHub("hub_shonandai", "湘南台", 1080, 150);
const ofuna = addJunction("wp_ofuna", "大船", 1320, 350); // 目的地候補ではなく経由地(内陸⇄海沿いの結節点)

// 海沿い⇄内陸の行き来ポイント(4箇所)。完全な縦横グリッドに見えすぎないよう、
// 座標を少しだけ本来の格子位置からずらしている。
const kagawa = addJunction("wp_kagawa", "香川", 440, 510); // 寒川⇄茅ヶ崎
const rokkai = addJunction("wp_rokkai", "六会", 1055, 420); // 湘南台⇄藤沢
const kajiwara = addJunction("wp_kajiwara", "梶原", 1345, 630); // 大船⇄藤沢
const kitakamakura = addJunction("wp_kitakamakura", "北鎌倉", 1540, 370); // 大船⇄鎌倉

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
// 江の島は海沿い幹線の通過点にせず、鵠沼から橋(roadType: national、太い道路として描かれる)
// を渡った先の行き止まりの島にする。幹線そのものは鵠沼から直接 腰越 へ抜ける。
buildRoad(kugenuma, enoshima, "national", "r_kg_en_bridge", "江の島大橋"); // 江の島大橋(橋)
buildRoad(kugenuma, koshigoe, "coastal", "r_kg_ks", "鵠沼");
buildRoad(koshigoe, inamuragasaki, "coastal", "r_ks_in", "腰越");
buildRoad(inamuragasaki, kamakura, "coastal", "r_in_km", "稲村ヶ崎");

// ============================================================
// 内陸ルート(2区間)。海沿いの都会的な直線グリッドと対比させ、のどかな内陸らしく
// 少し蛇行させる(wobble)。四角いグリッドに見えすぎないようにするための調整。
// ============================================================
buildRoad(samukawa, shonandai, "main", "r_sm_sc", "寒川", 18);
buildRoad(shonandai, ofuna, "main", "r_sc_of", "湘南台", 18);

// ============================================================
// 海沿い⇄内陸の行き来(4箇所、各2区間)。こちらも軽く蛇行させている。
// ============================================================
buildRoad(samukawa, kagawa, "main", "r_sm_kg", "寒川", 12);
buildRoad(kagawa, chigasaki, "main", "r_kg_cg", "香川", 12);

buildRoad(shonandai, rokkai, "main", "r_sc_rk", "湘南台", 12);
buildRoad(rokkai, fujisawa, "main", "r_rk_fj", "六会", 12);

buildRoad(ofuna, kajiwara, "main", "r_of_kj", "大船", 12);
buildRoad(kajiwara, fujisawa, "main", "r_kj_fj", "梶原", 12);

buildRoad(ofuna, kitakamakura, "main", "r_of_kk", "大船", 12);
buildRoad(kitakamakura, kamakura, "main", "r_kk_km", "北鎌倉", 12);

// ============================================================
// 道路密度のメリハリ(小さな環状路)
// ============================================================
// 街どうしの間隔を詰めた分、環状路の半径・ゲート数を前バージョンより一回り大きくし、
// 「都市間を移動する」よりも「街の中で分岐して遊ぶ」比重を増やしている。
// (鎌倉だけは稲村ヶ崎との間隔が元々狭いため、半径は据え置いてゲート数のみ維持)
// radiusX/radiusYを街ごとに変え、円(正方形)の街が同じ形で連続しないようにしている
// (藤沢=大きな正円のロータリー、茅ヶ崎=東西に長い楕円、辻堂=南北に長い楕円、
//  平塚=やや平たい楕円、鎌倉=南北にやや長い楕円)。
// 鎌倉は寺社が多い古い街並みを意識し、環状路にわずかな蛇行(wobble)を入れて
// 「碁盤の目」ではない曲がりくねった路地の雰囲気を出している。
const fujisawaRing = smallLoop(fujisawa, 95, "fjrt", "藤沢ロータリー", 4); // ★★★★★
const kamakuraRing = smallLoop(kamakura, 70, "kmlp", "鎌倉小路", 3, 90, 10); // ★★★★☆(古都らしく蛇行)
const chigasakiRing = smallLoop(chigasaki, 100, "cglp", "茅ヶ崎小路", 3, 70); // ★★★★☆
const tsujidoRing = smallLoop(tsujido, 65, "tslp", "辻堂小路", 2, 100); // ★★★☆☆
// 平塚: 西側最大の都市として、環状路を鎌倉・茅ヶ崎と同格まで拡大する(半径85→105、ゲート2→3)。
const hiratsukaRing = smallLoop(hiratsuka, 105, "hrlp", "平塚小路", 3, 90); // ★★★★☆(西側最大都市)
// 江の島: 橋を渡った先の島の中の小さな参道(仲見世通りイメージ)。行き止まりの小さな輪。
smallLoop(enoshima, 35, "enlp", "江の島参道", 1);
// 湘南台・寒川は環状路なし(幹線2+行き来1の計3方向で十分な分岐がある)

// ============================================================
// ゲーム性強化: 茅ヶ崎〜辻堂〜藤沢を1つの都市圏として道路を増やす、
// 藤沢をさらに分岐の多いハブにする、鎌倉周辺を強化する、
// 長い一本道の途中に内陸へ抜ける近道を作る
// ============================================================

// 茅ヶ崎⇄辻堂、辻堂⇄藤沢: 海沿いの幹線とは別に、環状路どうしを直接つなぐ「裏道」を
// 複数本通す。幹線(coastal)を通るか、どの裏道を通るか、プレイヤーが選べるようになる。
buildRoad(chigasakiRing.e, tsujidoRing.w, "residential", "r_local_cg_ts", "茅ヶ崎");
buildRoad(chigasakiRing.se, tsujidoRing.sw, "residential", "r_local2_cg_ts", "茅ヶ崎"); // 2本目(海側寄り)
buildRoad(tsujidoRing.e, fujisawaRing.w, "residential", "r_local_ts_fj", "辻堂");
buildRoad(tsujidoRing.se, fujisawaRing.sw, "residential", "r_local2_ts_fj", "辻堂"); // 2本目(海側寄り)
buildRoad(tsujidoRing.ne, fujisawaRing.nw, "residential", "r_local3_ts_fj", "辻堂"); // 3本目(内陸寄り)

// 藤沢: ロータリーの斜めの点からも六会・梶原へ直接抜けられるようにし、
// 「幹線→藤沢中心→行き来ルート」以外に「ロータリー経由」でも同じ場所へ行けるようにする。
buildRoad(fujisawaRing.ne, rokkai, "residential", "r_fj_ne_rk", "藤沢ロータリー");
buildRoad(fujisawaRing.se, kajiwara, "residential", "r_fj_se_kj", "藤沢ロータリー");

// 藤沢: マップ最大の都市として、外周のロータリーの内側にもう一回り小さな内周ロータリーを作る
// (実在の大きな環状交差点のように外周・内周の2重構造にする)。内周はまず外周と radial に
// つなぎ、藤沢の中心には外周からしか入れないようにする(内周だけ孤立させない)。
const fujisawaInner = smallLoop(fujisawa, 45, "fjrt2", "藤沢中央ロータリー", 0);
buildRoad(fujisawaInner.n, fujisawaRing.n, "residential", "r_fjrt_in_n", "藤沢ロータリー");
buildRoad(fujisawaInner.e, fujisawaRing.e, "residential", "r_fjrt_in_e", "藤沢ロータリー");
buildRoad(fujisawaInner.s, fujisawaRing.s, "residential", "r_fjrt_in_s", "藤沢ロータリー");
buildRoad(fujisawaInner.w, fujisawaRing.w, "residential", "r_fjrt_in_w", "藤沢ロータリー");

// 鎌倉: 環状路の西側を稲村ヶ崎に直結し、稲村ヶ崎⇄鎌倉が海沿い幹線+この裏道の2ルートになる。
buildRoad(kamakuraRing.w, inamuragasaki, "residential", "r_km_w_in", "鎌倉小路", 10);

// 鎌倉: 観光地らしく、周辺(北鎌倉・稲村ヶ崎)にも小さな環状ルートを追加する(いずれも蛇行あり)。
smallLoop(kitakamakura, 45, "kklp", "北鎌倉小路", 2, 45, 10); // 円覚寺・建長寺まわりのイメージ
smallLoop(inamuragasaki, 40, "inlp", "稲村ヶ崎小路", 1, 40, 10); // 稲村ヶ崎公園まわりのイメージ

// 鎌倉: 古い商店街らしく、まっすぐではなく2回曲がって着く小さな通り(小町通りイメージ)を追加。
const komachiBend1 = addJunction("wp_komachi1", "小町通り入口", kamakuraRing.e.x + 40, kamakuraRing.e.y);
buildRoad(kamakuraRing.e, komachiBend1, "residential", "r_km_komachi1", "小町通り");
const komachiBend2 = addJunction("wp_komachi2", "小町通り中程", komachiBend1.x, komachiBend1.y + 45);
buildRoad(komachiBend1, komachiBend2, "residential", "r_km_komachi2", "小町通り");
const komachi = addJunction("wp_komachi3", "小町通り", komachiBend2.x + 40, komachiBend2.y);
buildRoad(komachiBend2, komachi, "residential", "r_km_komachi3", "小町通り");

// 長い一本道の途中から、内陸ルートへ抜ける近道を追加。
// 海沿いを直進するか、内陸へ抜けて別ルートを回るか、の選択肢が生まれる。
buildRoad(pickMidFiller(chigasaki, tsujido), kagawa, "shortcut", "r_short_cgts_kg", "茅ヶ崎"); // 茅ヶ崎-辻堂の中間→香川(寒川方面)
buildRoad(pickMidFiller(tsujido, fujisawa), rokkai, "shortcut", "r_short_tsfj_rk", "辻堂"); // 辻堂-藤沢の中間→六会(湘南台方面)
buildRoad(pickFillerAt(samukawa, shonandai, 0.33), kagawa, "shortcut", "r_short_smsc_kg", "寒川"); // 寒川-湘南台の1/3地点→香川
buildRoad(pickFillerAt(samukawa, shonandai, 0.66), rokkai, "shortcut", "r_short_smsc_rk", "湘南台"); // 寒川-湘南台の2/3地点→六会

// 海沿い幹線から海側へ寄り道できる行き止まりの観光スポットを追加(意図した行き止まり、
// 目的地候補にはしない実在地名の経由地)。
const chigasakiKaigan = addJunction("wp_chigasaki_kaigan", "茅ヶ崎海岸", chigasaki.x, chigasaki.y + 130);
buildRoad(chigasakiRing.s, chigasakiKaigan, "coastal", "r_cg_s_kaigan", "茅ヶ崎海岸");
// 茅ヶ崎: 海側へ寄る小さなルートとして、海岸沿いにもう少しだけ小さな輪を作る。
smallLoop(chigasakiKaigan, 30, "cgklp", "茅ヶ崎海岸通り", 1);

const tsujidoKaigan = addJunction("wp_tsujido_kaigan", "辻堂海岸", tsujido.x, tsujido.y + 150);
buildRoad(tsujidoRing.s, tsujidoKaigan, "coastal", "r_ts_s_kaigan", "辻堂海岸");

const yuigahama = addJunction("wp_yuigahama", "由比ヶ浜", inamuragasaki.x - 100, inamuragasaki.y + 90);
buildRoad(inamuragasaki, yuigahama, "coastal", "r_in_yui", "由比ヶ浜");

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
