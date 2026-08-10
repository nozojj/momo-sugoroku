/**
 * 湘南すごろく ― コアの型定義
 *
 * マップは「マス(MapNode)」をノード、「道路(RoadEdge)」をエッジとするグラフとして持つ。
 * 見た目は自由に走れる道路に見せつつ、内部的には隣接ノードIDのリストで接続関係を表す。
 */

/** マスの種別 */
export type NodeType =
  | "normal" // 通常マス
  | "money" // お金増減マス(±混在の抽選。既存マスの互換のため残す)
  | "moneyGain" // 青マス: 止まると所持金が増える(常にプラス)
  | "moneyLoss" // 赤マス: 止まると所持金が減る(常にマイナス)
  | "card" // カード獲得マス
  | "property" // 物件購入スポット
  | "gasStation" // ガソリンスタンド(将来のガソリン制のための予約枠。MVPでは効果なし)
  | "warp" // ワープ地点(MVPでは未使用)
  | "event"; // 渋滞・工事などの特殊マス(将来、季節・地域限定イベントに拡張する土台)

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
  /** type: "property" のときに紐づく物件グループのid。同じグループidを複数のノードが共有してよく、
   *  そのグループに属する全PropertyDefがまとめて購入対象として一覧表示される。 */
  propertyGroupId?: string;
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
  | { kind: "coastline"; points: { x: number; y: number }[]; side: "south" }
  /** coastlineと同じ曲線塗りつぶしだが、砂浜の色で塗る。coastlineより手前(装飾配列で先)に
   * 置くことで、coastlineの海(青)が砂浜の南側を覆い、間の帯だけが砂浜として見える。 */
  | { kind: "beach"; points: { x: number; y: number }[] }
  /** 道路のない空白エリアを「何もない」ではなく「地形」として見せるための背景装飾。
   * forest=森、farmland=農地、hills=丘陵。parkBlobと同じ楕円形だが、種類ごとに
   * 色・質感を変える。道路配置には影響しない(空白を埋めるための地形であって、
   * 道路がこの上を通ってもよい/避けてもよい、あくまで背景)。 */
  | { kind: "terrain"; variant: "forest" | "farmland" | "hills"; cx: number; cy: number; rx: number; ry: number; rotation?: number };

/**
 * 建物の種類。マス(MapNode)とは完全に分離した見た目だけの分類で、
 * ゲームロジック(移動判定・停止判定・物件購入判定)には一切関与しない。
 */
export type BuildingType =
  | "station" // 駅舎
  | "restaurant" // 飲食店(レストラン・ラーメン屋・居酒屋など)
  | "shop" // 商店
  | "house" // 住宅系
  | "commercial" // 商業施設・ビル・大型店舗
  | "landmark" // 観光施設
  | "hotel" // ホテル・旅館
  | "generic"; // 分類不明時のデフォルト

/**
 * ノードごとの建物設定の「上書き」。1ノードにつき最大1件を想定する。
 * どのフィールドも省略可能で、省略した項目は自動推測(buildingStyle.tsのresolveBuildingForNode)
 * の既定値が使われる。つまりこのレコード自体が存在しなくても、対象ノード(物件/駅)には
 * 自動推測された建物が表示される。エディタはこのレコードの追加・変更・削除だけを行う。
 */
export interface BuildingOverride {
  /** 対応するマスのID。マス側はこのレコードの存在を一切知らない(一方向参照)。 */
  nodeId: string;
  /** 省略時は自動推測(物件のcategoryや駅かどうか)を使う */
  buildingType?: BuildingType;
  /** trueなら自動推測分も含めて建物を表示しない */
  hidden?: boolean;
  /** ノード座標からのオフセット(マップ座標系)。省略時は既定オフセット(ノードの少し上)。 */
  offsetX?: number;
  offsetY?: number;
  /** 表示倍率。省略時は1。 */
  scale?: number;
}

export interface MapData {
  id: string;
  name: string;
  nodes: MapNode[];
  /** ゲーム開始位置のノードID */
  startNodeId: string;
  /** 背景装飾(海・川・公園・街並みなど)。省略時は無装飾。 */
  decorations?: MapDecoration[];
  /** 建物の個別設定。省略した物件/駅ノードは自動推測された建物が表示される。 */
  buildingOverrides?: BuildingOverride[];
}

