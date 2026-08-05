import type {
  MapData,
  MapNode,
  MapDecoration,
  NodeType,
  PropertyDef,
  RoadType,
} from "@/types/game";
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
function addHub(
  id: string,
  name: string,
  x: number,
  y: number,
  isMajorHub?: true,
): Hub {
  nodeSpecs.push({
    id,
    name,
    type: "normal",
    area: name,
    x,
    y,
    dest: true,
    majorHub: isMajorHub,
  });
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

function buildRoad(
  a: Hub,
  b: Hub,
  roadType: RoadType,
  idPrefix: string,
  area: string,
  wobble: number = 0,
) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = 50;
  const spineCount = Math.max(0, Math.round(dist / scale) - 1);

  const spine = windingFiller(
    { id: a.id, x: a.x, y: a.y },
    { id: b.id, x: b.x, y: b.y },
    { count: spineCount, roadType, area, idPrefix, wobble, plain: true },
    generatedProperties,
  );
  for (const n of spine.nodes)
    nodeSpecs.push({
      id: n.id,
      name: n.name,
      type: n.type,
      area: n.area,
      x: n.x,
      y: n.y,
      propertyId: n.propertyId,
    });
  for (const e of spine.edges) edgeSpecs.push(e);

  const fillers: Hub[] = spine.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    x: n.x,
    y: n.y,
  }));
  chainCache.set([a.id, b.id].sort().join("__"), fillers);
}

/**
 * 同じroadType・areaで連続するbuildRoad呼び出しをまとめて書くためのヘルパー。
 * points=[a,b,c,d] なら buildRoad(a,b,...), buildRoad(b,c,...), buildRoad(c,d,...) を
 * 順番に呼ぶのと完全に同じ(生成されるノードID・座標・chainCacheの中身も一致する)。
 * idPrefixesは各区間ごとに明示的に指定する(自動生成しない)。既存のidPrefixは
 * "r_sm_sc_h1"のように意味のある名前であり、インデックスから機械的に作ると
 * ノードIDが変わってしまうため。
 */
function connectRoad(
  points: Hub[],
  roadType: RoadType,
  area: string,
  idPrefixes: string[],
) {
  if (idPrefixes.length !== points.length - 1) {
    throw new Error(
      `connectRoad: expected ${points.length - 1} idPrefixes, got ${idPrefixes.length}`,
    );
  }
  for (let i = 0; i < points.length - 1; i++) {
    buildRoad(points[i], points[i + 1], roadType, idPrefixes[i], area, 0);
  }
}

/** connectRoadを複数区間まとめて呼ぶためのヘルパー。roadType・areaが共通の複数チェーンをまとめて書ける。 */
function connectMany(
  chains: { points: Hub[]; idPrefixes: string[] }[],
  roadType: RoadType,
  area: string,
) {
  for (const chain of chains)
    connectRoad(chain.points, roadType, area, chain.idPrefixes);
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
  const idx = Math.min(
    chain.length - 1,
    Math.max(0, Math.floor(chain.length * t)),
  );
  return chain[idx];
}

interface LoopRing {
  n: Hub;
  ne: Hub;
  e: Hub;
  se: Hub;
  s: Hub;
  sw: Hub;
  w: Hub;
  nw: Hub;
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
  const n = addJunction(
    `${idPrefix}_n`,
    `${label}(北)`,
    hub.x,
    hub.y - radiusY,
  );
  const ne = addJunction(
    `${idPrefix}_ne`,
    `${label}(北東)`,
    hub.x + radiusX,
    hub.y - radiusY,
  );
  const e = addJunction(
    `${idPrefix}_e`,
    `${label}(東)`,
    hub.x + radiusX,
    hub.y,
  );
  const se = addJunction(
    `${idPrefix}_se`,
    `${label}(南東)`,
    hub.x + radiusX,
    hub.y + radiusY,
  );
  const s = addJunction(
    `${idPrefix}_s`,
    `${label}(南)`,
    hub.x,
    hub.y + radiusY,
  );
  const sw = addJunction(
    `${idPrefix}_sw`,
    `${label}(南西)`,
    hub.x - radiusX,
    hub.y + radiusY,
  );
  const w = addJunction(
    `${idPrefix}_w`,
    `${label}(西)`,
    hub.x - radiusX,
    hub.y,
  );
  const nw = addJunction(
    `${idPrefix}_nw`,
    `${label}(北西)`,
    hub.x - radiusX,
    hub.y - radiusY,
  );
  const ring: LoopRing = { n, ne, e, se, s, sw, w, nw };
  const points = [n, ne, e, se, s, sw, w, nw];
  for (let i = 0; i < points.length; i++) {
    buildRoad(
      points[i],
      points[(i + 1) % points.length],
      "residential",
      `r_${idPrefix}_ring${i}`,
      label,
      wobble,
    );
  }
  // gateCorners: どの点をhubへの「ゲート」にするか。街から実際に伸びる幹線・行き来ルートと
  // 同じ方角(例: 東西南北)にゲートを置くと、hubから伸びる直線どうしが重なってマスが
  // 重なって見えるため、街ごとに衝突しない方角(斜めの点など)を指定できるようにしている。
  const gateNodes = gateCorners.slice(0, gates).map((key) => ring[key]);
  for (const g of gateNodes) {
    buildRoad(
      hub,
      g,
      "residential",
      `r_${idPrefix}_gate_${g.id}`,
      label,
      wobble,
    );
  }
  return ring;
}

/**
 * 「親(hub)から少し離れた場所に入口(entrance)を1つ作り、そこへ道でつないだ上で
 * 入口を中心に小さな環状路(smallLoop)を作る」という、ファイル全体で何十回も
 * 繰り返されているパターンをまとめたヘルパー。
 * entrance用の addJunction + 接続用の buildRoad + smallLoop の3行を、
 * 完全に同じ呼び出しとして1回にまとめるだけ(挙動・生成ID・座標は一切変えない)。
 */
function createRoundTown(opts: {
  parent: Hub;
  entranceId: string;
  entranceName: string;
  entranceX: number;
  entranceY: number;
  connectorRoadType: RoadType;
  connectorIdPrefix: string;
  connectorArea: string;
  connectorWobble?: number;
  radiusX: number;
  idPrefix: string;
  label: string;
  gates: number;
  radiusY?: number;
  wobble?: number;
  gateCorners?: (keyof LoopRing)[];
}): LoopRing & { entrance: Hub } {
  const entrance = addJunction(
    opts.entranceId,
    opts.entranceName,
    opts.entranceX,
    opts.entranceY,
  );
  buildRoad(
    opts.parent,
    entrance,
    opts.connectorRoadType,
    opts.connectorIdPrefix,
    opts.connectorArea,
    opts.connectorWobble ?? 0,
  );
  const ring = smallLoop(
    entrance,
    opts.radiusX,
    opts.idPrefix,
    opts.label,
    opts.gates,
    opts.radiusY,
    opts.wobble,
    opts.gateCorners,
  );
  return { ...ring, entrance };
}

/**
 * 「3列×2行、方角名(nw/n/ne/sw/s/se)で呼ぶ小さな住宅街メッシュ」を作るヘルパー。
 * 手書きの addJunction 6個 + connectMany(横2行) + buildRoad 3本(縦3列)を
 * まとめたもの。colSpacing/rowSpacingが実際の座標と完全に一致する(=歪みのない
 * 均等な格子になっている)メッシュにだけ適用する。歪みのあるメッシュ(例: 茅ヶ崎
 * 住宅街)はそのまま手書きのコードを残す。
 */
