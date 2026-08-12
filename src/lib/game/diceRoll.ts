export interface DiceRollInput {
  /** 振るダイスの個数。急行系カード(multiDice)使用時のみ2以上。 */
  diceCount: number;
  /** 妨害系カード(halveDiceNextRoll)が発動中なら、その原因カード名。無ければnull。 */
  halveDebuff: { sourceCardName: string } | null;
  /** スピードアップ系カード(doubleMove)が予約されているか。 */
  pendingDoubleMove: boolean;
  /** 単体テスト用に乱数源を差し替えたいときだけ指定する。未指定時はMath.randomを使うため、
   *  既存のmapGraph.tsのrollDice()(1 + Math.floor(Math.random()*6))と全く同じ出目分布になる。 */
  random?: () => number;
}

export interface DiceRollResult {
  /** サイコロ1個ずつの出目(diceCountが1のときも要素数1の配列)。 */
  faces: number[];
  /** 全ダイスの合計値(修飾前)。 */
  rawSum: number;
  /** 半減デバフ適用後の値(デバフが無ければrawSumと同じ)。 */
  afterHalve: number;
  /** 倍化まで適用した最終移動マス数。remainingMovesにそのまま渡す値。 */
  result: number;
  /** ログ表示用の出目内訳("6+3+2+6+6=23" または単発なら"3")。 */
  rollDescription: string;
  /** ログ表示用の修飾説明(「カード名」の効果で半分の…→2倍で…等)。無ければ空文字。 */
  modifierSuffix: string;
}

/**
 * gameStore.tsのrollDice()に直接書かれていた、state更新を伴わない計算部分だけを
 * そのまま切り出した純関数。計算順序・丸め方は一切変更していない:
 *   1. diceCount個のダイスをそれぞれ振る(faces)
 *   2. 急行系(diceCount>1)でも必ず全ダイスの合計を先に出す(rawSum)
 *   3. 妨害系カード(halveDiceNextRoll)による半減を先に適用する(小数はMath.ceilで切り上げ)
 *   4. 自分で使った予約系カード(pendingDoubleMove)による倍化を最後に適用する
 * この順序(妨害→自分の予約効果)は意図的なもので、変更しない。
 */
export function resolveDiceRoll(input: DiceRollInput): DiceRollResult {
  const { diceCount, halveDebuff, pendingDoubleMove, random = Math.random } = input;
  const faces = Array.from({ length: diceCount }, () => 1 + Math.floor(random() * 6));
  const rawSum = faces.reduce((sum, face) => sum + face, 0);

  const afterHalve = halveDebuff ? Math.ceil(rawSum / 2) : rawSum;
  const result = pendingDoubleMove ? afterHalve * 2 : afterHalve;

  const rollDescription = diceCount > 1 ? `${faces.join("+")}=${rawSum}` : `${rawSum}`;
  const modifierParts: string[] = [];
  if (halveDebuff) modifierParts.push(`「${halveDebuff.sourceCardName}」の効果で半分の${afterHalve}マス`);
  if (pendingDoubleMove) modifierParts.push(`2倍で${result}マス`);
  const modifierSuffix = modifierParts.length > 0 ? ` (${modifierParts.join("→")})` : "";

  return { faces, rawSum, afterHalve, result, rollDescription, modifierSuffix };
}
