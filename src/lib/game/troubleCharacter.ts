import type {
  ActiveDebuff,
  MapData,
  Player,
  TroubleCharacterFormDef,
  TroubleCharacterFormId,
  TroubleCharacterMischiefDef,
  TroubleCharacterMischiefOutcome,
  TroubleCharacterMischiefSeverity,
  TroubleCharacterTransformStep,
} from "@/types/game";
import { shortestDistance } from "@/lib/game/mapGraph";
import { makeDebuffId } from "@/lib/game/engine";
import { troubleCharacterFormDefs } from "@/data/troubleCharacterForms";
import { getPropertyDef } from "@/data/properties";
import { getCardDef } from "@/data/cards";

/**
 * 妨害キャラ(仮称)まわりの判定・計算だけを集めた純関数ファイル。gameStore.ts本体
 * (get()/set())には一切依存しない。destinationArrival.tsと同じ役割分担: 「何が起きるか」を
 * ここで決め、実際にstateへ反映するのはgameStore.ts側の薄いラッパー。
 *
 * MVPでは仮名称のまま("妨害キャラ")。正式なキャラクター名・演出は別フェーズで扱う。
 */

/** ActiveDebuff.sourcePlayerId/sourceCardNameに使う、妨害キャラ由来であることを示す仮の値。
 *  実在プレイヤーIDと衝突しない固定文字列(既存プレイヤーIDは常に"p1"/"p2"...の形)。 */
export const TROUBLE_CHARACTER_SOURCE_ID = "troubleCharacter";
export const TROUBLE_CHARACTER_SOURCE_NAME = "妨害キャラ";

/** 既知の妨害キャラ形態idの一覧(S-3dで"sake"、S-3eで"seagullKing"を追加)。新しい形態を
 *  追加するときはここに1件足すだけでよく、isTroubleCharacterFormId()の呼び出し側
 *  (persistMigration.ts等)は変更不要。 */
const TROUBLE_CHARACTER_FORM_IDS: TroubleCharacterFormId[] = ["normal", "sake", "seagullKing"];

/** 値が既知の妨害キャラ形態idかどうかを判定する型ガード。旧セーブ(このフィールド追加前、
 *  値がundefined)や、将来形態を削除/リネームした場合に消えたidが残っているケースを、
 *  呼び出し側(persistMigration.ts)が安全にfalse判定してフォールバックできるようにする。 */
export function isTroubleCharacterFormId(value: unknown): value is TroubleCharacterFormId {
  return typeof value === "string" && (TROUBLE_CHARACTER_FORM_IDS as string[]).includes(value);
}

/**
 * formIdに対応するTroubleCharacterFormDef(data/troubleCharacterForms.ts)を取得する。
 * S-3b時点ではtroubleCharacterFormDefsに"normal"の1件しか無いため、有効なformIdを渡す限り
 * 必ず見つかる想定だが、getCardDef/getYearEventDefと同じ「見つからなければundefined」規約に
 * 揃え、呼び出し側(gameStore.ts)がフォールバックを選べるようにしておく。
 */
export function getTroubleCharacterFormDef(formId: TroubleCharacterFormId): TroubleCharacterFormDef | undefined {
  return troubleCharacterFormDefs.find((f) => f.id === formId);
}

/**
 * formIdが「これ以上の進化先を持たない最終形態」かどうかを判定する(Polish Phase P1 S-3f-3で
 * TroubleCharacterAnnounceModal.tsxから切り出し)。判定基準はdecideTroubleCharacterTransform()と
 * 同じく「transformフィールドの有無」のみで、"seagullKing"のような具体的なformId文字列には
 * 一切依存しない。将来さらに形態を追加してもこの関数の呼び出し側(演出テーマ・SE選択)は
 * 変更不要になる。formIdが未知(理論上到達しない)の場合もtrue側にfail-closeし、見つからない
 * 形態を「まだ先がある」と誤判定して演出を弱めにしないようにする。
 */
export function isFinalTroubleCharacterForm(formId: TroubleCharacterFormId): boolean {
  return !getTroubleCharacterFormDef(formId)?.transform;
}