function createGridTown(
  idPrefix: string,
  area: string,
  originX: number,
  originY: number,
  colSpacing: number,
  rowSpacing: number,
  rowIdPrefixes: [string, string],
  colIds: [string, string, string],
): { nw: Hub; n: Hub; ne: Hub; sw: Hub; s: Hub; se: Hub } {
  const nw = addJunction(`${idPrefix}_nw`, `${area}(北西)`, originX, originY);
  const n = addJunction(
    `${idPrefix}_n`,
    `${area}(北)`,
    originX + colSpacing,
    originY,
  );
  const ne = addJunction(
    `${idPrefix}_ne`,
    `${area}(北東)`,
    originX + colSpacing * 2,
    originY,
  );
  const sw = addJunction(
    `${idPrefix}_sw`,
    `${area}(南西)`,
    originX,
    originY + rowSpacing,
  );
  const s = addJunction(
    `${idPrefix}_s`,
    `${area}(南)`,
    originX + colSpacing,
    originY + rowSpacing,
  );
  const se = addJunction(
    `${idPrefix}_se`,
    `${area}(南東)`,
    originX + colSpacing * 2,
    originY + rowSpacing,
  );
  connectMany(
    [
      {
        points: [nw, n, ne],
        idPrefixes: [`${rowIdPrefixes[0]}a`, `${rowIdPrefixes[0]}b`],
      },
      {
        points: [sw, s, se],
        idPrefixes: [`${rowIdPrefixes[1]}a`, `${rowIdPrefixes[1]}b`],
      },
    ],
    "residential",
    area,
  );
  buildRoad(nw, sw, "residential", colIds[0], area);
  buildRoad(n, s, "residential", colIds[1], area);
  buildRoad(ne, se, "residential", colIds[2], area);
  return { nw, n, ne, sw, s, se };
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
// 街のシルエット再設計: 湘南台⇄大船の距離が短すぎて六会周辺が密集していたため、
// 大船(+梶原・北鎌倉・大船銀座も一体で)を(+180,+60)だけ遠ざけ、独立した
// 「駅前ターミナル」として成立する距離を確保する(相対位置はそのまま平行移動)。
const ofuna = addJunction("wp_ofuna", "大船", 1500, 410); // 目的地候補ではなく経由地(内陸⇄海沿いの結節点)

// 海沿い⇄内陸の行き来ポイント(4箇所)。完全な縦横グリッドに見えすぎないよう、
// 座標を少しだけ本来の格子位置からずらしている。
const kagawa = addJunction("wp_kagawa", "香川", 440, 510); // 寒川⇄茅ヶ崎
const rokkai = addJunction("wp_rokkai", "六会", 1080, 420); // 湘南台⇄藤沢。湘南台(x=1080)・藤沢(x=1080)と同じXに揃え、縦横四方向にする
const kajiwara = addJunction("wp_kajiwara", "梶原", 1500, 680); // 大船⇄藤沢(鎌倉小路周辺との重なりを避けて調整)
// 北鎌倉は大船ほど大きく動かさない(北鎌倉⇄鎌倉の道が御成通り・建長寺参道と
// 重ならないよう、大船との相対位置を保つより経路の素直さを優先する)。
const kitakamakura = addJunction("wp_kitakamakura", "北鎌倉", 1650, 420); // 大船⇄鎌倉

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
  {
    kind: "terrain",
    variant: "forest",
    cx: 220,
    cy: 300,
    rx: 95,
    ry: 75,
    rotation: -8,
  },
  // 北鎌倉まわり(実際に寺社の緑が多いエリア) → 森
  {
    kind: "terrain",
    variant: "forest",
    cx: 1470,
    cy: 470,
    rx: 75,
    ry: 95,
    rotation: 12,
  },
  // 平塚まわり(実際に田畑が広がるエリア) → 農地
  {
    kind: "terrain",
    variant: "farmland",
    cx: 130,
    cy: 850,
    rx: 105,
    ry: 65,
    rotation: -10,
  },
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
// 寒川⇄湘南台は斜めの直線ではなく、湘南台の真下まで縦横だけで下りてから
// 寒川へ一直線に向かうルートにする(斜めなし)。湘南台側はx=1080の列を
// 使うと六会行きの幹線(r_sc_rk)と同じ列に重なってしまうため、いったん
// 西へ1マス分ずらしてから南下する。四之宮のゲートや香川・六会への近道は
// この区間の途中の点を拾って使っているため、3区間のマス列をつなげて1本の
// 連続したチェーンとしてchainCacheに登録し直し、pickMidFiller/pickFillerAtが
// 引き続き正しく機能するようにする。
const smscBendW = addJunction(
  "wp_sm_sc_bend_w",
  "寒川湘南台間(西)",
  shonandai.x - 90,
  samukawa.y,
);
const smscBendN = addJunction(
  "wp_sm_sc_bend_n",
  "寒川湘南台間(北)",
  shonandai.x - 90,
  shonandai.y,
);
buildRoad(samukawa, smscBendW, "main", "r_sm_sc_h1", "寒川");
buildRoad(smscBendW, smscBendN, "main", "r_sm_sc_v", "寒川");
buildRoad(smscBendN, shonandai, "main", "r_sm_sc_h2", "寒川");
{
  const c1 =
    chainCache.get([samukawa.id, smscBendW.id].sort().join("__")) ?? [];
  const c2 =
    chainCache.get([smscBendW.id, smscBendN.id].sort().join("__")) ?? [];
  const c3 =
    chainCache.get([smscBendN.id, shonandai.id].sort().join("__")) ?? [];
  chainCache.set([samukawa.id, shonandai.id].sort().join("__"), [
    ...c1,
    smscBendW,
    ...c2,
    smscBendN,
    ...c3,
  ]);
}
// 湘南台⇄大船も斜めの直線ではなく、湘南台と同じ緯度を東へ進んでから南下する
// L字にする(斜めなし)。大船自体は西(六会大船間)・北(大船銀座)・南(梶原)・
// 東(北鎌倉)の4方向がすでにふさがっているため、大船へ直接着けるのではなく、
// 六会大船間トランクの西側の点(大船入口(西)、後方で定義)へ南から合流させる。
// 善行の枝道はこの区間の途中の点を拾っているため、寒川⇄湘南台と同様に
// 区間をつなげてchainCacheに登録し直す。
const scofBendE = addJunction(
  "wp_sc_of_bend_e",
  "湘南台大船間(東)",
  ofuna.x - 100,
  shonandai.y,
);
const scofBendS = addJunction(
  "wp_sc_of_bend_s",
  "湘南台大船間(南)",
  ofuna.x - 100,
  ofuna.y + 40,
);
const scofBendE2 = addJunction(
  "wp_sc_of_bend_e2",
  "湘南台大船間(南東)",
  ofuna.x - 70,
  ofuna.y + 40,
);
buildRoad(shonandai, scofBendE, "main", "r_sc_of_h", "湘南台");
buildRoad(scofBendE, scofBendS, "main", "r_sc_of_v", "湘南台");
buildRoad(scofBendS, scofBendE2, "main", "r_sc_of_h2", "湘南台");
// 最後は「大船入口(西)」(wp_rk_ofuna_up、後方で定義)へ直結する短い1区間。
// まだ定義前のノードIDなので、buildRoadを介さず直接エッジを追加する。
edgeSpecs.push({ from: scofBendE2.id, to: "wp_rk_ofuna_up", roadType: "main" });
{
  const c1 =
    chainCache.get([shonandai.id, scofBendE.id].sort().join("__")) ?? [];
  const c2 =
    chainCache.get([scofBendE.id, scofBendS.id].sort().join("__")) ?? [];
  const c3 =
    chainCache.get([scofBendS.id, scofBendE2.id].sort().join("__")) ?? [];
  chainCache.set([shonandai.id, ofuna.id].sort().join("__"), [
    ...c1,
    scofBendE,
    ...c2,
    scofBendS,
    ...c3,
    scofBendE2,
  ]);
}

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
createRoundTown({
  parent: tamura,
  entranceId: "wp_tamura_kado",
  entranceName: "田村北",
  entranceX: tamura.x,
  entranceY: tamura.y - 55,
  connectorRoadType: "residential",
  connectorIdPrefix: "r_tm_kado",
  connectorArea: "田村小路",
  radiusX: 30,
  idPrefix: "tmlp",
  label: "田村小路",
  gates: 1,
});

// 分岐2: 田村⇄平塚の区間の途中(だいたい真ん中のマス)から、少し東へ入った所に
// もう1箇所小さな輪(中原イメージ)を作る。
const tamuraHiratsukaMid = pickMidFiller(tamura, hiratsuka);
const nakahara = addJunction(
  "wp_nakahara",
  "中原",
  tamuraHiratsukaMid.x + 70,
  tamuraHiratsukaMid.y,
);
buildRoad(tamuraHiratsukaMid, nakahara, "shortcut", "r_tmhr_nk", "中原");
const nakaharaRing = smallLoop(nakahara, 40, "nklp", "中原小路", 1);
// 600マス化・第6弾(残りエリア): 中原小路の東点から、もう1つ小さな輪(田村ヶ丘イメージ)。
const tamuragaoka = addJunction(
  "wp_tamuragaoka",
  "田村ヶ丘入口",
  nakaharaRing.e.x + 55,
  nakaharaRing.e.y + 25,
);
buildRoad(
  nakaharaRing.e,
  tamuragaoka,
  "residential",
  "r_nklp_tamuragaoka",
  "田村ヶ丘",
);
smallLoop(tamuragaoka, 25, "tmgo", "田村ヶ丘", 1);

// 寒川: これまで環状路が1つもなかった(幹線2+行き来1の計3方向のみ)ため、
// 北側の空いた方角に湘南台と同じ手法(衛星型ロータリー+住宅街)で追加する。
// 大神は寒川エリアの一部として扱い、独立した輪は作らない。
// 街のシルエット再設計: 寒川は全街区中もっとも小さい「小さなロータリーの町」として
// 引き締める(半径・オフセットとも縮小し、輪郭がぼやけないようにする)。
const samukawaKita = addJunction(
  "wp_samukawa_kita",
  "寒川ロータリー入口",
  samukawa.x + 15,
  samukawa.y - 45,
);
buildRoad(samukawa, samukawaKita, "residential", "r_sm_kita", "寒川ロータリー");
const smrtRing = smallLoop(samukawaKita, 27, "smrt", "寒川ロータリー", 1);
const smResidential = addJunction(
  "wp_sm_residential",
  "寒川住宅街入口",
  smrtRing.e.x - 6,
  smrtRing.e.y - 73,
);
buildRoad(
  smrtRing.e,
  smResidential,
  "residential",
  "r_sm_residential",
  "寒川住宅街",
);
const smrsRing = smallLoop(smResidential, 27, "smrs", "寒川住宅街", 1);

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
const fujisawaRing = smallLoop(
  fujisawa,
  80,
  "fjrt",
  "藤沢ロータリー",
  4,
  65,
  0,
  ["ne", "se", "sw", "nw"],
); // ★★★★★
// 鎌倉: 実際の幹線が南(稲村ヶ崎)・北(北鎌倉)を使っているため、ゲートは東寄り3点にする。
const kamakuraRing = smallLoop(kamakura, 55, "kmlp", "鎌倉小路", 3, 75, 0, [
  "e",
  "se",
  "nw",
]); // ★★★★☆
// 茅ヶ崎: 実際の幹線が東(辻堂)・西(平塚)・北(香川)を使っているため、ゲートは南寄り3点にする。
const chigasakiRing = smallLoop(chigasaki, 80, "cglp", "茅ヶ崎小路", 3, 72, 0, [
  "s",
  "se",
  "sw",
]); // ★★★★☆

// ============================================================
// 茅ヶ崎: 600マス化・第5弾。実際の幹線・行き来ルートが西(平塚)・東(辻堂、裏道含む)・
// 南(香川・茅ヶ崎海岸)を使っているため、北西・北東・西の空いた点から衛星区画を作る。
// ============================================================
const cgShop = addJunction(
  "wp_cg_shop",
  "茅ヶ崎銀座入口",
  chigasakiRing.nw.x - 25,
  chigasakiRing.nw.y - 55,
);
buildRoad(
  chigasakiRing.nw,
  cgShop,
  "residential",
  "r_cg_nw_shop",
  "茅ヶ崎銀座",
);
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
connectMany(
  [
    {
      points: [cgmNw, cgmN, cgmNe],
      idPrefixes: ["r_cgmesh_row1a", "r_cgmesh_row1b"],
    },
    {
      points: [cgmSw, cgmS, cgmSe],
      idPrefixes: ["r_cgmesh_row2a", "r_cgmesh_row2b"],
    },
  ],
  "residential",
  "茅ヶ崎住宅街",
);
buildRoad(cgmNw, cgmSw, "residential", "r_cgmesh_col1", "茅ヶ崎住宅街");
buildRoad(cgmN, cgmS, "residential", "r_cgmesh_col2", "茅ヶ崎住宅街");
buildRoad(cgmNe, cgmSe, "residential", "r_cgmesh_col3", "茅ヶ崎住宅街");
buildRoad(
  chigasakiRing.ne,
  cgmNw,
  "residential",
  "r_cg_ne_mesh",
  "茅ヶ崎住宅街",
);
// 辻堂ロータリーへの接続は、辻堂ロータリー定義後にまとめて追加する。

// 茅ヶ崎: ロータリー西点から、もう1つ小さな輪(茅ヶ崎中央イメージ)を足す。
const cgChuo = addJunction(
  "wp_cg_chuo",
  "茅ヶ崎中央入口",
  chigasakiRing.w.x - 60,
  chigasakiRing.w.y + 30,
);
buildRoad(chigasakiRing.w, cgChuo, "residential", "r_cg_w_chuo", "茅ヶ崎中央");
smallLoop(cgChuo, 25, "cgcyu", "茅ヶ崎中央", 1);
const tsujidoRing = smallLoop(tsujido, 70, "tslp", "辻堂小路", 2, 80, 0, [
  "n",
  "nw",
]); // ★★★☆☆

// 辻堂: 600マス化・第6弾。実際の幹線・行き来ルートが西(茅ヶ崎)・東(藤沢方面、
// 裏道・近道含む)・南(辻堂海岸)・北(茅ヶ崎住宅街への裏道)を使っているため、
// まだ空いている北東の点から衛星区画を作る。
// 北東(藤沢本町・辻堂緑ヶ浜案①)・東(藤沢住宅街メッシュ)はどちらも他区画と
// 近すぎるため、南西点から茅ヶ崎方面の空き地へ衛星区画を作る。
const tsShop = addJunction(
  "wp_ts_shop",
  "辻堂海浜商店街入口",
  tsujidoRing.sw.x - 50,
  tsujidoRing.sw.y + 20,
);
buildRoad(
  tsujidoRing.sw,
  tsShop,
  "residential",
  "r_ts_sw_shop",
  "辻堂海浜商店街",
);
const tsShopRing = smallLoop(tsShop, 26, "tssp", "辻堂海浜商店街", 1);
// 商店街からさらに1本、小さな輪(辻堂緑ヶ浜イメージ)を足す。
const tsMidori = addJunction(
  "wp_ts_midori",
  "辻堂緑ヶ浜入口",
  tsShopRing.s.x,
  tsShopRing.s.y + 74,
);
buildRoad(tsShopRing.s, tsMidori, "residential", "r_tssp_midori", "辻堂緑ヶ浜");
smallLoop(tsMidori, 32, "tsmd", "辻堂緑ヶ浜", 1); // 半径は南からの直接アクセス路が輪の点を避けて通れるだけの余裕を持たせている
// 茅ヶ崎住宅街メッシュから辻堂ロータリーの北西ゲートへ抜ける裏道(海沿い幹線・
// 裏道(r_local_cg_ts)のどちらとも通らない北側のルート)。
buildRoad(
  cgmNe,
  tsujidoRing.n,
  "residential",
  "r_cgmesh_tsujido",
  "茅ヶ崎住宅街",
);
// 平塚: 西側最大の都市として、環状路を鎌倉・茅ヶ崎と同格まで拡大する。
// 実際の幹線が東(茅ヶ崎)・北(田村)を使っているため、ゲートは南〜西寄り3点にする。
const hiratsukaRing = smallLoop(hiratsuka, 85, "hrlp", "平塚小路", 3, 70, 0, [
  "s",
  "sw",
  "w",
]); // ★★★★☆(西側最大都市)

// ============================================================
// 平塚: 600マス化・第4弾。実際の幹線が東(茅ヶ崎)・北(田村)を使っているため、
// 北東の点(ne)から離して衛星区画を作る(茅ヶ崎方面の道・田村方面の道のどちらとも
// 十分離れている)。
// ============================================================
const hrShop = addJunction(
  "wp_hr_shop",
  "平塚銀座入口",
  hiratsukaRing.ne.x + 50,
  hiratsukaRing.ne.y - 40,
);
buildRoad(hiratsukaRing.ne, hrShop, "residential", "r_hr_ne_shop", "平塚銀座");
const hrShopRing = smallLoop(hrShop, 28, "hrsp", "平塚銀座", 1);

// 平塚: 銀座の輪からさらに1本、小さな輪(桜ヶ丘イメージ)を足す。
const hrSakura = addJunction(
  "wp_hr_sakura",
  "平塚桜ヶ丘入口",
  hrShopRing.e.x + 60,
  hrShopRing.e.y + 20,
);
buildRoad(hrShopRing.e, hrSakura, "residential", "r_hrsp_sakura", "平塚桜ヶ丘");
smallLoop(hrSakura, 27, "hrsk", "平塚桜ヶ丘", 1);

// 平塚: 住宅街メッシュ — ロータリー南東点から南側の空き地(農地の裏手)へ
// 3列×2行の格子を作る。出口をロータリー南点へ直結し、格子内でも通り方を選べる
// うえに、ロータリーを回らずに南側へ抜けられる裏ルートにする。
const hrmNw = addJunction("hrmesh_nw", "平塚住宅街(北西)", 60, 830);
const hrmN = addJunction("hrmesh_n", "平塚住宅街(北)", 130, 830);
const hrmNe = addJunction("hrmesh_ne", "平塚住宅街(北東)", 200, 830);
const hrmSw = addJunction("hrmesh_sw", "平塚住宅街(南西)", 60, 880);
const hrmS = addJunction("hrmesh_s", "平塚住宅街(南)", 130, 880);
const hrmSe = addJunction("hrmesh_se", "平塚住宅街(南東)", 200, 880);
connectMany(
  [
    {
      points: [hrmNw, hrmN, hrmNe],
      idPrefixes: ["r_hrmesh_row1a", "r_hrmesh_row1b"],
    },
    {
      points: [hrmSw, hrmS, hrmSe],
      idPrefixes: ["r_hrmesh_row2a", "r_hrmesh_row2b"],
    },
  ],
  "residential",
  "平塚住宅街",
);
buildRoad(hrmNw, hrmSw, "residential", "r_hrmesh_col1", "平塚住宅街");
buildRoad(hrmN, hrmS, "residential", "r_hrmesh_col2", "平塚住宅街");
buildRoad(hrmNe, hrmSe, "residential", "r_hrmesh_col3", "平塚住宅街");
buildRoad(hiratsukaRing.se, hrmNw, "residential", "r_hr_se_mesh", "平塚住宅街");
buildRoad(
  hrmSw,
  hiratsukaRing.s,
  "shortcut",
  "r_hrmesh_hrring_s",
  "平塚住宅街",
);
// 江の島: 橋を渡った先の島の中の小さな参道(仲見世通りイメージ)。行き止まりの小さな輪。
const enlpRing = smallLoop(enoshima, 35, "enlp", "江の島参道", 1);
// 600マス化・第6弾: 参道の輪から、島の別の場所(展望灯台・稚児ヶ淵イメージ)へ
// 2本の小さな輪を足す。江の島は行き止まりの島なので、島の中でも通り方を
// 選べるようにする。
const enCandle = addJunction(
  "wp_en_candle",
  "江の島シーキャンドル入口",
  enlpRing.n.x - 160,
  enlpRing.n.y + 35,
);
buildRoad(
  enlpRing.n,
  enCandle,
  "residential",
  "r_enlp_candle",
  "江の島シーキャンドル通り",
);
smallLoop(enCandle, 30, "encd", "江の島シーキャンドル通り", 1);
const enChigo = addJunction(
  "wp_en_chigo",
  "稚児ヶ淵入口",
  enlpRing.s.x,
  enlpRing.s.y + 55,
);
buildRoad(enlpRing.s, enChigo, "coastal", "r_enlp_chigo", "稚児ヶ淵");
smallLoop(enChigo, 32, "encg", "稚児ヶ淵", 1);

// ============================================================
// 湘南台: 道路階層を分離する。
//   幹線(main) = 街区の外側だけを通る(寒川・大船・六会・北ルートの4本)。
//   生活道路(residential) = 街区の内部専用。色も別レイヤーとして視覚分離する。
// 街区(3列×4行=12マスの格子)を先に置き、そのあとで幹線をその外側に迂回させる
// 順序で設計する(逆に「幹線が交差する点に街を後付けする」と、街ではなく
// 交差点そのものが主役に見えてしまうため)。ゲートは北端中央・南端中央の
// 2点だけ(=1〜2箇所)。南端はhub_shonandaiとほぼ密着させ(24px)、寒川・大船・
// 六会の3幹線が収束する場所そのものを街区の一部として視覚的に取り込む
// (旧デザインは寒川台距離があり、街と交差点が別物に見えていた)。
// 湘南台住宅街の裏道(六会・大船方面)は、街区の中を通さずhub_shonandai自体
// から分岐させる(=ゲート以外で幹線と街内部の道路が交差・接続しない)。
// ============================================================
function buildGridBlock(
  originX: number,
  originY: number,
  colSpacing: number,
  rowSpacing: number,
  cols: number,
  rows: number,
  idPrefix: string,
  area: string,
  // "full": 全マスを格子状に接続する(従来どおり)。
  // "perimeter": 外周(四辺)だけを道にし、中央列は南北ゲートを結ぶ最短の1本だけ
  // 通す(内部は接続を作らない=見た目上「塗りつぶされた街区」にする)。
  edgeStyle: "full" | "perimeter" = "full",
): Hub[][] {
  const grid: Hub[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: Hub[] = [];
    for (let r = 0; r < rows; r++) {
      const x = originX + c * colSpacing;
      const y = originY + r * rowSpacing;
      col.push(
        addJunction(`${idPrefix}_c${c}r${r}`, `${area}(${c},${r})`, x, y),
      );
    }
    grid.push(col);
  }
  if (edgeStyle === "full") {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        buildRoad(
          grid[c][r],
          grid[c + 1][r],
          "residential",
          `r_${idPrefix}_h${c}${r}`,
          area,
        );
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - 1; r++) {
        buildRoad(
          grid[c][r],
          grid[c][r + 1],
          "residential",
          `r_${idPrefix}_v${c}${r}`,
          area,
        );
      }
    }
  } else {
    // 外周(上端・下端・左端・右端)
    for (let c = 0; c < cols - 1; c++) {
      buildRoad(
        grid[c][0],
        grid[c + 1][0],
        "residential",
        `r_${idPrefix}_h${c}0`,
        area,
      );
      buildRoad(
        grid[c][rows - 1],
        grid[c + 1][rows - 1],
        "residential",
        `r_${idPrefix}_h${c}${rows - 1}`,
        area,
      );
    }
    for (let r = 0; r < rows - 1; r++) {
      buildRoad(
        grid[0][r],
        grid[0][r + 1],
        "residential",
        `r_${idPrefix}_v0${r}`,
        area,
      );
      buildRoad(
        grid[cols - 1][r],
        grid[cols - 1][r + 1],
        "residential",
        `r_${idPrefix}_v${cols - 1}${r}`,
        area,
      );
    }
    // 中央列: 南北ゲートを結ぶ最短の1本(外周だけだと中央列の内部マスが孤立するため)。
    const midCol = Math.floor(cols / 2);
    if (midCol > 0 && midCol < cols - 1) {
      for (let r = 0; r < rows - 1; r++) {
        buildRoad(
          grid[midCol][r],
          grid[midCol][r + 1],
          "residential",
          `r_${idPrefix}_v${midCol}${r}`,
          area,
        );
      }
    }
  }
  return grid;
}
// 中央列(c=1)をhub_shonandai・北ルートと同じx=1080に揃え、南口・北口とも
// 縦一直線の接続にする(斜めなし)。南端行はhub_shonandaiの24px北に置き、
// 街区の外周がすぐそこまで迫っているように見せる。
// edgeStyle:"perimeter" — 全マス格子(3x4=17辺)だと「規則正しい道路網」に見えて
// しまうため、外周(四辺)+中央列(南北ゲートを結ぶ最短路)の13辺だけに絞り、
// 内部はtextureデコレーション(建物の塊)で塗って「街」の見た目を作る。
const sctw = buildGridBlock(
  1080 - 42,
  12,
  42,
  38,
  3,
  4,
  "sctw",
  "湘南台",
  "perimeter",
);
const shonandaiKita = sctw[1][0]; // 北口ゲート(北ルートへ)
buildRoad(shonandai, sctw[1][3], "residential", "r_sc_kita", "湘南台北口"); // 南口ゲート(hub_shonandaiへ)
decorations.push({
  kind: "texture",
  variant: "houses",
  x: sctw[0][0].x - 24,
  y: sctw[0][0].y - 24,
  width: sctw[2][0].x - sctw[0][0].x + 48,
  height: sctw[0][3].y - sctw[0][0].y + 48,
});
// 住宅街から六会方面へ抜ける裏道。湘南台駅前を経由しない、駅の外側を回るルートになる。
// (六会⇄大船間の再設計に合わせて縦横のみのルートに引き直すため、実際の接続は
// 円蔵⇄六会⇄大船のトランクを作った後段でまとめて行う。)

