// 妨害キャラ(仮称)まわりの、useGameStoreの公開アクションを通した統合テスト。
// gameStore.destinationArrival.test.tsと同じ方針: privateな内部関数(checkTroubleCharacterHandoff等の
// gameStore.ts内クロージャ)には触れず、公開アクション(rollDice/advanceStep/chooseRoute/useCard/
// continueAfter*)だけを使って、UIのアニメーション(setTimeout)を挟まずに同期的に検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";
import { STARTING_MONEY } from "@/lib/game/engine";
import { mockSingleDiceFace, driveToLanding } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
/** gameStore.destinationArrival.test.tsで検証済みの実マップ経路: wp_komachi2 → hub_kamakura(3マス)。 */
const DESTINATION = "hub_kamakura";
const START_3_AWAY = "wp_komachi2";
const EXPECTED_DISTANCE = 3;
/** 8つの目的地候補ノードのうち、DESTINATIONとは別の1つ。プレイヤーを離れた位置に置くのに使う。 */
const OTHER_HUB = "hub_chigasaki";

function startTwoPlayerGame(controllers: ["human" | "cpu", "human" | "cpu"] = ["human", "human"]): void {
  useGameStore.getState().resetGame();
  useGameStore.getState().startGame(["P1", "P2"], 1, controllers);
  const map = getMap(MAP_ID);
  const distance = shortestDistance(map, START_3_AWAY, DESTINATION, []);
  if (distance !== EXPECTED_DISTANCE) {
    throw new Error(
      `テスト前提が崩れています: ${START_3_AWAY} から ${DESTINATION} までの距離は${distance}マス(期待値: ${EXPECTED_DISTANCE}マス)。`,
    );
  }
}

beforeEach(() => {
  startTwoPlayerGame();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ゲーム開始時", () => {
  it("owner=null(未登場)である", () => {
    expect(useGameStore.getState().troubleCharacterOwnerId).toBeNull();
  });

  // S-3a: 未登場の間は形態(troubleCharacterFormId)もownerと表裏一体でnullになる
  // (owner=null・form=非nullという中間状態を許さない不変条件、types/game.ts参照)。
  it("形態(troubleCharacterFormId)もnull(未登場)である", () => {
    expect(useGameStore.getState().troubleCharacterFormId).toBeNull();
  });
});

describe("初回所有者決定", () => {
  it("最初の目的地到着時に、次目的地から最も遠いプレイヤーが初回所有者になる", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
    }));

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.status).toBe("destinationArrived");
    expect(after.troubleCharacterOwnerId).not.toBeNull();
    // S-3a: 初登場は必ず通常形態("normal")から始まる。ownerId確定と同じset()で
    // 一緒に書き込まれるため、owner有り・form無しの中間状態は発生しない。
    expect(after.troubleCharacterFormId).toBe("normal");
    expect(after.troubleCharacterAnnounceInfo).toEqual({
      kind: "appeared",
      ownerId: after.troubleCharacterOwnerId,
      ownerName: after.players.find((p) => p.id === after.troubleCharacterOwnerId)!.name,
    });

    // 期待値をshortestDistance()で自前計算し、実際の結果と突き合わせる
    // (どのノードが新しい目的地になるかは抽選なので、結果をハードコードせず都度計算する)。
    const map = getMap(MAP_ID);
    const newDest = after.destinationNodeId;
    const distances = after.players.map((p) => ({
      id: p.id,
      distance: shortestDistance(map, p.currentNodeId, newDest, p.cardIds) ?? Infinity,
    }));
    const maxDistance = Math.max(...distances.map((d) => d.distance));
    const expectedOwnerIds = distances.filter((d) => d.distance === maxDistance).map((d) => d.id);
    expect(expectedOwnerIds).toContain(after.troubleCharacterOwnerId);
  });

  it("2回目以降の目的地到着では初回所有者決定ロジックは動かない(既存所有者を上書きしない)", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2", // 既に所有者が決まっている状態を模擬
      troubleCharacterFormId: "normal",
      troubleCharacterAnnounceInfo: null,
    }));

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.status).toBe("destinationArrived");
    expect(after.troubleCharacterOwnerId).toBe("p2"); // 変わらない
    expect(after.troubleCharacterFormId).toBe("normal"); // 形態も上書きされない(S-3a)
    expect(after.troubleCharacterAnnounceInfo).toBeNull(); // 新規登場通知も出ない
  });
});

describe("所有者交代(finishLandingAndEndTurn経由)", () => {
  function setupHandoffScenario(ownerControl: "human" | "cpu", moverControl: "human" | "cpu"): void {
    startTwoPlayerGame(["human", "human"]);
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY], controlledBy: moverControl },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION], controlledBy: ownerControl },
      ],
      // driveToLanding()は目的地(destinationNodeId)方向へ最短優先で分岐を選ぶため、検証済みの
      // wp_komachi2→hub_kamakura(3マス)経路をそのまま辿らせるにはdestinationNodeIdもDESTINATIONに
      // 揃える必要がある(目的地到着自体が同時に起きても、ここでは所有者交代の結果だけを見る)。
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterAnnounceInfo: null,
    }));
  }

  it("所有者と同じマスへexact landingすると、所有者が今移動してきたプレイヤーへ移る", () => {
    setupHandoffScenario("human", "human");
    mockSingleDiceFace(3); // wp_komachi2から3マスでhub_kamakura(=DESTINATION=所有者のいるマス)にぴったり到着

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.players[0].currentNodeId).toBe(DESTINATION);
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterAnnounceInfo).toEqual({
      kind: "handoff",
      fromPlayerId: "p2",
      fromPlayerName: "P2",
      toPlayerId: "p1",
      toPlayerName: "P1",
    });
  });

  it("通過(目的地までの距離より大きい出目)では交代しない", () => {
    setupHandoffScenario("human", "human");
    mockSingleDiceFace(6); // 3マス地点(DESTINATION)を通過してさらに進む

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.players[0].currentNodeId).not.toBe(DESTINATION); // 通過して別マスに停止している
    expect(after.troubleCharacterOwnerId).toBe("p2"); // 交代していない
  });

  it.each([
    ["human", "cpu"],
    ["cpu", "human"],
    ["cpu", "cpu"],
  ] as const)("controlledBy(owner=%s, mover=%s)によらず同じ結果になる", (ownerControl, moverControl) => {
    setupHandoffScenario(ownerControl, moverControl);
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    expect(useGameStore.getState().troubleCharacterOwnerId).toBe("p1");
  });
});

