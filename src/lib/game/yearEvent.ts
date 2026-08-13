import type { PropertyGenre, YearEventDef } from "@/types/game";
import { yearEventDefs } from "@/data/yearEvents";

/**
 * yearEventDefsのweightに基づいた重み付きランダム抽選。cardDraw.tsのdrawWeightedCard()と
 * 同じ形。イベント追加・確率調整はデータ側(yearEventDefsのweight)だけで完結し、
 * ここのロジックには手を入れなくてよい。
 */
export function drawYearEvent(pool: YearEventDef[] = yearEventDefs): YearEventDef {
  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const event of pool) {
    r -= event.weight;
    if (r < 0) return event;
  }
  return pool[pool.length - 1];
}

/** idからYearEventDefを引く。旧セーブが指す未知のid・省略時はundefinedを返す
 *  (呼び出し側はyearEventGenreMultiplier()経由で「補正なし」に安全にフォールバックできる)。 */
export function getYearEventDef(id: string | undefined): YearEventDef | undefined {
  return yearEventDefs.find((e) => e.id === id);
}

/** 指定ジャンルへの決算収益倍率。eventがundefined、またはそのジャンルの指定が無ければ1
 *  (補正なし)を返す。旧セーブ・平年・対象外ジャンルのすべてがこの1本のフォールバックで
 *  安全に処理できる。 */
export function yearEventGenreMultiplier(event: YearEventDef | undefined, genre: PropertyGenre): number {
  return event?.genreMultipliers[genre] ?? 1;
}