// 街のシルエット再設計: 四之宮・用田はどちらも小さな街区で、寒川⇄湘南台の
// 660px区間に2つ並べると余白が足りず「街区の連続」に見えてしまっていた。
// 1つの街(四之宮)に統合し、幹線(r_sm_sc)のちょうど中間から北へ張り出す
// 不規則な住宅街メッシュにする(碁盤目にしない=湘南台・円蔵と形が被らないため)。
// ゲートは幹線からのスプール1本だけ。
// 斜めの多い不規則メッシュをやめ、3列×2行の格子(はしご状)に作り直す
// (縦横のみ・斜めなし)。北ルート(snmB)・中間ルート西(snmC)・中間ルート東
// (snmE)・幹線ゲート(snmD)の接続先はそのまま同じ変数を使う。
const shinomiyaGate = pickMidFiller(samukawa, shonandai);
const snmCx = shinomiyaGate.x + 10;
const snmCy = shinomiyaGate.y - 108;
const snmA = addJunction("wp_snm_a", "四之宮(北西)", snmCx - 42, snmCy - 19);
const snmB = addJunction("wp_snm_b", "四之宮(北東)", snmCx, snmCy - 19);
const snmF = addJunction("wp_snm_f", "四之宮(東端)", snmCx + 42, snmCy - 19);
const snmC = addJunction("wp_snm_c", "四之宮(西)", snmCx - 42, snmCy + 19);
const snmD = addJunction("wp_snm_d", "四之宮", snmCx, snmCy + 19);
const snmE = addJunction("wp_snm_e", "四之宮(東)", snmCx + 42, snmCy + 19);
connectMany(
  [
    { points: [snmA, snmB, snmF], idPrefixes: ["r_snm_ab", "r_snm_bf"] },
    { points: [snmC, snmD, snmE], idPrefixes: ["r_snm_cd", "r_snm_de"] },
  ],
  "residential",
  "四之宮",
);
buildRoad(snmA, snmC, "residential", "r_snm_ac", "四之宮");
buildRoad(snmB, snmD, "residential", "r_snm_bd", "四之宮");
buildRoad(snmF, snmE, "residential", "r_snm_fe", "四之宮");
buildRoad(
  shinomiyaGate,
  snmD,
  "residential",
  "r_sm_sc_shinomiya_gate",
  "四之宮",
);

// ============================================================
// 北ルート: 寒川・四之宮・湘南台の北側を東西に貫く幹線(main)。既存の
// 寒川⇄湘南台の道(中央ルート)とは別の、北側の迂回幹線として機能させる。
// 各街のシルエットの外側(北端の既存ゲート)にだけ接続し、街の中は貫通しない。
// 縦横のみで構成し斜めは使わない(スパイン・ゲート接続とも同じx/yで直線)。
// 六会へはこの幹線から新たに直結させない(湘南台の東側は住宅街の輪・藤沢北口が
// 密集していて、無理に迂回させると別の場所で道がマスを横切る問題を再発するため)。
// 既存の湘南台⇄六会の幹線(main、南北一直線)を経由して到達させる。
// ============================================================
// 湘南台の街区(y=12〜126)・四之宮(y≈snmCy-19〜+19)と縦方向の間隔を広く取り、
// 「街のすぐ上に幹線が並走している」印象を避ける(y=-40→-90)。
const northRouteWest = addJunction(
  "wp_north_route_west",
  "北ルート(寒川)",
  smrsRing.n.x,
  -90,
);
const northRouteMid = addJunction(
  "wp_north_route_mid",
  "北ルート(四之宮)",
  snmB.x,
  -90,
);
const northRouteEast = addJunction(
  "wp_north_route_east",
  "北ルート(湘南台)",
  shonandaiKita.x,
  -90,
);
buildRoad(northRouteWest, smrsRing.n, "main", "r_north_west_gate", "北ルート");
buildRoad(northRouteMid, snmB, "main", "r_north_mid_gate", "北ルート");
buildRoad(
  northRouteEast,
  shonandaiKita,
  "main",
  "r_north_east_gate",
  "北ルート",
);
connectRoad(
  [northRouteWest, northRouteMid, northRouteEast],
  "main",
  "北ルート",
  ["r_north_spine_1", "r_north_spine_2"],
);