describe("目的地到着との競合", () => {
  it("目的地到着と所有者交代が同じ着地で同時に成立しても、両方とも正しく処理される", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION] }, // 所有者が目的地に先着
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterAnnounceInfo: null,
    }));

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    // 所有者交代
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("handoff");
    // 目的地到着(両方が独立して成立している)
    expect(after.status).toBe("destinationArrived");
    expect(after.arrivalInfo).not.toBeNull();
    expect(after.players.find((p) => p.id === "p1")!.destinationsReached).toBe(1);
  });
});

describe("カードワープ着地との競合", () => {
  it("目的地ワープカードで着地しても所有者交代が発生する", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY], cardIds: ["card_warp_destination"] },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION] }, // 所有者がワープ先に先着
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterAnnounceInfo: null,
    }));

    useGameStore.getState().useCard("card_warp_destination");
    expect(useGameStore.getState().status).toBe("cardWarpAnnounce");
    useGameStore.getState().continueAfterWarpAnnounce();
    expect(useGameStore.getState().status).toBe("cardWarpFocus");
    useGameStore.getState().continueAfterCardWarpFocus();

    const after = useGameStore.getState();
    expect(after.players[0].currentNodeId).toBe(DESTINATION);
    expect(after.troubleCharacterOwnerId).toBe("p1"); // ワープ着地でも交代する
  });
});

describe("悪さ発生(advanceToNextTurn経由)", () => {
  /** 目的地到着 → continueAfterArrival() で destinationFocus まで、公開アクションだけで進める
   *  (gameStore.tsのprivate関数には触れない)。この時点ではまだ advanceToNextTurn() は呼ばれていない。
   *  mockSingleDiceFace()がMath.randomを消費するため、悪さ抽選用のMath.random制御は
   *  この関数の外(呼び出し側がcontinueAfterDestinationFocus()を呼ぶ直前)で行う。 */
  function arriveAtDestinationFocus(ownerId: "p1" | "p2"): void {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: ownerId,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding(); // p1がhub_kamakuraへ到着 -> destinationArrived
    useGameStore.getState().continueAfterArrival(); // -> destinationFocus
  }

  /** destinationFocus状態から advanceToNextTurn() まで進める(p2の番へ)。 */
  function advanceToNextPlayer(): void {
    useGameStore.getState().continueAfterDestinationFocus(); // -> endTurn -> advanceToNextTurn
  }

  it("所有者(次に手番を得るプレイヤー)のターン開始時にだけ悪さが1回発生する", () => {
    const before = useGameStore.getState();
    const p2MoneyBefore = before.players[1].money;
    const p2DebuffsBefore = before.players[1].activeDebuffs.length;

    arriveAtDestinationFocus("p2"); // p2(次に手番を得る)が所有者
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.currentPlayerIndex).toBe(1); // p2の番になった
    expect(after.status).toBe("rolling");
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("mischief");
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ playerId: "p2", playerName: "P2" });

    const p2After = after.players[1];
    const moneyChanged = p2After.money !== p2MoneyBefore;
    const debuffAdded = p2After.activeDebuffs.length > p2DebuffsBefore;
    expect(moneyChanged || debuffAdded).toBe(true); // 何らかの悪さが発生している
  });

  it("非所有者のターンが開始しても悪さは発生しない", () => {
    // p1が所有者のまま、p2(非所有者)へ手番が渡るシナリオ。
    // p1MoneyBeforeは到着ボーナス(DESTINATION_BONUS)反映後、手番送り直前の時点で取る
    // (悪さ以外の要因である到着ボーナスをここでの比較対象から除くため)。
    arriveAtDestinationFocus("p1");
    const p1MoneyBefore = useGameStore.getState().players[0].money;
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.currentPlayerIndex).toBe(1); // p2の番(非所有者)
    expect(after.troubleCharacterAnnounceInfo).toBeNull(); // 悪さ通知が出ていない
    expect(after.players[1].activeDebuffs).toHaveLength(0);
    // p1(所有者だが今回手番を得ていない)にも変化がない
    expect(after.players[0].money).toBe(p1MoneyBefore);
  });

  it("所持金減少パターン(money)が正しく反映される", () => {
    arriveAtDestinationFocus("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.1); // weight配分(money40/halve40/skip20)でmoney側になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", mischiefKind: "money" });
    expect(after.players[1].money).toBeLessThan(STARTING_MONEY);
  });

  it("デバフ付与パターン(debuff)が既存ActiveDebuffの形で正しく反映される", () => {
    arriveAtDestinationFocus("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.5); // weight配分でhalveDiceNextRoll側になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", mischiefKind: "debuff" });
    expect(after.players[1].activeDebuffs).toHaveLength(1);
    expect(after.players[1].activeDebuffs[0].kind).toBe("halveDiceNextRoll");
  });
});
