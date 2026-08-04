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
 *     環状道路(ロータリー)と、そこから1本外付けした小さな衛星の輪(藤沢北口)を持つ。
 *     ゲーム中もっとも分岐が多い街になる。
 *   - 目的地候補(主要駅)はゲームの分かりやすさのため8駅だけに絞っている:
 *     平塚・茅ヶ崎・辻堂・藤沢・湘南台・寒川・鎌倉・江の島。それ以外(大船・鵠沼・腰越・
 *     稲村ヶ崎・香川・六会・梶原・北鎌倉・各海岸・小町通りなど)は経由地・行き止まりの
 *     観光スポットとして地図上に存在するが、目的地には選ばれない。
 *   - 道路密度のメリハリ: smallLoop()で街ごとに小さな環状路を追加し、街の大きさ・
 *     ゲートの本数で密度を変えている。
 *       藤沢     ★★★★★  ロータリー(半径80・ゲート4) + 衛星の輪(藤沢北口)
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
 * ── 空白を地形で埋める(今回追加、道路構造はほぼ変更なし) ──
 *   道路網の内側・外側にできる大きな空白を、道路を足して埋めるのではなく「地形エリア」
 *   として扱った。MapDecorationに新しい種類"terrain"(variant: forest/farmland/hills)を
 *   追加し、内陸ルートと海沿いの街のあいだの空白に丘陵を2箇所、寒川・北鎌倉まわりに森、
 *   平塚まわりに農地を配置。あわせて引地川・相模川イメージの川(river)も2本追加した。
 *   さらに、海沿いの幹線(平塚〜鎌倉)にごく軽い蛇行(wobble:8〜10)を入れ、地形を避けて
 *   自然に通っているような、四角い折れ線ではなくゆるく曲がる輪郭にした
 *   (江の島大橋だけはまっすぐな橋のイメージで蛇行なし)。「ゲームのための道路」ではなく
 *   「街の中に道路がある」見た目を目標にしている。
 *
 * ── 寒川⇄平塚「西側の近道」(今回追加) ──
 *   寒川と平塚を直接つなぐルートを新設した(田村経由、roadType: shortcut)。
 *   海沿いルート(平塚→茅ヶ崎→辻堂→藤沢)はそのまま維持し、これとは別に
 *   内陸(寒川・湘南台方面)から直接平塚へ抜けられる選択肢を追加している。
 *   途中に小さな輪を2箇所(田村小路・中原小路)作り、完全な一本道にはしていないが、
 *   藤沢のような密な街区にはせず、郊外らしいシンプルな構成にとどめた。
 *
 * ── 都市間の一本道を道路網へ(今回追加) ──
 *   幹線・行き来ルートの主要区間はすべて距離を確認し、「5〜8マス進むごとに分岐」を
 *   満たすようにした。すでに分岐のあった区間(寒川⇄湘南台、茅ヶ崎⇄辻堂、辻堂⇄藤沢、
 *   田村⇄平塚など)はそのまま、両端にしか分岐のなかった区間(平塚⇄茅ヶ崎、鵠沼⇄腰越、
 *   湘南台⇄大船、北鎌倉⇄鎌倉)には区間の真ん中あたりから短い枝道・合流を追加した
 *   (大神・片瀬海岸・善行への短い枝道、北鎌倉⇄鎌倉は鎌倉小路への合流)。
 *   これにより主要な区間はどこも一本道の最長区間が8マス以下になり、15マス以上
 *   続く一本道は存在しない。茅ヶ崎⇄辻堂⇄藤沢のあいだは幹線+裏道+近道で
 *   すでに3〜4ルートあり、他の主要都市どうしも最低2ルートを確保している。
 *
 * ── マスの重なりを解消(今回追加) ──
 *   街どうしの間隔を詰め、環状路の半径も大きくし、蛇行(wobble)も加えていった結果、
 *   無関係な道路どうしのマスが近すぎて重なって見える箇所が多数(41箇所)発生していた。
 *   座標を突き合わせて機械的に検出するスクリプトで洗い出し、次の対応をした。
 *     - 蛇行(wobble)は全廃した。街の間隔が詰まった状態では、わずかな蛇行でも
 *       隣の道路・環状路とマスが重なってしまうため、「ゆるく曲がる輪郭」より
 *       正確さを優先した。
 *     - 環状路の半径を全体的に一回り小さくした(藤沢95→80、鎌倉70/90→55/75、
 *       茅ヶ崎100/70→80/55、辻堂65/100→50/80、平塚105/90→85/70、
 *       北鎌倉小路・稲村ヶ崎小路も同様に縮小)。
 *     - 藤沢の「二重ロータリー」(外周+同心円の内周)は設計上の欠陥があったため廃止した。
 *       hubを中心とする同心円の輪は、どの方角に内周⇄外周の接続を作っても、
 *       hub→外周への直線スポークと同じ直線上に内周の点が乗ってしまい、
 *       どうしてもマスが重なる。かわりに、鎌倉の北鎌倉小路・稲村ヶ崎小路と同じ
 *       「衛星型」(ロータリーの1点から1本の道で少し離れた場所に別の小さな輪を作る)
 *       に統一し、「藤沢北口」という衛星の輪を追加した。
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
function smallLoop(
  hub: Hub,
  radiusX: number,
  idPrefix: string,
  label: string,
  gates: number,
  radiusY: number = radiusX,
  wobble: number = 0,
  gateCorners: (keyof LoopRing)[] = ["n", "e", "s", "w"],
): LoopRing {
  const n = addJunction(`${idPrefix}_n`, `${label}(北)`, hub.x, hub.y - radiusY);
  const ne = addJunction(`${idPrefix}_ne`, `${label}(北東)`, hub.x + radiusX, hub.y - radiusY);
  const e = addJunction(`${idPrefix}_e`, `${label}(東)`, hub.x + radiusX, hub.y);
  const se = addJunction(`${idPrefix}_se`, `${label}(南東)`, hub.x + radiusX, hub.y + radiusY);
  const s = addJunction(`${idPrefix}_s`, `${label}(南)`, hub.x, hub.y + radiusY);
  const sw = addJunction(`${idPrefix}_sw`, `${label}(南西)`, hub.x - radiusX, hub.y + radiusY);
  const w = addJunction(`${idPrefix}_w`, `${label}(西)`, hub.x - radiusX, hub.y);
  const nw = addJunction(`${idPrefix}_nw`, `${label}(北西)`, hub.x - radiusX, hub.y - radiusY);
  const ring: LoopRing = { n, ne, e, se, s, sw, w, nw };
  const points = [n, ne, e, se, s, sw, w, nw];
  for (let i = 0; i < points.length; i++) {
    buildRoad(points[i], points[(i + 1) % points.length], "residential", `r_${idPrefix}_ring${i}`, label, wobble);
  }
  // gateCorners: どの点をhubへの「ゲート」にするか。街から実際に伸びる幹線・行き来ルートと
  // 同じ方角(例: 東西南北)にゲートを置くと、hubから伸びる直線どうしが重なってマスが
  // 重なって見えるため、街ごとに衝突しない方角(斜めの点など)を指定できるようにしている。
  const gateNodes = gateCorners.slice(0, gates).map((key) => ring[key]);
  for (const g of gateNodes) {
    buildRoad(hub, g, "residential", `r_${idPrefix}_gate_${g.id}`, label, wobble);
  }
  return ring;
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

// 寒川⇄平塚を直接つなぐ「西側の近道」。海沿いルート(平塚→茅ヶ崎→辻堂→藤沢)は
// そのまま残し、これとは別に内陸から直接平塚へ抜けられる選択肢を追加する。
// 郊外らしいシンプルな構成にするため、藤沢のような密な街区にはしない。
const tamura = addJunction("wp_tamura", "田村", 0, 200); // 寒川⇄平塚の曲がり角
const ofuna = addJunction("wp_ofuna", "大船", 1320, 350); // 目的地候補ではなく経由地(内陸⇄海沿いの結節点)

// 海沿い⇄内陸の行き来ポイント(4箇所)。完全な縦横グリッドに見えすぎないよう、
// 座標を少しだけ本来の格子位置からずらしている。
const kagawa = addJunction("wp_kagawa", "香川", 440, 510); // 寒川⇄茅ヶ崎
const rokkai = addJunction("wp_rokkai", "六会", 1055, 420); // 湘南台⇄藤沢
const kajiwara = addJunction("wp_kajiwara", "梶原", 1345, 630); // 大船⇄藤沢
const kitakamakura = addJunction("wp_kitakamakura", "北鎌倉", 1540, 370); // 大船⇄鎌倉

// 道路網の外側・内側にできる大きな空白を「何もない」ではなく「地形」として埋める。
// 空白そのものを道路で埋めるのではなく、森・農地・丘陵・河川の背景を配置して、
// 「道路が地形を避けて自然に通っている」ように見せる。道路データ自体は変更していない。
const decorations: MapDecoration[] = [
  { kind: "parkBlob", cx: 770, cy: 820, rx: 70, ry: 45 }, // 辻堂海浜公園イメージ
  // 内陸ルート(寒川・湘南台・大船)と海沿いの街(茅ヶ崎・辻堂・藤沢)のあいだの大きな空白 → 丘陵
  { kind: "terrain", variant: "hills", cx: 720, cy: 430, rx: 190, ry: 140 },
  // 大船・北鎌倉と鎌倉・稲村ヶ崎のあいだの空白(鎌倉アルプス・大船丘陵のイメージ) → 丘陵
  { kind: "terrain", variant: "hills", cx: 1300, cy: 560, rx: 150, ry: 115 },
  // 寒川の西側 → 森
  { kind: "terrain", variant: "forest", cx: 220, cy: 300, rx: 95, ry: 75, rotation: -8 },
  // 北鎌倉まわり(実際に寺社の緑が多いエリア) → 森
  { kind: "terrain", variant: "forest", cx: 1470, cy: 470, rx: 75, ry: 95, rotation: 12 },
  // 平塚まわり(実際に田畑が広がるエリア) → 農地
  { kind: "terrain", variant: "farmland", cx: 130, cy: 850, rx: 105, ry: 65, rotation: -10 },
  // 引地川イメージ(内陸から藤沢・辻堂方面の海へ流れる川)
  {
    kind: "river",
    points: [
      { x: 760, y: 160 },
      { x: 730, y: 340 },
      { x: 755, y: 520 },
      { x: 800, y: 680 },
      { x: 830, y: 850 },
    ],
  },
  // 相模川イメージ(寒川・平塚の西側を流れる川)
  {
    kind: "river",
    points: [
      { x: 180, y: 120 },
      { x: 210, y: 350 },
      { x: 240, y: 560 },
      { x: 270, y: 780 },
    ],
  },
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
// 海沿いの幹線(8区間)。
// 蛇行(wobble)は廃止した。街どうしの間隔を詰め、環状路も増やした結果、
// わずかな蛇行でも隣接する道路・環状路とマスが重なって見える箇所が多数出たため、
// 「ゆるく曲がる輪郭」より「マスが重ならないこと」を優先している
// (南北の座標そのものはすでに海岸線のカーブに沿ってずらしてあるので、
// 蛇行なしでも折れ線としての緩やかなカーブは残る)。
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
// 内陸ルート(2区間)。同じ理由で蛇行は廃止。
// ============================================================
buildRoad(samukawa, shonandai, "main", "r_sm_sc", "寒川");
buildRoad(shonandai, ofuna, "main", "r_sc_of", "湘南台");

// ============================================================
// 海沿い⇄内陸の行き来(4箇所、各2区間)。
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
// 寒川⇄平塚「西側の近道」(2区間 + 分岐2箇所)。roadType: shortcut にして、
// 海沿い幹線・内陸ルートとは別の選択肢だとひと目でわかるようにする(紫の破線)。
// ============================================================
buildRoad(samukawa, tamura, "shortcut", "r_sm_tm", "寒川");
buildRoad(tamura, hiratsuka, "shortcut", "r_tm_hr", "田村");

// 分岐1: 田村に小さな輪をひとつ(藤沢ほど密にせず、郊外らしい規模にとどめる)。
// 田村自体は寒川(東)・平塚(南)の道が通る交差点のため、輪を田村の真上ではなく
// 北へ少し離した場所(衛星型)に置き、輪の点が既存の道と重ならないようにしている。
const tamuraKado = addJunction("wp_tamura_kado", "田村北", tamura.x, tamura.y - 55);
buildRoad(tamura, tamuraKado, "residential", "r_tm_kado", "田村小路");
smallLoop(tamuraKado, 30, "tmlp", "田村小路", 1);

// 分岐2: 田村⇄平塚の区間の途中(だいたい真ん中のマス)から、少し東へ入った所に
// もう1箇所小さな輪(中原イメージ)を作る。
const tamuraHiratsukaMid = pickMidFiller(tamura, hiratsuka);
const nakahara = addJunction("wp_nakahara", "中原", tamuraHiratsukaMid.x + 70, tamuraHiratsukaMid.y);
buildRoad(tamuraHiratsukaMid, nakahara, "shortcut", "r_tmhr_nk", "中原");
const nakaharaRing = smallLoop(nakahara, 40, "nklp", "中原小路", 1);
// 600マス化・第6弾(残りエリア): 中原小路の東点から、もう1つ小さな輪(田村ヶ丘イメージ)。
const tamuragaoka = addJunction("wp_tamuragaoka", "田村ヶ丘入口", nakaharaRing.e.x + 55, nakaharaRing.e.y + 25);
buildRoad(nakaharaRing.e, tamuragaoka, "residential", "r_nklp_tamuragaoka", "田村ヶ丘");
smallLoop(tamuragaoka, 25, "tmgo", "田村ヶ丘", 1);

// 寒川: これまで環状路が1つもなかった(幹線2+行き来1の計3方向のみ)ため、
// 北側の空いた方角に湘南台と同じ手法(衛星型ロータリー+住宅街)で追加する。
// 大神は寒川エリアの一部として扱い、独立した輪は作らない。
const samukawaKita = addJunction("wp_samukawa_kita", "寒川ロータリー入口", samukawa.x + 20, samukawa.y - 60);
buildRoad(samukawa, samukawaKita, "residential", "r_sm_kita", "寒川ロータリー");
const smrtRing = smallLoop(samukawaKita, 30, "smrt", "寒川ロータリー", 1);
const smResidential = addJunction("wp_sm_residential", "寒川住宅街入口", smrtRing.e.x - 30, smrtRing.e.y - 105);
buildRoad(smrtRing.e, smResidential, "residential", "r_sm_residential", "寒川住宅街");
smallLoop(smResidential, 24, "smrs", "寒川住宅街", 1);

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
// 街どうしの間隔を詰めてある分、環状路の半径は隣の街・幹線と干渉しない範囲に抑えている
// (以前より一回り小さいが、ゲート数・形の違いで密度のメリハリは維持している)。
// 藤沢: 実際の幹線(辻堂=西・鵠沼=南・六会=北・梶原=東)が東西南北をすべて使っているため、
// ゲートは斜め4点(北東・南東・南西・北西)にして、hubから伸びる直線どうしが重ならないようにする。
const fujisawaRing = smallLoop(fujisawa, 80, "fjrt", "藤沢ロータリー", 4, 65, 0, ["ne", "se", "sw", "nw"]); // ★★★★★
// 鎌倉: 実際の幹線が南(稲村ヶ崎)・北(北鎌倉)を使っているため、ゲートは東寄り3点にする。
const kamakuraRing = smallLoop(kamakura, 55, "kmlp", "鎌倉小路", 3, 75, 0, ["e", "se", "nw"]); // ★★★★☆
// 茅ヶ崎: 実際の幹線が東(辻堂)・西(平塚)・北(香川)を使っているため、ゲートは南寄り3点にする。
const chigasakiRing = smallLoop(chigasaki, 80, "cglp", "茅ヶ崎小路", 3, 72, 0, ["s", "se", "sw"]); // ★★★★☆

// ============================================================
// 茅ヶ崎: 600マス化・第5弾。実際の幹線・行き来ルートが西(平塚)・東(辻堂、裏道含む)・
// 南(香川・茅ヶ崎海岸)を使っているため、北西・北東・西の空いた点から衛星区画を作る。
// ============================================================
const cgShop = addJunction("wp_cg_shop", "茅ヶ崎銀座入口", chigasakiRing.nw.x - 25, chigasakiRing.nw.y - 55);
buildRoad(chigasakiRing.nw, cgShop, "residential", "r_cg_nw_shop", "茅ヶ崎銀座");
smallLoop(cgShop, 26, "cgsp", "茅ヶ崎銀座", 1);

// 住宅街メッシュ: ロータリー北東点から辻堂ロータリーの北西点(ゲート)へ抜ける
// 3列×2行の格子。海沿い幹線・裏道(r_local_cg_ts)・寒川方面の近道
// (r_short_cgts_kg)のいずれとも重ならない、さらに北東寄りの位置に置く。
const cgmNw = addJunction("cgmesh_nw", "茅ヶ崎住宅街(北西)", 620, 600);
const cgmN = addJunction("cgmesh_n", "茅ヶ崎住宅街(北)", 680, 600);
const cgmNe = addJunction("cgmesh_ne", "茅ヶ崎住宅街(北東)", 710, 600);
const cgmSw = addJunction("cgmesh_sw", "茅ヶ崎住宅街(南西)", 620, 680);
const cgmS = addJunction("cgmesh_s", "茅ヶ崎住宅街(南)", 680, 680);
const cgmSe = addJunction("cgmesh_se", "茅ヶ崎住宅街(南東)", 710, 680);
buildRoad(cgmNw, cgmN, "residential", "r_cgmesh_row1a", "茅ヶ崎住宅街");
buildRoad(cgmN, cgmNe, "residential", "r_cgmesh_row1b", "茅ヶ崎住宅街");
buildRoad(cgmSw, cgmS, "residential", "r_cgmesh_row2a", "茅ヶ崎住宅街");
buildRoad(cgmS, cgmSe, "residential", "r_cgmesh_row2b", "茅ヶ崎住宅街");
buildRoad(cgmNw, cgmSw, "residential", "r_cgmesh_col1", "茅ヶ崎住宅街");
buildRoad(cgmN, cgmS, "residential", "r_cgmesh_col2", "茅ヶ崎住宅街");
buildRoad(cgmNe, cgmSe, "residential", "r_cgmesh_col3", "茅ヶ崎住宅街");
buildRoad(chigasakiRing.ne, cgmNw, "residential", "r_cg_ne_mesh", "茅ヶ崎住宅街");
// 辻堂ロータリーへの接続は、辻堂ロータリー定義後にまとめて追加する。

// 茅ヶ崎: ロータリー西点から、もう1つ小さな輪(茅ヶ崎中央イメージ)を足す。
const cgChuo = addJunction("wp_cg_chuo", "茅ヶ崎中央入口", chigasakiRing.w.x - 60, chigasakiRing.w.y + 30);
buildRoad(chigasakiRing.w, cgChuo, "residential", "r_cg_w_chuo", "茅ヶ崎中央");
smallLoop(cgChuo, 25, "cgcyu", "茅ヶ崎中央", 1);
const tsujidoRing = smallLoop(tsujido, 70, "tslp", "辻堂小路", 2, 80, 0, ["n", "nw"]); // ★★★☆☆

// 辻堂: 600マス化・第6弾。実際の幹線・行き来ルートが西(茅ヶ崎)・東(藤沢方面、
// 裏道・近道含む)・南(辻堂海岸)・北(茅ヶ崎住宅街への裏道)を使っているため、
// まだ空いている北東の点から衛星区画を作る。
// 北東(藤沢本町・辻堂緑ヶ浜案①)・東(藤沢住宅街メッシュ)はどちらも他区画と
// 近すぎるため、南西点から茅ヶ崎方面の空き地へ衛星区画を作る。
const tsShop = addJunction("wp_ts_shop", "辻堂海浜商店街入口", tsujidoRing.sw.x - 50, tsujidoRing.sw.y + 20);
buildRoad(tsujidoRing.sw, tsShop, "residential", "r_ts_sw_shop", "辻堂海浜商店街");
const tsShopRing = smallLoop(tsShop, 26, "tssp", "辻堂海浜商店街", 1);
// 商店街からさらに1本、小さな輪(辻堂緑ヶ浜イメージ)を足す。
const tsMidori = addJunction("wp_ts_midori", "辻堂緑ヶ浜入口", tsShopRing.s.x, tsShopRing.s.y + 50);
buildRoad(tsShopRing.s, tsMidori, "residential", "r_tssp_midori", "辻堂緑ヶ浜");
smallLoop(tsMidori, 24, "tsmd", "辻堂緑ヶ浜", 1);
// 茅ヶ崎住宅街メッシュから辻堂ロータリーの北西ゲートへ抜ける裏道(海沿い幹線・
// 裏道(r_local_cg_ts)のどちらとも通らない北側のルート)。
buildRoad(cgmNe, tsujidoRing.n, "residential", "r_cgmesh_tsujido", "茅ヶ崎住宅街");
// 平塚: 西側最大の都市として、環状路を鎌倉・茅ヶ崎と同格まで拡大する。
// 実際の幹線が東(茅ヶ崎)・北(田村)を使っているため、ゲートは南〜西寄り3点にする。
const hiratsukaRing = smallLoop(hiratsuka, 85, "hrlp", "平塚小路", 3, 70, 0, ["s", "sw", "w"]); // ★★★★☆(西側最大都市)

// ============================================================
// 平塚: 600マス化・第4弾。実際の幹線が東(茅ヶ崎)・北(田村)を使っているため、
// 北東の点(ne)から離して衛星区画を作る(茅ヶ崎方面の道・田村方面の道のどちらとも
// 十分離れている)。
// ============================================================
const hrShop = addJunction("wp_hr_shop", "平塚銀座入口", hiratsukaRing.ne.x + 50, hiratsukaRing.ne.y - 40);
buildRoad(hiratsukaRing.ne, hrShop, "residential", "r_hr_ne_shop", "平塚銀座");
const hrShopRing = smallLoop(hrShop, 28, "hrsp", "平塚銀座", 1);

// 平塚: 銀座の輪からさらに1本、小さな輪(桜ヶ丘イメージ)を足す。
const hrSakura = addJunction("wp_hr_sakura", "平塚桜ヶ丘入口", hrShopRing.e.x + 60, hrShopRing.e.y + 20);
buildRoad(hrShopRing.e, hrSakura, "residential", "r_hrsp_sakura", "平塚桜ヶ丘");
smallLoop(hrSakura, 25, "hrsk", "平塚桜ヶ丘", 1);

// 平塚: 住宅街メッシュ — ロータリー南東点から南側の空き地(農地の裏手)へ
// 3列×2行の格子を作る。出口をロータリー南点へ直結し、格子内でも通り方を選べる
// うえに、ロータリーを回らずに南側へ抜けられる裏ルートにする。
const hrmNw = addJunction("hrmesh_nw", "平塚住宅街(北西)", 60, 830);
const hrmN = addJunction("hrmesh_n", "平塚住宅街(北)", 130, 830);
const hrmNe = addJunction("hrmesh_ne", "平塚住宅街(北東)", 200, 830);
const hrmSw = addJunction("hrmesh_sw", "平塚住宅街(南西)", 60, 880);
const hrmS = addJunction("hrmesh_s", "平塚住宅街(南)", 130, 880);
const hrmSe = addJunction("hrmesh_se", "平塚住宅街(南東)", 200, 880);
buildRoad(hrmNw, hrmN, "residential", "r_hrmesh_row1a", "平塚住宅街");
buildRoad(hrmN, hrmNe, "residential", "r_hrmesh_row1b", "平塚住宅街");
buildRoad(hrmSw, hrmS, "residential", "r_hrmesh_row2a", "平塚住宅街");
buildRoad(hrmS, hrmSe, "residential", "r_hrmesh_row2b", "平塚住宅街");
buildRoad(hrmNw, hrmSw, "residential", "r_hrmesh_col1", "平塚住宅街");
buildRoad(hrmN, hrmS, "residential", "r_hrmesh_col2", "平塚住宅街");
buildRoad(hrmNe, hrmSe, "residential", "r_hrmesh_col3", "平塚住宅街");
buildRoad(hiratsukaRing.se, hrmNw, "residential", "r_hr_se_mesh", "平塚住宅街");
buildRoad(hrmSw, hiratsukaRing.s, "shortcut", "r_hrmesh_hrring_s", "平塚住宅街");
// 江の島: 橋を渡った先の島の中の小さな参道(仲見世通りイメージ)。行き止まりの小さな輪。
const enlpRing = smallLoop(enoshima, 35, "enlp", "江の島参道", 1);
// 600マス化・第6弾: 参道の輪から、島の別の場所(展望灯台・稚児ヶ淵イメージ)へ
// 2本の小さな輪を足す。江の島は行き止まりの島なので、島の中でも通り方を
// 選べるようにする。
const enCandle = addJunction("wp_en_candle", "江の島シーキャンドル入口", enlpRing.n.x - 160, enlpRing.n.y + 35);
buildRoad(enlpRing.n, enCandle, "residential", "r_enlp_candle", "江の島シーキャンドル通り");
smallLoop(enCandle, 24, "encd", "江の島シーキャンドル通り", 1);
const enChigo = addJunction("wp_en_chigo", "稚児ヶ淵入口", enlpRing.s.x, enlpRing.s.y + 55);
buildRoad(enlpRing.s, enChigo, "coastal", "r_enlp_chigo", "稚児ヶ淵");
smallLoop(enChigo, 24, "encg", "稚児ヶ淵", 1);

// ============================================================
// 湘南台: 600マス化・第3弾。これまで環状路が1つもなく、寒川・六会・大船の3方向が
// 湘南台の1点で交わるだけだった(駅前に選択肢が無い)。3方向すべて駅のすぐ近くから
// 出ているため、環状路は北側の空いた方角に衛星型で作る。
// ============================================================
const shonandaiKita = addJunction("wp_shonandai_kita", "湘南台北口", shonandai.x + 20, shonandai.y - 55);
buildRoad(shonandai, shonandaiKita, "residential", "r_sc_kita", "湘南台北口");
const scrtRing = smallLoop(shonandaiKita, 30, "scrt", "湘南台ロータリー", 1);
// 住宅街: ロータリーの東点からさらに1本、小さな輪を足す。
const scResidential = addJunction("wp_sc_residential", "湘南台住宅街入口", scrtRing.e.x + 110, scrtRing.e.y + 55);
buildRoad(scrtRing.e, scResidential, "residential", "r_sc_residential", "湘南台住宅街");
const scResRing = smallLoop(scResidential, 22, "scrs", "湘南台住宅街", 1);
// 住宅街から六会方面へ抜ける裏道。湘南台駅前を経由しない、駅の外側を回るルートになる。
buildRoad(scResRing.s, rokkai, "shortcut", "r_sc_res_rokkai", "湘南台住宅街");

// ============================================================
// 設計方針の見直し: 「道路→道路→道路」で埋めるのをやめ、「街→道路→街」の
// 構成に作り直す。寒川⇄湘南台間に、これまでのような道路沿いの小さな寄り道
// (寒川台・四之宮台・用田・北の横断路・中央住宅街)を並べるのではなく、
// 独立した街区を2つ(四之宮・用田)だけ置き、街と街の間は装飾なしの
// 幹線道路(residential、経由地なし)で直結する。
//   寒川(街区) → 幹線 → 四之宮(街区) → 幹線 → 用田(街区) → 幹線 → 湘南台(街区)
// 各街区はロータリー(ゲート4)+商店街+住宅街の構成にし、街の中だけで
// 複数ルートを選べるようにする(一本道の解消は「道を増やす」のではなく
// 「街区の中に選択肢を作る」ことで行う)。
// ============================================================

// 四之宮: 寒川寄りの街区。寒川ロータリーの北東点から幹線道路で直結する。
// 直通路(r_sm_sc)・その途中の近道群がy150〜200の帯を通っているため、
// ゲートは西・東(幹線)のみにし、商店街・住宅街メッシュはどちらも
// 北側(斜めのne/nw)から、さらに北へ離して置く。
const shinomiyaTownJct = addJunction("wp_shinomiya_town", "四之宮", 650, 125);
const shinomiyaTownRing = smallLoop(shinomiyaTownJct, 35, "snmt", "四之宮ロータリー", 2, 35, 0, ["w", "e"]);
buildRoad(smrtRing.ne, shinomiyaTownRing.w, "residential", "r_smrt_shinomiya", "四之宮");
// 商店街(北東側からさらに北へ)。
const shinomiyaShopJct = addJunction("wp_shinomiya_shop", "四之宮銀座入口", shinomiyaTownRing.ne.x + 10, shinomiyaTownRing.ne.y - 45);
buildRoad(shinomiyaTownRing.ne, shinomiyaShopJct, "residential", "r_shinomiya_shop", "四之宮銀座");
smallLoop(shinomiyaShopJct, 24, "snsp", "四之宮銀座", 1);
// 住宅街メッシュ(北西側からさらに北へ、2x2)。
const shinomiyaMeshNw = addJunction("snmesh_nw", "四之宮住宅街(北西)", shinomiyaTownRing.nw.x - 35, shinomiyaTownRing.nw.y - 60);
const shinomiyaMeshNe = addJunction("snmesh_ne", "四之宮住宅街(北東)", shinomiyaTownRing.nw.x + 5, shinomiyaTownRing.nw.y - 60);
const shinomiyaMeshSw = addJunction("snmesh_sw", "四之宮住宅街(南西)", shinomiyaTownRing.nw.x - 35, shinomiyaTownRing.nw.y - 20);
const shinomiyaMeshSe = addJunction("snmesh_se", "四之宮住宅街(南東)", shinomiyaTownRing.nw.x + 5, shinomiyaTownRing.nw.y - 20);
buildRoad(shinomiyaMeshNw, shinomiyaMeshNe, "residential", "r_snmesh_row1", "四之宮住宅街");
buildRoad(shinomiyaMeshSw, shinomiyaMeshSe, "residential", "r_snmesh_row2", "四之宮住宅街");
buildRoad(shinomiyaMeshNw, shinomiyaMeshSw, "residential", "r_snmesh_col1", "四之宮住宅街");
buildRoad(shinomiyaMeshNe, shinomiyaMeshSe, "residential", "r_snmesh_col2", "四之宮住宅街");
buildRoad(shinomiyaTownRing.nw, shinomiyaMeshSe, "residential", "r_shinomiya_mesh", "四之宮住宅街");

// 用田: 湘南台寄りの街区。四之宮ロータリーの東点から幹線道路で直結する。
// 同じ理由でゲートは西・東のみにし、神社・住宅街は北東/北西からさらに北へ離す。
const yodaTownJct = addJunction("wp_yoda_town", "用田", 900, 105);
const yodaTownRing = smallLoop(yodaTownJct, 32, "ydmt", "用田ロータリー", 2, 32, 0, ["w", "e"]);
buildRoad(shinomiyaTownRing.e, yodaTownRing.w, "residential", "r_shinomiya_yoda", "四之宮用田間");
buildRoad(yodaTownRing.e, scrtRing.w, "residential", "r_yoda_scrt", "用田");
// 神社の輪(北東側からさらに北へ)。
const yodaShrineJct = addJunction("wp_yoda_shrine", "用田神社入口", yodaTownRing.ne.x + 10, yodaTownRing.ne.y - 45);
buildRoad(yodaTownRing.ne, yodaShrineJct, "residential", "r_yoda_shrine", "用田神社");
smallLoop(yodaShrineJct, 24, "ydsr", "用田神社", 1);
// 住宅街の輪(北西側からさらに北へ)。
const yodaResJct = addJunction("wp_yoda_res", "用田住宅街入口", yodaTownRing.nw.x - 10, yodaTownRing.nw.y - 45);
buildRoad(yodaTownRing.nw, yodaResJct, "residential", "r_yoda_res", "用田住宅街");
smallLoop(yodaResJct, 24, "ydrs", "用田住宅街", 1);

// ============================================================
// ゲーム性強化: 茅ヶ崎〜辻堂〜藤沢を1つの都市圏として道路を増やす、
// 藤沢をさらに分岐の多いハブにする、鎌倉周辺を強化する、
// 長い一本道の途中に内陸へ抜ける近道を作る
// ============================================================

// 茅ヶ崎⇄辻堂、辻堂⇄藤沢: 海沿いの幹線とは別に、環状路どうしを直接つなぐ「裏道」を
// 複数本通す。幹線(coastal)を通るか、どの裏道を通るか、プレイヤーが選べるようになる。
// マスの重なりを避けるため、混雑していた区間の裏道を必要最小限(要件を満たす本数)に
// 間引いた。茅ヶ崎⇄辻堂は幹線+裏道1本の計2ルート、辻堂⇄藤沢は幹線+裏道1本+近道の
// 計3ルートを確保している。
buildRoad(chigasakiRing.e, tsujidoRing.w, "residential", "r_local_cg_ts", "茅ヶ崎");
buildRoad(tsujidoRing.se, fujisawaRing.sw, "residential", "r_local2_ts_fj", "辻堂");

// 藤沢: ロータリーの斜めの点からも六会・梶原へ直接抜けられるようにし、
// 「幹線→藤沢中心→行き来ルート」以外に「ロータリー経由」でも同じ場所へ行けるようにする。
buildRoad(fujisawaRing.ne, rokkai, "residential", "r_fj_ne_rk", "藤沢ロータリー");
buildRoad(fujisawaRing.se, kajiwara, "residential", "r_fj_se_kj", "藤沢ロータリー");

// 藤沢: マップ最大の都市として、ロータリーからさらにもう1つ小さな輪(藤沢北口イメージ)を
// 外付けする。中心を同じくする「内周ロータリー」ではなく、ロータリーの北東の点から
// 1本の道で少し離れた場所に作る衛星型の輪にしている(hubを中心に同心円状の輪を
// 複数作ると、どの方角でつないでも中心からの直線どうしが重なってマスが重なって
// しまうため、鎌倉の北鎌倉小路・稲村ヶ崎小路と同じ「衛星型」の作り方に統一した)。
const fujisawaKitaguchi = addJunction("wp_fj_kitaguchi", "藤沢北口", fujisawaRing.ne.x, fujisawaRing.ne.y - 100);
buildRoad(fujisawaRing.ne, fujisawaKitaguchi, "residential", "r_fj_ne_kitaguchi", "藤沢北口");
smallLoop(fujisawaKitaguchi, 50, "fjkt", "藤沢北口通り", 1, 70);

// ============================================================
// 藤沢: 街の中の選択肢を増やす拡張(600マス化・第1弾)。
// ロータリーのうち、まだ何も生やしていない4点(北・東・南・西)から、それぞれ性格の
// 違う衛星区画を1つずつ足す。北口と同じ「衛星型」(hubを中心にした同心円は作らない)
// を徹底し、隣接する既存の道路・環状路とは60px以上離す。
// ============================================================
// 北: 商店街(藤沢名店街) — 小町通りと同じく2回曲がってから小さな輪に着く構成。
const fjMeitenEnt = addJunction("wp_fj_meiten_ent", "藤沢名店街入口", fujisawaRing.n.x, fujisawaRing.n.y - 55);
buildRoad(fujisawaRing.n, fjMeitenEnt, "residential", "r_fj_n_meiten1", "藤沢名店街");
const fjMeitenNaka = addJunction("wp_fj_meiten_naka", "藤沢名店街仲通り", fjMeitenEnt.x - 90, fjMeitenEnt.y - 60);
buildRoad(fjMeitenEnt, fjMeitenNaka, "residential", "r_fj_n_meiten2", "藤沢名店街");
const fjMeitenOku = addJunction("wp_fj_meiten_oku", "藤沢名店街奥", fjMeitenNaka.x - 90, fjMeitenNaka.y - 15);
buildRoad(fjMeitenNaka, fjMeitenOku, "residential", "r_fj_n_meiten3", "藤沢名店街");
const fjMeitenRing = smallLoop(fjMeitenOku, 20, "fjmt", "藤沢名店街", 1);

// 西: 藤沢本町(実在地名、老舗和菓子屋の想定地) — 名店街の輪からさらに南へ1本入った
// 衛星の輪にする。ロータリー西点から直結すると寒川方面への近道(r_short_tsfj_rk)の
// マスとほぼ重なってしまうため、ロータリーへの直結はあきらめ、名店街経由の1本道にした。
const fjHonmachi = addJunction("wp_fj_honmachi", "藤沢本町", fjMeitenRing.s.x - 40, fjMeitenRing.s.y + 58);
buildRoad(fjMeitenRing.s, fjHonmachi, "residential", "r_fj_meiten_honmachi", "藤沢本町");
smallLoop(fjHonmachi, 30, "fjhm", "藤沢本町通り", 1);

// 東: 藤沢東口 — 北口の対になる衛星の輪。梶原方面の2本の道(藤沢⇄梶原・ロータリー南東
// ゲート⇄梶原)、鵠沼⇄腰越の海沿い幹線のどれとも重ならない隙間(ロータリー南東ゲートの
// すぐ南)に、小さめの円形の輪として置く。
const fjHigashiguchi = addJunction("wp_fj_higashiguchi", "藤沢東口", fujisawaRing.se.x + 80, fujisawaRing.se.y + 45);
buildRoad(fujisawaRing.se, fjHigashiguchi, "residential", "r_fj_se_higashiguchi", "藤沢東口");
smallLoop(fjHigashiguchi, 45, "fjhg", "藤沢東口通り", 1);

// 南: 住宅街メッシュ — 単純な輪ではなく3列×2行の格子にし、格子の中でも道を選べるようにする。
// 辻堂⇄藤沢の裏道(r_local2_ts_fj)より南、鵠沼への幹線より西の隙間に置き、
// 入口をロータリー南西点、出口を鵠沼方面の幹線の途中への近道にすることで、
// 「ロータリーを回らずに鵠沼側へ抜ける裏ルート」として機能させる。
const fjmNw = addJunction("fjmesh_nw", "藤沢住宅街(北西)", 890, 815);
const fjmN = addJunction("fjmesh_n", "藤沢住宅街(北)", 970, 815);
const fjmNe = addJunction("fjmesh_ne", "藤沢住宅街(北東)", 1050, 815);
const fjmSw = addJunction("fjmesh_sw", "藤沢住宅街(南西)", 890, 865);
const fjmS = addJunction("fjmesh_s", "藤沢住宅街(南)", 970, 865);
const fjmSe = addJunction("fjmesh_se", "藤沢住宅街(南東)", 1050, 865);
buildRoad(fjmNw, fjmN, "residential", "r_fjmesh_row1a", "藤沢住宅街");
buildRoad(fjmN, fjmNe, "residential", "r_fjmesh_row1b", "藤沢住宅街");
buildRoad(fjmSw, fjmS, "residential", "r_fjmesh_row2a", "藤沢住宅街");
buildRoad(fjmS, fjmSe, "residential", "r_fjmesh_row2b", "藤沢住宅街");
buildRoad(fjmNw, fjmSw, "residential", "r_fjmesh_col1", "藤沢住宅街");
buildRoad(fjmN, fjmS, "residential", "r_fjmesh_col2", "藤沢住宅街");
buildRoad(fjmNe, fjmSe, "residential", "r_fjmesh_col3", "藤沢住宅街");
buildRoad(fujisawaRing.sw, fjmNe, "residential", "r_fj_sw_mesh", "藤沢住宅街");
// 出口はロータリー南西点(sw)からの入口とは別に、北西の角(nw)からロータリー南点(s)へ
// 直接抜ける近道にする。格子を斜めに横切る形になるので、sw⇄nw⇄sで回るか、
// nwから直接sへ抜けるかの選択が生まれる。
buildRoad(fjmNw, fujisawaRing.s, "shortcut", "r_fj_mesh_exit", "藤沢住宅街");

// 鎌倉: 環状路の西側を稲村ヶ崎に直結し、稲村ヶ崎⇄鎌倉が海沿い幹線+この裏道の2ルートになる。
buildRoad(kamakuraRing.w, inamuragasaki, "residential", "r_km_w_in", "鎌倉小路");

// 鎌倉: 観光地らしく、周辺(北鎌倉・稲村ヶ崎)にも小さな環状ルートを追加する。
const kitakamakuraRing = smallLoop(kitakamakura, 35, "kklp", "北鎌倉小路", 2, 66); // 円覚寺・建長寺まわりのイメージ
// 稲村ヶ崎自体は腰越(西)・鎌倉(北)・由比ヶ浜(南西)・鎌倉小路(北東寄り)の道が集まる
// 交差点のため、輪は他の道と重ならない東側へ少し離した衛星型にする。
const inamuragasakiPark = addJunction("wp_inamuragasaki_park", "稲村ヶ崎公園入口", inamuragasaki.x + 65, inamuragasaki.y);
buildRoad(inamuragasaki, inamuragasakiPark, "residential", "r_in_park", "稲村ヶ崎小路");
const inamuragasakiParkRing = smallLoop(inamuragasakiPark, 25, "inlp", "稲村ヶ崎小路", 1); // 稲村ヶ崎公園まわりのイメージ

// 鎌倉: 古い商店街らしく、まっすぐではなく2回曲がって着く小さな通り(小町通りイメージ)を追加。
const komachiBend1 = addJunction("wp_komachi1", "小町通り入口", kamakuraRing.e.x + 40, kamakuraRing.e.y);
buildRoad(kamakuraRing.e, komachiBend1, "residential", "r_km_komachi1", "小町通り");
const komachiBend2 = addJunction("wp_komachi2", "小町通り中程", komachiBend1.x, komachiBend1.y + 45);
buildRoad(komachiBend1, komachiBend2, "residential", "r_km_komachi2", "小町通り");
const komachi = addJunction("wp_komachi3", "小町通り", komachiBend2.x + 40, komachiBend2.y);
buildRoad(komachiBend2, komachi, "residential", "r_km_komachi3", "小町通り");

// ============================================================
// 鎌倉圏: 街の中の選択肢を増やす拡張(600マス化・第2弾)。
// ============================================================
// 鎌倉: 商店街(御成通りイメージ) — ロータリーの北点から、北鎌倉⇄鎌倉の直通路
// (r_kk_km)や合流路(r_kkkm_merge)とは重ならない東寄りの位置に小さな輪を作る。
const onariEnt = addJunction("wp_onari_ent", "御成通り入口", kamakuraRing.n.x + 100, kamakuraRing.n.y - 40);
buildRoad(kamakuraRing.n, onariEnt, "residential", "r_km_n_onari", "御成通り");
smallLoop(onariEnt, 28, "onlp", "御成通り", 1);

// 鎌倉: 住宅街メッシュ — 腰越・稲村ヶ崎の間、海沿いの道(r_ks_in)よりさらに南の
// 空き地に3列×2行の格子を作る。入口を腰越、出口を稲村ヶ崎への近道にすることで、
// 海沿いを通らずに腰越⇄稲村ヶ崎を抜けられる裏ルートにする。
const kmmNw = addJunction("kmmesh_nw", "鎌倉住宅街(北西)", 1340, 1140);
const kmmN = addJunction("kmmesh_n", "鎌倉住宅街(北)", 1410, 1140);
const kmmNe = addJunction("kmmesh_ne", "鎌倉住宅街(北東)", 1480, 1140);
const kmmSw = addJunction("kmmesh_sw", "鎌倉住宅街(南西)", 1340, 1190);
const kmmS = addJunction("kmmesh_s", "鎌倉住宅街(南)", 1410, 1190);
const kmmSe = addJunction("kmmesh_se", "鎌倉住宅街(南東)", 1480, 1190);
buildRoad(kmmNw, kmmN, "residential", "r_kmmesh_row1a", "鎌倉住宅街");
buildRoad(kmmN, kmmNe, "residential", "r_kmmesh_row1b", "鎌倉住宅街");
buildRoad(kmmSw, kmmS, "residential", "r_kmmesh_row2a", "鎌倉住宅街");
buildRoad(kmmS, kmmSe, "residential", "r_kmmesh_row2b", "鎌倉住宅街");
buildRoad(kmmNw, kmmSw, "residential", "r_kmmesh_col1", "鎌倉住宅街");
buildRoad(kmmN, kmmS, "residential", "r_kmmesh_col2", "鎌倉住宅街");
buildRoad(kmmNe, kmmSe, "residential", "r_kmmesh_col3", "鎌倉住宅街");

// 北鎌倉: 2つめの参道(建長寺イメージ)を、既存の環状路の南西点から短い直結(マスを
// 挟まない1本道)で作る。マスを挟むと途中のマスが輪の頂点と重なりやすいため、
// 距離を70px程度に抑えて直結にした。
const kenchojiEnt = addJunction("wp_kenchoji_ent", "建長寺参道入口", kitakamakuraRing.sw.x - 50, kitakamakuraRing.sw.y + 50);
buildRoad(kitakamakuraRing.sw, kenchojiEnt, "residential", "r_kk_kenchoji", "建長寺参道");
smallLoop(kenchojiEnt, 25, "kjlp", "建長寺参道", 1);

// 稲村ヶ崎: 公園入口の輪からさらに海側へ1本、小さな海岸通りを足す。
const inamuraKaigan = addJunction("wp_inamura_kaigan", "稲村ヶ崎海岸通り入口", inamuragasakiParkRing.e.x + 60, inamuragasakiParkRing.e.y + 40);
buildRoad(inamuragasakiParkRing.e, inamuraKaigan, "residential", "r_inpark_kaigan", "稲村ヶ崎海岸通り");
smallLoop(inamuraKaigan, 22, "incl", "稲村ヶ崎海岸通り", 1);

// 腰越: これまで行き止まりの1マスだけだった観光地に、衛星型の小さな輪を持たせて
// 「浜辺の集落」らしい内部の選択肢を作る(由比ヶ浜は後方でノード定義後に追加)。
// 腰越自体を中心にすると鵠沼⇄腰越・腰越⇄稲村ヶ崎の道と重なるため、南西へ離す。
const koshigoeSat = addJunction("wp_koshigoe_sat", "腰越漁港通り入口", koshigoe.x - 30, koshigoe.y + 90);
buildRoad(koshigoe, koshigoeSat, "residential", "r_ks_sat", "腰越漁港通り");
smallLoop(koshigoeSat, 25, "kslp", "腰越漁港通り", 1);
// 鎌倉住宅街メッシュの入口(腰越漁港通りから)。出口(由比ヶ浜側)は由比ヶ浜のノード
// 定義後にまとめて追加する。
buildRoad(koshigoeSat, kmmNw, "residential", "r_ks_mesh", "鎌倉住宅街");

// 小町通り: 行き止まりの1本道の終点から、さらに1本南へ入った衛星の輪を追加し、
// 古い商店街らしい奥行きを持たせる(終点そのものを中心にすると入口の道と重なるため)。
const komachiOku = addJunction("wp_komachi_oku", "小町通り奥入口", komachi.x, komachi.y + 70);
buildRoad(komachi, komachiOku, "residential", "r_km_komachi_oku", "小町通り奥");
smallLoop(komachiOku, 25, "kmclp", "小町通り奥", 1);

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
// 茅ヶ崎海岸自体は茅ヶ崎小路からの道(北)が通っているため、輪はさらに海側(南)へ
// 少し離した衛星型にする。
const chigasakiKaiganOku = addJunction("wp_chigasaki_kaigan_oku", "茅ヶ崎海岸奥", chigasakiKaigan.x, chigasakiKaigan.y + 45);
buildRoad(chigasakiKaigan, chigasakiKaiganOku, "coastal", "r_cg_kaigan_oku", "茅ヶ崎海岸通り");
smallLoop(chigasakiKaiganOku, 25, "cgklp", "茅ヶ崎海岸通り", 1);
// 600マス化・第7弾(全体接続調整): 辻堂海浜商店街(南西の衛星区画)と茅ヶ崎海岸奥を
// 直結し、海沿いの寄り道どうしを、幹線・ロータリーへ戻らずに移動できるようにする。
buildRoad(tsShop, chigasakiKaiganOku, "shortcut", "r_ts_shop_cg_kaigan", "海沿い裏道");

const tsujidoKaigan = addJunction("wp_tsujido_kaigan", "辻堂海岸", tsujido.x, tsujido.y + 150);
buildRoad(tsujidoRing.s, tsujidoKaigan, "coastal", "r_ts_s_kaigan", "辻堂海岸");

const yuigahama = addJunction("wp_yuigahama", "由比ヶ浜", inamuragasaki.x - 100, inamuragasaki.y + 90);
buildRoad(inamuragasaki, yuigahama, "coastal", "r_in_yui", "由比ヶ浜");
// 由比ヶ浜自体を中心に輪を作ると、稲村ヶ崎からの道(r_in_yui)の延長線上に輪の頂点が
// 乗って重なるため、南西へ1本離した衛星の輪にする。
const yuigahamaSat = addJunction("wp_yuigahama_sat", "由比ヶ浜海岸通り入口", yuigahama.x - 40, yuigahama.y + 40);
buildRoad(yuigahama, yuigahamaSat, "residential", "r_yui_sat", "由比ヶ浜海岸通り");
smallLoop(yuigahamaSat, 24, "yuilp", "由比ヶ浜海岸通り", 1);
// 鎌倉住宅街メッシュの出口。北東の角から稲村ヶ崎へ直結する(南東の角から由比ヶ浜へ
// 抜けるルートだと、稲村ヶ崎⇄由比ヶ浜の道や由比ヶ浜海岸通りの輪と重なるため)。
buildRoad(kmmNe, inamuragasaki, "shortcut", "r_km_mesh_inamura", "鎌倉住宅街");

// ============================================================
// 「都市間の一本道」から「道路網」へ: まだ途中に分岐のなかった区間
// (5〜8マスは超えていないが、区間の両端にしか分岐がなかった箇所)に、
// 区間の真ん中あたりから短い枝道・合流をもう一段追加する。
// これで幹線・行き来ルートのどの区間も「5〜8マス進むごとに必ずどこかで
// 進路を選べる」状態になる。
// ============================================================
// 平塚⇄茅ヶ崎の中間 → 大神(実在地名)への短い枝道
const oga = addJunction("wp_oga", "大神", pickMidFiller(hiratsuka, chigasaki).x, pickMidFiller(hiratsuka, chigasaki).y - 60);
buildRoad(pickMidFiller(hiratsuka, chigasaki), oga, "residential", "r_hrcg_oga", "大神");

// 鵠沼⇄腰越の中間 → 片瀬海岸(実在地名)への短い枝道(意図した行き止まり)
const katasekaigan = addJunction("wp_katase_kaigan", "片瀬海岸", pickMidFiller(kugenuma, koshigoe).x, pickMidFiller(kugenuma, koshigoe).y + 70);
buildRoad(pickMidFiller(kugenuma, koshigoe), katasekaigan, "coastal", "r_kgks_katase", "片瀬海岸");
// 600マス化・第6弾: 片瀬海岸は行き止まりの1マスだけだったため、小さな輪だけ追加する
// (他の小地名と違い、水族館の想定地として指定されているため独立した輪にする)。
smallLoop(katasekaigan, 24, "ktlp", "片瀬海岸通り", 1);

// 湘南台⇄大船の中間 → 善行(実在地名)への短い枝道
const zengyo = addJunction("wp_zengyo", "善行", pickMidFiller(shonandai, ofuna).x, pickMidFiller(shonandai, ofuna).y - 60);
buildRoad(pickMidFiller(shonandai, ofuna), zengyo, "residential", "r_scof_zengyo", "善行");

// 北鎌倉⇄鎌倉(8マス、区間内で最長)の中間 → 鎌倉小路の北ゲートに合流させる。
// 新しい行き止まりを作るのではなく、既存の環状路に合流させることで
// 「鎌倉へ抜ける2本目のルート」として機能させる。蛇行なし(まっすぐ合流させ、
// 鎌倉小路のリング自体と交差しないようにする)。
buildRoad(pickMidFiller(kitakamakura, kamakura), kamakuraRing.nw, "residential", "r_kkkm_merge", "鎌倉小路");

// ============================================================
// 生活道路の抜け道: 香川(西エリア)⇄大船(東エリア)。
// 幹線(coastal/main/national)は使わず、すべて residential(生活道路)でつなぐ。
// 藤沢のロータリー・住宅街・商店街の並びを避け、内陸ルート(寒川⇄湘南台⇄大船)よりも
// 一段南、藤沢の衛星区画群よりも一段北の隙間を縫って通す。一本道ではなく、
// 住宅街メッシュの手前と出口の2箇所で分岐し(+合流点で3つ目の分岐相当)、
// 「最短ではないが知っていると便利な近道」という位置づけにする。
// ============================================================
const backstreetP1 = addJunction("wp_backstreet_p1", "四之宮入口", 550, 440);
buildRoad(kagawa, backstreetP1, "residential", "r_bs_kagawa_p1", "四之宮");

// 分岐1: P1から南へ、行き止まりの小さな輪(四之宮イメージ)。
const backstreetSpur = addJunction("wp_backstreet_spur", "四之宮", backstreetP1.x, backstreetP1.y + 70);
buildRoad(backstreetP1, backstreetSpur, "residential", "r_bs_p1_spur", "四之宮");
smallLoop(backstreetSpur, 26, "bslp", "四之宮", 1);

// 住宅街メッシュ(3列×2行)。P1から少し東へ入ったところに置く。
const bsmNw = addJunction("bsmesh_nw", "内陸住宅街(北西)", 620, 400);
const bsmN = addJunction("bsmesh_n", "内陸住宅街(北)", 660, 400);
const bsmNe = addJunction("bsmesh_ne", "内陸住宅街(北東)", 700, 400);
const bsmSw = addJunction("bsmesh_sw", "内陸住宅街(南西)", 620, 445);
const bsmS = addJunction("bsmesh_s", "内陸住宅街(南)", 660, 445);
const bsmSe = addJunction("bsmesh_se", "内陸住宅街(南東)", 700, 445);
buildRoad(bsmNw, bsmN, "residential", "r_bsmesh_row1a", "内陸住宅街");
buildRoad(bsmN, bsmNe, "residential", "r_bsmesh_row1b", "内陸住宅街");
buildRoad(bsmSw, bsmS, "residential", "r_bsmesh_row2a", "内陸住宅街");
buildRoad(bsmS, bsmSe, "residential", "r_bsmesh_row2b", "内陸住宅街");
buildRoad(bsmNw, bsmSw, "residential", "r_bsmesh_col1", "内陸住宅街");
buildRoad(bsmN, bsmS, "residential", "r_bsmesh_col2", "内陸住宅街");
buildRoad(bsmNe, bsmSe, "residential", "r_bsmesh_col3", "内陸住宅街");
buildRoad(backstreetP1, bsmNw, "residential", "r_bs_p1_mesh", "内陸住宅街");

// 分岐2: メッシュを出た直後、北回り(Pb)と南回り(Pa)の2本に分かれる。
const backstreetPb = addJunction("wp_backstreet_pb", "内陸ルート北回り", 800, 370);
buildRoad(bsmNe, backstreetPb, "residential", "r_bsmesh_ne_pb", "内陸住宅街");
const backstreetPa = addJunction("wp_backstreet_pa", "内陸ルート南回り", 780, 485);
buildRoad(bsmSe, backstreetPa, "residential", "r_bsmesh_se_pa", "内陸住宅街");

// 分岐3(合流): 北回り・南回りが1点で合流する。
const backstreetP2 = addJunction("wp_backstreet_p2", "内陸ルート合流点", 900, 395);
buildRoad(backstreetPb, backstreetP2, "residential", "r_bs_pb_p2", "内陸ルート");
buildRoad(backstreetPa, backstreetP2, "residential", "r_bs_pa_p2", "内陸ルート");

// 合流後、内陸トランク(寒川⇄湘南台⇄大船)と藤沢の衛星区画群の隙間を抜けて大船へ。
const backstreetP3 = addJunction("wp_backstreet_p3", "内陸ルート中間点", 1030, 280);
buildRoad(backstreetP2, backstreetP3, "residential", "r_bs_p2_p3", "内陸ルート");
const backstreetP4 = addJunction("wp_backstreet_p4", "内陸ルート東端", 1215, 325);
buildRoad(backstreetP3, backstreetP4, "residential", "r_bs_p3_p4", "内陸ルート");
buildRoad(backstreetP4, ofuna, "residential", "r_bs_p4_ofuna", "内陸ルート");

// ============================================================
// 全エリア見直し(第2弾): 藤沢⇄鎌倉・大船周辺。
// 藤沢⇄鎌倉はこれまで「海沿い(鵠沼⇄腰越⇄稲村ヶ崎)」と「内陸(梶原⇄大船⇄北鎌倉)」の
// 2ルートしかなく、しかもどちらも分岐なしの長い一本道だった。梶原⇄腰越を直結する
// 裏道を新設し、海沿い⇄内陸を行き来できる3本目のルートにする。
// 大船は経由地なのに独自の街並みが1つも無かったため、小さな商店街を1つ足す。
// ============================================================
buildRoad(kajiwara, koshigoe, "shortcut", "r_kj_ks", "梶原");

// 梶原にも他の経由地と同じように小さな輪(飯島イメージ)を1つ持たせる。
// 既存の道(藤沢方面・大船方面・海沿いへの新しい近道)がどれも北〜西〜南から
// 伸びているため、東側へ離した衛星型にする。
const kajiwaraLoopJct = addJunction("wp_kajiwara_loop", "梶原東入口", kajiwara.x + 70, kajiwara.y - 10);
buildRoad(kajiwara, kajiwaraLoopJct, "residential", "r_kj_loop", "梶原東");
smallLoop(kajiwaraLoopJct, 26, "kjer", "梶原東", 1);

// 大船にも小さな商店街(大船銀座イメージ)を1つ持たせる。既存の接続
// (湘南台方面・梶原方面・北鎌倉方面・裏道)がどれも西〜南〜東から伸びているため、
// 空いている北側へ衛星型で置く。
const ofunaShopJct = addJunction("wp_ofuna_shop", "大船銀座入口", ofuna.x + 20, ofuna.y - 90);
buildRoad(ofuna, ofunaShopJct, "residential", "r_of_shop", "大船銀座");
smallLoop(ofunaShopJct, 26, "ofsp", "大船銀座", 1);

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
