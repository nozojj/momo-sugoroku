/**
 * 湘南すごろく ― コアの型定義
 *
 * マップは「マス(MapNode)」をノード、「道路(RoadEdge)」をエッジとするグラフとして持つ。
 * 見た目は自由に走れる道路に見せつつ、内部的には隣接ノードIDのリストで接続関係を表す。
 */

/** マスの種別 */
export type NodeType =
  | "normal" // 通常マス
  | "money" // お金増減マス
  | "card" // カード獲得マス
  | "property" // 物件購入スポット
  | "gasStation" // ガソリンスタンド(将来のガソリン制のための予約枠。MVPでは効果なし)
  | "warp" // ワープ地点(MVPでは未使用)
  | "event"; // 渋滞・工事などの特殊マス

/** 道路の種類。ルート選択の見た目・演出に使う。 */
export type RoadType =
  | "national" // 国道(467号・134号など、地図上でひときわ太く強調する幹線)
  | "main" // 幹線道路
  | "coastal" // 海沿いルート(イベントが起きやすい)
  | "residential" // 住宅街ルート(安全)
  | "shortcut"; // 近道(カードが必要な場合がある)

/** ノードから伸びる道路(エッジ)。 */
export interface RoadEdge {
  /** 接続先ノードID */
  to: string;
  /** 道路の種類(演出・将来の渋滞判定に使用) */
  roadType: RoadType;
  /** この道を通るのに必要なカードID(近道など)。未指定なら誰でも通行可能。 */
  requiresCardId?: string;
}

/** マップ上の1マス。 */
export interface MapNode {
  id: string;
  name: string;
  type: NodeType;
  /** SVG描画用の座標(ボード座標系)。 */
  x: number;
  y: number;
  /** このマスから進める道路一覧。双方向路は両端のノードにそれぞれ定義する。 */
  connections: RoadEdge[];
  /** type: "property" のときの物件定義ID */
  propertyId?: string;
  /** 目的地の抽選対象になり得るか */
  isDestinationCandidate?: boolean;
  /** マップ上の地区名(表示・演出用) */
  area?: string;
  /** 藤沢駅など、盤面上ひときわ大きく描画する主要ハブか */
  isMajorHub?: boolean;
}

/** マップ背景の装飾要素(道路・マスとは独立した見た目だけの飾り)。 */
export type MapDecoration =
  | { kind: "river"; points: { x: number; y: number }[] }
  | { kind: "parkBlob"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "texture"; variant: "houses" | "city"; x: number; y: number; width: number; height: number }
  | { kind: "sea"; edge: "bottom" | "right"; pos: number }
  /** 点列を滑らかにつないだ曲線の海岸線。曲線の外側(pointsの並び順に対してside側)を海として塗る。
   * 道路自体には影響しない見た目だけの背景装飾(道路は縦横グリッドのまま)。 */
  | { kind: "coastline"; points: { x: number; y: number }[]; side: "south" };

export interface MapData {
  id: string;
  name: string;
  nodes: MapNode[];
  /** ゲーム開始位置のノードID */
  startNodeId: string;
  /** 背景装飾(海・川・公園・街並みなど)。省略時は無装飾。 */
  decorations?: MapDecoration[];
}

/** 物件の定義(静的データ)。 */
export interface PropertyDef {
  id: string;
  name: string;
  category: string;
  price: number;
  /** 所有していると勝敗判定時に加算される資産価値(基本は price と同額)。 */
  assetValue: number;
  area: string;
  /** マス上に表示するアイコン(絵文字)。省略時は物件の標準アイコンを使う。 */
  icon?: string;
  /** 実在店舗をモデルにしたランドマークか(架空物件と見た目を区別する)。 */
  isRealLandmark?: boolean;
}

/** カードの定義(静的データ)。 */
export type CardEffectType = "diceAgain" | "doubleMove";

export interface CardDef {
  id: string;
  name: string;
  description: string;
  /** usable: 手札から使って即効果を発動するカード。key: 持っているだけで近道等の通行条件を満たすカード。 */
  kind: "usable" | "key";
  /** kind: "usable" のときのみ使用 */
  effect?: CardEffectType;
}

/** お金増減マスで発生しうる事象。 */
export interface MoneyEventDef {
  id: string;
  message: string;
  amount: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  /** プレイヤーパネル表示用の車アイコン(絵文字)。MVPでは見た目の差別化程度の意味。 */
  carIcon: string;
  currentNodeId: string;
  previousNodeId: string | null;
  money: number;
  ownedPropertyIds: string[];
  cardIds: string[];
  /** 現在の目的地に一番乗りしたことがあるか(このゲームで) */
  destinationsReached: number;
}

/** ゲーム全体のステータス(状態遷移)。 */
export type GameStatus =
  | "waiting" // ゲーム開始前
  | "rolling" // サイコロを振れる/振っている
  | "selectingRoute" // 分岐地点でルート選択待ち
  | "moving" // マスからマスへ移動アニメーション中
  | "resolvingEvent" // マスの効果を解決中(お金/カード/物件購入確認など)
  | "purchaseOffer" // 物件購入の確認待ち
  | "finished"; // ゲーム終了

/** 分岐地点で選べる進行先候補。 */
export interface RouteOption {
  nodeId: string;
  nodeName: string;
  roadType: RoadType;
  /** MVPではカード未所持の近道は候補から除外されるので常にtrueだが、UI表示用に残す。 */
  available: boolean;
}

export interface LogEntry {
  id: string;
  turn: number;
  message: string;
}

export interface GameState {
  mapId: string;
  players: Player[];
  currentPlayerIndex: number;
  turn: number;
  /** 何ターックで終了するか(規定ターン終了後、総資産が最も多いプレイヤーの勝ち) */
  totalTurns: number;
  destinationNodeId: string;
  diceResult: number | null;
  /** 残り移動マス数(移動処理の途中経過) */
  remainingMoves: number;
  /** 次の移動でカードにより移動数が2倍になるフラグ */
  pendingDoubleMove: boolean;
  /** 「もういちどサイコロ」カードにより、手番を渡さずもう一度振れるフラグ */
  extraRollGranted: boolean;
  status: GameStatus;
  routeOptions: RouteOption[];
  /** purchaseOffer状態のときに提示している物件ID */
  pendingPropertyId: string | null;
  log: LogEntry[];
  winnerIds: string[] | null;
}
