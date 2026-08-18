// detectMonopolyAchievement()の自動テスト。
//
// この関数は allProperties/allGroups を引数で受け取る完全な純関数なので、実マップデータには
// 依存しない自己完結したフィクスチャでテストする(propertyMonopoly.ts/propertyOwnership.ts側の
// コードは一切変更していない)。
//
// フィクスチャ構成: region "R1" に groupA(2件)・groupB(2件)、region "R2" に groupC(2件)。
// 「二重通知防止」は、実際のプレイで起こり得る状態(既に別グループを独占済みの状態で、
// 同地域最後のグループの最後の1件を買って地域独占とグループ独占が同時に成立する)だけを対象にし、
// 通常のbuyProperty()経由では起こり得ない人為的な内部状態(既に独占済みのグループへの購入)は
// 対象にしない。
import { describe, expect, it } from "vitest";
import type { Player, PropertyDef, PropertyGroup } from "@/types/game";
import { detectMonopolyAchievement } from "@/lib/game/propertyMonopoly";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";

const groupA: PropertyGroup = { id: "groupA", name: "グループA", region: "R1" };
const groupB: PropertyGroup = { id: "groupB", name: "グループB", region: "R1" };
const groupC: PropertyGroup = { id: "groupC", name: "グループC", region: "R2" };
const allGroups: PropertyGroup[] = [groupA, groupB, groupC];

function prop(id: string, groupId: string): PropertyDef {
  return { id, name: id, category: "テスト", price: 100, assetValue: 100, groupId, revenueRate: 0.1 };
}

const a1 = prop("a1", "groupA");
const a2 = prop("a2", "groupA");
const b1 = prop("b1", "groupB");
const b2 = prop("b2", "groupB");
const c1 = prop("c1", "groupC");
const c2 = prop("c2", "groupC");
const allProperties: PropertyDef[] = [a1, a2, b1, b2, c1, c2];

function makePlayer(id: string, ownedPropertyIds: string[]): Player {
  return {
    id,
    name: id,
    color: "#000000",
    carIcon: "🚗",
    currentNodeId: "n",
    moveHistory: ["n"],
    money: 1000,
    ownedPropertyIds,
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
    controlledBy: "human",
  };
}

describe("detectMonopolyAchievement()", () => {
  it("グループ内最後の1件を購入した瞬間、グループ独占として通知される", () => {
    const playersBefore = [makePlayer("p1", ["a1"])];
    const playersAfter = [makePlayer("p1", ["a1", "a2"])];

    const result = detectMonopolyAchievement(a2, groupA, "p1", playersBefore, playersAfter, allProperties, allGroups);

    expect(result.monopolyAchievement).toEqual({
      kind: "group",
      name: groupA.name,
      multiplier: PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier,
    });
    expect(result.logSuffix).toContain(groupA.name);
  });

  it("グループがまだ埋まっていなければ独占は成立しない(nullが返る)", () => {
    const playersBefore = [makePlayer("p1", [])];
    const playersAfter = [makePlayer("p1", ["a1"])]; // a2はまだ誰も所有していない

    const result = detectMonopolyAchievement(a1, groupA, "p1", playersBefore, playersAfter, allProperties, allGroups);

    expect(result.monopolyAchievement).toBeNull();
    expect(result.logSuffix).toBe("");
  });

  it("他プレイヤーがグループ内の1件でも所有していれば、残り全部を持っていても独占にならない", () => {
    const playersBefore = [makePlayer("p1", ["a1"]), makePlayer("p2", ["a2"])];
    // p1がa2を買おうとする状況自体が実際には起こらない(a2は既にp2所有)が、
    // ここでは「グループ内に他プレイヤー所有物件が残っている限り独占にならない」ことだけを検証する。
    const playersAfter = [makePlayer("p1", ["a1"]), makePlayer("p2", ["a2"])];

    const result = detectMonopolyAchievement(a1, groupA, "p1", playersBefore, playersAfter, allProperties, allGroups);

    expect(result.monopolyAchievement).toBeNull();
  });

  it("地域完全独占: 既にgroupAを独占済みの状態でgroupB最後の1件を買うと、地域独占として1回だけ通知される(グループ側の重複通知はしない)", () => {
    // 実際のプレイで普通に起こる状態: groupAは既に独占済み(a1,a2両方所有)、groupBはb1だけ所有。
    const playersBefore = [makePlayer("p1", ["a1", "a2", "b1"])];
    // このターンでb2を購入し、groupBの独占とR1地域の完全独占が同時に成立する。
    const playersAfter = [makePlayer("p1", ["a1", "a2", "b1", "b2"])];

    const result = detectMonopolyAchievement(b2, groupB, "p1", playersBefore, playersAfter, allProperties, allGroups);

    expect(result.monopolyAchievement).toEqual({
      kind: "region",
      name: groupB.region,
      multiplier: PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier,
    });
    // kind:"region"以外(="group")では返らないことを明示的に確認する(重複通知防止の本質)。
    expect(result.monopolyAchievement?.kind).not.toBe("group");
  });

  it("無関係な地域(groupC)の状況は、groupA/groupBの独占判定に影響しない", () => {
    const playersBefore = [makePlayer("p1", ["a1", "c1", "c2"])]; // groupC(R2)は既に独占済みだが無関係
    const playersAfter = [makePlayer("p1", ["a1", "a2", "c1", "c2"])];

    const result = detectMonopolyAchievement(a2, groupA, "p1", playersBefore, playersAfter, allProperties, allGroups);

    // groupAの独占(R1地域はgroupBを持っていないので地域独占にはならない)だけが通知される。
    expect(result.monopolyAchievement).toEqual({
      kind: "group",
      name: groupA.name,
      multiplier: PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier,
    });
  });
});