/** 初登場時・handoff成功時に必ず戻る基準(通常)形態のid。gameStore.ts側でリテラル"normal"を
 *  複数箇所に直書きしないための共有定数(意味は同じだが、書き間違い防止のため1箇所にまとめる)。 */
export const TROUBLE_CHARACTER_BASE_FORM_ID: TroubleCharacterFormId = "normal";

/** severity判定でmoney系(money/moneyNearby/propertyLossのfallback)を"heavy"とみなす、
 *  実損失合計(万円、符号付き)のしきい値(Polish Phase P1 S-3f-5)。実データ(data/troubleCharacter
 *  Mischief*.ts)との整合: normal/sakeのmoney/moneyNearby(所有者本人-50/-30万円)はいずれも
 *  この閾値を上回らずlight/medium扱いのまま、seagullKingのmoney(-150万円)・propertyLossの
 *  fallbackAmount(-100万円、所有物件0件のため代替適用される場合)はちょうど閾値を満たしheavy
 *  になる。moneyNearbyは「所有者本人+実際に巻き込まれた人数分」の合計で判定するため、
 *  定義上nearbyAmountが存在するだけで誰も巻き込まれていない回はheavyにならない
 *  (judgeMischiefSeverity()参照)。 */
export const TROUBLE_CHARACTER_MISCHIEF_HEAVY_MONEY_THRESHOLD = -100;

/** cardDestroyで「複数枚失った」とみなす、実際に破壊された枚数のしきい値(Polish Phase
 *  P1 S-3f-5)。0枚(破壊対象が無く実害なし)はlight、1枚はmedium、2枚以上でheavyになる。 */
const HEAVY_CARD_DESTROY_MIN_DESTROYED_COUNT = 2;

/**
 * mischiefの演出強度を、applyTroubleCharacterMischief()が実際に確定させた結果
 * (TroubleCharacterMischiefOutcome)だけから判定する純関数(Polish Phase P1 S-3f-5)。
 * mischief定義(kind)やformId・"seagullKing"のような形態名には一切依存しない。「カモメ魔王
 * だから派手にする」ではなく「実際に起きた被害の大きさ」だけを見る、という要件をこの関数
 * だけで保証する。
 *
 * - money: 実際に適用された金額がTROUBLE_CHARACTER_MISCHIEF_HEAVY_MONEY_THRESHOLD以下ならheavy、
 *   そうでなければlight。
 * - moneyNearby: 所有者本人+実際に巻き込まれた全員の被害を合算した値で判定する(medium/heavy)。
 *   巻き込み0人の回は所有者本人の被害額だけで判定されるため、nearbyAmountが定義上存在する
 *   だけではheavyにならない。
 * - propertyLoss: 実際に物件を失った(lost:true)場合は常にheavy(取り返しのつかない資産損失、
 *   金額換算しない)。物件0件のためfallbackAmountが適用された(lost:false)場合は、実際に
 *   発生したのは「ただの金銭被害」なのでmoneyと同じ閾値で判定する(定義上のkindが
 *   "propertyLoss"であることだけでheavy扱いにはしない)。
 * - cardDestroy: 実際に破壊された枚数がHEAVY_CARD_DESTROY_MIN_DESTROYED_COUNT以上ならheavy、
 *   1枚ならmedium、0枚(実害なし)ならlight。定義上のmaxCountではなく、実際に破壊された
 *   destroyed配列の長さだけを見る。
 * - debuff: 金額・件数による被害規模を持たないため常にlight(S-3f-5では演出差を付けない)。
 */
export function judgeMischiefSeverity(outcome: TroubleCharacterMischiefOutcome): TroubleCharacterMischiefSeverity {
  switch (outcome.kind) {
    case "money":
      return outcome.amount <= TROUBLE_CHARACTER_MISCHIEF_HEAVY_MONEY_THRESHOLD ? "heavy" : "light";
    case "moneyNearby": {
      const total = outcome.ownerAmount + outcome.nearby.reduce((sum, r) => sum + r.amount, 0);
      return total <= TROUBLE_CHARACTER_MISCHIEF_HEAVY_MONEY_THRESHOLD ? "heavy" : "medium";
    }
    case "propertyLoss":
      if (outcome.lost) return "heavy";
      return outcome.fallbackAmount <= TROUBLE_CHARACTER_MISCHIEF_HEAVY_MONEY_THRESHOLD ? "heavy" : "light";
    case "cardDestroy":
      if (outcome.destroyed.length >= HEAVY_CARD_DESTROY_MIN_DESTROYED_COUNT) return "heavy";
      return outcome.destroyed.length === 1 ? "medium" : "light";
    case "debuff":
      return "light";
  }
}

