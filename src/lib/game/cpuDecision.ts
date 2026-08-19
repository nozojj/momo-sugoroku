import type {
  CardRarity,
  GameState,
  MapData,
  Player,
  RouteOption,
  TargetSelectInfo,
} from "@/types/game";
import { getCardDef } from "@/data/cards";
import { getPropertiesInGroup, propertyDefs } from "@/data/properties";
import { getPropertyOwner } from "@/lib/game/propertyOwnership";
import { netWorth } from "@/lib/game/engine";
import { shortestDistance } from "@/lib/game/mapGraph";

/**
 * CPU(自動操作プレイヤー)の「何をするか」を決める判断ロジックだけを集めたファイル。
 *
 * ここに置く関数は全て純粋関数(GameState等を読むだけで、setState等の副作用は一切持たない)で、
 * useGameStoreの各アクション(rollDice/chooseRoute/buyProperty/useCard/confirmTargetSelection/
 * resolveCardOverflow)は一切呼ばない。実際にアクションを呼ぶ「実行層」はuseCpuAutoplay.ts側の
 * 責務とし、判断(このファイル)と実行(フック側)を分離する。
 *
 * 難易度は今回1種類のみ(defaultCpuStrategy)。将来複数難易度を作る場合は、CpuStrategyを
 * 実装する別オブジェクトを追加し、呼び出し側(useCpuAutoplay.ts)が使う実装を差し替えるだけでよい
 * (呼び出し側のインターフェースは変えずに済む)。
 */

/** サイコロの出目・移動量そのものを予約する効果(doubleMove/multiDice)が既に予約されているか。
 *  gameStore.ts側のblockedByPendingDiceModifier()と同じ判定条件をここでも独立に持つ
 *  (gameStore.ts内のプライベート関数はモジュール外から参照できないため)。 */
function blockedByPendingDiceModifier(state: Pick<GameState, "pendingDoubleMove" | "pendingDiceCount">): boolean {
  return state.pendingDoubleMove || state.pendingDiceCount > 1;
}

function ownerIdOf(propertyId: string, players: Player[]): string | undefined {
  return getPropertyOwner(propertyId, players)?.id;
}

/** ロール前に使えるカードのうち、所持金に照らして「今すぐ投資に使えそうな物件が最低1件ある」か。 */
function hasAffordableUnownedProperty(player: Player, players: Player[]): boolean {
  const budget = player.money - CPU_MONEY_RESERVE;
  if (budget < 0) return false;
  return propertyDefs.some((def) => def.price <= budget && !ownerIdOf(def.id, players));
}

function findBestMultiDiceCard(cardIds: string[]): { id: string; diceCount: number } | null {
  let best: { id: string; diceCount: number } | null = null;
  for (const id of cardIds) {
    const def = getCardDef(id);
    if (!def?.effect || typeof def.effect !== "object" || def.effect.type !== "multiDice") continue;
    if (!best || def.effect.diceCount > best.diceCount) best = { id, diceCount: def.effect.diceCount };
  }
  return best;
}

export interface CpuPreRollContext {
  /** decidePreRoll()が実際に読むのはこの4項目だけ(GameState全体には依存しない)。 */
  state: Pick<GameState, "pendingDoubleMove" | "pendingDiceCount" | "players" | "destinationNodeId">;
  map: MapData;
  player: Player;
}

export type CpuPreRollDecision = { type: "useCard"; cardId: string } | { type: "roll" };

/** カード判断・分岐選択の判断で「目的地からどれだけ離れているか」を判定する目安のしきい値。
 *  これ以上離れているときだけ、行き先指定系カードを積極的に使う(近い時に無駄遣いしない)。
 *  station/region(選んだ場所へ確実に進める)専用のしきい値で、下記のnearby/anywhere
 *  (結果がランダムで外れる可能性があるカード)には流用しない。 */
const FAR_FROM_DESTINATION_THRESHOLD = 4;

