import type { MonopolyAchievement, Player, PropertyDef, PropertyGroup } from "@/types/game";
import { isGroupMonopolized, isRegionMonopolized } from "@/lib/game/propertyOwnership";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";

export interface MonopolyAchievementResult {
  /** 今回の購入で新しく独占を達成していればその内容、していなければnull。 */
  monopolyAchievement: MonopolyAchievement | null;
  /** 達成していればログメッセージへ追記する文言、していなければ空文字。 */
  logSuffix: string;
}

/**
 * 物件購入によって独占(グループ/地域)が今まさに達成されたかを判定する純関数。
 * gameStore.tsのbuyProperty()に直接書かれていた判定をそのまま切り出したもの
 * (isGroupMonopolized()/isRegionMonopolized()の呼び方・条件分岐の順序は変更していない)。
 *
 * 独占達成の検知: 購入「前」の所有状況(playersBefore)では未達成、購入「後」の所有状況
 * (playersAfter)では達成、という差分だけを見る。そのグループは既に全物件が埋まるため、
 * 同じ購入で再度この分岐に入ることはない(=通知は達成した瞬間の1回だけ)。
 * `wasGroupMonopoly`(購入した物件のグループが購入前に独占済みだったか)を、
 * グループ独占・地域独占どちらの「新規達成か」の判定にも共通のガードとして使うことで、
 * 地域完全独占の一部として既存グループのおかげで初めて地域独占に達した場合(そのグループ自体は
 * 既に独占済み)でも、地域独占だけが1回通知される(グループ側の二重通知を起こさない)。
 * 地域完全独占と通常のグループ独占を同時に達成した場合は、地域完全独占を優先して1つだけ返す。
 */
export function detectMonopolyAchievement(
  def: PropertyDef,
  group: PropertyGroup | undefined,
  playerId: string,
  playersBefore: Player[],
  playersAfter: Player[],
  allProperties: PropertyDef[],
  allGroups: PropertyGroup[],
): MonopolyAchievementResult {
  const wasGroupMonopoly = isGroupMonopolized(def.groupId, playerId, playersBefore, allProperties);
  const isGroupMonopolyNow = isGroupMonopolized(def.groupId, playerId, playersAfter, allProperties);
  const isRegionMonopolyNow =
    !!group && isRegionMonopolized(group.region, playerId, playersAfter, allProperties, allGroups);

  if (!wasGroupMonopoly && isRegionMonopolyNow && group) {
    return {
      monopolyAchievement: { kind: "region", name: group.region, multiplier: PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier },
      logSuffix: ` 🎉 ${group.region}エリアを完全独占!物件収益が${PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier}倍になります!`,
    };
  }
  if (!wasGroupMonopoly && isGroupMonopolyNow && group) {
    return {
      monopolyAchievement: { kind: "group", name: group.name, multiplier: PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier },
      logSuffix: ` 🎉 ${group.name}を独占!物件収益が${PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier}倍になります!`,
    };
  }
  return { monopolyAchievement: null, logSuffix: "" };
}