export interface TroubleCharacterMischiefAnnounceHighlight {
  /** money/moneyNearbyの実被害額、またはpropertyLossがfallback(money代替)になった場合の
   *  実被害額。TroubleCharacterAnnounceInfo.highlightAmountへそのまま渡す。 */
  amount?: number;
  /** propertyLoss(実際に物件を失った場合)・cardDestroy(heavy、複数枚破壊時)の実結果を
   *  表す短いテキスト。TroubleCharacterAnnounceInfo.highlightTextへそのまま渡す。 */
  text?: string;
}

/**
 * TroubleCharacterAnnounceInfo(kind:"mischief")のhighlightAmount/highlightTextへ渡す値を、
 * 実際の適用結果(outcome)とseverityだけから導出する(Polish Phase P1 S-3f-5、S-3f-4の
 * mischiefHighlightAmount()を置き換え)。ここでも呼び出し側(gameStore.ts)でも被害内容の
 * 再計算はしない。
 *
 * money/moneyNearbyは severity に関わらず既存通り所有者本人の実額をamountとして返す
 * (S-3f-4のLIGHT/MEDIUM演出を1つも変えない)。moneyNearbyの巻き込み対象(nearby)は、
 * このアナウンス自体が所有者本人向けの通知であるため含めない(S-3f-4から変更なし)。
 *
 * propertyLoss/cardDestroyは、severityが"heavy"のときだけhighlightを追加する
 * (S-3f-4時点でこの2種にhighlightが一切無かった状態を、light/mediumでは変えないため)。
 * propertyLossが実際に物件を失っていればtextで物件名を、物件0件のためfallbackAmountが
 * 適用されていればamountで実際の金額被害を返す(「物件を失った」とは表示しない = 実際の
 * 結果と一致させる)。cardDestroyは実際に破壊されたdestroyed配列の枚数をtextへそのまま使う
 * (定義上のmaxCountではなく実結果)。
 *
 * debuffは金額・テキストのどちらも持たないため常に{}を返す(S-3f-4から変更なし)。
 */
export function deriveMischiefAnnounceHighlight(
  outcome: TroubleCharacterMischiefOutcome,
  severity: TroubleCharacterMischiefSeverity,
): TroubleCharacterMischiefAnnounceHighlight {
  if (outcome.kind === "money") return { amount: outcome.amount };
  if (outcome.kind === "moneyNearby") return { amount: outcome.ownerAmount };
  if (severity !== "heavy") return {};
  if (outcome.kind === "propertyLoss") {
    return outcome.lost ? { text: `${outcome.propertyName}を失った!` } : { amount: outcome.fallbackAmount };
  }
  if (outcome.kind === "cardDestroy") return { text: `カードを${outcome.destroyed.length}枚失った!` };
  return {};
}

/**
 * 変身確率の段階表(TroubleCharacterTransformRule.probabilitySteps、atCount昇順を想定)から、
 * 現在の憑依カウントに該当する確率を求める(S-3c)。countが最初の段階のatCountに満たない間は
 * 0(抽選対象外)、最後の段階のatCount以上になった後はその段階の確率(通常は1=pity相当の上限)を
 * 使い続ける。戻り値は念のため0〜1にクランプする(データ側の入力ミスで確率が範囲外でも
 * 呼び出し元がクラッシュしない)。
 */
function resolveTransformProbability(steps: TroubleCharacterTransformStep[], count: number): number {
  let probability = 0;
  for (const step of steps) {
    if (count >= step.atCount) probability = step.probability;
  }
  return Math.min(1, Math.max(0, probability));
}

