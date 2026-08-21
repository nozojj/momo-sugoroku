/**
 * 盤面のマス名ラベルの間引き(Phase5)。
 *
 * normal/movement帯では駅(主要8駅・目的地候補)と物件のマス名を表示するが、
 * 藤沢ロータリー・鎌倉小路・江の島参道のように道が密集する区画では、隣接ノードの
 * ラベルが物理的に重なって読めなくなる箇所があった(Phase5 Proposal参照)。
 *
 * ここではノード座標だけから「どのラベルを残すか」を決定的に計算する純関数を提供する。
 * - 優先度0(駅・目的地候補)は常に表示する(絶対に間引かない)。
 * - 優先度1以降(物件など)は、優先度昇順→id昇順のソート順で貪欲に採用し、
 *   すでに採用済みのラベルとLABEL_DECLUTTER_MIN_DIST未満に近いものだけを間引く。
 * ソート基準が入力配列の並び順に依存しないため、呼び出し側の描画順(map.nodesの並び)や
 * Reactの再レンダリングが変わっても、同じノード座標・同じ優先度なら常に同じ結果になる。
 */

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  /** 0が最優先(常に表示・間引き対象外)。値が大きいほど間引かれやすい。 */
  priority: number;
}

/** ラベル同士が重なって読めなくなると判断する最小距離(ゲーム座標単位、ノード中心間)。
 *  日本語4〜6文字程度のマス名(fontSize 10.5〜11.5)が並んだときに重なり始める距離を
 *  実データ(Phase5 Proposalの近接ラベル調査、藤沢ロータリー・鎌倉小路等で30〜49px)から
 *  実用的な閾値として採用した。ノード自体の最小間隔(mapBuilder.tsのMIN_NODE_DIST=24)より
 *  広いため、隣接ノードすべてが即座に間引かれることはない。 */
export const LABEL_DECLUTTER_MIN_DIST = 50;

/**
 * ラベル候補から、実際に表示するラベルのノードID集合を決定する。
 * 優先度0(駅・目的地候補)は互いに競合しても間引かない。優先度1以降は、
 * 優先度→id の順で安定ソートしてから貪欲法で採用/間引きを決めるため、
 * candidatesの入力順やReactの再レンダリングタイミングに一切依存しない。
 */
export function resolveVisibleLabelIds(
  candidates: LabelCandidate[],
  minDist: number = LABEL_DECLUTTER_MIN_DIST,
): Set<string> {
  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const accepted: { x: number; y: number }[] = [];
  const visible = new Set<string>();

  for (const candidate of sorted) {
    if (candidate.priority === 0) {
      accepted.push(candidate);
      visible.add(candidate.id);
      continue;
    }
    const collides = accepted.some((a) => Math.hypot(a.x - candidate.x, a.y - candidate.y) < minDist);
    if (!collides) {
      accepted.push(candidate);
      visible.add(candidate.id);
    }
  }

  return visible;
}