/**
 * 物件グループ(「物件エリア/物件駅」に相当)。1つの物件マス(MapNode.propertyGroupId)は
 * このグループを1つ指し、グループに属する全PropertyDefが購入対象として一覧表示される。
 * 複数の物件マスが同じグループを指してもよい(例: 藤沢駅前の複数マスすべてが同じ
 * 「藤沢駅前」グループを指し、どこに止まっても同じラインナップが出る)。
 */
export interface PropertyGroup {
  id: string;
  /** 購入画面の見出し・盤面表示に使う名前(例: "藤沢駅前") */
  name: string;
  /** 地域独占判定・季節連動などで使う都市単位のくくり(例: "藤沢") */
  region: string;
  /** 盤面タイルに表示するアイコン(絵文字)。省略時は種別ごとの既定アイコン。 */
  icon?: string;
  /** 盤面の建物見た目。省略時はグループ名からのキーワード自動推測。 */
  buildingType?: BuildingType;
}

/** 物件の定義(静的データ)。 */
export interface PropertyDef {
  id: string;
  name: string;
  category: string;
  price: number;
  /** 所有していると勝敗判定時に加算される資産価値(基本は price と同額)。 */
  assetValue: number;
  /** 所属する物件グループのid。物件の地域・立地はここを経由して決まる(PropertyDef自体はarea/regionを持たない)。 */
  groupId: string;
  /** 年間収益率(0.1 = 10%)。決算(3月)で price * revenueRate を基準額として使う。 */
  revenueRate: number;
  /** マス上に表示するアイコン(絵文字)。省略時は物件の標準アイコンを使う。 */
  icon?: string;
  /** 実在店舗・実在施設をモデルにしたランドマークか(架空物件と見た目を区別する)。 */
  isRealLandmark?: boolean;
  /** 明示的な建物タイプ上書き。省略時はcategory/nameからの自動推測。 */
  buildingType?: BuildingType;
}

/** 物件所有の3段階。通常所有 → グループ独占 → region独占の順に強い。 */
export type OwnershipTier = "normal" | "groupMonopoly" | "regionMonopoly";

/** 物件購入によって独占(グループ/地域)が今まさに達成された、という1回限りの通知情報。
 *  MonopolyToastが表示し、一定時間後にdismissMonopolyAchievement()でnullへ戻す。
 *  ゲームの勝敗・収益計算には一切関与しない、UI通知専用の一時的な状態。 */
export interface MonopolyAchievement {
  kind: "group" | "region";
  /** 表示名(kind:"group"なら物件グループ名、kind:"region"なら地域名) */
  name: string;
  /** PROPERTY_REVENUE_CONFIGの該当倍率をそのまま渡す(ここでは再計算しない) */
  multiplier: number;
}

/** カードの定義(静的データ)。 */
export type CardEffectType = "diceAgain" | "doubleMove";

/** 車の見た目モード。急行系カード(複数ダイス移動)使用時に一時的に切り替わる速さの段階。
 *  normalが通常状態で、それ以外はendTurn()完了時に必ずnormalへ戻る。 */
export type VehicleMode = "normal" | "expressLv1" | "expressLv2" | "expressLv3" | "expressLv4";

/** 複数のサイコロを振って移動するカードの効果。diceCountとvehicleModeの組み合わせを変えるだけで
 *  新しい急行系カードを追加できる(cardEffects.tsのmultiDiceハンドラは共通処理1つのみ)。 */
export interface MultiDiceEffect {
  type: "multiDice";
  /** 振るサイコロの個数(2〜) */
  diceCount: number;
  /** 使用中に一時的に切り替える車の見た目 */
  vehicleMode: VehicleMode;
}

/** カード効果。単純な効果(diceAgain/doubleMove)は文字列そのまま、パラメータを持つ効果は
 *  {type: "..."}形式のオブジェクトで表す(既存カードのeffectは無変更でこの型に収まる)。 */
export type CardEffect = CardEffectType | MultiDiceEffect;

