// computeWinnerIds()の自動テスト(同率1位の判定を含む)。
//
// netWorth()はgetPropertyDef()経由で@/data/propertiesを参照するため、所有物件0件の
// フィクスチャ(money比較だけ)を基本にしつつ、1件だけ実データの物件を使って
// 「現金だけでなく所有物件込みの総資産で比較している」ことも確認する。
import { describe, expect, it } from "vitest";
import type { Player } from "@/types/game";
import { computeWinnerIds, rankPlayers } from "@/lib/game/engine";
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

// rankPlayers()の自動テスト。GameOverModal(最終順位)とPlayerHud(プレイ中の順位バッジ)の
// 両方がこの同じ関数を使うため、同着の扱いはここで一箇所だけ検証すれば両方の画面に反映される。
describe("rankPlayers()", () => {
  it("全員異なる総資産なら、総資産降順にrank 1,2,3,4が振られる(tiedは全員false)", () => {
    const players = [makePlayer("p1", 1000), makePlayer("p2", 3000), makePlayer("p3", 2000), makePlayer("p4", 500)];
    const ranked = rankPlayers(players);
    expect(ranked.map((r) => [r.player.id, r.rank, r.tied])).toEqual([
      ["p2", 1, false],
      ["p3", 2, false],
      ["p1", 3, false],
      ["p4", 4, false],
    ]);
  });

  it("上位2人が同額の場合、両方rank1・tied trueになり、次の順位は3位に飛ぶ(2位は欠番)", () => {
    const players = [makePlayer("p1", 2000), makePlayer("p2", 2000), makePlayer("p3", 1000)];
    const ranked = rankPlayers(players);
    expect(ranked.map((r) => [r.player.id, r.rank, r.tied])).toEqual([
      ["p1", 1, true],
      ["p2", 1, true],
      ["p3", 3, false],
    ]);
  });

  it("下位2人が同額の場合、上位のtiedはfalseのまま、下位2人だけtied trueで同じrankになる", () => {
    const players = [makePlayer("p1", 3000), makePlayer("p2", 1000), makePlayer("p3", 1000)];
    const ranked = rankPlayers(players);
    expect(ranked.map((r) => [r.player.id, r.rank, r.tied])).toEqual([
      ["p1", 1, false],
      ["p2", 2, true],
      ["p3", 2, true],
    ]);
  });

  it("全員完全同額の場合、全員rank1・tied trueになる", () => {
    const players = [makePlayer("p1", 1500), makePlayer("p2", 1500), makePlayer("p3", 1500), makePlayer("p4", 1500)];
    const ranked = rankPlayers(players);
    expect(ranked.every((r) => r.rank === 1 && r.tied)).toBe(true);
  });

  it("現金が少なくても所有物件込みの総資産で上回っていれば、その分rankが上になる", () => {
    const def = propertyDefs[0];
    if (!def) throw new Error("テスト前提が崩れています: propertyDefsが空です。");

    // p1: 現金だけでdef.assetValue分の総資産 / p2: 現金は同額だが物件を持たない(p1よりnetWorthが低い)
    const p1 = makePlayer("p1", 1000 + def.assetValue, []);
    const p2 = makePlayer("p2", 1000, []);

    const ranked = rankPlayers([p1, p2]);
    expect(ranked.map((r) => [r.player.id, r.rank, r.tied])).toEqual([
      ["p1", 1, false],
      ["p2", 2, false],
    ]);
  });

  it("netWorth降順にソートされて返る(引数のplayers順ではない)", () => {
    const players = [makePlayer("p1", 500), makePlayer("p2", 3000), makePlayer("p3", 1000)];
    const ranked = rankPlayers(players);
    expect(ranked.map((r) => r.player.id)).toEqual(["p2", "p3", "p1"]);
  });
});
