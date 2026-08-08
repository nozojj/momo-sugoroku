import type { CardDef } from "@/types/game";
import { RARITY_WEIGHT } from "@/data/cards";

/**
 * レア度別の重み(data/cards.tsのRARITY_WEIGHT)に基づいた重み付きランダム抽選。
 * カード追加・確率調整はデータ側(RARITY_WEIGHT・各カードのrarity)だけで完結し、
 * ここのロジックには手を入れなくてよい。
 */
export function drawWeightedCard(pool: CardDef[]): CardDef {
  const totalWeight = pool.reduce((sum, c) => sum + RARITY_WEIGHT[c.rarity], 0);
  let r = Math.random() * totalWeight;
  for (const card of pool) {
    r -= RARITY_WEIGHT[card.rarity];
    if (r < 0) return card;
  }
  return pool[pool.length - 1];
}