/** カードのレア度。抽選重みは data/cards.ts の RARITY_WEIGHT で定義する。 */
export type CardRarity = "common" | "rare" | "superRare";

export interface CardDef {
  id: string;
  name: string;
  description: string;
  /** usable: 手札から使って即効果を発動するカード。key: 持っているだけで近道等の通行条件を満たすカード。 */
  kind: "usable" | "key";
  /** kind: "usable" のときのみ使用 */
  effect?: CardEffect;
  rarity: CardRarity;
  /** カード獲得演出・所持カード表示で使う絵文字アイコン。 */
  icon: string;
  /** カードマスの抽選対象にするか。省略時はtrue(裏道パスなど特別枠のカードのみfalseにする)。 */
  drawable?: boolean;
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
  /**
   * 今回のサイコロ移動で実際に通ったノードの履歴(移動開始地点を含む)。
   * rollDice() のたびにリセットされる。stepBack() はこの末尾をpopして1マス戻す。
   */
  moveHistory: string[];
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
  | "destinationArrived" // 目的地到着演出中(ボーナス表示・次の目的地提示の確認待ち)
  | "destinationFocus" // 次の目的地マスへカメラが移動し、強調表示している間(自動 or タップでスキップ)
  | "moneyRoulette" // プラス/マイナスマスのルーレット演出中(確定額表示・次へ待ち)
  | "cardDraw" // カードマスの抽選演出中(結果表示・自動で次へ)
  | "cardOverflow" // 所持上限到達につき、捨てるカードの選択待ち(自動進行しない)
  | "settlementIntro" // 決算導入演出中(CharacterAnnouncerが「○年目の決算です」を表示。盤面はまだ裏に見える)
  | "settlement" // 決算画面表示中(Board/HUD/Diceを完全にアンマウントしSettlementScreenのみ表示)
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

/** status: "destinationArrived" のときに表示する到着演出の内容。 */
export interface ArrivalInfo {
  playerId: string;
  playerName: string;
  playerColor: string;
  destinationName: string;
  bonus: number;
  nextDestinationName: string;
}

/** status: "moneyRoulette" のときに表示するルーレット演出の内容。
 *  amountは既に確定済みのゲームロジック上の結果、candidatesは演出用の見せかけの候補一覧。 */
export interface MoneyRouletteInfo {
  playerId: string;
  playerName: string;
  kind: "moneyGain" | "moneyLoss";
  nodeName: string;
  /** 確定した金額(符号付き) */
  amount: number;
  /** 演出用の候補一覧(符号付き)。amountを必ず含む。 */
  candidates: number[];
}

/** status: "cardDraw" のときに表示する抽選演出の内容。確定済みのcardIdを持つ(まだplayer.cardIdsには未反映)。 */
export interface CardDrawInfo {
  playerId: string;
  playerName: string;
  cardId: string;
}

/** status: "cardOverflow" のときに表示する、カード整理画面の内容。
 *  currentCardIdsのindexで「どの1枚を捨てるか」を指定できるようにし、同名カードの重複所持でも
 *  1枚単位で選べるようにする。 */
export interface CardOverflowInfo {
  playerId: string;
  playerName: string;
  /** 抽選前から所持していたカード(上限に達している状態のもの) */
  currentCardIds: string[];
  /** 今回引いた新カード */
  newCardId: string;
}

/** SettlementScreen/SettlementIntroAnnouncerが表示する、1プレイヤー分の決算結果。
 *  計算はすべてsrc/lib/game/settlement.tsのcalculateSettlement()で行い、ここには
 *  計算済みの値だけを積む(画面側はこの値を並べ替え・表示するだけで、お金は一切動かさない)。 */
export interface SettlementEntry {
  playerId: string;
  playerName: string;
  /** ランキング表示・資産推移グラフの線色に使う */
  playerColor: string;
  propertyBreakdown: {
    propertyId: string;
    propertyName: string;
    amount: number;
    /** 独占倍率の判定結果。旧セーブ(この項目追加前)には無いので必ずoptional。 */
    tier?: OwnershipTier;
    /** tierが"groupMonopoly"のとき、注記表示用の物件グループ名。 */
    groupName?: string;
    /** tierが"regionMonopoly"のとき、注記表示用の地域名。 */
    region?: string;
  }[];
  /** 今年度の物件収益(合計) */
  propertyRevenue: number;
  /** 現金(決算後、今年度の物件収益を反映済み) */
  cash: number;
  /** 所有物件総額(assetValueの合計) */
  propertyValue: number;
  /** 所有物件数 */
  propertyCount: number;
  /** 年度開始時点(前年決算直後、1年目はゲーム開始時)の総資産。
   *  今はUI表示していないが、netWorthAfterとの差分で「今年度の増減額」を出せるように保持している。 */
  netWorthBefore: number;
  /** 決算後の総資産 = cash + propertyValue */
  netWorthAfter: number;
  /** 今年度の総資産増減額 = netWorthAfter - netWorthBefore。将来「決算前→決算後」表示を追加する際に使う。 */
  netWorthDelta: number;
}

/** status: "settlementIntro"/"settlement" のときに表示する決算結果。プレイヤーごと・物件ごとの内訳を持つ。 */
export interface SettlementInfo {
  /** 決算が発生した年度(決算前の年) */
  year: number;
  /** この決算が規定年数の最終年度のものか。SettlementScreenのボタン文言("次の年度へ"/"結果を見る")の出し分けに使う。 */
  isFinalSettlement: boolean;
  entries: SettlementEntry[];
}

/** 年度ごとの総資産スナップショット(資産推移グラフ用)。決算のたびに1件ずつ積み上がる。 */
export interface NetWorthHistoryEntry {
  year: number;
  values: { playerId: string; netWorth: number }[];
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
  /** 直近のロールの内訳(サイコロ1個ずつの出目)。表示専用で、remainingMoves等の計算には使わない。
   *  常にdiceResult(合計値)と対になり、diceCountが1のときは要素数1の配列になる。 */
  diceFaces: number[] | null;
  /** 残り移動マス数(移動処理の途中経過) */
  remainingMoves: number;
  /** 次の移動でカードにより移動数が2倍になるフラグ */
  pendingDoubleMove: boolean;
  /** 次のrollDice()で振るサイコロの個数。既定1。multiDice系カード使用時のみ一時的に上書きされ、
   *  rollDice()で消費された時点で1に戻る。 */
  pendingDiceCount: number;
  /** 「もういちどサイコロ」カードにより、手番を渡さずもう一度振れるフラグ */
  extraRollGranted: boolean;
  /** 現在表示中の車の見た目モード(通常時null)。currentPlayerIndexの駒にのみ適用され、
   *  endTurn()完了時に必ずnullへ戻る。 */
  activeVehicleMode: VehicleMode | null;
  status: GameStatus;
  routeOptions: RouteOption[];
  /** purchaseOffer状態のときに提示している物件グループID(所属する全PropertyDefが購入対象) */
  pendingPropertyGroupId: string | null;
  /** 直近の購入で独占(グループ/地域)を達成した場合の通知。MonopolyToastが表示し終えたら
   *  dismissMonopolyAchievement()でnullに戻る。statusの遷移やターン進行には影響しない。 */
  monopolyAchievement: MonopolyAchievement | null;
  /** destinationArrived状態のときに表示する到着演出の内容 */
  arrivalInfo: ArrivalInfo | null;
  /** moneyRoulette状態のときに表示するルーレット演出の内容 */
  moneyRouletteInfo: MoneyRouletteInfo | null;
  /** cardDraw状態のときに表示する抽選演出の内容 */
  cardDrawInfo: CardDrawInfo | null;
  /** cardOverflow状態のときに表示するカード整理画面の内容 */
  cardOverflowInfo: CardOverflowInfo | null;
  /** settlementIntro/settlement状態のときに表示する決算結果 */
  settlementInfo: SettlementInfo | null;
  /** 年度ごとの総資産スナップショットの履歴(資産推移グラフ用)。決算のたびに1件追加される。 */
  netWorthHistory: NetWorthHistoryEntry[];
  log: LogEntry[];
  winnerIds: string[] | null;
}
