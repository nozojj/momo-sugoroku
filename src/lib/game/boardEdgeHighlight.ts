/**
 * 盤面の道路(edge)ハイライト判定(Phase6)。
 *
 * Board.tsxのedges.map(道路描画)がedgeキー("from|toをsortしたもの")の集合に対して
 * Set.has()するだけで済むよう、「今どのedgeを強調すべきか」を座標やGameStateから独立した
 * 純関数として切り出す。ゲームロジック(rollDice/advanceStep/chooseRoute/stepBack)は
 * 一切参照しない・変更しない(読み取り専用の表示計算)。
 */

/** 2ノード間のedgeキー。道路描画側(Board.tsx)の重複排除キーと同じ形式("from|to"をsort)。 */
export function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** RouteChoiceOverlayに渡すRouteOptionのうち、edgeキー計算に必要な最小限の形。 */
export interface SelectableRouteOption {
  nodeId: string;
}

/**
 * P6-1: 現在地から選択可能な次マスへ続くedgeのキー集合。
 * routeOptionsだけから導出する(=既存のisSelectableIdsと全く同じ情報源)ため、
 * 「戻る」選択肢(stepBackで使うbackNodeId)はここに含まれない。戻る先の表示は
 * 下記のbackEdgeKey()が別途担当し、前進候補(このSet、アンバー)より控えめな
 * 表現にする(P7-3、優先順位: 前進候補 > 戻る候補)。
 * routeOptionsが空(分岐中でない)ならcurrentNodeIdの値に関わらず空集合を返す。
 */
export function selectableEdgeKeys(currentNodeId: string | undefined, routeOptions: SelectableRouteOption[]): Set<string> {
  const keys = new Set<string>();
  if (!currentNodeId || routeOptions.length === 0) return keys;
  for (const option of routeOptions) {
    keys.add(edgeKey(currentNodeId, option.nodeId));
  }
  return keys;
}

/** P6-3: 直前トレイルとして残すedgeの最大本数。「1〜数本程度」の上限。 */
export const TRAIL_MAX_SEGMENTS = 2;

/**
 * P6-3: 直前に通過したedgeのキー集合。Player.moveHistory(今回のロールで通った
 * nodeId列、rollDice()のたびに[現在地]へリセットされる既存フィールド)をそのまま
 * 読むだけで、moveHistory自体の意味・保存タイミング・他のロジック(セーブ/CPU/
 * 移動禁止判定等)には一切影響しない。末尾からmaxSegments本ぶんのedgeだけを返すため、
 * 呼び出し側が「移動が進むたびに古いedgeは自然に集合から外れる」形で短時間表示を実現できる
 * (タイマーやタイムスタンプを持たない)。
 */
export function recentTrailEdgeKeys(moveHistory: string[], maxSegments: number = TRAIL_MAX_SEGMENTS): Set<string> {
  const keys = new Set<string>();
  const n = moveHistory.length;
  const start = Math.max(0, n - 1 - maxSegments);
  for (let i = start; i < n - 1; i++) {
    keys.add(edgeKey(moveHistory[i], moveHistory[i + 1]));
  }
  return keys;
}

/**
 * P7-3: 「戻る」候補(現在地→backNodeId)のedgeキー。stepBack()が対象にするノードと
 * 完全に同じ条件(moveHistory末尾2件)から独立に算出する。値としては
 * recentTrailEdgeKeys()が返す集合の末尾セグメントと常に一致する(戻り先=直前に
 * 通った道)が、TRAIL_MAX_SEGMENTSの値に依存させたくない(将来トレイルの本数設定を
 * 変えても「戻る」表示だけは壊れてほしくない)ため、あえて別関数として切り出している。
 * 呼び出し側は戻り値をtrail集合へ合流させ、同じ見た目(静的・控えめ)で描画する
 * (「戻る」専用の新しい派手な装飾は作らない、という方針)。
 * currentNodeId・backNodeIdのどちらかが無ければnullを返す。
 */
export function backEdgeKey(currentNodeId: string | undefined, backNodeId: string | null | undefined): string | null {
  if (!currentNodeId || !backNodeId) return null;
  return edgeKey(currentNodeId, backNodeId);
}
