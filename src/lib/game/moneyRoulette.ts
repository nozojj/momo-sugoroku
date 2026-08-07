import { MONTHLY_GAIN_BASE, MONTHLY_LOSS_BASE, MONEY_INFLATION_RATE_PER_YEAR } from "@/data/moneySeasonality";

export type MoneyRouletteKind = "moneyGain" | "moneyLoss";

const CANDIDATE_COUNT = 5;
/** 基準額に対する候補額のばらつき幅(倍率)。 */
const VARIANCE_MIN = 0.6;
const VARIANCE_MAX = 1.4;

/** 10万円未満を切り捨てる(例: 487万円→480万円)。 */
export function floorToTen(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

/**
 * その月・その年数における基準額(万円、常に正の大きさ)を返す。
 * 年数によるインフレはプラス・マイナスどちらにも同じ倍率で効く。
 */
export function seasonalBaseAmount(kind: MoneyRouletteKind, month: number, year: number): number {
  const table = kind === "moneyGain" ? MONTHLY_GAIN_BASE : MONTHLY_LOSS_BASE;
  const monthlyBase = table[month] ?? table[4];
  const inflation = Math.pow(1 + MONEY_INFLATION_RATE_PER_YEAR, Math.max(0, year - 1));
  return monthlyBase * inflation;
}

/** 基準額から、ばらつきを持たせた候補額(万円、正の大きさ・10万円単位)を複数生成する。 */
export function generateRouletteCandidates(baseAmount: number): number[] {
  const candidates: number[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const factor = VARIANCE_MIN + Math.random() * (VARIANCE_MAX - VARIANCE_MIN);
    candidates.push(Math.max(10, floorToTen(baseAmount * factor)));
  }
  return candidates;
}

/** 候補の中から実際の結果を1つ選ぶ(ゲームロジック上の確定値。演出には関与しない)。 */
export function drawRouletteResult(candidates: number[]): number {
  return candidates[Math.floor(Math.random() * candidates.length)];
}
