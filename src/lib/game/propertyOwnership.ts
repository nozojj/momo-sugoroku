import type { OwnershipTier, Player, PropertyDef, PropertyGroup } from "@/types/game";

/** 指定した物件を所有しているプレイヤーを返す(誰も所有していなければundefined)。 */
export function getPropertyOwner(propertyId: string, players: Player[]): Player | undefined {
  return players.find((p) => p.ownedPropertyIds.includes(propertyId));
}

/** そのグループに属する全物件を、指定したプレイヤーが1人で所有しているか。 */
export function isGroupMonopolized(groupId: string, playerId: string, players: Player[], allProperties: PropertyDef[]): boolean {
  const memberIds = allProperties.filter((p) => p.groupId === groupId).map((p) => p.id);
  const player = players.find((p) => p.id === playerId);
  if (!player || memberIds.length === 0) return false;
  return memberIds.every((id) => player.ownedPropertyIds.includes(id));
}

/** その地域(region)に属する全グループの全物件を、指定したプレイヤーが1人で所有しているか。 */
export function isRegionMonopolized(
  region: string,
  playerId: string,
  players: Player[],
  allProperties: PropertyDef[],
  allGroups: PropertyGroup[],
): boolean {
  const regionGroupIds = new Set(allGroups.filter((g) => g.region === region).map((g) => g.id));
  const memberIds = allProperties.filter((p) => regionGroupIds.has(p.groupId)).map((p) => p.id);
  const player = players.find((p) => p.id === playerId);
  if (!player || memberIds.length === 0) return false;
  return memberIds.every((id) => player.ownedPropertyIds.includes(id));
}

/**
 * 通常所有 → グループ独占 → region独占の3段階を判定する。
 * 将来、収益計算(propertyRevenue.ts)からこれを呼んで倍率を決める想定。
 */
export function ownershipTier(
  property: PropertyDef,
  playerId: string,
  players: Player[],
  allProperties: PropertyDef[],
  allGroups: PropertyGroup[],
): OwnershipTier {
  const group = allGroups.find((g) => g.id === property.groupId);
  if (group && isRegionMonopolized(group.region, playerId, players, allProperties, allGroups)) return "regionMonopoly";
  if (isGroupMonopolized(property.groupId, playerId, players, allProperties)) return "groupMonopoly";
  return "normal";
}