export interface TroubleCharacterTransformDecisionInput {
  /** 現在の形態の定義。transformが無ければこの形態を進化の終点として扱う。 */
  formDef: TroubleCharacterFormDef;
  /** 現在の形態で、所有者が実際に悪さを受けた回数。 */
  possessionCount: number;
  /** 変身判定を行う時点のゲームturn(暦月カウンタ、advanceToNextTurn()で既に繰り上げ済みの値)。 */
  currentTurn: number;
  /** ゲーム全体のturn数。 */
  totalTurns: number;
  /** 呼び出し側が注入する乱数値(0以上1未満を想定)。drawTroubleCharacterMischief()等の既存
   *  draw系関数と異なり、この関数自体はMath.random()を呼ばない。呼び出し側(gameStore.ts)が
   *  「変身対象になり得る形態のときだけMath.random()を消費する」という制御をできるようにし、
   *  かつテストからrandom値を直接注入できるようにするため。 */
  random: number;
}

export type TroubleCharacterTransformDecision =
  | { transformed: false }
  | { transformed: true; nextFormId: TroubleCharacterFormId };

/**
 * 現在の形態(formDef)から次の形態へ変身するかどうかを判定する純関数(S-3c)。
 *
 * formDef.transformが無い(進化の終点、現状のseagullKing想定)場合は常に{transformed:false}を
 * 返す。
 *
 * minProgressRatio指定時はfail-closed(設定ミスで強い形態を誤って解禁しない)方針を取る:
 * - minProgressRatio自体が`Number.isFinite(minProgressRatio) && 0 <= minProgressRatio <= 1`を
 *   満たさない(負数・1超・NaN・±Infinity)場合、その時点で無条件に{transformed:false}を返す
 *   (「終盤限定の強い形態」に設定ミスで負数が入っても、序盤から解禁されることはない)。
 * - totalTurnsが0以下の異常値の場合も、minProgressRatioが指定されている限り無条件に
 *   {transformed:false}を返す(進行度を計算できない=安全側でまだ未達扱いにする)。
 * - 上記のどちらにも該当しない、通常の0〜1のratio指定であれば、currentTurn/totalTurnsの
 *   進行割合がその値未満の間は{transformed:false}を返す。
 *
 * いずれのケースも例外は投げない。
 */
export function decideTroubleCharacterTransform(
  input: TroubleCharacterTransformDecisionInput,
): TroubleCharacterTransformDecision {
  const { formDef, possessionCount, currentTurn, totalTurns, random } = input;
  const rule = formDef.transform;
  if (!rule) return { transformed: false };

  if (rule.minProgressRatio !== undefined) {
    const ratio = rule.minProgressRatio;
    const isValidRatio = Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;
    if (!isValidRatio) return { transformed: false }; // fail-closed: 設定ミスは常に未解禁扱い
    if (totalTurns <= 0) return { transformed: false }; // 進行度を計算できない=常に未達扱い

    const progressRatio = currentTurn / totalTurns;
    if (!(progressRatio >= ratio)) return { transformed: false };
  }

  const probability = resolveTransformProbability(rule.probabilitySteps, possessionCount);
  if (random < probability) {
    return { transformed: true, nextFormId: rule.targetFormId };
  }
  return { transformed: false };
}

/**
 * ゲーム最初の目的地到着時、新しく決定された次の目的地(destinationNodeId)から最も遠い
 * プレイヤーを初回所有者として選ぶ。距離は既存のshortestDistance()をそのまま使う
 * (目的地抽選ロジック・distanceの計算方法自体には一切手を入れない)。
 * 同距離(タイ)の場合はその中からランダムに1人選ぶ(pickRandomDestinationと同じMath.random()方式)。
 * 全員が目的地へ到達不能(理論上ほぼ発生しない)の場合は、距離をInfinity扱いにして
 * 「最も遠い」の判定から除外しない(到達不能=最も遠いとみなす)。
 */