/**
 * 地元ぶっとびカード(warp:nearby)・ぶっとびカード(warp:anywhere)専用のしきい値。
 * どちらも結果が完全にランダムで、目的地へ近づく保証が無い(anywhereはむしろ遠ざかる可能性すらある)
 * ため、FAR_FROM_DESTINATION_THRESHOLD(station/region用、確実に進めるカード用)とは別に、
 * 実マップ(shonan-full、598ノード×8目的地候補=4776ペア)の実測距離分布を基にそれぞれ設定する:
 *   中央値21・p75=31・p90=43・最大67、8目的地ごとの平均距離は18.1(藤沢)〜38.1(江の島)。
 * - nearby: distance>=20(全体の約55.6%が該当)。「そこそこ遠いときの、下振れが小さい賭け」。
 *   半径250px圏内という限定的な対象範囲(anywhereほど遠くへは飛ばない)なので、station/region
 *   より低いハードルで気軽に使ってよい。
 * - anywhere: distance>=40(全体の約13.5%が該当)。「かなり遠いときだけの最後の手段」。
 *   8目的地の平均距離の最大値(江の島38.1)を上回る水準にすることで、どの目的地であっても
 *   「anywhereで得られる期待距離より今の方が確実に悪い」と言える状況でしか発動しないようにする。
 * アクセスの良い目的地(藤沢等)ではほぼ発動せず、アクセスの悪い目的地(江の島等)でのみ
 * 実質的に機能する、という地理的な偏りは意図した挙動(行きにくい目的地ほど賭けに頼る)。
 */
const NEARBY_WARP_DISTANCE_THRESHOLD = 20;
const ANYWHERE_WARP_DISTANCE_THRESHOLD = 40;

/** CPUが物件購入・投資系カードに使ってよい所持金の下限(万円)。これを割り込む使い方はしない。 */
export const CPU_MONEY_RESERVE = 300;

function decidePreRoll({ state, map, player }: CpuPreRollContext): CpuPreRollDecision {
  const cardIds = player.cardIds;

  // 1. もういちどサイコロ: 使っても何も失わない(移動を消費しない)ので、持っていれば必ず使う。
  if (cardIds.includes("card_dice_again")) {
    return { type: "useCard", cardId: "card_dice_again" };
  }

  if (!blockedByPendingDiceModifier(state)) {
    // 2. 急行系カード(multiDice): 一度に進めるマス数が増えるほど目的地へ早く近づけるので、
    //    複数持っていれば一番強いものを使う。
    const bestMultiDice = findBestMultiDiceCard(cardIds);
    if (bestMultiDice) {
      return { type: "useCard", cardId: bestMultiDice.id };
    }

    // 3. スピードアップ(doubleMove): 急行系が無ければこちらを使う。
    if (cardIds.includes("card_double_move")) {
      return { type: "useCard", cardId: "card_double_move" };
    }

    // 4. 目的地ワープカード: 使えば目的地へ直行できるので無条件に使う。
    if (cardIds.includes("card_warp_destination")) {
      return { type: "useCard", cardId: "card_warp_destination" };
    }

    // 5. 妨害系カード(お休み/のろま): 手番そのものを消費するトレードオフがあるので、
    //    有効な対象(自分以外のプレイヤー)がいるときだけ使う。
    const rivalsExist = state.players.some((p) => p.id !== player.id);
    if (rivalsExist) {
      if (cardIds.includes("card_debuff_skip")) return { type: "useCard", cardId: "card_debuff_skip" };
      if (cardIds.includes("card_debuff_halve")) return { type: "useCard", cardId: "card_debuff_halve" };
    }

    // 6. 駅指定/エリア指定ワープカード: 目的地からかなり離れているときだけ使う
    //    (近いときは通常移動で十分なので温存する)。
    const distanceToDestination = shortestDistance(map, player.currentNodeId, state.destinationNodeId, cardIds);
    const isFar = distanceToDestination === null || distanceToDestination >= FAR_FROM_DESTINATION_THRESHOLD;
    if (isFar) {
      if (cardIds.includes("card_warp_select_station")) return { type: "useCard", cardId: "card_warp_select_station" };
      if (cardIds.includes("card_warp_select_region")) return { type: "useCard", cardId: "card_warp_select_region" };
    }

    // 6.5. 地元ぶっとびカード: 駅指定/エリア指定ほど確実ではない(結果がランダムな)賭けなので、
    //      より確実なそれらのカードを持っていない場合の代替として使う。
    const isFarEnoughForNearbyWarp =
      distanceToDestination === null || distanceToDestination >= NEARBY_WARP_DISTANCE_THRESHOLD;
    if (isFarEnoughForNearbyWarp && cardIds.includes("card_warp_nearby")) {
      return { type: "useCard", cardId: "card_warp_nearby" };
    }

    // 6.6. ぶっとびカード: マップ全体が対象で、目的地からさらに遠ざかる可能性すらある最大の賭け。
    //      地元ぶっとびカードより高いハードルを課し、「本当に手詰まりなときだけの最後の手段」にする。
    const isFarEnoughForAnywhereWarp =
      distanceToDestination === null || distanceToDestination >= ANYWHERE_WARP_DISTANCE_THRESHOLD;
    if (isFarEnoughForAnywhereWarp && cardIds.includes("card_warp_anywhere")) {
      return { type: "useCard", cardId: "card_warp_anywhere" };
    }

    // 7. 狙い撃ち物件ワープカード: 今すぐ買える未所有物件があるときだけ、投資目的で使う。
    if (cardIds.includes("card_warp_select_property_group") && hasAffordableUnownedProperty(player, state.players)) {
      return { type: "useCard", cardId: "card_warp_select_property_group" };
    }
  }

  return { type: "roll" };
}

