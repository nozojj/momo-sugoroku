// 目的地到着仕様の自動テスト(第1弾)。
//
// 検証する対象は useGameStore の公開アクション(rollDice/advanceStep/chooseRoute)
// だけで、resolveLanding()/finishLandingAndEndTurn()/checkDestinationArrival()/endTurn()
// のようなprivateな内部関数はテストのためにexportしたり分割したりしていない。
// GameScreen.tsxが実際に呼んでいるのと同じ経路を、UIのアニメーション(setTimeout)を
// 挟まずに同期的に呼び出して検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";
import { DESTINATION_BONUS } from "@/lib/game/engine";
import { freshGame, placePlayerAt, mockSingleDiceFace, stepOnce, driveToLanding } from "./gameStore.testHelpers";

/**
 * このテストが依存する実マップ上の経路: wp_komachi2 → hub_kamakura (現マップで3マス)。
 * 「3マス」という前提を盲目的に信じず、beforeEachで毎回 shortestDistance() により
 * 実際のグラフに対して確認する。マップ改変で距離が変わった場合はここで即座に失敗し、
 * 誤った前提のままテストが緑になることを防ぐ。
 * hub_kamakuraは目的地候補ノード(isDestinationCandidate)の1つ。
 */
const MAP_ID = "shonan-full";
const DESTINATION = "hub_kamakura";
const START_3_AWAY = "wp_komachi2";
const EXPECTED_DISTANCE = 3;

describe("目的地到着仕様: 通過では到着せず、ピッタリ停止したときだけ到着する", () => {
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

  it("ケース1: 目的地まで3マス・出目3 → ピッタリ到着", () => {
    placePlayerAt(START_3_AWAY, DESTINATION);
    const startMoney = useGameStore.getState().players[0].money;

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const s = useGameStore.getState();
    expect(s.players[0].currentNodeId).toBe(DESTINATION); // 目的地に停止する
    expect(s.status).toBe("destinationArrived"); // destinationArrivedになる
    expect(s.arrivalInfo).not.toBeNull(); // arrivalInfoが生成される
    expect(s.arrivalInfo?.destinationName).toBe(getMap(MAP_ID).nodes.find((n) => n.id === DESTINATION)?.name);
    expect(s.players[0].destinationsReached).toBe(1); // destinationsReachedが1増える
    expect(s.players[0].money).toBe(startMoney + DESTINATION_BONUS); // 到着ボーナスが1回だけ加算される
    expect(s.destinationNodeId).not.toBe(DESTINATION); // 次の目的地が選ばれる(元の目的地から変わる)
  });

  it("ケース2: 目的地まで3マス・出目5 → 3マス目で通過、到着扱いにならない", () => {
    placePlayerAt(START_3_AWAY, DESTINATION);
    const startMoney = useGameStore.getState().players[0].money;
    const startDestination = useGameStore.getState().destinationNodeId;

    mockSingleDiceFace(5);
    useGameStore.getState().rollDice();

    let passedThroughDestination = false;
    for (let i = 0; i < 200; i++) {
      const before = useGameStore.getState();
      if (before.status !== "moving" && before.status !== "selectingRoute") break;
      const stillGoing = stepOnce();
      const after = useGameStore.getState();

      if (after.players[0].currentNodeId === DESTINATION && after.remainingMoves > 0) {
        passedThroughDestination = true;
        // 通過した瞬間: 到着扱いになっていないこと
        expect(after.remainingMoves).toBeGreaterThan(0);
        expect(after.status).not.toBe("destinationArrived");
        expect(after.arrivalInfo).toBeNull(); // 到着演出が発生しない
        expect(after.players[0].destinationsReached).toBe(0); // 到着ボーナスが加算されない
        expect(after.players[0].money).toBe(startMoney);
        expect(after.destinationNodeId).toBe(startDestination); // 次の目的地抽選が発生しない
      }
      if (!stillGoing) break;
    }

    // このテスト自体が「本当に目的地を通過したか」を前提にしている。
    // ここがfalseのままならテストの意味が無いので、明示的に確認する。
    expect(passedThroughDestination).toBe(true);

    const finalState = useGameStore.getState();
    expect(finalState.status).not.toBe("destinationArrived");
    expect(finalState.arrivalInfo).toBeNull();
    expect(finalState.players[0].destinationsReached).toBe(0);
    expect(finalState.players[0].currentNodeId).not.toBe(DESTINATION); // 目的地とは別マスに停止している
    expect(finalState.destinationNodeId).toBe(startDestination); // 目的地の再抽選も起きていない
  });

  it("ケース3: 分岐選択中(目的地が選択肢に含まれる)では到着判定されない", () => {
    // kmlp_e は hub_kamakura への分岐点の1つで、選択肢に目的地(hub_kamakura)自身を含む
    // (第一段階の目的地到着調査でも確認済みの分岐)。ここへ直接配置し、advanceStep()を
    // 1回呼ぶだけで、着地処理を一切経由せずselectingRouteへ入る状況を作れる。
    const BRANCH_WITH_DESTINATION_OPTION = "kmlp_e";
    placePlayerAt(BRANCH_WITH_DESTINATION_OPTION, DESTINATION);
    const startMoney = useGameStore.getState().players[0].money;

    mockSingleDiceFace(1);
    useGameStore.getState().rollDice();
    useGameStore.getState().advanceStep();

    const s = useGameStore.getState();
    expect(s.status).toBe("selectingRoute");
    expect(s.routeOptions.some((o) => o.nodeId === DESTINATION)).toBe(true);
    expect(s.arrivalInfo).toBeNull();
    expect(s.players[0].destinationsReached).toBe(0);
    expect(s.players[0].money).toBe(startMoney);
  });

  it("ケース4: 二重発火防止(到着後にadvanceStep/chooseRouteを呼んでも状態が変わらない)", () => {
    placePlayerAt(START_3_AWAY, DESTINATION);
    const startMoney = useGameStore.getState().players[0].money;

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const arrived = useGameStore.getState();
    expect(arrived.status).toBe("destinationArrived");
    expect(arrived.players[0].money).toBe(startMoney + DESTINATION_BONUS); // 1回だけ加算されている

    const moneyAfterArrival = arrived.players[0].money;
    const destinationsReachedAfterArrival = arrived.players[0].destinationsReached;
    const nextDestinationAfterArrival = arrived.destinationNodeId;
    const arrivalInfoAfterArrival = arrived.arrivalInfo;

    // status !== "moving"/"selectingRoute" のガードにより、これらの呼び出しは本来no-opのはず。
    useGameStore.getState().advanceStep();
    useGameStore.getState().chooseRoute("hub_fujisawa");

    const after = useGameStore.getState();
    expect(after.players[0].money).toBe(moneyAfterArrival); // 二重加算されない
    expect(after.players[0].destinationsReached).toBe(destinationsReachedAfterArrival); // 二重加算されない
    expect(after.destinationNodeId).toBe(nextDestinationAfterArrival); // 再抽選されない
    expect(after.arrivalInfo).toEqual(arrivalInfoAfterArrival); // 上書きされない
  });
});