// ============================================================
// 中間ルート: 寒川ロータリー⇄四之宮⇄湘南台ブロックをつなぐ、北ルートとは別の
// もう1本の東西ルート(residential、生活道路レイヤー)。北ルート(最北端)と
// 寒川⇄湘南台の中央トランク(南端、六会列を避けたL字)の間の空いた帯を通す。
// 縦横のみで構成し、四之宮は西(snmC)・東(snmE)の2ゲートで通過点にする
// (北ルートの接続先であるsnmBとは別のゲートを使い、四之宮内部で分岐させる)。
// ============================================================
// 西側: 寒川住宅街の輪の列(x=483)にすぐ沿わせると輪の点と重なるため、
// いったん東へ離れてから縦に折れる。
const midRouteBendW1 = addJunction(
  "wp_mid_route_bend_w1",
  "中間ルート(寒川・東)",
  600,
  smrsRing.e.y,
);
const midRouteBendW2 = addJunction(
  "wp_mid_route_bend_w2",
  "中間ルート(寒川・南)",
  600,
  snmC.y,
);
connectRoad(
  [smrsRing.e, midRouteBendW1, midRouteBendW2, snmC],
  "residential",
  "中間ルート",
  ["r_mid_west_h1", "r_mid_west_v", "r_mid_west_h2"],
);
// 東側: 四之宮の点の列(x=823)にすぐ沿わせると四之宮内部の道と重なるため、
// いったん東へ離れてから折れる(snmEとブロックのyはほぼ同じ(4px差)なので
// 折れ点は1つで足りる)。
const midRouteBendE1 = addJunction(
  "wp_mid_route_bend_e1",
  "中間ルート(湘南台・西)",
  910,
  sctw[0][2].y,
);
buildRoad(snmE, midRouteBendE1, "residential", "r_mid_east_h1", "中間ルート");
buildRoad(
  midRouteBendE1,
  sctw[0][2],
  "residential",
  "r_mid_east_h2",
  "中間ルート",
);

// ============================================================
// 丘陵連絡路: 北ルートと四之宮の間の空白(丘陵地形エリア)を東西に横切る道。
// 直線ではなく、赤線のイメージに合わせて2回曲がる(ジグザグの)ルートにする。
// ============================================================

const hillsRoadStart = pickMidFiller(northRouteWest, northRouteMid); // 北ルートの西寄りの中間点から分岐
const hillsBend1 = addJunction(
  "wp_hills_bend1",
  "丘陵連絡路(1)",
  hillsRoadStart.x + 40,
  hillsRoadStart.y + 70,
);
const hillsBend2 = addJunction(
  "wp_hills_bend2",
  "丘陵連絡路(2)",
  hillsBend1.x + 60,
  hillsBend1.y - 30,
);
const hillsEnd = snmA; // 四之宮(北西)の点に合流させる

buildRoad(
  hillsRoadStart,
  hillsBend1,
  "residential",
  "r_hills_road1",
  "丘陵連絡路",
);
buildRoad(hillsBend1, hillsBend2, "residential", "r_hills_road2", "丘陵連絡路");
buildRoad(hillsBend2, hillsEnd, "residential", "r_hills_road3", "丘陵連絡路");

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
buildRoad(
  chigasakiRing.e,
  tsujidoRing.w,
  "residential",
  "r_local_cg_ts",
  "茅ヶ崎",
);
buildRoad(
  tsujidoRing.se,
  fujisawaRing.sw,
  "residential",
  "r_local2_ts_fj",
  "辻堂",
);

// 藤沢: ロータリーの斜めの点から梶原へのショートカットは、梶原が大船と一緒に
// 移動して藤沢本線(r_kj_fj)とほぼ並走・接触するようになったため廃止した。
// 梶原へは藤沢本線(r_kj_fj)で直接到達できる。
// (六会への接続は、六会⇄大船間の再設計に合わせて後段でまとめて縦横のみで引き直す。)

// 藤沢: マップ最大の都市として、ロータリーからさらにもう1つ小さな輪(藤沢北口イメージ)を
// 外付けする。中心を同じくする「内周ロータリー」ではなく、ロータリーの北東の点から
// 1本の道で少し離れた場所に作る衛星型の輪にしている(hubを中心に同心円状の輪を
// 複数作ると、どの方角でつないでも中心からの直線どうしが重なってマスが重なって
// しまうため、鎌倉の北鎌倉小路・稲村ヶ崎小路と同じ「衛星型」の作り方に統一した)。
const fujisawaKitaguchi = addJunction(
  "wp_fj_kitaguchi",
  "藤沢北口",
  fujisawaRing.ne.x,
  fujisawaRing.ne.y - 100,
);
buildRoad(
  fujisawaRing.ne,
  fujisawaKitaguchi,
  "residential",
  "r_fj_ne_kitaguchi",
  "藤沢北口",
);
smallLoop(fujisawaKitaguchi, 50, "fjkt", "藤沢北口通り", 1, 70);

// ============================================================
// 藤沢: 街の中の選択肢を増やす拡張(600マス化・第1弾)。
// ロータリーのうち、まだ何も生やしていない4点(北・東・南・西)から、それぞれ性格の
// 違う衛星区画を1つずつ足す。北口と同じ「衛星型」(hubを中心にした同心円は作らない)
// を徹底し、隣接する既存の道路・環状路とは60px以上離す。
// ============================================================
// 北: 商店街(藤沢名店街) — 小町通りと同じく2回曲がってから小さな輪に着く構成。
// y-50(旧-55): 六会が湘南台・藤沢と同じX(1080)にそろったため、ロータリーの北点から
// 真上に伸ばすと六会⇄藤沢の縦の幹線のマス(y512)と重なってしまう。縦の幹線の
// マスとマスの間(y512と558の中間)に高さだけ逃がす。
const fjMeitenEnt = addJunction(
  "wp_fj_meiten_ent",
  "藤沢名店街入口",
  fujisawaRing.n.x,
  fujisawaRing.n.y - 50,
);
buildRoad(
  fujisawaRing.n,
  fjMeitenEnt,
  "residential",
  "r_fj_n_meiten1",
  "藤沢名店街",
);
// y-185(旧-60): 六会大船間トランク(y420)より北側の帯へ丸ごと逃がし、辻堂裏道・
// 藤沢ロータリー裏道と高さで棲み分ける。
const fjMeitenNaka = addJunction(
  "wp_fj_meiten_naka",
  "藤沢名店街仲通り",
  fjMeitenEnt.x - 60,
  fjMeitenEnt.y - 185,
);
buildRoad(
  fjMeitenEnt,
  fjMeitenNaka,
  "residential",
  "r_fj_n_meiten2",
  "藤沢名店街",
);
// 六会大船間トランクの新しい裏道群(辻堂裏道・藤沢ロータリー裏道)がこの一帯
// (x900〜1030・y420〜590)を通るようになったため、名店街の奥の輪・藤沢本町の輪は
// 重なりを避けきれず廃止し、奥通りを行き止まりの1マスにした(装飾目的の支線のため
// 一本道の行き止まりで問題ない)。
const fjMeitenOku = addJunction(
  "wp_fj_meiten_oku",
  "藤沢名店街奥",
  fjMeitenNaka.x - 90,
  fjMeitenNaka.y - 15,
);
buildRoad(
  fjMeitenNaka,
  fjMeitenOku,
  "residential",
  "r_fj_n_meiten3",
  "藤沢名店街",
);

// 東: 藤沢東口 — 北口の対になる衛星の輪。梶原方面の2本の道(藤沢⇄梶原・ロータリー南東
// ゲート⇄梶原)、鵠沼⇄腰越の海沿い幹線のどれとも重ならない隙間(ロータリー南東ゲートの
// すぐ南)に、小さめの円形の輪として置く。
// 梶原が大船と一緒に移動して藤沢ロータリー⇄梶原の道(r_fj_se_kj)の角度が
// 変わったため、東口の輪をさらに南東へ離す。
const fjHigashiguchi = addJunction(
  "wp_fj_higashiguchi",
  "藤沢東口",
  fujisawaRing.se.x + 160,
  fujisawaRing.se.y + 60,
);
buildRoad(
  fujisawaRing.se,
  fjHigashiguchi,
  "residential",
  "r_fj_se_higashiguchi",
  "藤沢東口",
);
smallLoop(fjHigashiguchi, 32, "fjhg", "藤沢東口通り", 1);

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
connectMany(
  [
    {
      points: [fjmNw, fjmN, fjmNe],
      idPrefixes: ["r_fjmesh_row1a", "r_fjmesh_row1b"],
    },
    {
      points: [fjmSw, fjmS, fjmSe],
      idPrefixes: ["r_fjmesh_row2a", "r_fjmesh_row2b"],
    },
  ],
  "residential",
  "藤沢住宅街",
);
buildRoad(fjmNw, fjmSw, "residential", "r_fjmesh_col1", "藤沢住宅街");
buildRoad(fjmN, fjmS, "residential", "r_fjmesh_col2", "藤沢住宅街");
buildRoad(fjmNe, fjmSe, "residential", "r_fjmesh_col3", "藤沢住宅街");
buildRoad(fujisawaRing.sw, fjmNe, "residential", "r_fj_sw_mesh", "藤沢住宅街");
// 出口はロータリー南西点(sw)からの入口とは別に、北西の角(nw)からロータリー南点(s)へ
// 直接抜ける近道にする。格子を斜めに横切る形になるので、sw⇄nw⇄sで回るか、
// nwから直接sへ抜けるかの選択が生まれる。
buildRoad(fjmNw, fujisawaRing.s, "shortcut", "r_fj_mesh_exit", "藤沢住宅街");

// 鎌倉: 環状路の西側を稲村ヶ崎に直結し、稲村ヶ崎⇄鎌倉が海沿い幹線+この裏道の2ルートになる。
buildRoad(
  kamakuraRing.w,
  inamuragasaki,
  "residential",
  "r_km_w_in",
  "鎌倉小路",
);

// 鎌倉: 観光地らしく、周辺(北鎌倉・稲村ヶ崎)にも小さな環状ルートを追加する。
const kitakamakuraRing = smallLoop(
  kitakamakura,
  25,
  "kklp",
  "北鎌倉小路",
  2,
  66,
); // 円覚寺・建長寺まわりのイメージ
// 稲村ヶ崎自体は腰越(西)・鎌倉(北)・由比ヶ浜(南西)・鎌倉小路(北東寄り)の道が集まる
// 交差点のため、輪は他の道と重ならない東側へ少し離した衛星型にする。
const inamuragasakiPark = addJunction(
  "wp_inamuragasaki_park",
  "稲村ヶ崎公園入口",
  inamuragasaki.x + 65,
  inamuragasaki.y,
);
buildRoad(
  inamuragasaki,
  inamuragasakiPark,
  "residential",
  "r_in_park",
  "稲村ヶ崎小路",
);
const inamuragasakiParkRing = smallLoop(
  inamuragasakiPark,
  25,
  "inlp",
  "稲村ヶ崎小路",
  1,
); // 稲村ヶ崎公園まわりのイメージ

// 鎌倉: 古い商店街らしく、まっすぐではなく2回曲がって着く小さな通り(小町通りイメージ)を追加。
const komachiBend1 = addJunction(
  "wp_komachi1",
  "小町通り入口",
  kamakuraRing.e.x + 40,
  kamakuraRing.e.y,
);
buildRoad(
  kamakuraRing.e,
  komachiBend1,
  "residential",
  "r_km_komachi1",
  "小町通り",
);
const komachiBend2 = addJunction(
  "wp_komachi2",
  "小町通り中程",
  komachiBend1.x,
  komachiBend1.y + 45,
);
buildRoad(
  komachiBend1,
  komachiBend2,
  "residential",
  "r_km_komachi2",
  "小町通り",
);
const komachi = addJunction(
  "wp_komachi3",
  "小町通り",
  komachiBend2.x + 40,
  komachiBend2.y,
);
buildRoad(komachiBend2, komachi, "residential", "r_km_komachi3", "小町通り");

// ============================================================
// 鎌倉圏: 街の中の選択肢を増やす拡張(600マス化・第2弾)。
// ============================================================
// 鎌倉: 商店街(御成通りイメージ) — ロータリーの北点から、北鎌倉⇄鎌倉の直通路
// (r_kk_km、北鎌倉が大船と一緒に移動して経路が変わった)や合流路(r_kkkm_merge)
// とは重ならない、より東・北寄りの位置に小さな輪を作る。
const onariEnt = addJunction(
  "wp_onari_ent",
  "御成通り入口",
  kamakuraRing.n.x + 85,
  kamakuraRing.n.y - 70,
);
buildRoad(kamakuraRing.n, onariEnt, "residential", "r_km_n_onari", "御成通り");
smallLoop(onariEnt, 27, "onlp", "御成通り", 1);