export interface CpuRouteContext {
  map: MapData;
  destinationNodeId: string;
  routeOptions: RouteOption[];
  ownedCardIds: string[];
}

/** 分岐では、目的地までの最短距離が最も短くなる選択肢を選ぶ(gameStore.testHelpers.tsの
 *  pickOptionTowardDestination()と同じ考え方。あちらはテスト専用ヘルパーなので、CPUの実際の
 *  意思決定としてここに独立して持つ)。 */
function decideRoute({ map, destinationNodeId, routeOptions, ownedCardIds }: CpuRouteContext): string {
  let best = routeOptions[0];
  let bestDist = shortestDistance(map, best.nodeId, destinationNodeId, ownedCardIds) ?? Infinity;
  for (const opt of routeOptions.slice(1)) {
    const d = shortestDistance(map, opt.nodeId, destinationNodeId, ownedCardIds) ?? Infinity;
    if (d < bestDist) {
      best = opt;
      bestDist = d;
    }
  }
  return best.nodeId;
}

export interface CpuPurchaseContext {
  player: Player;
  players: Player[];
  groupId: string;
}

/** 物件購入マスで、どの物件を(何件)買うかを順番に決める。
 *  - グループ独占を1件で完成させられる場合は、価格に関わらずそれを優先して確保する。
 *  - それ以外は、CPU_MONEY_RESERVEを下回らない範囲で、安い物件から買えるだけ買う。
 *  戻り値は購入する順序どおりのpropertyId配列(空配列なら何も買わない)。 */
function decidePurchases({ player, players, groupId }: CpuPurchaseContext): string[] {
  const properties = getPropertiesInGroup(groupId);
  const ownedByOther = properties.filter((def) => {
    const owner = ownerIdOf(def.id, players);
    return owner !== undefined && owner !== player.id;
  });
  const unowned = properties.filter((def) => ownerIdOf(def.id, players) === undefined);
  if (unowned.length === 0) return [];

  let budget = player.money - CPU_MONEY_RESERVE;
  if (budget < 0) return [];

  const picks: string[] = [];
  let remaining = unowned;

  const monopolyAttainable = ownedByOther.length === 0;
  if (monopolyAttainable && remaining.length === 1 && remaining[0].price <= budget) {
    picks.push(remaining[0].id);
    budget -= remaining[0].price;
    remaining = [];
  }

  const cheapestFirst = [...remaining].sort((a, b) => a.price - b.price);
  for (const def of cheapestFirst) {
    if (def.price > budget) continue;
    picks.push(def.id);
    budget -= def.price;
  }
  return picks;
}

export interface CpuTargetSelectContext {
  map: MapData;
  player: Player;
  players: Player[];
  destinationNodeId: string;
  info: TargetSelectInfo;
}

export type CpuTargetSelectDecision = { type: "select"; optionId: string } | { type: "cancel" };

/** 対象選択画面(TargetSelectOverlay)での選択を決める。選択肢(info.options)は既存の
 *  TARGET_SELECT_HANDLERS(targetSelectEffects.ts)/listRivalPlayerOptions(debuffEffects.ts)が
 *  既にCPU自身を除外した状態で渡してくる(rivalPlayerは自分以外のプレイヤーのみ)ため、
 *  ここではその中から選ぶだけでよい。選択肢が0件(有効な対象がいない)ならキャンセルする。 */