export function pickInitialTroubleCharacterOwner(map: MapData, players: Player[], destinationNodeId: string): string {
  const distances = players.map((p) => ({
    id: p.id,
    distance: shortestDistance(map, p.currentNodeId, destinationNodeId, p.cardIds) ?? Infinity,
  }));
  const maxDistance = Math.max(...distances.map((d) => d.distance));
  const farthest = distances.filter((d) => d.distance === maxDistance);
  const picked = farthest[Math.floor(Math.random() * farthest.length)];
  return picked.id;
}

export type TroubleCharacterHandoffResult =
  | { handedOff: false }
  | { handedOff: true; newOwnerId: string; fromPlayerId: string; toPlayerId: string };

/**
 * 着地(exact landing)が確定したプレイヤー(mover)の位置に、現在の妨害キャラ所有者が既にいれば
 * moverへ所有者を移す。通過は判定しない(moveHistoryは見ない、finishLandingAndEndTurn()の
 * 「最終停止時のみ呼ばれる」という既存の呼び出しタイミングに乗るだけで実現する)。
 * 所有者が未登場(null)、moverが既に所有者本人、所有者がmoverと別マスにいる場合はhandedOff:falseを返す。
 */
export function checkTroubleCharacterHandoff(
  troubleCharacterOwnerId: string | null,
  mover: Player,
  players: Player[],
): TroubleCharacterHandoffResult {
  if (troubleCharacterOwnerId === null || troubleCharacterOwnerId === mover.id) return { handedOff: false };
  const owner = players.find((p) => p.id === troubleCharacterOwnerId);
  if (!owner || owner.currentNodeId !== mover.currentNodeId) return { handedOff: false };
  return { handedOff: true, newOwnerId: mover.id, fromPlayerId: owner.id, toPlayerId: mover.id };
}

/**
 * troubleCharacterMischiefDefsから、weight(合計100慣習)に基づく重み付きランダム抽選を行う。
 * drawYearEvent()(yearEvent.ts)と全く同じ式。悪さの追加・確率調整はデータ側(weight)だけで
 * 完結し、ここのロジックには手を入れなくてよい。
 */
export function drawTroubleCharacterMischief(pool: TroubleCharacterMischiefDef[]): TroubleCharacterMischiefDef {
  const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * totalWeight;
  for (const mischief of pool) {
    r -= mischief.weight;
    if (r < 0) return mischief;
  }
  return pool[pool.length - 1];
}

export interface TroubleCharacterMischiefApplication {
  players: Player[];
  logMessage: string;
  /** 実際に適用された結果の構造化データ(Polish Phase P1 S-3f-5)。judgeMischiefSeverity()/
   *  deriveMischiefAnnounceHighlight()の入力になる。 */
  outcome: TroubleCharacterMischiefOutcome;
}

/** 「周囲巻き込み」mischief(kind: "moneyNearby")が対象とみなす、所有者からのグラフ距離
 *  (edge数)の上限(S-3d)。mapGraph.tsのshortestDistance()はshortestPath()がBFSで求めた
 *  ノード列の長さ-1を返すため、返り値は正確に最短経路のedge数と一致する(座標上の距離や
 *  ワープカードのNEARBY_WARP_RADIUS[coordinate半径]とは別の指標)。0=所有者と同じマス、
 *  1=隣接1マスまでを対象とする。 */
export const TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE = 1;

/**
 * 所有者からTROUBLE_CHARACTER_NEARBY_MAX_DISTANCE以内(所有者自身は除く)にいるプレイヤーの
 * idを求める。距離は所有者のcardIds基準で計算する(所有者の立ち位置から見た到達可能性。
 * ぶっとびカードのnearbyスコープ判定等と同じ「起点側のcardIdsで測る」考え方)。距離が
 * 計算できない(到達不能、null)プレイヤーは対象に含めない。
 */
function findNearbyPlayerIds(map: MapData, owner: Player, players: Player[]): string[] {
  return players
    .filter((p) => p.id !== owner.id)
    .filter((p) => {
      const distance = shortestDistance(map, owner.currentNodeId, p.currentNodeId, owner.cardIds);
      return distance !== null && distance <= TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE;
    })
    .map((p) => p.id);
}