// 鎌倉: 住宅街メッシュ — 腰越・稲村ヶ崎の間、海沿いの道(r_ks_in)よりさらに南の
// 空き地に3列×2行の格子を作る。入口を腰越、出口を稲村ヶ崎への近道にすることで、
// 海沿いを通らずに腰越⇄稲村ヶ崎を抜けられる裏ルートにする。
const kmmNw = addJunction("kmmesh_nw", "鎌倉住宅街(北西)", 1340, 1140);
const kmmN = addJunction("kmmesh_n", "鎌倉住宅街(北)", 1410, 1140);
const kmmNe = addJunction("kmmesh_ne", "鎌倉住宅街(北東)", 1480, 1140);
const kmmSw = addJunction("kmmesh_sw", "鎌倉住宅街(南西)", 1340, 1190);
const kmmS = addJunction("kmmesh_s", "鎌倉住宅街(南)", 1410, 1190);
const kmmSe = addJunction("kmmesh_se", "鎌倉住宅街(南東)", 1480, 1190);
connectMany(
  [
    {
      points: [kmmNw, kmmN, kmmNe],
      idPrefixes: ["r_kmmesh_row1a", "r_kmmesh_row1b"],
    },
    {
      points: [kmmSw, kmmS, kmmSe],
      idPrefixes: ["r_kmmesh_row2a", "r_kmmesh_row2b"],
    },
  ],
  "residential",
  "鎌倉住宅街",
);
buildRoad(kmmNw, kmmSw, "residential", "r_kmmesh_col1", "鎌倉住宅街");
buildRoad(kmmN, kmmS, "residential", "r_kmmesh_col2", "鎌倉住宅街");
buildRoad(kmmNe, kmmSe, "residential", "r_kmmesh_col3", "鎌倉住宅街");

// 北鎌倉: 2つめの参道(建長寺イメージ)を、既存の環状路の南西点から短い直結(マスを
// 挟まない1本道)で作る。マスを挟むと途中のマスが輪の頂点と重なりやすいため、
// 距離を70px程度に抑えて直結にした。
const kenchojiEnt = addJunction(
  "wp_kenchoji_ent",
  "建長寺参道入口",
  kitakamakuraRing.sw.x - 200,
  kitakamakuraRing.sw.y + 20,
);
buildRoad(
  kitakamakuraRing.sw,
  kenchojiEnt,
  "residential",
  "r_kk_kenchoji",
  "建長寺参道",
);
smallLoop(kenchojiEnt, 27, "kjlp", "建長寺参道", 1);

// 稲村ヶ崎: 公園入口の輪からさらに海側へ1本、小さな海岸通りを足す。
const inamuraKaigan = addJunction(
  "wp_inamura_kaigan",
  "稲村ヶ崎海岸通り入口",
  inamuragasakiParkRing.e.x + 60,
  inamuragasakiParkRing.e.y + 40,
);
buildRoad(
  inamuragasakiParkRing.e,
  inamuraKaigan,
  "residential",
  "r_inpark_kaigan",
  "稲村ヶ崎海岸通り",
);
smallLoop(inamuraKaigan, 27, "incl", "稲村ヶ崎海岸通り", 1);

// 腰越: これまで行き止まりの1マスだけだった観光地に、衛星型の小さな輪を持たせて
// 「浜辺の集落」らしい内部の選択肢を作る(由比ヶ浜は後方でノード定義後に追加)。
// 腰越自体を中心にすると鵠沼⇄腰越・腰越⇄稲村ヶ崎の道と重なるため、南西へ離す。
const koshigoeSat = addJunction(
  "wp_koshigoe_sat",
  "腰越漁港通り入口",
  koshigoe.x - 30,
  koshigoe.y + 90,
);
buildRoad(koshigoe, koshigoeSat, "residential", "r_ks_sat", "腰越漁港通り");
smallLoop(koshigoeSat, 27, "kslp", "腰越漁港通り", 1);
// 鎌倉住宅街メッシュの入口(腰越漁港通りから)。出口(由比ヶ浜側)は由比ヶ浜のノード
// 定義後にまとめて追加する。
buildRoad(koshigoeSat, kmmNw, "residential", "r_ks_mesh", "鎌倉住宅街");

// 小町通り: 行き止まりの1本道の終点から、さらに1本南へ入った衛星の輪を追加し、
// 古い商店街らしい奥行きを持たせる(終点そのものを中心にすると入口の道と重なるため)。
const komachiOku = addJunction(
  "wp_komachi_oku",
  "小町通り奥入口",
  komachi.x,
  komachi.y + 70,
);
buildRoad(komachi, komachiOku, "residential", "r_km_komachi_oku", "小町通り奥");
smallLoop(komachiOku, 28, "kmclp", "小町通り奥", 1);

// 長い一本道の途中から、内陸ルートへ抜ける近道を追加。
// 海沿いを直進するか、内陸へ抜けて別ルートを回るか、の選択肢が生まれる。
buildRoad(
  pickMidFiller(chigasaki, tsujido),
  kagawa,
  "shortcut",
  "r_short_cgts_kg",
  "茅ヶ崎",
); // 茅ヶ崎-辻堂の中間→香川(寒川方面)
// (辻堂-藤沢の中間→六会、寒川-湘南台の2/3地点→六会 の2本は、六会への接続を
// 縦横のみで引き直すため、円蔵⇄六会⇄大船トランクを作った後段でまとめて行う。)
buildRoad(
  pickFillerAt(samukawa, shonandai, 0.33),
  kagawa,
  "shortcut",
  "r_short_smsc_kg",
  "寒川",
); // 寒川-湘南台の1/3地点→香川

// 海沿い幹線から海側へ寄り道できる行き止まりの観光スポットを追加(意図した行き止まり、
// 目的地候補にはしない実在地名の経由地)。
const chigasakiKaigan = addJunction(
  "wp_chigasaki_kaigan",
  "茅ヶ崎海岸",
  chigasaki.x,
  chigasaki.y + 130,
);
buildRoad(
  chigasakiRing.s,
  chigasakiKaigan,
  "coastal",
  "r_cg_s_kaigan",
  "茅ヶ崎海岸",
);
// 茅ヶ崎: 海側へ寄る小さなルートとして、海岸沿いにもう少しだけ小さな輪を作る。
// 茅ヶ崎海岸自体は茅ヶ崎小路からの道(北)が通っているため、輪はさらに海側(南)へ
// 少し離した衛星型にする。
const chigasakiKaiganOku = addJunction(
  "wp_chigasaki_kaigan_oku",
  "茅ヶ崎海岸奥",
  chigasakiKaigan.x,
  chigasakiKaigan.y + 45,
);
buildRoad(
  chigasakiKaigan,
  chigasakiKaiganOku,
  "coastal",
  "r_cg_kaigan_oku",
  "茅ヶ崎海岸通り",
);
smallLoop(chigasakiKaiganOku, 25, "cgklp", "茅ヶ崎海岸通り", 1);
// 600マス化・第7弾(全体接続調整): 辻堂海浜商店街(南西の衛星区画)と茅ヶ崎海岸奥を
// 直結し、海沿いの寄り道どうしを、幹線・ロータリーへ戻らずに移動できるようにする。
buildRoad(
  tsShop,
  chigasakiKaiganOku,
  "shortcut",
  "r_ts_shop_cg_kaigan",
  "海沿い裏道",
);

const tsujidoKaigan = addJunction(
  "wp_tsujido_kaigan",
  "辻堂海岸",
  tsujido.x,
  tsujido.y + 150,
);
buildRoad(tsujidoRing.s, tsujidoKaigan, "coastal", "r_ts_s_kaigan", "辻堂海岸");

const yuigahama = addJunction(
  "wp_yuigahama",
  "由比ヶ浜",
  inamuragasaki.x - 100,
  inamuragasaki.y + 90,
);
buildRoad(inamuragasaki, yuigahama, "coastal", "r_in_yui", "由比ヶ浜");
// 由比ヶ浜自体を中心に輪を作ると、稲村ヶ崎からの道(r_in_yui)の延長線上に輪の頂点が
// 乗って重なるため、南西へ1本離した衛星の輪にする。オフセットは輪の北東の角
// (yuilp_ne)が由比ヶ浜(wp_yuigahama)自身と重ならないだけの距離を確保している。
const yuigahamaSat = addJunction(
  "wp_yuigahama_sat",
  "由比ヶ浜海岸通り入口",
  yuigahama.x - 46,
  yuigahama.y + 46,
);
buildRoad(
  yuigahama,
  yuigahamaSat,
  "residential",
  "r_yui_sat",
  "由比ヶ浜海岸通り",
);
smallLoop(yuigahamaSat, 32, "yuilp", "由比ヶ浜海岸通り", 1);
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
const oga = addJunction(
  "wp_oga",
  "大神",
  pickMidFiller(hiratsuka, chigasaki).x,
  pickMidFiller(hiratsuka, chigasaki).y - 60,
);
buildRoad(
  pickMidFiller(hiratsuka, chigasaki),
  oga,
  "residential",
  "r_hrcg_oga",
  "大神",
);

// 鵠沼⇄腰越の中間 → 片瀬海岸(実在地名)への短い枝道(意図した行き止まり)
const katasekaigan = addJunction(
  "wp_katase_kaigan",
  "片瀬海岸",
  pickMidFiller(kugenuma, koshigoe).x,
  pickMidFiller(kugenuma, koshigoe).y + 70,
);
buildRoad(
  pickMidFiller(kugenuma, koshigoe),
  katasekaigan,
  "coastal",
  "r_kgks_katase",
  "片瀬海岸",
);
// 600マス化・第6弾: 片瀬海岸は行き止まりの1マスだけだったため、小さな輪だけ追加する
// (他の小地名と違い、水族館の想定地として指定されているため独立した輪にする)。
smallLoop(katasekaigan, 32, "ktlp", "片瀬海岸通り", 1); // 半径は北からの直接アクセス路が輪の点を避けて通れるだけの余裕を持たせている

// 湘南台⇄大船の中間 → 善行(実在地名)への短い枝道(区間の途中が縦の列・
// 湘南台住宅街裏道の横の列と近いため、どちらからも離れた向きへオフセットする)。
const zengyo = addJunction(
  "wp_zengyo",
  "善行",
  pickMidFiller(shonandai, ofuna).x + 80,
  pickMidFiller(shonandai, ofuna).y - 60,
);
buildRoad(
  pickMidFiller(shonandai, ofuna),
  zengyo,
  "residential",
  "r_scof_zengyo",
  "善行",
);

// 北鎌倉⇄鎌倉(8マス、区間内で最長)の中間 → 鎌倉小路の北ゲートに合流させる。
// 新しい行き止まりを作るのではなく、既存の環状路に合流させることで
// 「鎌倉へ抜ける2本目のルート」として機能させる。蛇行なし(まっすぐ合流させ、
// 鎌倉小路のリング自体と交差しないようにする)。
buildRoad(
  pickMidFiller(kitakamakura, kamakura),
  kamakuraRing.nw,
  "residential",
  "r_kkkm_merge",
  "鎌倉小路",
);

// ============================================================
// 街のシルエット再設計: 香川(西エリア)⇄大船(東エリア)。
// 「街は箱、道路は線」を徹底し、似た碁盤目だった打戻・円蔵の2街区を1つ(円蔵)に
// 統合した。幹線は香川⇄六会を直結する1本(main)にし、円蔵はその中間から
// ゲート1本だけで分岐する「商店街」にする(碁盤目にしない=湘南台・四之宮と
// 形が被らないようにする)。新しい街区は増やさない。
// ============================================================
buildRoad(kagawa, rokkai, "main", "r_kg_rk", "香川");

// ============================================================
// 北側バイパス: 香川⇄六会の幹線とは別に、その少し北側を並行して走る
// ジグザグの裏道。既存の幹線を通るか、このバイパスを通るか選べるようにする。
// ============================================================
const bypassP1 = addJunction("wp_bypass_p1", "北側バイパス(1)", 75, 280);
const bypassP2 = addJunction("wp_bypass_p2", "北側バイパス(2)", 318, 477);
const bypassP3 = addJunction("wp_bypass_p3", "北側バイパス(3)", 350, 350);
const bypassP4 = addJunction("wp_bypass_p4", "北側バイパス(4)", 500, 295);
const bypassP5 = addJunction("wp_bypass_p5", "北側バイパス(5)", 655, 368);
const bypassP6 = addJunction("wp_bypass_p6", "北側バイパス(6)", 1010, 240);

connectRoad(
  [tamura, bypassP1, bypassP2, bypassP3, bypassP4, bypassP5, bypassP6, shonandai],
  "residential",
  "北側バイパス",
  ["r_bypass_0", "r_bypass_1", "r_bypass_2", "r_bypass_3", "r_bypass_4", "r_bypass_5", "r_bypass_6"],
);

// 円蔵: 幹線のちょうど中間から南へ張り出す商店街(目抜き通り+短い路地2本)。
const enzoGate = pickMidFiller(kagawa, rokkai);