function decideTargetSelect({ map, player, players, destinationNodeId, info }: CpuTargetSelectContext): CpuTargetSelectDecision {
  if (info.options.length === 0) return { type: "cancel" };

  if (info.selectKind === "rivalPlayer") {
    // 最も総資産が多い相手を狙う(単純だが分かりやすい優先度)。
    let best = info.options[0];
    let bestWorth = -Infinity;
    for (const opt of info.options) {
      const rival = players.find((p) => p.id === opt.optionId);
      const worth = rival ? netWorth(rival) : -Infinity;
      if (worth > bestWorth) {
        best = opt;
        bestWorth = worth;
      }
    }
    return { type: "select", optionId: best.optionId };
  }

  if (info.selectKind === "station" || info.selectKind === "region") {
    // optionIdはどちらも駅/地域中心のノードIDなので、目的地までの最短距離が最小のものを選ぶ。
    let best = info.options[0];
    let bestDist = shortestDistance(map, best.optionId, destinationNodeId, player.cardIds) ?? Infinity;
    for (const opt of info.options.slice(1)) {
      const d = shortestDistance(map, opt.optionId, destinationNodeId, player.cardIds) ?? Infinity;
      if (d < bestDist) {
        best = opt;
        bestDist = d;
      }
    }
    return { type: "select", optionId: best.optionId };
  }

  // propertyGroup: 今すぐ買える(未所有・予算内の)物件を含むグループを優先する。
  const budget = player.money - CPU_MONEY_RESERVE;
  let best = info.options[0];
  let bestPrice = Infinity;
  for (const opt of info.options) {
    const cheapestAffordable = getPropertiesInGroup(opt.optionId)
      .filter((def) => ownerIdOf(def.id, players) === undefined && def.price <= budget)
      .sort((a, b) => a.price - b.price)[0];
    if (cheapestAffordable && cheapestAffordable.price < bestPrice) {
      best = opt;
      bestPrice = cheapestAffordable.price;
    }
  }
  return { type: "select", optionId: best.optionId };
}

export interface CpuOverflowContext {
  currentCardIds: string[];
  newCardId: string;
}

export type CpuOverflowDecision = { discard: "newCard" } | { discard: "existing"; index: number };

const RARITY_RANK: Record<CardRarity, number> = { common: 0, rare: 1, superRare: 2 };

/** 手札overflow時、新しく引いたカードのレア度が既存の最弱カード以下なら見送り、
 *  上回るなら既存の最弱カード(先頭から見て最初に見つかったもの)と入れ替える。 */
function decideCardOverflow({ currentCardIds, newCardId }: CpuOverflowContext): CpuOverflowDecision {
  const newDef = getCardDef(newCardId);
  const newRank = newDef ? RARITY_RANK[newDef.rarity] : 0;

  let weakestIndex = -1;
  let weakestRank = Infinity;
  currentCardIds.forEach((id, i) => {
    const def = getCardDef(id);
    const rank = def ? RARITY_RANK[def.rarity] : 0;
    if (rank < weakestRank) {
      weakestRank = rank;
      weakestIndex = i;
    }
  });

  if (weakestIndex === -1 || newRank <= weakestRank) {
    return { discard: "newCard" };
  }
  return { discard: "existing", index: weakestIndex };
}

/** CPUの判断ロジック一式。将来別の難易度を追加する場合は、この形を実装する別オブジェクトを
 *  作り、useCpuAutoplay.ts側で使う実装を差し替えるだけでよい(呼び出し側のシグネチャは不変)。 */
export interface CpuStrategy {
  decidePreRoll: (ctx: CpuPreRollContext) => CpuPreRollDecision;
  decideRoute: (ctx: CpuRouteContext) => string;
  decidePurchases: (ctx: CpuPurchaseContext) => string[];
  decideTargetSelect: (ctx: CpuTargetSelectContext) => CpuTargetSelectDecision;
  decideCardOverflow: (ctx: CpuOverflowContext) => CpuOverflowDecision;
}

export const defaultCpuStrategy: CpuStrategy = {
  decidePreRoll,
  decideRoute,
  decidePurchases,
  decideTargetSelect,
  decideCardOverflow,
};