/**
 * 配列から重複無くランダムにcount件選ぶ(Fisher-Yatesの部分シャッフルと同じ考え方: 毎回
 * 残りの候補からランダムに1件抜き出し、候補から除いてから次を選ぶ。`sort(() => Math.random()
 * - 0.5)`のような偏りのある擬似シャッフルは使わない)。countが配列長以上なら全件を
 * (順序をシャッフルして)返す。cardDestroy種別(S-3e)の「最大N枚をランダムに壊す」で使う。
 */
export function pickRandomDistinct<T>(items: T[], count: number): T[] {
  // fail-closed(S-3e QA): countが有限な正の整数でなければ0件として扱う。この正規化が無いと
  // 例えば count=2.5 のとき「for (i=0; i<2.5; i++)」がi=0,1,2の3回走ってしまい
  // (Math.min(2.5, pool.length)がそのままループ上限になり、整数比較の副作用で切り上げ相当の
  // 挙動になる)、意図しない大量削除につながる。NaN/±Infinity/負数は既存のMath.min+ループ
  // 条件だけでも安全に0件へ収束するが、非整数(小数)はこの明示的なガードが無いと収束しない
  // ため、正規化を先に行う。items.lengthを超える値はMath.minでitems.lengthへclampする
  // (この部分は元から安全に動作していたため挙動を変えない)。
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  const pool = [...items];
  const picked: T[] = [];
  const take = Math.min(safeCount, pool.length);
  for (let i = 0; i < take; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/**
 * 抽選済みの悪さ(mischief)を所有者(ownerId)へ適用する。money種別は既存のmoney加減算と
 * 同じ形でその場でplayer.moneyを増減し、debuff種別は既存のActiveDebuff/DebuffKindの形で
 * そのまま所有者自身へ付与する(新しいDebuffKindは増やさない)。moneyNearby種別(S-3d)は
 * 所有者本人へownerAmount、findNearbyPlayerIds()で求めた巻き込み対象へ1人ずつnearbyAmountを
 * 同時に適用する。propertyLoss種別(S-3e)は所有物件からランダムに1件選びownedPropertyIdsから
 * 除去する(未所有へ戻すだけで、他プレイヤーへは移らない)。所有物件が無い場合のみ
 * fallbackAmountをmoneyと同じ形で適用する。cardDestroy種別(S-3e)は所持カードのうち
 * excludeKeyCardsがtrueならCardDef.kind==="key"のカード(裏道パス等)を除いた候補から、
 * pickRandomDistinct()でmaxCount枚(所持数がそれ未満なら持っている分だけ)をランダムに選び
 * cardIdsから除去する。所持金がマイナスになることは既存ルール(moneyRoulette等)と同様に
 * 許容する(フロア処理はしない)。
 *
 * mapはmoneyNearby種別の巻き込み対象を求めるためだけに使う(他の種別では未使用)。
 * 呼び出し側を単純に保つため、常に必須の引数にしている(既存のCpuPreRollContext等、
 * 一部の分岐でしか使わないフィールドも含めて丸ごと渡す既存パターンと同じ考え方)。
 */
export function applyTroubleCharacterMischief(
  players: Player[],
  ownerId: string,
  mischief: TroubleCharacterMischiefDef,
  map: MapData,
): TroubleCharacterMischiefApplication {
  const owner = players.find((p) => p.id === ownerId);
  const ownerName = owner?.name ?? "";

  if (mischief.kind === "money") {
    const updated = players.map((p) => (p.id === ownerId ? { ...p, money: p.money + mischief.amount } : p));
    return {
      players: updated,
      logMessage: `${ownerName}さん: ${mischief.message}(${mischief.amount}万円)`,
      outcome: { kind: "money", amount: mischief.amount },
    };
  }

  if (mischief.kind === "moneyNearby") {
    const nearbyIds = owner ? findNearbyPlayerIds(map, owner, players) : [];
    const updated = players.map((p) => {
      if (p.id === ownerId) return { ...p, money: p.money + mischief.ownerAmount };
      if (nearbyIds.includes(p.id)) return { ...p, money: p.money + mischief.nearbyAmount };
      return p;
    });
    const nearbyPlayers = players.filter((p) => nearbyIds.includes(p.id));
    const nearbyPart =
      nearbyPlayers.length > 0
        ? `巻き添えで${nearbyPlayers.map((p) => p.name).join("・")}さんも${mischief.nearbyAmount}万円`
        : "幸い巻き添えは出なかった";
    return {
      players: updated,
      logMessage: `${ownerName}さん: ${mischief.message}(${mischief.ownerAmount}万円、${nearbyPart})`,
      outcome: {
        kind: "moneyNearby",
        ownerAmount: mischief.ownerAmount,
        nearby: nearbyPlayers.map((p) => ({ playerId: p.id, playerName: p.name, amount: mischief.nearbyAmount })),
      },
    };
  }

  if (mischief.kind === "propertyLoss") {
    const ownedPropertyIds = owner?.ownedPropertyIds ?? [];
    if (ownedPropertyIds.length === 0) {
      const updated = players.map((p) => (p.id === ownerId ? { ...p, money: p.money + mischief.fallbackAmount } : p));
      return {
        players: updated,
        logMessage: `${ownerName}さん: ${mischief.message}(所有物件が無かったため${mischief.fallbackAmount}万円の被害に切り替わった)`,
        outcome: { kind: "propertyLoss", lost: false, fallbackAmount: mischief.fallbackAmount },
      };
    }
    const lostPropertyId = ownedPropertyIds[Math.floor(Math.random() * ownedPropertyIds.length)];
    const propertyName = getPropertyDef(lostPropertyId)?.name ?? lostPropertyId;
    const updated = players.map((p) =>
      p.id === ownerId ? { ...p, ownedPropertyIds: p.ownedPropertyIds.filter((id) => id !== lostPropertyId) } : p,
    );
    return {
      players: updated,
      logMessage: `${ownerName}さん: ${mischief.message}(${propertyName}が未所有に戻った)`,
      outcome: { kind: "propertyLoss", lost: true, propertyId: lostPropertyId, propertyName },
    };
  }

  if (mischief.kind === "cardDestroy") {
    const ownedCardIds = owner?.cardIds ?? [];
    // resolveCardOverflow()と同じ「id文字列ではなくindexで特定する」考え方。同名カードを
    // 複数所持している場合でも、選ばれたスロットだけを正しく破壊できるようにするため。
    const destroyableSlots = ownedCardIds
      .map((cardId, index) => ({ cardId, index }))
      .filter(({ cardId }) => !mischief.excludeKeyCards || getCardDef(cardId)?.kind !== "key");

    if (destroyableSlots.length === 0) {
      return {
        players,
        logMessage: `${ownerName}さん: ${mischief.message}(壊せるカードが無く実害は無かった)`,
        outcome: { kind: "cardDestroy", destroyed: [] },
      };
    }

    const destroyedSlots = pickRandomDistinct(destroyableSlots, mischief.maxCount);
    const destroyedIndexSet = new Set(destroyedSlots.map((s) => s.index));
    const destroyed = destroyedSlots.map((s) => ({ cardId: s.cardId, cardName: getCardDef(s.cardId)?.name ?? s.cardId }));

    const updated = players.map((p) =>
      p.id === ownerId ? { ...p, cardIds: p.cardIds.filter((_, i) => !destroyedIndexSet.has(i)) } : p,
    );
    return {
      players: updated,
      logMessage: `${ownerName}さん: ${mischief.message}(${destroyed.map((d) => d.cardName).join("・")}を失った)`,
      outcome: { kind: "cardDestroy", destroyed },
    };
  }

  const debuff: ActiveDebuff = {
    id: makeDebuffId(),
    kind: mischief.debuffKind,
    sourcePlayerId: TROUBLE_CHARACTER_SOURCE_ID,
    sourceCardName: TROUBLE_CHARACTER_SOURCE_NAME,
  };
  const updated = players.map((p) => (p.id === ownerId ? { ...p, activeDebuffs: [...p.activeDebuffs, debuff] } : p));
  return {
    players: updated,
    logMessage: `${ownerName}さん: ${mischief.message}`,
    outcome: { kind: "debuff", debuffKind: mischief.debuffKind },
  };
}
