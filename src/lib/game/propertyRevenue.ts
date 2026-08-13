import type { OwnershipTier, PropertyDef } from "@/types/game";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";

/**
 * 決算(3月)で1件の物件が生む年間収益を計算する。
 * tierはpropertyOwnership.tsのownershipTier()の結果をそのまま渡す想定(ここでは
 * 独占判定を行わない)。regionMonopolyはgroupMonopolyとの重ね掛けにはせず、
 * 該当する倍率を1つだけ適用する(ownershipTier()自体がregion>group>normalの
 * 優先順位で1つのtierしか返さないため、自然にそうなる)。
 * yearEventMultiplierは年度イベント(lib/game/yearEvent.tsのyearEventGenreMultiplier())の
 * ジャンル別倍率をそのまま渡す想定。既定値1(補正なし)なので、この引数を渡さない
 * 既存の呼び出し側の挙動は変わらない。
 * 将来ここに
 *   - 物件レベル/増資倍率
 *   - 地域イベント・プレイヤー個別イベントによる収益変化
 * を足していける(呼び出し側のgameStore.tsは変更不要)。
 */
export function calculateAnnualRevenue(
  property: PropertyDef,
  tier: OwnershipTier = "normal",
  yearEventMultiplier: number = 1,
): number {
  const tierMultiplier =
    tier === "regionMonopoly"
      ? PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier
      : tier === "groupMonopoly"
        ? PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier
        : PROPERTY_REVENUE_CONFIG.baseMultiplier;
  return Math.round(property.price * property.revenueRate * tierMultiplier * yearEventMultiplier);
}
