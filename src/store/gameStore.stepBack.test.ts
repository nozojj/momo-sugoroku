// stepBack()の自動テスト。
//
// 今回の目的はstepBack()の現在の挙動をテストで固定することであり、リファクタリングや
// 仕様変更は行わない。gameStore.ts・advanceStep()/chooseRoute()/resolveLanding()/
// checkDestinationArrival()/endTurn()等の既存処理には一切触れていない。
//
// 経路は調査段階で確認済みの実マップ経路(wp_komachi2→wp_komachi1→kmlp_e→hub_kamakura、
// および第2弾で使ったマス効果ノード)をそのまま再利用する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";
import {
  freshGame,
  placePlayerAt,
  mockSingleDiceFace,
  advanceUntilAt,
  stepOnceToward,
  driveToLandingToward,
  snapshotRelevantState,
} from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const DESTINATION = "hub_kamakura";
// 目的地到着テスト(第1弾)と同じ経路。距離3であることをbeforeEachで都度確認する。
const START_3_AWAY = "wp_komachi2";
const EXPECTED_DISTANCE = 3;
// 目的地への到着に無関係な、経路上の他プレイヤー用の目的地(マス効果テストで使用)。
const UNRELATED_DESTINATION = "hub_kamakura";

describe("stepBack(): 現在の挙動の固定", () => {
  beforeEach(() => {
    freshGame();
    const map = getMap(MAP_ID);
    const distance = shortestDistance(map, START_3_AWAY, DESTINATION, []);
    if (distance !== EXPECTED_DISTANCE) {
      throw new Error(
        `テスト前提が崩れています: ${START_3_AWAY} から ${DESTINATION} までの距離は${distance}マス` +
          `(期待値: ${EXPECTED_DISTANCE}マス)。マップデータが変更された可能性があります。`,
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("基本の巻き戻し", () => {
    it("moving状態から1マス戻れる: currentNodeId・remainingMoves・moveHistoryが対称に復元される", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice(); // remainingMoves=3, status:"moving"
      useGameStore.getState().advanceStep(); // wp_komachi2は分岐(prevId無し) -> selectingRoute
      const branchOptions = useGameStore.getState().routeOptions.map((o) => o.nodeId);
      expect(branchOptions).toContain("wp_komachi1");

      useGameStore.getState().chooseRoute("wp_komachi1"); // 実移動#1: remainingMoves 3->2, status:"moving"
      const beforeStepBack = snapshotRelevantState();
      expect(beforeStepBack.currentNodeId).toBe("wp_komachi1");
      expect(beforeStepBack.moveHistory).toEqual(["wp_komachi2", "wp_komachi1"]);
      expect(beforeStepBack.remainingMoves).toBe(2);
      expect(beforeStepBack.status).toBe("moving");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("wp_komachi2"); // 直前のノードへ戻る
      expect(after.moveHistory).toEqual(["wp_komachi2"]); // 末尾1件だけ削除、それ以前は維持
      expect(after.remainingMoves).toBe(3); // 2 -> 3 (1増える)
      expect(after.status).toBe("selectingRoute"); // 戻った後は常にselectingRoute
      expect(after.routeOptions.sort()).toEqual(branchOptions.sort()); // 戻った地点の分岐が正しく再計算される
    });

    it("selectingRoute状態(分岐提示中、まだ選択前)からも正常に戻れる", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      useGameStore.getState().advanceStep(); // wp_komachi2の分岐 -> selectingRoute
      useGameStore.getState().chooseRoute("wp_komachi1"); // remainingMoves 3->2, moving
      useGameStore.getState().advanceStep(); // wp_komachi1(prevId=wp_komachi2)は単一経路 -> kmlp_eへ自動移動, remainingMoves 2->1
      const afterAutoMove = snapshotRelevantState();
      expect(afterAutoMove.currentNodeId).toBe("kmlp_e");
      expect(afterAutoMove.status).toBe("moving");

      useGameStore.getState().advanceStep(); // kmlp_e(prevId=wp_komachi1)は分岐 -> selectingRoute、まだ移動しない
      const branchState = snapshotRelevantState();
      expect(branchState.status).toBe("selectingRoute"); // ここでstepBackを呼ぶ(選択前)
      expect(branchState.currentNodeId).toBe("kmlp_e");
      expect(branchState.remainingMoves).toBe(1);

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("wp_komachi1"); // kmlp_eへ来る前のノードへ戻る
      expect(after.moveHistory).toEqual(["wp_komachi2", "wp_komachi1"]);
      expect(after.remainingMoves).toBe(2); // 1 -> 2
      expect(after.status).toBe("selectingRoute");
    });
  });

  describe("マス効果ノードへ戻っても発火しない(第2弾で使用した実ノードを再利用)", () => {
    it("プラスマス(moneyGain: r_fjrt_gate_fjrt_e_1)", () => {
      placePlayerAt("hub_fujisawa", UNRELATED_DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      advanceUntilAt("r_fjrt_gate_fjrt_e_1"); // hub_fujisawaの分岐でTARGET方向を選び、TARGET到達直前で止める
      const before = snapshotRelevantState();
      stepOnceToward("r_fjrt_gate_fjrt_e_1"); // 単一経路でfjrt_eへ実移動(TARGETを通過)
      expect(useGameStore.getState().players[0].currentNodeId).toBe("fjrt_e");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("r_fjrt_gate_fjrt_e_1");
      expect(after.money).toBe(before.money); // マス効果は発火していない
      expect(after.moneyRouletteInfo).toBeNull();
      expect(after.status).toBe("selectingRoute"); // "moneyRoulette"になっていない
      expect(after.logLength).toBe(before.logLength); // ログも増えていない
    });

    it("マイナスマス(moneyLoss: r_fjrt_gate_fjrt_w_1)", () => {
      placePlayerAt("hub_fujisawa", UNRELATED_DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      advanceUntilAt("r_fjrt_gate_fjrt_w_1");
      const before = snapshotRelevantState();
      stepOnceToward("r_fjrt_gate_fjrt_w_1"); // 単一経路でfjrt_wへ実移動(TARGETを通過)
      expect(useGameStore.getState().players[0].currentNodeId).toBe("fjrt_w");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("r_fjrt_gate_fjrt_w_1");
      expect(after.money).toBe(before.money);
      expect(after.moneyRouletteInfo).toBeNull();
      expect(after.status).toBe("selectingRoute");
      expect(after.logLength).toBe(before.logLength);
    });

    it("カードマス(card: r_tslp_gate_tslp_n_1)", () => {
      placePlayerAt("hub_tsujido", UNRELATED_DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      advanceUntilAt("r_tslp_gate_tslp_n_1");
      const before = snapshotRelevantState();
      stepOnceToward("r_tslp_gate_tslp_n_1"); // 単一経路でtslp_nへ実移動(TARGETを通過)
      expect(useGameStore.getState().players[0].currentNodeId).toBe("tslp_n");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("r_tslp_gate_tslp_n_1");
      expect(after.cardIds).toEqual(before.cardIds);
      expect(after.cardDrawInfo).toBeNull();
      expect(after.status).toBe("selectingRoute"); // "cardDraw"になっていない
      expect(after.logLength).toBe(before.logLength);
    });

    it("物件マス(property: r_fj_kg_1)", () => {
      placePlayerAt("hub_fujisawa", UNRELATED_DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      advanceUntilAt("r_fj_kg_1");
      const before = snapshotRelevantState();
      stepOnceToward("r_fj_kg_1"); // r_fj_kg_1は行き止まりでhub_fujisawaへ折り返す単一経路
      expect(useGameStore.getState().players[0].currentNodeId).toBe("hub_fujisawa");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("r_fj_kg_1");
      expect(after.money).toBe(before.money);
      expect(after.ownedPropertyIds).toEqual(before.ownedPropertyIds);
      expect(after.pendingPropertyGroupId).toBeNull();
      expect(after.status).toBe("selectingRoute"); // "purchaseOffer"になっていない
      expect(after.logLength).toBe(before.logLength);
    });

    it("イベントマス(event: r_kg_ks_2)", () => {
      placePlayerAt("r_kg_ks_1", UNRELATED_DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      advanceUntilAt("r_kg_ks_2");
      const before = snapshotRelevantState();
      stepOnceToward("r_kg_ks_2"); // 単一経路でr_kg_ks_3へ実移動(TARGETを通過)
      expect(useGameStore.getState().players[0].currentNodeId).toBe("r_kg_ks_3");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe("r_kg_ks_2");
      expect(after.money).toBe(before.money);
      expect(after.status).toBe("selectingRoute"); // 同期的にendTurn()まで進んでいない
      expect(after.logLength).toBe(before.logLength);
    });
  });

  describe("目的地ノードへstepBack()で戻っても到着扱いにならない(最重要)", () => {
    it("hub_kamakura(目的地)へ戻ってもdestinationArrivedにならない", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(5);
      useGameStore.getState().rollDice(); // remainingMoves=5

      useGameStore.getState().advanceStep(); // wp_komachi2の分岐 -> selectingRoute
      useGameStore.getState().chooseRoute("wp_komachi1"); // remainingMoves 5->4
      useGameStore.getState().advanceStep(); // wp_komachi1単一経路 -> kmlp_eへ自動移動, remainingMoves 4->3
      useGameStore.getState().advanceStep(); // kmlp_eの分岐 -> selectingRoute
      useGameStore.getState().chooseRoute("hub_kamakura"); // remainingMoves 3->2、目的地ノードへ実移動

      const onDestination = snapshotRelevantState();
      expect(onDestination.currentNodeId).toBe(DESTINATION);
      expect(onDestination.remainingMoves).toBeGreaterThan(0); // まだ移動中(着地処理は未実行)
      expect(onDestination.status).not.toBe("destinationArrived");
      expect(onDestination.arrivalInfo).toBeNull();

      useGameStore.getState().advanceStep(); // hub_kamakuraの分岐 -> selectingRoute
      const branchAtDest = useGameStore.getState().routeOptions.map((o) => o.nodeId);
      useGameStore.getState().chooseRoute(branchAtDest[0]); // 目的地を通過し、さらに1マス先へ実移動, remainingMoves 2->1
      expect(useGameStore.getState().players[0].currentNodeId).toBe(branchAtDest[0]);

      const beforeStepBack = snapshotRelevantState();

      useGameStore.getState().stepBack(); // ここでhub_kamakuraへ戻る

      const after = snapshotRelevantState();
      expect(after.currentNodeId).toBe(DESTINATION); // 目的地ノードへ戻った
      expect(after.status).toBe("selectingRoute"); // destinationArrivedになっていない
      expect(after.arrivalInfo).toBeNull();
      expect(after.destinationsReached).toBe(0); // 到着ボーナスのdestinationsReached増加なし
      expect(after.money).toBe(beforeStepBack.money); // 到着ボーナス加算なし
      expect(after.destinationNodeId).toBe(DESTINATION); // 次の目的地が再抽選されていない
      expect(after.remainingMoves).toBe(beforeStepBack.remainingMoves + 1);
    });
  });

  describe("戻った後に再び前進できる", () => {
    it("stepBack()の後、chooseRoute()/advanceStep()で矛盾なく前進を再開できる", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      useGameStore.getState().advanceStep(); // wp_komachi2の分岐
      useGameStore.getState().chooseRoute("wp_komachi1"); // remainingMoves 3->2
      useGameStore.getState().stepBack(); // remainingMoves 2->3, wp_komachi2へ戻る

      const afterStepBack = snapshotRelevantState();
      expect(afterStepBack.currentNodeId).toBe("wp_komachi2");
      expect(afterStepBack.remainingMoves).toBe(3);
      expect(afterStepBack.status).toBe("selectingRoute");

      // 戻った後、同じ方向へ再度前進(公開アクションのみで再開できることを確認)。
      useGameStore.getState().chooseRoute("wp_komachi1");
      const afterReChoose = snapshotRelevantState();
      expect(afterReChoose.currentNodeId).toBe("wp_komachi1");
      expect(afterReChoose.moveHistory).toEqual(["wp_komachi2", "wp_komachi1"]); // 履歴が壊れていない
      expect(afterReChoose.remainingMoves).toBe(2); // 3 -> 2、消費数の整合が取れている

      // そのまま最後まで進めても矛盾なく着地できることを確認する。
      driveToLandingToward("kmlp_e");
      const finalState = useGameStore.getState();
      expect(finalState.remainingMoves).toBe(0);
      expect(finalState.players[0].moveHistory.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("戻れる履歴がない場合は完全なno-op", () => {
    it("moveHistory.length < 2(ロール直後、1回も移動していない)のときstepBack()は何も変えない", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice(); // moveHistory=["wp_komachi2"](1件のみ)、status:"moving"

      const before = snapshotRelevantState();
      expect(before.moveHistory).toEqual([START_3_AWAY]);

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after).toEqual(before); // すべてのフィールドが完全に不変
    });

    it("selectingRoute中で1回も移動していない場合もno-op", () => {
      placePlayerAt(START_3_AWAY, DESTINATION);
      mockSingleDiceFace(3);
      useGameStore.getState().rollDice();
      useGameStore.getState().advanceStep(); // wp_komachi2の分岐 -> selectingRoute、まだ移動していない

      const before = snapshotRelevantState();
      expect(before.moveHistory).toEqual([START_3_AWAY]);
      expect(before.status).toBe("selectingRoute");

      useGameStore.getState().stepBack();

      const after = snapshotRelevantState();
      expect(after).toEqual(before);
    });
  });
});
