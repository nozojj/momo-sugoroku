/**
 * 物件収益まわりのゲームバランス調整値。ここの数値を変えるだけで挙動を調整できるようにし、
 * 計算ロジック(propertyRevenue.ts)側にはマジックナンバーを書かない。
 */
export const PROPERTY_REVENUE_CONFIG = {
  /** 通常時の年間収益 = price * revenueRate に対する倍率。基本は1のまま。 */
  baseMultiplier: 1,
  /** グループ独占(そのグループの全物件を1人が所有)時の収益倍率。propertyRevenue.tsの
   *  calculateAnnualRevenue()がownershipTier()の結果と組み合わせて適用する。 */
  groupMonopolyMultiplier: 1.5,
  /** region独占(その地域の全グループの全物件を1人が所有)時の収益倍率。groupMonopolyとの
   *  重ね掛けはしない(ownershipTier()がregionMonopolyを優先して1つだけ返すため)。 */
  regionMonopolyMultiplier: 2,
};
