// cpuDecision.ts(CPU判断ロジック)の自動テスト。
//
// 全て純粋関数のテストなので、useGameStore(zustand)には一切触れない。分岐・対象選択系の
// テストは、実マップの座標・道路網に依存しない自己完結した最小MapDataフィクスチャ
// (propertyMonopoly.test.tsの自己完結フィクスチャと同じ考え方)を使い、マップデータ変更に
// 追従できるようにする。物件購入系のテストだけは実データ(data/properties.ts)を使う
// (decidePurchases/decideTargetSelectのpropertyGroup分岐がモジュール直import前提のため)。
import { describe, expect, it } from "vitest";
import type { MapData, MapNode, Player, RouteOption, TargetSelectInfo } from "@/types/game";
import {
  CPU_MONEY_RESERVE,
  defaultCpuStrategy,
  type CpuPreRollContext,
} from "@/lib/game/cpuDecision";
import { getPropertiesInGroup } from "@/data/properties";
import { STARTING_MONEY } from "@/lib/game/engine";

function makePlayer(overrides: Partial<Player> & { id: string }): Player {
  const base: Player = {
    id: overrides.id,
    name: overrides.id,
    color: "#000000",
    carIcon: "🚗",
    currentNodeId: "n0",
    moveHistory: ["n0"],
    money: STARTING_MONEY,
    ownedPropertyIds: [],
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
    controlledBy: "human",
  };
  return { ...base, ...overrides };
}

/** n0 - a1 - a2(行き止まり)
 *       \- b1 - dest
 *  という分岐マップ。a1経由よりb1経由の方がdestへ近い。 */
function makeBranchMap(): MapData {
  function node(id: string, connections: string[]): MapNode {
    return { id, name: id, type: "normal", x: 0, y: 0, connections: connections.map((to) => ({ to, roadType: "main" })) };
  }
  const nodes: MapNode[] = [
    node("n0", ["a1", "b1"]),
    node("a1", ["n0", "a2"]),
    node("a2", ["a1"]),
    node("b1", ["n0", "dest"]),
    node("dest", ["b1"]),
  ];
  return { id: "test-branch", name: "test-branch", nodes, startNodeId: "n0" };
}

function basePreRollState(players: Player[], destinationNodeId = "dest"): CpuPreRollContext["state"] {
  return { pendingDoubleMove: false, pendingDiceCount: 1, players, destinationNodeId };
}

describe("decidePreRoll()", () => {
  const map = makeBranchMap();

  it("card_dice_againを持っていれば必ず使う(何も失わないため)", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_dice_again", "card_warp_destination"] });
    const state = basePreRollState([player]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "useCard", cardId: "card_dice_again" });
  });

  it("急行系カード(multiDice)を複数持つ場合、diceCountが一番大きいものを使う", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_drive", "card_shonan_hyper", "card_sports_car"] });
    const state = basePreRollState([player]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "useCard", cardId: "card_shonan_hyper" });
  });

  it("既にダイス修飾効果が予約済みなら、multiDice/doubleMove/ワープ系カードは使わずロールする", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_drive", "card_double_move", "card_warp_destination"] });
    const state: CpuPreRollContext["state"] = { ...basePreRollState([player]), pendingDoubleMove: true };
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "roll" });
  });

  it("目的地ワープカードを持っていれば使う", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_warp_destination"] });
    const state = basePreRollState([player]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "useCard", cardId: "card_warp_destination" });
  });

  it("妨害カードは、他プレイヤーが存在すれば使う", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_debuff_skip"] });
    const rival = makePlayer({ id: "p2" });
    const state = basePreRollState([player, rival]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "useCard", cardId: "card_debuff_skip" });
  });

  it("妨害カードは、他プレイヤーがいなければ使わない(見送ってロールする)", () => {
    const player = makePlayer({ id: "p1", cardIds: ["card_debuff_skip"] });
    const state = basePreRollState([player]); // 自分1人だけ
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "roll" });
  });

  it("駅指定ワープカードは、目的地からの距離が近ければ使わずロールする", () => {
    // n0からdestまでの最短距離は2(n0→b1→dest)なのでFAR_FROM_DESTINATION_THRESHOLD(4)未満
    const player = makePlayer({ id: "p1", currentNodeId: "n0", cardIds: ["card_warp_select_station"] });
    const state = basePreRollState([player]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "roll" });
  });

  it("手札に使えるカードが無ければロールする", () => {
    const player = makePlayer({ id: "p1", cardIds: [] });
    const state = basePreRollState([player]);
    const decision = defaultCpuStrategy.decidePreRoll({ state, map, player });
    expect(decision).toEqual({ type: "roll" });
  });
});

describe("decideRoute()", () => {
  it("目的地までの最短距離が最も短くなる分岐先を選ぶ", () => {
    const map = makeBranchMap();
    const routeOptions: RouteOption[] = [
      { nodeId: "a1", nodeName: "a1", roadType: "main", available: true },
      { nodeId: "b1", nodeName: "b1", roadType: "main", available: true },
    ];
    const nodeId = defaultCpuStrategy.decideRoute({
      map,
      destinationNodeId: "dest",
      routeOptions,
      ownedCardIds: [],
    });
    expect(nodeId).toBe("b1"); // a1は行き止まり方向、b1はdestへ直結
  });
});