// 旧・打戻+円蔵を統合した1つの街。ゲートは幹線からのスプール1本だけ。
const enzoW = addJunction(
  "wp_enzo_w",
  "円蔵(西)",
  enzoGate.x - 70,
  enzoGate.y + 95,
);
const enzoC = addJunction("wp_enzo_c", "円蔵", enzoGate.x, enzoGate.y + 95);
const enzoE = addJunction(
  "wp_enzo_e",
  "円蔵(東)",
  enzoGate.x + 70,
  enzoGate.y + 95,
);
connectRoad([enzoW, enzoC, enzoE], "residential", "円蔵", [
  "r_enzo_w_c",
  "r_enzo_c_e",
]);
const enzoAlley1 = addJunction(
  "wp_enzo_alley1",
  "円蔵仲通り(北)",
  enzoC.x - 35,
  enzoC.y - 35,
);
buildRoad(enzoC, enzoAlley1, "residential", "r_enzo_alley1", "円蔵");
const enzoAlley2 = addJunction(
  "wp_enzo_alley2",
  "円蔵仲通り(南)",
  enzoE.x + 35,
  enzoE.y + 35,
);
buildRoad(enzoE, enzoAlley2, "residential", "r_enzo_alley2", "円蔵");
buildRoad(enzoGate, enzoC, "residential", "r_enzo_gate", "円蔵");

// ============================================================
// 六会→大船(東側トランク)。大船を遠ざけた分トランクが伸びたが、経路の考え方は
// 従来どおり: 六会の真上(y=393)へ上がり、藤沢北口の輪(x1110〜1210・y415〜555)の
// 真上を水平に抜けてから大船の真上で下ろす。すべて縦横のみ(main、幹線色)。
// ============================================================
const rkOfunaBend1 = addJunction(
  "wp_rk_ofuna_bend1",
  "六会大船間(西)",
  rokkai.x,
  388,
);
buildRoad(rokkai, rkOfunaBend1, "main", "r_rk_ofuna_v1", "六会大船間");
// 大船の真西70pxで一度区切り、大船への分岐点として使う(大船南側の梶原方面の道
// r_of_kj のマスと重ならない位置を選んでいる)。
const rkOfunaBendE = addJunction(
  "wp_rk_ofuna_bende",
  "六会大船間(東)",
  ofuna.x - 70,
  388,
);
buildRoad(rkOfunaBend1, rkOfunaBendE, "main", "r_rk_ofuna_h1", "六会大船間");

// 一本道防止: トランク中央のマスから短い行き止まりの寄り道(望地)を1つ挟む。
const enzoRokkaiMid = pickMidFiller(rkOfunaBend1, rkOfunaBendE);
const enzoOfunaSpur = addJunction(
  "wp_enzo_ofuna_spur",
  "望地",
  enzoRokkaiMid.x,
  enzoRokkaiMid.y - 50,
);
buildRoad(
  enzoRokkaiMid,
  enzoOfunaSpur,
  "residential",
  "r_enzo_bend1_spur",
  "望地",
);

const rkOfunaUp = addJunction(
  "wp_rk_ofuna_up",
  "大船入口(西)",
  rkOfunaBendE.x,
  ofuna.y,
);
connectRoad([rkOfunaBendE, rkOfunaUp, ofuna], "main", "六会大船間", [
  "r_rk_ofuna_v2",
  "r_rk_ofuna_h2",
]);

// 辻堂-藤沢の中間→六会(湘南台方面)の裏道。香川⇄六会の幹線トランクへ、
// ほぼ垂直に近い形で合流させる。
buildRoad(
  pickMidFiller(tsujido, fujisawa),
  pickFillerAt(kagawa, rokkai, 0.75),
  "shortcut",
  "r_short_tsfj_rk",
  "辻堂",
);

// 寒川-湘南台の2/3地点→六会 の裏道。同じく香川⇄六会の幹線トランクへ合流。
buildRoad(
  pickFillerAt(samukawa, shonandai, 0.66),
  pickFillerAt(kagawa, rokkai, 0.6),
  "shortcut",
  "r_short_smsc_rk",
  "湘南台",
);

// 藤沢ロータリー⇄六会。ロータリーの北西点(藤沢北口とは反対側、他の接続に
// 未使用の点)から、同じく香川⇄六会の幹線トランクへ合流。
buildRoad(
  fujisawaRing.nw,
  pickFillerAt(kagawa, rokkai, 0.85),
  "residential",
  "r_fj_nw_rk",
  "藤沢ロータリー",
);

// 湘南台住宅街から六会方面へ抜ける裏道(駅前を経由しない)。街区の中は通さず
// hub_shonandai自身から分岐させ(=ゲート以外で幹線と街内部の道路が交差・
// 接続しないようにする)、大船銀座よりさらに東まで水平に迂回してから南下し、
// 東側トランクの終端付近へつなぐ(縦横のみ・既存の道と重ならない)。
// 湘南台⇄大船の幹線(r_sc_of、y=shonandai.yで東へ一直線)と同じ緯度を通ると
// 重なってしまうため、いったん六会方面の列(x=1080)を少し南下してから東へ折れる。
const scResBranchStart = pickFillerAt(shonandai, rokkai, 0.2);
const scResBend1 = addJunction(
  "wp_sc_res_bend1",
  "湘南台住宅街裏道(東)",
  ofuna.x + 220,
  scResBranchStart.y,
);
buildRoad(
  scResBranchStart,
  scResBend1,
  "shortcut",
  "r_sc_res_rokkai_h",
  "湘南台住宅街",
);
// 一本道防止: 東西に長い区間(9マス分)の途中から短い行き止まりの寄り道を1つ挟む。
const scResHSpurBase = pickMidFiller(scResBranchStart, scResBend1);
const scResHSpur = addJunction(
  "wp_sc_res_hspur",
  "湘南台住宅街裏の外れ(西)",
  scResHSpurBase.x,
  scResHSpurBase.y - 50,
);
buildRoad(
  scResHSpurBase,
  scResHSpur,
  "shortcut",
  "r_sc_res_hspur",
  "湘南台住宅街",
);
const scResBend2 = addJunction(
  "wp_sc_res_bend2",
  "湘南台住宅街裏道(南)",
  scResBend1.x,
  388,
);
connectRoad(
  [scResBend1, scResBend2, rkOfunaBendE],
  "shortcut",
  "湘南台住宅街",
  ["r_sc_res_rokkai_v", "r_sc_res_rokkai_join"],
);
// 一本道防止: 東西に長い裏道の途中から短い行き止まりの寄り道を1つ挟む。
const scResSpurBase = pickMidFiller(scResBend1, scResBend2);
const scResSpur = addJunction(
  "wp_sc_res_spur",
  "湘南台住宅街裏の外れ",
  scResSpurBase.x + 50,
  scResSpurBase.y,
);
buildRoad(
  scResSpurBase,
  scResSpur,
  "shortcut",
  "r_sc_res_spur",
  "湘南台住宅街",
);

// ============================================================
// 全エリア見直し(第2弾): 藤沢⇄鎌倉・大船周辺。
// 藤沢⇄鎌倉はこれまで「海沿い(鵠沼⇄腰越⇄稲村ヶ崎)」と「内陸(梶原⇄大船⇄北鎌倉)」の
// 2ルートしかなく、しかもどちらも分岐なしの長い一本道だった。梶原⇄腰越を直結する
// 裏道を新設し、海沿い⇄内陸を行き来できる3本目のルートにする。
// 大船は経由地なのに独自の街並みが1つも無かったため、小さな商店街を1つ足す。
// ============================================================
buildRoad(kajiwara, koshigoe, "shortcut", "r_kj_ks", "梶原");

// 梶原東の輪(飯島イメージ)は、梶原・北鎌倉が大船と一緒に移動したことで
// 北鎌倉⇄鎌倉・御成通り一帯と重なりを避けきれず廃止した(装飾目的の行き止まりの
// ため、街としての機能には影響しない)。

// 大船は「駅前ターミナル」: 六会方面(西)・梶原方面(南)・北鎌倉方面(北東)・
// 大船銀座(北)の4方向が中心から放射状に伸びる形が、既存の接続だけで自然に
// できている。銀座の輪だけ規模を大きくして(半径26→32)、全街区中2番目に
// 大きいシルエットにする。
const ofunaShopJct = addJunction(
  "wp_ofuna_shop",
  "大船銀座入口",
  ofuna.x + 20,
  ofuna.y - 105,
);
buildRoad(ofuna, ofunaShopJct, "residential", "r_of_shop", "大船銀座");
smallLoop(ofunaShopJct, 32, "ofsp", "大船銀座", 1);

// ------------------------------------------------------------------
// 座標の微調整: 別々に生成された道・輪が、互いを見ずに独立して座標を決めるため
// ごくまれに1〜数pxだけマスが重なることがある。そのような箇所だけ、最終座標を
// 数px押し出して重なりを解消する(道の形自体を作り直すほどではない微修正)。
// ------------------------------------------------------------------
function nudgeNode(id: string, dx: number, dy: number) {
  const spec = nodeSpecs.find((n) => n.id === id);
  if (!spec) throw new Error(`nudgeNode: unknown node id "${id}"`);
  spec.x += dx;
  spec.y += dy;
}
nudgeNode("r_in_km_1", 3, 0); // 稲村ヶ崎南通り ⇄ 鎌倉小路旧道
nudgeNode("r_ts_fj_1", -3, -1); // 辻堂南通り ⇄ 辻堂小路(東)
nudgeNode("r_rk_fj_4", 0, 2); // 六会北通り ⇄ 藤沢ロータリー(北)
nudgeNode("r_kk_km_1", -2, -3); // 北鎌倉通り ⇄ 北鎌倉小路(南・南西)
nudgeNode("r_km_w_in_1", 3, 2); // 鎌倉小路新道 ⇄ 鎌倉小路本通り
nudgeNode("r_enlp_candle_1", -2, 2); // 江の島シーキャンドル通り ⇄ 江の島参道(北西)
nudgeNode("r_in_yui_1", -2, -2); // 由比ヶ浜北通り ⇄ 鎌倉住宅街大通り
nudgeNode("r_hr_cg_6", 1, -1); // 平塚南通り ⇄ 茅ヶ崎中央(北東)
nudgeNode("r_fj_n_meiten2_2", 1, 1); // 藤沢名店街北通り ⇄ 香川新道

// ------------------------------------------------------------------
// 道が無関係なマスの真上を素通りする問題の解消: ハブ⇄出入口の直線や、別々に
// 生成された道どうしが、途中にある無関係なマス(X)の真上を素通りしてしまう
// 箇所が多数あった。Xを経由する交差点に変えるのではなく、道(A⇄B)自体を
// Xを避けてL字に迂回させる(A⇄迂回点⇄Bの2区間にする)。迂回点はA・Bのみに
// つながる単純な通過点で、Xの接続は一切変更しない。
// ------------------------------------------------------------------
function bAndNodeRadius(n: { majorHub?: true }): number {
  return n.majorHub ? 18 : 10;
}
/** 線分(x1,y1)-(x2,y2)が、中心(cx,cy)・半幅hw・半高hhの矩形と交わるか(Liang-Barsky)。 */
function bAndSegmentHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): boolean {
  const xmin = cx - hw,
    xmax = cx + hw,
    ymin = cy - hh,
    ymax = cy + hh;
  let t0 = 0,
    t1 = 1;
  const dx = x2 - x1,
    dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}
/** 既存のどの道(いま置き換えようとしているa⇄b自体は除く)も、点(px,py)を中心とした通常マスの上を通っていないか。 */
function bAndAnyExistingEdgeHitsPoint(
  px: number,
  py: number,
  a: string,
  b: string,
): boolean {
  const r = 10 - 2;
  for (const e of edgeSpecs) {
    if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) continue;
    const from = nodeSpecs.find((n) => n.id === e.from);
    const to = nodeSpecs.find((n) => n.id === e.to);
    if (!from || !to) continue;
    if (bAndSegmentHitsRect(from.x, from.y, to.x, to.y, px, py, r, r))
      return true;
  }
  return false;
}
/** 迂回点の候補(bx,by)が、a・b以外の全マスと重ならず、新しい2区間もa・b以外のマスを素通りせず、
 * 既存のどの道からも素通りされない(=候補自体が別の道の上に乗らない)か。 */
function bAndCandidateIsSafe(
  bx: number,
  by: number,
  a: string,
  b: string,
): boolean {
  const bRadius = 10; // 迂回点は常に通常マス
  for (const n of nodeSpecs) {
    if (n.id === a || n.id === b) continue;
    const rSum = bRadius + bAndNodeRadius(n);
    if (Math.abs(bx - n.x) < rSum && Math.abs(by - n.y) < rSum) return false;
  }
  const an = nodeSpecs.find((n) => n.id === a)!;
  const bn = nodeSpecs.find((n) => n.id === b)!;
  for (const n of nodeSpecs) {
    if (n.id === a || n.id === b) continue;
    const r = bAndNodeRadius(n) - 2;
    if (r <= 0) continue;
    if (bAndSegmentHitsRect(an.x, an.y, bx, by, n.x, n.y, r, r)) return false;
    if (bAndSegmentHitsRect(bx, by, bn.x, bn.y, n.x, n.y, r, r)) return false;
  }
  if (bAndAnyExistingEdgeHitsPoint(bx, by, a, b)) return false;
  return true;
}
/** 線分(x1,y1)-(x2,y2)が、a・b以外のどれかのマスの真上を通っていないか。 */
function bAndSegmentHitsAnyOtherNode(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  a: string,
  b: string,
): boolean {
  for (const n of nodeSpecs) {
    if (n.id === a || n.id === b) continue;
    const r = bAndNodeRadius(n) - 2;
    if (r <= 0) continue;
    if (bAndSegmentHitsRect(x1, y1, x2, y2, n.x, n.y, r, r)) return true;
  }
  return false;
}

