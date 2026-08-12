// buyProperty()/finishPropertyShopping()の自動テスト。
//
// 検証する対象はuseGameStoreの公開アクションだけで、resolveLanding()等のprivateな内部関数には
// 一切触れていない。landingEffects.test.tsで既に検証済みの経路(hub_fujisawa → r_fj_kg_1、
// グループgrp_fujisawa_ekimae)をそのまま再利用する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import { propertyDefs, getPropertiesInGroup } from "@/data/properties";
import { STARTING_MONEY } from "@/lib/game/engine";
import { freshGame, placePlayerAt, mockSingleDiceFace, driveToLandingToward } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const UNRELATED_DESTINATION = "hub_kamakura";
const START = "hub_fujisawa";
const TARGET = "r_fj_kg_1";
const EXPECTED_GROUP_ID = "grp_fujisawa_ekimae";
const EXPECTED_PROPERTY_COUNT = 6;

function groupProperties() {
  return getPropertiesInGroup(EXPECTED_GROUP_ID);
}

describe("buyProperty() / finishPropertyShopping()", () => {
  beforeEach(() => {
    freshGame();

    const node = getNode(getMap(MAP_ID), TARGET);
    if (node.type !== "property" || node.propertyGroupId !== EXPECTED_GROUP_ID) {
      throw new Error(
        `テスト前提が崩れています: ${TARGET} はtype:"property"・propertyGroupId:"${EXPECTED_GROUP_ID}"の前提だが、` +
          `実際はtype:"${node.type}"・propertyGroupId:"${node.propertyGroupId}"でした。マップデータが変更された可能性があります。`,
      );
    }
    if (groupProperties().length !== EXPECTED_PROPERTY_COUNT) {
      throw new Error(
        `テスト前提が崩れています: ${EXPECTED_GROUP_ID}の物件数は${EXPECTED_PROPERTY_COUNT}件の前提だが、` +
          `実際は${groupProperties().length}件でした。properties.tsが変更された可能性があります。`,
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** hub_fujisawa → r_fj_kg_1 に停止し、status:"purchaseOffer" にするところまで共通で進める。 */
  function arriveAtPurchaseOffer() {
    placePlayerAt(START, UNRELATED_DESTINATION);
    mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
    useGameStore.getState().rollDice();
    driveToLandingToward(TARGET);

    const s = useGameStore.getState();
    if (s.status !== "purchaseOffer" || s.pendingPropertyGroupId !== EXPECTED_GROUP_ID) {
      throw new Error(`テストのセットアップに失敗しました: status=${s.status}, pendingPropertyGroupId=${s.pendingPropertyGroupId}`);
    }
  }

  describe("正常購入", () => {
    it("所持金が減算され、所有物件に追加され、statusはpurchaseOfferのまま維持される", () => {
      arriveAtPurchaseOffer();
      const props = groupProperties();
      const cheapest = [...props].sort((a, b) => a.price - b.price)[0];
      const startMoney = useGameStore.getState().players[0].money;
      const logLenBefore = useGameStore.getState().log.length;

      useGameStore.getState().buyProperty(cheapest.id);

      const s = useGameStore.getState();
      expect(s.players[0].money).toBe(startMoney - cheapest.price);
      expect(s.players[0].ownedPropertyIds).toContain(cheapest.id);
      expect(s.status).toBe("purchaseOffer"); // 続けて他の物件も買えるよう維持される
      expect(s.pendingPropertyGroupId).toBe(EXPECTED_GROUP_ID);
      expect(s.log.length).toBe(logLenBefore + 1);
      expect(s.monopolyAchievement).toBeNull(); // グループ内の他物件が残っているので独占達成ではない
    });
  });

  describe("no-op条件", () => {
    it("status:'purchaseOffer'でないときに呼んでも何も変化しない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION); // status: "rolling" のまま(まだ移動していない)
      const before = useGameStore.getState();
      expect(before.status).toBe("rolling");
      const startMoney = before.players[0].money;
      const startOwned = before.players[0].ownedPropertyIds;

      const cheapest = [...groupProperties()].sort((a, b) => a.price - b.price)[0];
      useGameStore.getState().buyProperty(cheapest.id);

      const after = useGameStore.getState();
      expect(after.players[0].money).toBe(startMoney);
      expect(after.players[0].ownedPropertyIds).toEqual(startOwned);
    });

    it("存在しないpropertyIdを渡しても何も変化しない", () => {
      arriveAtPurchaseOffer();
      const startMoney = useGameStore.getState().players[0].money;
      const startOwned = useGameStore.getState().players[0].ownedPropertyIds;

      useGameStore.getState().buyProperty("does_not_exist_prop");

      const s = useGameStore.getState();
      expect(s.players[0].money).toBe(startMoney);
      expect(s.players[0].ownedPropertyIds).toEqual(startOwned);
    });

    it("現在オファー中のグループと異なるグループの物件IDを渡しても何も変化しない", () => {
      arriveAtPurchaseOffer();
      const otherGroupProp = propertyDefs.find((p) => p.groupId !== EXPECTED_GROUP_ID);
      if (!otherGroupProp) throw new Error("テスト前提が崩れています: 他グループの物件が見つかりません。");

      const startMoney = useGameStore.getState().players[0].money;
      const startOwned = useGameStore.getState().players[0].ownedPropertyIds;

      useGameStore.getState().buyProperty(otherGroupProp.id);

      const s = useGameStore.getState();
      expect(s.players[0].money).toBe(startMoney);
      expect(s.players[0].ownedPropertyIds).toEqual(startOwned);
    });

    it("所持金が価格未満のときは何も変化しない", () => {
      arriveAtPurchaseOffer();
      const expensive = [...groupProperties()].sort((a, b) => b.price - a.price)[0];
      expect(expensive.price).toBeGreaterThan(STARTING_MONEY); // 前提: 開始所持金では買えない価格であること

      const startMoney = useGameStore.getState().players[0].money;
      const startOwned = useGameStore.getState().players[0].ownedPropertyIds;

      useGameStore.getState().buyProperty(expensive.id);

      const s = useGameStore.getState();
      expect(s.players[0].money).toBe(startMoney);
      expect(s.players[0].ownedPropertyIds).toEqual(startOwned);
    });

    it("既に自分が所有している物件を再度買おうとしても何も変化しない", () => {
      arriveAtPurchaseOffer();
      const cheapest = [...groupProperties()].sort((a, b) => a.price - b.price)[0];
      useGameStore.getState().buyProperty(cheapest.id); // 1回目: 正常購入

      const afterFirst = useGameStore.getState();
      const moneyAfterFirst = afterFirst.players[0].money;
      const ownedAfterFirst = afterFirst.players[0].ownedPropertyIds;

      useGameStore.getState().buyProperty(cheapest.id); // 2回目: 既に所有済み

      const afterSecond = useGameStore.getState();
      expect(afterSecond.players[0].money).toBe(moneyAfterFirst);
      expect(afterSecond.players[0].ownedPropertyIds).toEqual(ownedAfterFirst);
    });

    it("既に他プレイヤーが所有している物件を買おうとしても何も変化しない", () => {
      // freshGame()/placePlayerAt()は1人プレイ専用ヘルパー(players配列をplayers[0]だけに
      // 差し替える実装)のため、この2人プレイ限定のケースだけは直接startGame()/setState()で組み立てる。
      useGameStore.getState().resetGame();
      useGameStore.getState().startGame(["P1", "P2"], 1);

      const target = groupProperties()[0];
      const state = useGameStore.getState();
      const p1 = state.players[0];
      const p2 = { ...state.players[1], ownedPropertyIds: [target.id] };

      useGameStore.setState({
        players: [
          { ...p1, currentNodeId: START, moveHistory: [START] },
          p2,
        ],
        destinationNodeId: UNRELATED_DESTINATION,
        status: "rolling",
        diceResult: null,
        diceFaces: null,
        remainingMoves: 0,
        pendingDoubleMove: false,
        pendingDiceCount: 1,
        routeOptions: [],
        arrivalInfo: null,
      });

      mockSingleDiceFace(1);
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);
      expect(useGameStore.getState().status).toBe("purchaseOffer");

      const startMoneyP1 = useGameStore.getState().players[0].money;

      useGameStore.getState().buyProperty(target.id);

      const s = useGameStore.getState();
      expect(s.players[0].money).toBe(startMoneyP1); // P1のmoneyは変化しない
      expect(s.players[0].ownedPropertyIds).not.toContain(target.id); // P1の所有にもならない
      expect(s.players[1].ownedPropertyIds).toEqual([target.id]); // P2の所有のまま
    });
  });

  it("配線確認: グループ全件を購入し切ると、最後の購入でmonopolyAchievementがグループ独占としてセットされる", () => {
    arriveAtPurchaseOffer();
    const props = groupProperties();
    const totalPrice = props.reduce((sum, p) => sum + p.price, 0);

    // このテストの関心は「全件買い切ったときの独占検知の配線」だけであり、所持金不足による
    // 個々の購入no-opはbuyProperty()のno-op条件テストで別途検証済みのため、ここでは
    // 全件を確実に買い切れるだけの所持金を用意する。
    useGameStore.setState({
      players: [{ ...useGameStore.getState().players[0], money: totalPrice }],
    });

    for (const def of props) {
      useGameStore.getState().buyProperty(def.id);
    }

    const s = useGameStore.getState();
    expect(s.players[0].ownedPropertyIds).toHaveLength(EXPECTED_PROPERTY_COUNT);
    expect(s.monopolyAchievement).not.toBeNull();
    expect(s.monopolyAchievement?.kind).toBe("group");
  });

  it("finishPropertyShopping(): purchaseOfferを終えて通常のターン進行(endTurn)へ戻る", () => {
    arriveAtPurchaseOffer();
    const startTurn = useGameStore.getState().turn;

    useGameStore.getState().finishPropertyShopping();

    const s = useGameStore.getState();
    expect(s.pendingPropertyGroupId).toBeNull();
    expect(s.status).toBe("rolling"); // 1人プレイなので次のターンがすぐ回ってくる
    expect(s.turn).toBe(startTurn + 1);
  });
});
