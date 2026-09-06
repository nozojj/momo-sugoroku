/**
 * Polish Phase 3b: 「発進→巡航→到着前減速」の移動テンポを計算する純関数群。
 * ゲームstate(gameStore.ts)・DOM・Reactのいずれにも依存しない。ゲームルール・移動先決定
 * ロジック(mapGraph.ts/playerMovement.ts等)には一切関与せず、GameScreen.tsxが
 * 「次の1マスの移動にどれだけ時間をかけて見せるか」を決めるためだけに呼び出す。
 *
 * 呼び出し側(GameScreen.tsx)の責務:
 *   - totalSteps: 今回のロールの合計移動マス数(rollDice()直後のremainingMovesを
 *     useMoveTotalSteps.tsで1回だけキャプチャした値)。diceResult(サイコロの見た目の目)は
 *     doubleMove等の修飾で実際の移動マス数とズレることがあるため使わない。
 *   - remainingMoves: 現在のgameStore.remainingMoves(これから進もうとしている1マスを
 *     含めた残りマス数)。
 * stepIndex(=totalSteps - remainingMoves、今回のロールの何マス目か、0始まり)は
 * この2つから導出できるため、別途保持する必要はない。
 */

export interface StepTempoInput {
  /** 今回のロールの合計移動マス数。分岐(selectingRoute)をまたいでも不変。 */
  totalSteps: number;
  /** これから進もうとしている1マスを含めた残りマス数(gameStore.remainingMoves)。 */
  remainingMoves: number;
}

/** 発進(このロールの最初の1マス、totalSteps>2のときだけ)。既存の固定460msより
 *  やや長めにして「動き出し」の実感を作る。 */
export const DEPART_MS = 500;
/** 巡航(発進・到着前減速のどちらにも該当しない中間区間)。既存の固定460msより
 *  明確に短くして、長距離移動の「待たされる」感覚を緩和する。 */
export const CRUISE_MS = 300;
/** 到着前減速(残り2マスのうち、最後から2マス目)。 */
export const ARRIVAL_SECOND_LAST_MS = 400;
/** 到着前減速(残り2マスのうち、最後の1マス)。着地が分かる程度に既存の460msより
 *  やや長めにする。 */
export const ARRIVAL_LAST_MS = 520;

/** getStepAnimationMs()の入力が不正(NaN/負数/非整数等)な場合の安全側フォールバック値。
 *  ARRIVAL_LAST_MSと同じ「急がせない」値にしておくことで、万一不正値が渡っても
 *  極端に速い/遅い/意味不明な間隔にはならない。 */
const FALLBACK_MS = ARRIVAL_LAST_MS;

function toSafeNonNegativeInt(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  return truncated < 0 ? null : truncated;
}

/**
 * 次の1マスの移動(GameScreen.tsxのsetTimeout delay)にかける時間(ms)を返す。
 * 優先順位は「1. ARRIVAL(残り2マス以内) → 2. DEPART(このロールの最初の1マス) →
 * 3. CRUISE(それ以外)」の順。ARRIVALを最優先にすることで、totalSteps<=2の短距離移動は
 * 自動的に「終始ゆっくり」になり、DEPART/CRUISE用の特別分岐を追加する必要が無い
 * (出目1→ARRIVAL_LAST_MSのみ、出目2→ARRIVAL_SECOND_LAST_MS→ARRIVAL_LAST_MS)。
 *
 * remainingMoves<=0(=このマス自体には進まず、resolveLanding()を呼ぶためだけの
 * 最終tick)はこの関数の対象外。GameScreen.tsx側で別の固定値(LANDING_TICK_MS)を
 * 使うことで、「移動する1マス」と「着地処理を呼ぶだけのtick」を混同しない設計にしている。
 *
 * 入力が不正(NaN/負数/非整数)な場合はクラッシュさせず、FALLBACK_MS(=ARRIVAL_LAST_MSと
 * 同じ、急がせない値)を返す。
 */
export function getStepAnimationMs({ totalSteps, remainingMoves }: StepTempoInput): number {
  const safeRemaining = toSafeNonNegativeInt(remainingMoves);
  if (safeRemaining === null) return FALLBACK_MS;

  const safeTotalRaw = toSafeNonNegativeInt(totalSteps);
  // totalStepsが不正、またはremainingMovesより小さい(理論上到達しないはずの不整合値)場合は
  // remainingMovesを下限としてクランプする(stepIndexが負にならないようにする安全策)。
  const safeTotal = safeTotalRaw === null ? safeRemaining : Math.max(safeTotalRaw, safeRemaining);

  // 1. ARRIVAL: 残り2マス以内。totalSteps<=2の移動は常にここで完結する。
  if (safeRemaining <= 1) return ARRIVAL_LAST_MS;
  if (safeRemaining === 2) return ARRIVAL_SECOND_LAST_MS;

  // 2. DEPART: このロールの最初の1マス(ARRIVALに該当しない場合のみ、=totalSteps>2)。
  const stepIndex = safeTotal - safeRemaining;
  if (stepIndex <= 0) return DEPART_MS;

  // 3. CRUISE: それ以外の中間区間。
  return CRUISE_MS;
}

/** CarToken/Board cameraのtransition durationとGameScreenのstep interval(setTimeout delay)を
 *  完全に同じ値にすると、前のtransitionが終わるか終わらないかのタイミングで次の位置更新が
 *  来てしまい、「各マスへの到達感」が失われる(常に動き続けているように見える)。
 *  そのため、実際のtransition durationはstep intervalよりこの分だけ短くする
 *  (=次のstepまでの間に短い静止の余白を残す)。 */
export const STEP_TRANSITION_BUFFER_MS = 30;
/** transition durationの下限。将来CRUISE_MS等を短縮しても、bufferの引き算だけで
 *  極端に短い/0以下のtransitionになることを防ぐ安全弁。 */
export const MIN_STEP_TRANSITION_MS = 160;

/**
 * getStepAnimationMs()が返したstep interval(ms)から、CarToken/Board cameraへ渡す
 * transition duration(ms)を導出する。stepIntervalMsが不正(NaN等)な場合は
 * MIN_STEP_TRANSITION_MSを返す(移動が止まって見えるほうが、transition:0msで
 * ワープするより安全なため)。
 */
export function getStepTransitionMs(stepIntervalMs: number): number {
  if (!Number.isFinite(stepIntervalMs)) return MIN_STEP_TRANSITION_MS;
  return Math.max(MIN_STEP_TRANSITION_MS, stepIntervalMs - STEP_TRANSITION_BUFFER_MS);
}
