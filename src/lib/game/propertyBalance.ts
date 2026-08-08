/**
 * 物件収益まわりのゲームバランス調整値。ここの数値を変えるだけで挙動を調整できるようにし、
 * 計算ロジック(propertyRevenue.ts)側にはマジックナンバーを書かない。
 */
export const PROPERTY_REVENUE_CONFIG = {
  /** 通常時の年間収益 = price * revenueRate に対する倍率。基本は1のまま。 */
  baseMultiplier: 1,
  /**
   * グループ独占(そのグループの全物件を1人が所有)時の収益倍率。
   * 現時点ではpropertyRevenue.tsから未参照(判定ロジックのみ用意済み)。
   * 将来、ownershipTier()の結果と組み合わせて有効化する。
   */
  groupMonopolyMultiplier: 1.5,
  /**
   * region独占(その地域の全グループの全物件を1人が所有)時の収益倍率。
   * 現時点では未参照。
   */
  regionMonopolyMultiplier: 2,
};