describe("decidePurchases()", () => {
  const GROUP_ID = "grp_fujisawa_ekimae";
  const groupProps = getPropertiesInGroup(GROUP_ID);

  it("テスト前提: 対象グループに複数物件があり、価格差がある", () => {
    expect(groupProps.length).toBeGreaterThanOrEqual(2);
  });

  it("CPU_MONEY_RESERVEを下回らない範囲で、安い物件から買えるだけ買う", () => {
    const sorted = [...groupProps].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0];
    const player = makePlayer({ id: "p1", money: cheapest.price + CPU_MONEY_RESERVE });
    const picks = defaultCpuStrategy.decidePurchases({ player, players: [player], groupId: GROUP_ID });
    expect(picks).toEqual([cheapest.id]);
  });

  it("所持金がCPU_MONEY_RESERVEを下回る場合は何も買わない", () => {
    const player = makePlayer({ id: "p1", money: CPU_MONEY_RESERVE - 1 });
    const picks = defaultCpuStrategy.decidePurchases({ player, players: [player], groupId: GROUP_ID });
    expect(picks).toEqual([]);
  });

  it("グループ独占をあと1件で達成できる場合、価格に関わらずその物件を優先して買う", () => {
    const sorted = [...groupProps].sort((a, b) => a.price - b.price);
    const last = sorted[sorted.length - 1]; // 一番高い物件を「残り1件」に設定
    const alreadyOwned = sorted.slice(0, -1).map((p) => p.id);
    const player = makePlayer({ id: "p1", money: last.price + CPU_MONEY_RESERVE, ownedPropertyIds: alreadyOwned });
    const picks = defaultCpuStrategy.decidePurchases({ player, players: [player], groupId: GROUP_ID });
    expect(picks).toEqual([last.id]);
  });

  it("既に他プレイヤーがグループ内の物件を持っている場合は独占優先ロジックを発動しない", () => {
    const sorted = [...groupProps].sort((a, b) => a.price - b.price);
    const last = sorted[sorted.length - 1];
    const rival = makePlayer({ id: "rival", ownedPropertyIds: [sorted[0].id] });
    const player = makePlayer({
      id: "p1",
      money: last.price + CPU_MONEY_RESERVE,
      ownedPropertyIds: sorted.slice(1, -1).map((p) => p.id),
    });
    const picks = defaultCpuStrategy.decidePurchases({ player, players: [player, rival], groupId: GROUP_ID });
    // 独占不可能なので、通常どおり「安い順に買えるだけ」ロジックのみが働く(highest-price一件買いにはならない)
    if (last.price > player.money - CPU_MONEY_RESERVE) {
      expect(picks).not.toContain(last.id);
    }
  });
});

describe("decideTargetSelect()", () => {
  const map = makeBranchMap();

  it("rivalPlayer: 総資産が最も多い相手を選ぶ", () => {
    const player = makePlayer({ id: "p1" });
    const poorRival = makePlayer({ id: "p2", money: 100 });
    const richRival = makePlayer({ id: "p3", money: 99999 });
    const info: TargetSelectInfo = {
      playerId: "p1",
      playerName: "p1",
      cardId: "card_debuff_skip",
      cardName: "お休みカード",
      selectKind: "rivalPlayer",
      options: [
        { optionId: "p2", label: "p2" },
        { optionId: "p3", label: "p3" },
      ],
    };
    const decision = defaultCpuStrategy.decideTargetSelect({
      map,
      player,
      players: [player, poorRival, richRival],
      destinationNodeId: "dest",
      info,
    });
    expect(decision).toEqual({ type: "select", optionId: "p3" });
  });

  it("選択肢が0件ならキャンセルする", () => {
    const player = makePlayer({ id: "p1" });
    const info: TargetSelectInfo = {
      playerId: "p1",
      playerName: "p1",
      cardId: "card_debuff_skip",
      cardName: "お休みカード",
      selectKind: "rivalPlayer",
      options: [],
    };
    const decision = defaultCpuStrategy.decideTargetSelect({
      map,
      player,
      players: [player],
      destinationNodeId: "dest",
      info,
    });
    expect(decision).toEqual({ type: "cancel" });
  });

  it("station: 目的地までの距離が最小になる選択肢を選ぶ", () => {
    const player = makePlayer({ id: "p1" });
    const info: TargetSelectInfo = {
      playerId: "p1",
      playerName: "p1",
      cardId: "card_warp_select_station",
      cardName: "駅指定ワープカード",
      selectKind: "station",
      options: [
        { optionId: "a2", label: "a2" }, // destまで遠い(行き止まり経由)
        { optionId: "dest", label: "dest" }, // distance 0
      ],
    };
    const decision = defaultCpuStrategy.decideTargetSelect({
      map,
      player,
      players: [player],
      destinationNodeId: "dest",
      info,
    });
    expect(decision).toEqual({ type: "select", optionId: "dest" });
  });
});

describe("decideCardOverflow()", () => {
  it("新カードが既存の最弱カード以下のレア度なら見送る", () => {
    // card_dice_again(common) vs 既存 card_double_move(rare)
    const decision = defaultCpuStrategy.decideCardOverflow({
      currentCardIds: ["card_double_move"],
      newCardId: "card_dice_again",
    });
    expect(decision).toEqual({ discard: "newCard" });
  });

  it("新カードが既存の最弱カードより強ければ、最弱カードと入れ替える", () => {
    // 既存: [common, rare]、新カード: superRare → 最弱(common, index 0)と入れ替え
    const decision = defaultCpuStrategy.decideCardOverflow({
      currentCardIds: ["card_dice_again", "card_double_move"],
      newCardId: "card_warp_destination", // superRare
    });
    expect(decision).toEqual({ discard: "existing", index: 0 });
  });
});