function bendAroundNode(a: string, b: string, x: string, idPrefix: string) {
  const an = nodeSpecs.find((n) => n.id === a);
  const bn = nodeSpecs.find((n) => n.id === b);
  const xn = nodeSpecs.find((n) => n.id === x);
  if (!an || !bn || !xn)
    throw new Error(
      `bendAroundNode: unknown node id among "${a}", "${b}", "${x}"`,
    );
  const idx = edgeSpecs.findIndex(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  );
  if (idx === -1)
    throw new Error(`bendAroundNode: no edge between "${a}" and "${b}"`);
  const edge = edgeSpecs[idx];

  const dx = bn.x - an.x,
    dy = bn.y - an.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len,
    uy = dy / len;
  const px = -uy,
    py = ux; // 進行方向に対する法線ベクトル

  const vx = xn.x - an.x,
    vy = xn.y - an.y;
  const preferredSide = vx * px + vy * py >= 0 ? -1 : 1; // Xと反対側を優先
  const t = vx * ux + vy * uy; // A→B方向でのXの投影位置
  const projX = an.x + ux * t,
    projY = an.y + uy * t;

  // まず単純な1点バイパス(法線方向〜やや斜めに1回だけ膨らませる)を試す。
  // A〜B全体を大きく迂回させると遠くの無関係なマスまで巻き込みやすいので、
  // 効かない場合は「Xの近くだけ」を四角くよける2点のノッチ(コの字)に切り替える
  // (街区の外周沿いをかすめて避けるイメージ)。
  const margins = [8, 14, 20, 28, 38, 50, 65];
  const angleOffsetsDeg = [0, -15, 15, -30, 30, -45, 45];
  let singleFound: { x: number; y: number } | null = null;
  single: for (const margin of margins) {
    for (const angleDeg of angleOffsetsDeg) {
      for (const sideFirst of [preferredSide, -preferredSide] as const) {
        const clearance = bAndNodeRadius(xn) + 10 + margin;
        const theta = (angleDeg * Math.PI) / 180;
        const dirX = px * Math.cos(theta) - py * Math.sin(theta);
        const dirY = px * Math.sin(theta) + py * Math.cos(theta);
        const bx = Math.round(projX + dirX * sideFirst * clearance);
        const by = Math.round(projY + dirY * sideFirst * clearance);
        if (bAndCandidateIsSafe(bx, by, a, b)) {
          singleFound = { x: bx, y: by };
          break single;
        }
      }
    }
  }
  if (singleFound) {
    const bendId = `${idPrefix}_bend`;
    nodeSpecs.push({
      id: bendId,
      name: `${xn.area}迂回路`,
      type: "normal",
      area: xn.area,
      x: singleFound.x,
      y: singleFound.y,
    });
    edgeSpecs.splice(idx, 1);
    edgeSpecs.push({
      from: a,
      to: bendId,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
    edgeSpecs.push({
      from: bendId,
      to: b,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
    return;
  }

  // 2点のノッチ(コの字)。Xのすぐ手前・すぐ先の2点だけを法線方向にずらし、
  // それ以外はもとの直線に沿わせることで、遠くのマスを巻き込まずXだけを避ける。
  let notchFound: {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
  } | null = null;
  const halfSpans = [
    bAndNodeRadius(xn) + 6,
    bAndNodeRadius(xn) + 12,
    bAndNodeRadius(xn) + 20,
    bAndNodeRadius(xn) + 32,
  ];
  notch: for (const margin of margins.concat([85, 110, 140, 170])) {
    for (const halfSpan of halfSpans) {
      for (const sideFirst of [preferredSide, -preferredSide] as const) {
        const clearance = bAndNodeRadius(xn) + 10 + margin;
        const p1x = Math.round(
          projX - ux * halfSpan + px * sideFirst * clearance,
        );
        const p1y = Math.round(
          projY - uy * halfSpan + py * sideFirst * clearance,
        );
        const p2x = Math.round(
          projX + ux * halfSpan + px * sideFirst * clearance,
        );
        const p2y = Math.round(
          projY + uy * halfSpan + py * sideFirst * clearance,
        );
        if (
          bAndCandidateIsSafe(p1x, p1y, a, b) &&
          bAndCandidateIsSafe(p2x, p2y, a, b) &&
          !bAndSegmentHitsAnyOtherNode(p1x, p1y, p2x, p2y, a, b)
        ) {
          notchFound = { p1: { x: p1x, y: p1y }, p2: { x: p2x, y: p2y } };
          break notch;
        }
      }
    }
  }
  if (!notchFound) {
    // 最終手段: Xの周囲を360度・複数半径で総当たりし、A・Bへの2区間とも安全な
    // 隙間(たいていリング上の点と点のあいだ)を探す。狭い衛星の輪などで
    // 法線方向がふさがっている場合の救済。
    let fallback: { x: number; y: number } | null = null;
    fb: for (
      let radius = bAndNodeRadius(xn) + 12;
      radius <= bAndNodeRadius(xn) + 160;
      radius += 4
    ) {
      for (let angleDeg = 0; angleDeg < 360; angleDeg += 2) {
        const theta = (angleDeg * Math.PI) / 180;
        const bx = Math.round(xn.x + radius * Math.cos(theta));
        const by = Math.round(xn.y + radius * Math.sin(theta));
        if (bAndCandidateIsSafe(bx, by, a, b)) {
          fallback = { x: bx, y: by };
          break fb;
        }
      }
    }
    if (!fallback) {
      throw new Error(
        `bendAroundNode(${a}, ${b}, avoid ${x}): no safe detour point found within search range`,
      );
    }
    const bendId = `${idPrefix}_bend`;
    nodeSpecs.push({
      id: bendId,
      name: `${xn.area}迂回路`,
      type: "normal",
      area: xn.area,
      x: fallback.x,
      y: fallback.y,
    });
    edgeSpecs.splice(idx, 1);
    edgeSpecs.push({
      from: a,
      to: bendId,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
    edgeSpecs.push({
      from: bendId,
      to: b,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
    return;
  }
  const id1 = `${idPrefix}_bend1`;
  const id2 = `${idPrefix}_bend2`;
  nodeSpecs.push({
    id: id1,
    name: `${xn.area}迂回路`,
    type: "normal",
    area: xn.area,
    x: notchFound.p1.x,
    y: notchFound.p1.y,
  });
  nodeSpecs.push({
    id: id2,
    name: `${xn.area}迂回路`,
    type: "normal",
    area: xn.area,
    x: notchFound.p2.x,
    y: notchFound.p2.y,
  });
  edgeSpecs.splice(idx, 1);
  edgeSpecs.push({
    from: a,
    to: id1,
    roadType: edge.roadType,
    requiresCardId: edge.requiresCardId,
  });
  edgeSpecs.push({
    from: id1,
    to: id2,
    roadType: edge.roadType,
    requiresCardId: edge.requiresCardId,
  });
  edgeSpecs.push({
    from: id2,
    to: b,
    roadType: edge.roadType,
    requiresCardId: edge.requiresCardId,
  });
}

bendAroundNode("hub_enoshima", "r_kg_en_bridge_2", "enlp_n", "bend01");
bendAroundNode("wp_inamuragasaki", "wp_inamuragasaki_park", "inlp_w", "bend02");
bendAroundNode("wp_tamura", "wp_tamura_kado", "tmlp_s", "bend03");
bendAroundNode("wp_rokkai", "r_sc_rk_4", "wp_rk_ofuna_bend1", "bend04");
bendAroundNode("r_fj_kg_1", "r_fj_kg_2", "fjrt_s", "bend05");
bendAroundNode("r_kg_ks_3", "wp_katase_kaigan", "ktlp_n", "bend06");
bendAroundNode("r_rk_fj_2", "r_rk_fj_3", "wp_fj_meiten_ent", "bend07");
bendAroundNode("r_rk_fj_3", "r_rk_fj_4", "fjrt_n", "bend08");
bendAroundNode("r_tm_hr_5", "wp_nakahara", "nklp_w", "bend09");
bendAroundNode("r_tm_hr_8", "r_tm_hr_9", "hrlp_n", "bend10");
bendAroundNode("fjrt_n", "wp_fj_meiten_ent", "r_rk_fj_3", "bend11");
bendAroundNode("fjrt_ne", "r_fj_ne_kitaguchi_1", "fjkt_s", "bend12");
bendAroundNode("tssp_s", "wp_ts_midori", "tsmd_n", "bend13");
bendAroundNode("enlp_s", "wp_en_chigo", "encg_n", "bend14");
bendAroundNode("wp_komachi3", "wp_komachi_oku", "kmclp_n", "bend16");
bendAroundNode(
  "wp_chigasaki_kaigan",
  "wp_chigasaki_kaigan_oku",
  "cgklp_n",
  "bend17",
);
bendAroundNode("wp_yuigahama", "wp_yuigahama_sat", "yuilp_ne", "bend18");
bendAroundNode("r_cg_ts_3", "r_cg_ts_4", "r_local_cg_ts_2", "bend19");
bendAroundNode("wp_kitakamakura", "r_of_kk_2", "kklp_w", "bend20");
bendAroundNode("r_local_cg_ts_2", "r_local_cg_ts_3", "r_cg_ts_4", "bend21");
bendAroundNode("r_in_km_1", "r_in_km_2", "kmlp_s", "bend22");
bendAroundNode("smrt_e", "wp_sm_residential", "smrt_ne", "bend23");
bendAroundNode("kklp_w", "kklp_nw", "r_sc_res_rokkai_join_2", "bend25");
bendAroundNode("kmlp_n", "r_km_n_onari_1", "r_kk_km_6", "bend26");
bendAroundNode("wp_kenchoji_ent", "r_kk_kenchoji_3", "kjlp_e", "bend27");
bendAroundNode("wp_onari_ent", "r_km_n_onari_1", "onlp_sw", "bend28");
bendAroundNode("kklp_ne", "kklp_e", "r_sc_res_rokkai_join_1", "bend29");
bendAroundNode("wp_koshigoe_sat", "r_ks_mesh_1", "kslp_s", "bend30");
bendAroundNode("r_local_cg_ts_1", "r_local_cg_ts_2", "r_cg_ts_3", "bend32");
bendAroundNode("hrlp_ne", "wp_hr_shop", "hrsp_sw", "bend33");
bendAroundNode("r_cg_ts_4", "r_cg_ts_5", "r_local_cg_ts_3", "bend34");
bendAroundNode("wp_en_candle", "r_enlp_candle_2", "encd_e", "bend35");
bendAroundNode("tslp_nw", "r_tslp_gate_tslp_nw_1", "r_cgmesh_col3_1", "bend36");
bendAroundNode("r_kg_cg_3", "r_kg_cg_4", "cglp_n", "bend37");
bendAroundNode("wp_ofuna_shop", "r_of_shop_1", "ofsp_s", "bend38");
bendAroundNode("r_kj_fj_6", "r_kj_fj_7", "fjrt_e", "bend39");
bendAroundNode("inlp_e", "wp_inamura_kaigan", "incl_nw", "bend40");
// 寒川ロータリーは半径27pxと全街区中もっとも小さく、迂回点を置く余地が
// ほぼ無い(どの方角にずらしてもロータリー自身の点か、寒川⇄湘南台の幹線と
// 交差してしまう)。避けるのではなく、素通りされていたsmrt_s自体を経由する
// 2区間に繋ぎ直す(=そこを実際のゲートにする)。
{
  const idx = edgeSpecs.findIndex(
    (e) =>
      (e.from === "hub_samukawa" && e.to === "wp_samukawa_kita") ||
      (e.from === "wp_samukawa_kita" && e.to === "hub_samukawa"),
  );
  if (idx === -1)
    throw new Error(
      "寒川ロータリー: hub_samukawa-wp_samukawa_kita の辺が見つかりません",
    );
  const orig = edgeSpecs[idx];
  edgeSpecs.splice(idx, 1);
  edgeSpecs.push({
    from: "hub_samukawa",
    to: "smrt_s",
    roadType: orig.roadType,
  });
  edgeSpecs.push({
    from: "smrt_s",
    to: "wp_samukawa_kita",
    roadType: orig.roadType,
  });
}
bendAroundNode("r_cg_ts_2", "r_cg_ts_3", "r_local_cg_ts_1", "bend42");
bendAroundNode("wp_fj_meiten_ent", "r_fj_n_meiten2_1", "r_rk_fj_2", "bend44");
bendAroundNode("tslp_w", "r_local_cg_ts_3", "r_cg_ts_5", "bend45");
bendAroundNode("hrsp_e", "wp_hr_sakura", "hrsk_w", "bend46");
bendAroundNode("wp_koshigoe_sat", "r_ks_sat_1", "kslp_n", "bend47");
bendAroundNode("r_kk_km_1", "r_kk_km_2", "kklp_sw", "bend49");
bendAroundNode("enlp_n", "r_enlp_candle_1", "enlp_nw", "bend50");
bendAroundNode(
  "r_cg_ne_mesh_1",
  "r_cg_ne_mesh_2",
  "r_short_cgts_kg_2",
  "bend51",
);
bendAroundNode(
  "wp_chigasaki_kaigan_oku",
  "r_ts_shop_cg_kaigan_4",
  "cgklp_ne",
  "bend52",
);
bendAroundNode("tslp_sw", "wp_ts_shop", "tssp_e", "bend53");
bendAroundNode("wp_ts_shop", "r_ts_shop_cg_kaigan_1", "tssp_sw", "bend54");
bendAroundNode("nklp_e", "wp_tamuragaoka", "tmgo_w", "bend55");
bendAroundNode(
  "r_sc_res_rokkai_h_6",
  "r_sc_res_rokkai_h_7",
  "r_sc_of_v_1",
  "bend56",
);
nudgeNode("r_scof_zengyo_1", 15, -15);

// 北側バイパス(香川⇄六会の裏道)⇄寒川⇄湘南台の1/3・2/3地点から出る近道(shortcut)との
// 素通り・交差の解消。バイパスの折れ点3・4・6は元の座標がこれらの道とほぼ同じ列に
// 乗っていたため、まず座標をずらして重なりを解消し(addJunction呼び出し側で対応)、
// それでも残る「1点だけ交差」をここでbendAroundNode/edgeSpliceThroughNodeで直す。
bendAroundNode("r_bypass_5_4", "r_bypass_5_5", "r_short_smsc_rk_2", "bend57");
bendAroundNode(
  "r_short_smsc_rk_1",
  "r_short_smsc_rk_2",
  "r_bypass_5_5",
  "bend58",
);

// ------------------------------------------------------------------
// 道の線同士が(マスとは無関係な)開けた場所で交差してしまっている箇所の解消
// (第1弾: ちょっとした座標の押し出しだけで直せたもの)。
// ------------------------------------------------------------------
nudgeNode("r_cg_ts_5", 61, 35);
nudgeNode("wp_tamuragaoka", 0, -50);
nudgeNode("wp_hr_sakura", 0, -50);
nudgeNode("wp_fj_higashiguchi", -35, -61);
nudgeNode("r_km_w_in_1", -49, 49);
nudgeNode("kklp_sw", -35, -35);
nudgeNode("wp_inamuragasaki_park", -13, -48);
nudgeNode("inlp_se", -25, -25);
nudgeNode("wp_komachi_oku", -13, -48);
nudgeNode("wp_yuigahama_sat", -35, -61);
nudgeNode("r_scof_zengyo_1", -35, -35);
nudgeNode("bend19_bend", -35, -61);

// ------------------------------------------------------------------
// 道の線同士が(マスとは無関係な)開けた場所で交差してしまっている箇所の解消
// (第2弾: 座標を押し出すだけでは直せなかったもの)。ほとんどが「半径20〜30px
// 程度の小さな輪・メッシュの1辺」対「その輪のすぐそばを通る迂回・裏道」という
// 組み合わせで、輪自体を動かす余地がほぼ無い。避けるのではなく、交差している
// 短い辺の方を、もう片方の道がすでに触れている点を経由する2区間に繋ぎ直す
// (=すれ違いをやめて、その点を実際のゲートにする)。
// ------------------------------------------------------------------
function edgeSpliceThroughNode(a: string, b: string, x: string) {
  const idx = edgeSpecs.findIndex(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  );
  if (idx === -1)
    throw new Error(`edgeSpliceThroughNode: no edge between "${a}" and "${b}"`);
  const orig = edgeSpecs[idx];
  edgeSpecs.splice(idx, 1);
  const hasEdge = (p: string, q: string) =>
    edgeSpecs.some(
      (e) => (e.from === p && e.to === q) || (e.from === q && e.to === p),
    );
  if (!hasEdge(a, x))
    edgeSpecs.push({
      from: a,
      to: x,
      roadType: orig.roadType,
      requiresCardId: orig.requiresCardId,
    });
  if (!hasEdge(x, b))
    edgeSpecs.push({
      from: x,
      to: b,
      roadType: orig.roadType,
      requiresCardId: orig.requiresCardId,
    });
}
edgeSpliceThroughNode("enlp_n", "enlp_ne", "bend01_bend");
edgeSpliceThroughNode(
  "r_sc_res_rokkai_join_4",
  "r_sc_res_rokkai_join_5",
  "wp_ofuna",
);
edgeSpliceThroughNode("wp_rokkai", "r_kg_rk_12", "r_fj_n_meiten2_2");
edgeSpliceThroughNode(
  "r_sc_res_rokkai_join_1",
  "r_sc_res_rokkai_join_2",
  "wp_kitakamakura",
);
edgeSpliceThroughNode("r_hr_cg_1", "r_hr_cg_2", "hrlp_e");
edgeSpliceThroughNode("r_hr_cg_6", "r_hr_cg_7", "cglp_w");
edgeSpliceThroughNode("r_cg_ts_1", "r_cg_ts_2", "cglp_e");
edgeSpliceThroughNode("r_cg_ts_4", "bend34_bend", "bend21_bend");
edgeSpliceThroughNode("tslp_sw", "r_tslp_ring5_1", "r_cg_ts_5");
edgeSpliceThroughNode("tslp_e", "r_tslp_ring1_1", "r_ts_fj_1");
edgeSpliceThroughNode("r_ts_fj_4", "r_ts_fj_5", "fjrt_w");
edgeSpliceThroughNode("fjrt_s", "r_fjrt_ring3_1", "bend05_bend");
edgeSpliceThroughNode("r_in_km_1", "bend22_bend", "kmlp_s");
edgeSpliceThroughNode("r_sc_res_rokkai_h_6", "bend56_bend", "r_sc_of_v_1");
edgeSpliceThroughNode("r_sc_of_v_4", "r_sc_of_v_5", "r_rk_ofuna_h1_6");
edgeSpliceThroughNode("cglp_n", "r_cglp_ring0_1", "bend37_bend");
edgeSpliceThroughNode("r_fj_n_meiten2_1", "bend44_bend", "r_rk_fj_2");
edgeSpliceThroughNode("r_rk_fj_3", "bend07_bend", "wp_fj_meiten_ent");
edgeSpliceThroughNode("fjrt_n", "r_fjrt_ring7_1", "bend08_bend");
edgeSpliceThroughNode("fjrt_n", "bend11_bend", "r_rk_fj_3");
edgeSpliceThroughNode("r_kk_kenchoji_2", "r_kk_kenchoji_3", "r_of_kj_2");
edgeSpliceThroughNode("r_kj_fj_6", "bend39_bend", "fjrt_e");
edgeSpliceThroughNode("r_of_kk_2", "bend20_bend", "kklp_w");
edgeSpliceThroughNode("r_kk_km_1", "bend49_bend", "kklp_s");
edgeSpliceThroughNode("r_km_n_onari_1", "bend26_bend", "r_kk_km_6");
edgeSpliceThroughNode("r_kk_km_6", "r_kk_km_7", "kmlp_n");
edgeSpliceThroughNode("hrlp_n", "r_hrlp_ring7_1", "bend10_bend");
edgeSpliceThroughNode("tmlp_s", "tmlp_sw", "bend03_bend");
edgeSpliceThroughNode("nklp_w", "nklp_nw", "bend09_bend");
edgeSpliceThroughNode("smrs_se", "smrs_s", "wp_sm_residential");
edgeSpliceThroughNode("fjkt_se", "fjkt_s", "bend12_bend");
edgeSpliceThroughNode("r_fj_mesh_exit_2", "r_fj_mesh_exit_3", "r_fj_sw_mesh_1");
edgeSpliceThroughNode("cgcyu_ne", "cgcyu_e", "wp_cg_chuo");
edgeSpliceThroughNode("cgsp_se", "cgsp_s", "wp_cg_shop");
edgeSpliceThroughNode("cgmesh_ne", "r_cgmesh_col3_1", "tslp_nw");
edgeSpliceThroughNode("cgmesh_s", "cgmesh_se", "tslp_w");
edgeSpliceThroughNode("r_cg_ne_mesh_1", "bend51_bend", "r_short_cgts_kg_2");
edgeSpliceThroughNode("tssp_e", "tssp_se", "bend53_bend");
edgeSpliceThroughNode("tssp_s", "tssp_sw", "bend54_bend");
edgeSpliceThroughNode("tsmd_n", "tsmd_ne", "bend13_bend");
edgeSpliceThroughNode("hrsp_s", "hrsp_sw", "bend33_bend");
edgeSpliceThroughNode("encd_e", "encd_se", "bend35_bend");
edgeSpliceThroughNode("encg_ne", "encg_e", "wp_en_chigo");
edgeSpliceThroughNode(
  "wp_sc_res_bend2",
  "r_sc_res_rokkai_join_1",
  "bend29_bend",
);
edgeSpliceThroughNode(
  "r_sc_res_rokkai_join_2",
  "r_sc_res_rokkai_join_3",
  "bend25_bend",
);
edgeSpliceThroughNode("onlp_se", "onlp_s", "wp_onari_ent");
edgeSpliceThroughNode("kjlp_e", "kjlp_se", "bend27_bend");
edgeSpliceThroughNode("incl_sw", "incl_w", "wp_inamura_kaigan");
edgeSpliceThroughNode("kslp_s", "kslp_sw", "bend30_bend");
edgeSpliceThroughNode("kslp_n", "kslp_nw", "wp_koshigoe_sat");
edgeSpliceThroughNode("cgklp_n", "cgklp_ne", "bend17_bend");
edgeSpliceThroughNode("cgklp_e", "cgklp_se", "wp_chigasaki_kaigan_oku");
edgeSpliceThroughNode("ktlp_n", "ktlp_nw", "bend06_bend");
edgeSpliceThroughNode("ofsp_se", "ofsp_s", "bend38_bend");
edgeSpliceThroughNode("r_bypass_3_1", "r_bypass_3_2", "r_sm_kg_2");
edgeSpliceThroughNode("r_bypass_4_1", "r_bypass_4_2", "r_short_smsc_kg_3");
edgeSpliceThroughNode("r_bypass_5_5", "r_bypass_5_6", "bend58_bend");

// ------------------------------------------------------------------
// 座標の微調整(第2弾): 上記の輪の半径調整・迂回追加に伴い、隣接する別の輪・
// 既存マスとごくわずか(数px)重なった箇所だけを最終座標で押し出す。
// ------------------------------------------------------------------
nudgeNode("smrt_n", 0, 1);
nudgeNode("smrt_ne", 0, 1);
nudgeNode("smrt_se", -4, -6);
nudgeNode("inlp_e", -4, 4);
nudgeNode("inlp_ne", -4, 0);
nudgeNode("incl_nw", -2, 2);
nudgeNode("incl_n", -2, 2);
nudgeNode("incl_ne", 2, 2);
nudgeNode("onlp_sw", 5, -3);
nudgeNode("onlp_nw", 1, 1);
nudgeNode("kslp_n", 1, 2);
nudgeNode("kslp_ne", 2, 2);
nudgeNode("yuilp_ne", -6, 6);
nudgeNode("smrt_s", -1, -2);
nudgeNode("smrt_sw", -2, -2);
nudgeNode("ktlp_ne", -2, 2);
nudgeNode("bend40_bend", -1, 4);

export function buildShonanFullMap(): {
  map: MapData;
  properties: PropertyDef[];
} {
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
      throw new Error(
        `shonan-full map: edge references unknown node (${edge.from} -> ${edge.to})`,
      );
    }
    from.connections.push({
      to: to.id,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
    to.connections.push({
      to: from.id,
      roadType: edge.roadType,
      requiresCardId: edge.requiresCardId,
    });
  }

  const nodes = Array.from(nodeMap.values());

  for (const node of nodes) {
    if (node.type === "property" && !node.propertyId) {
      throw new Error(
        `shonan-full map: property node "${node.id}" is missing propertyId`,
      );
    }
    if (node.connections.length === 0) {
      throw new Error(
        `shonan-full map: node "${node.id}" is isolated (no connections)`,
      );
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
