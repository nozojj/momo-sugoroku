// computeWinnerIds()の自動テスト(同率1位の判定を含む)。
//
// netWorth()はgetPropertyDef()経由で@/data/propertiesを参照するため、所有物件0件の
// フィクスチャ(money比較だけ)を基本にしつつ、1件だけ実データの物件を使って
// 「現金だけでなく所有物件込みの総資産で比較している」ことも確認する。
import { describe, expect, it } from "vitest";
import type { Player } from "@/types/game";
import { computeWinnerIds } from "@/lib/game/engine";
import { propertyDefs } from "@/data/properties";

function makePlayer(id: string, money: number, ownedPropertyIds: string[] = []): Player {
  return {
    id,
    name: id,
    color: "#000000",
    carIcon: "🚗",
    currentNodeId: "n",
    moveHistory: ["n"],
    money,
    ownedPropertyIds,
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
    controlledBy: "human",
  };
}

describe("computeWinnerIds()", () => {
  it("1人だけ総資産最大なら、その1人のIDだけが返る", () => {
    const players = [makePlayer("p1", 3000), makePlayer("p2", 1000), makePlayer("p3", 2000)];
    expect(computeWinnerIds(players)).toEqual(["p1"]);
  });

  it("同率1位(2人)の場合、両方のIDが返る", () => {
    const players = [makePlayer("p1", 2000), makePlayer("p2", 2000), makePlayer("p3", 1000)];
    expect(computeWinnerIds(players)).toEqual(["p1", "p2"]);
  });

  it("同率1位(3人中2人)の場合、上位2人のIDだけが返り下位1人は含まれない", () => {
    const players = [makePlayer("p1", 500), makePlayer("p2", 2000), makePlayer("p3", 2000)];
    expect(computeWinnerIds(players)).toEqual(["p2", "p3"]);
  });

  it("全員完全同額の場合、全員のIDが返る", () => {
    const players = [makePlayer("p1", 1500), makePlayer("p2", 1500), makePlayer("p3", 1500), makePlayer("p4", 1500)];
    expect(computeWinnerIds(players)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("現金が少なくても所有物件込みの総資産で上回っていれば勝者になる", () => {
    const def = propertyDefs[0];
    if (!def) throw new Error("テスト前提が崩れています: propertyDefsが空です。");

    // p1: 現金だけでちょうどdef.assetValue分の総資産 / p2: 現金は少ないが物件のassetValue込みで同額
    const p1 = makePlayer("p1", 1000 + def.assetValue, []);
    const p2 = makePlayer("p2", 1000, [def.id]);

    expect(computeWinnerIds([p1, p2]).sort()).toEqual(["p1", "p2"]);
  });
});
