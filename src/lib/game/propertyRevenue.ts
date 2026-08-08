import type { PropertyDef } from "@/types/game";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";

/**
 * 決算(3月)で1件の物件が生む年間収益を計算する。
 * 今回はprice * revenueRateのみを使うが、将来ここに
 *   - 季節補正(getCalendar(state.turn)を使う。moneySeasonality.tsと同じ発想)
 *   - グループ独占/region独占ボーナス(propertyOwnership.tsのownershipTier()と組み合わせる)
 *   - 物件レベル/増資倍率
 *   - イベントによる収益変化
 * を足していける(呼び出し側のgameStore.tsは変更不要)。
 */
export function calculateAnnualRevenue(property: PropertyDef): number {
  return Math.round(property.price * property.revenueRate * PROPERTY_REVENUE_CONFIG.baseMultiplier);
}
