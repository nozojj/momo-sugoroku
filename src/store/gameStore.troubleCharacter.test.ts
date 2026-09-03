// 妨害キャラ(仮称)まわりの、useGameStoreの公開アクションを通した統合テスト。
// gameStore.destinationArrival.test.tsと同じ方針: privateな内部関数(checkTroubleCharacterHandoff等の
// gameStore.ts内クロージャ)には触れず、公開アクション(rollDice/advanceStep/chooseRoute/useCard/
// continueAfter*)だけを使って、UIのアニメーション(setTimeout)を挟まずに同期的に検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";
import { STARTING_MONEY } from "@/lib/game/engine";
import { troubleCharacterMischiefSakeDefs } from "@/data/troubleCharacterMischiefSake";
import { troubleCharacterMischiefSeagullKingDefs } from "@/data/troubleCharacterMischiefSeagullKing";
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

  // S-3c: 憑依カウント(troubleCharacterPossessionCount)も同じ不変条件でnullになる。
  it("憑依カウント(troubleCharacterPossessionCount)もnull(未登場)である", () => {
    expect(useGameStore.getState().troubleCharacterPossessionCount).toBeNull();
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
    // S-3c: 憑依カウントも初登場時は必ず0から始まる(同じset()内で確定させる)。
    expect(after.troubleCharacterPossessionCount).toBe(0);
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
      troubleCharacterPossessionCount: 5, // 既にある程度耐えている状態を模擬
      troubleCharacterAnnounceInfo: null,
    }));

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.status).toBe("destinationArrived");
    expect(after.troubleCharacterOwnerId).toBe("p2"); // 変わらない
    expect(after.troubleCharacterFormId).toBe("normal"); // 形態も上書きされない(S-3a)
    expect(after.troubleCharacterPossessionCount).toBe(5); // 憑依カウントも上書きされない(S-3c)
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
      troubleCharacterFormId: "normal",
      // S-3c: 既にある程度耐えていた状態(0ではない値)を模擬する。handoffで実際に0へ
      // リセットされることを意味のある形で検証するため。
      troubleCharacterPossessionCount: 5,
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
    // S-3c: handoff成功時は形態・憑依カウントを必ず基準形態(normal)・0へリセットする
    // (「早く他人へ押し付ければ助かる」というゲーム性を優先する正式仕様)。
    expect(after.troubleCharacterFormId).toBe("normal");
    expect(after.troubleCharacterPossessionCount).toBe(0);
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
    expect(after.troubleCharacterPossessionCount).toBe(5); // handoffが起きていないのでリセットもされない
  });

  it.each([
    ["human", "cpu"],
    ["cpu", "human"],
    ["cpu", "cpu"],
  ] as const)("controlledBy(owner=%s, mover=%s)によらず同じ結果になる(形態・憑依カウントのリセットを含む)", (ownerControl, moverControl) => {
    setupHandoffScenario(ownerControl, moverControl);
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterFormId).toBe("normal");
    expect(after.troubleCharacterPossessionCount).toBe(0);
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
  // startCount(S-3c): 呼び出し時点の憑依カウントを模擬する(既定0=初登場相当)。
  // 「複数回の悪さで正しく増加する」ことを検証するテストは、これに非0の値を渡して使う。
  function arriveAtDestinationFocus(ownerId: "p1" | "p2", startCount = 0): void {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: ownerId,
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: startCount,
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
    // S-3c: 初登場相当(count 0)から1回悪さを受けたので1になる。
    expect(after.troubleCharacterPossessionCount).toBe(1);
    // count閾値(atCount:3)未満のため、悪さを受けても形態はnormalのまま変わらない。
    expect(after.troubleCharacterFormId).toBe("normal");

    const p2After = after.players[1];
    const moneyChanged = p2After.money !== p2MoneyBefore;
    const debuffAdded = p2After.activeDebuffs.length > p2DebuffsBefore;
    expect(moneyChanged || debuffAdded).toBe(true); // 何らかの悪さが発生している

    // S-3f-2: 変身が起きていないので保留(pending)は使われず、mischiefだけがそのまま
    // troubleCharacterAnnounceInfoに入る。dismissTroubleCharacterAnnounce()を1回呼べば
    // 従来通りnullへ戻り、pendingが存在しないので何も昇格しない。
    expect(after.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterDismiss = useGameStore.getState();
    expect(afterDismiss.troubleCharacterAnnounceInfo).toBeNull();
    expect(afterDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
  });

  // S-3c: 複数回の悪さを受けても、憑依カウントは前回の値からリセットされずに続けて加算される。
  it("複数回の悪さを受けると、憑依カウントは前回の値から続けて加算される", () => {
    arriveAtDestinationFocus("p2", 4); // 既に4回受けている状態から開始
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("mischief");
    expect(after.troubleCharacterPossessionCount).toBe(5); // 4 -> 5(0へリセットされない)
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
    // S-3c: 所有者(p1)の憑依カウントも、p1の手番が来ていないので変化しない(0のまま)。
    expect(after.troubleCharacterPossessionCount).toBe(0);
  });

  it("所持金減少パターン(money)が正しく反映される", () => {
    arriveAtDestinationFocus("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.1); // weight配分(money40/halve40/skip20)でmoney側になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", mischiefKind: "money" });
    expect(after.players[1].money).toBeLessThan(STARTING_MONEY);
  });

  // Polish Phase P1 S-3f-4: kind:"money"のmischiefは、実際に所持金へ適用された金額
  // (trouble_money_pinch: -50万円)が、再計算ではなくそのままhighlightAmountへ渡される。
  it("kind:moneyのmischiefは、実際に減った所持金と一致するhighlightAmountを持つ", () => {
    arriveAtDestinationFocus("p2");
    const p2MoneyBefore = useGameStore.getState().players[1].money;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // money側(trouble_money_pinch、amount:-50)になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", mischiefKind: "money", highlightAmount: -50 });
    expect(after.players[1].money).toBe(p2MoneyBefore - 50);
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

  // Polish Phase P1 S-3f-4: kind:"debuff"は金額を持たないため、highlightAmountはundefinedのまま
  // (TroubleCharacterAnnounceModal.tsx側でhighlight表示を追加しない判定に使われる)。
  it("kind:debuffのmischiefはhighlightAmountを持たない(undefined)", () => {
    arriveAtDestinationFocus("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", mischiefKind: "debuff" });
    if (after.troubleCharacterAnnounceInfo?.kind === "mischief") {
      expect(after.troubleCharacterAnnounceInfo.highlightAmount).toBeUndefined();
    }
  });
});

// S-3d: normal→sake変身が、実データ(data/troubleCharacterForms.ts)を通じて実際に成立する
// ことを検証する。上の「悪さ発生」describeと同じ「目的地到着→destinationFocus→
// advanceToNextTurn」経路を使う(private関数には触れない)。
describe("normal→sake変身(advanceToNextTurn経由、実データ)(S-3d)", () => {
  function arriveAtDestinationFocus(ownerId: "p1" | "p2", startCount: number, startForm: "normal" | "sake" = "normal"): void {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: ownerId,
      troubleCharacterFormId: startForm,
      troubleCharacterPossessionCount: startCount,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();
    useGameStore.getState().continueAfterArrival();
  }

  function advanceToNextPlayer(): void {
    useGameStore.getState().continueAfterDestinationFocus();
  }

  it("count閾値未満(count<3)では、変身判定に最も有利なrandom値でもnormalのまま(countは通常通り加算される)", () => {
    arriveAtDestinationFocus("p2", 2); // 閾値(atCount:3)未満
    vi.spyOn(Math, "random").mockReturnValue(0); // 変身判定・悪さ抽選のどちらにも最も有利な値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("normal"); // 変身しない
    expect(after.troubleCharacterPossessionCount).toBe(3); // 2 -> 3(加算自体は通常通り)
  });

  it("count=7(100%段階)に到達すると、次の所有者ターンで確実にsakeへ変身し、sakeのmischiefPoolから悪さが抽選され、countは1になる", () => {
    arriveAtDestinationFocus("p2", 7);
    vi.spyOn(Math, "random").mockReturnValue(0.05); // 変身確率100%なのでどんな値でも成立する
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("sake"); // 変身成立
    expect(after.troubleCharacterPossessionCount).toBe(1); // 0へリセットされた直後の1回分
    // S-3f-2: 変身が成立したターンは、まずtransformアナウンスがtroubleCharacterAnnounceInfoへ
    // 入り、mischief自体は抽選・適用済みのままtroubleCharacterPendingMischiefAnnounceInfoへ
    // 保留される(mischiefの抽選・適用タイミング自体は変更していない)。
    expect(after.troubleCharacterAnnounceInfo).toEqual({ kind: "transform", fromFormId: "normal", toFormId: "sake" });
    const pending = after.troubleCharacterPendingMischiefAnnounceInfo;
    expect(pending?.kind).toBe("mischief");
    // sakeのmischiefPool由来のメッセージであることを、実データと突き合わせて確認する
    // (normal側のメッセージは一切含まれないことも同時に保証する)。
    if (pending?.kind === "mischief") {
      const sakeMessages = troubleCharacterMischiefSakeDefs.map((m) => m.message);
      expect(sakeMessages).toContain(pending.message);
    }
  });

  // S-3f-2: dismissTroubleCharacterAnnounce()を1回呼ぶとtransformが閉じ、保留中のmischiefが
  // troubleCharacterAnnounceInfoへ昇格する。もう1回呼ぶとそのmischiefも閉じ、pendingは
  // 既にnullなのでtroubleCharacterAnnounceInfoはそのままnullへ戻る(二重表示・消失のどちらも
  // 起きない、close連打で壊れないことの確認)。
  it("transformを閉じるとpending mischiefがtroubleCharacterAnnounceInfoへ昇格し、pendingはnullに戻る", () => {
    arriveAtDestinationFocus("p2", 7);
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    advanceToNextPlayer();

    const afterTransform = useGameStore.getState();
    expect(afterTransform.troubleCharacterAnnounceInfo?.kind).toBe("transform");
    const pendingBeforeDismiss = afterTransform.troubleCharacterPendingMischiefAnnounceInfo;
    expect(pendingBeforeDismiss?.kind).toBe("mischief");

    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterFirstDismiss = useGameStore.getState();
    // 昇格後のtroubleCharacterAnnounceInfoは、閉じる直前のpendingとまったく同じ中身になる
    // (transformを閉じただけで、mischiefの内容自体は一切変わらない)。
    expect(afterFirstDismiss.troubleCharacterAnnounceInfo).toEqual(pendingBeforeDismiss);
    expect(afterFirstDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull(); // 保留は消費済み

    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterSecondDismiss = useGameStore.getState();
    expect(afterSecondDismiss.troubleCharacterAnnounceInfo).toBeNull(); // mischiefも閉じられた
    expect(afterSecondDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull(); // pendingは再発生しない

    // close連打(3回目)しても状態は壊れず、nullのままを維持する。
    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterThirdDismiss = useGameStore.getState();
    expect(afterThirdDismiss.troubleCharacterAnnounceInfo).toBeNull();
    expect(afterThirdDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
  });

  it("sake状態で次の悪さが発動すると、変身せずcountが継続加算される(count閾値[atCount:3]未満のため)", () => {
    arriveAtDestinationFocus("p2", 2, "sake");
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("sake"); // count閾値未満のため変身しない
    expect(after.troubleCharacterPossessionCount).toBe(3); // 2 -> 3(通常通り加算)
    // S-3f-2: 変身しなかったターンはpendingが使われない(mischiefのみ即座に表示、従来通り)。
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("mischief");
    expect(after.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
  });

  it("sake状態でhandoffが成功すると、normal/count 0へリセットされる(強い形態のまま他人へ渡らない)", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterFormId: "sake",
      troubleCharacterPossessionCount: 5,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterFormId).toBe("normal"); // sakeのまま渡らない
    expect(after.troubleCharacterPossessionCount).toBe(0);
  });

  it.each([
    ["human", "cpu"],
    ["cpu", "human"],
    ["cpu", "cpu"],
  ] as const)("sake状態からのhandoffリセットはcontrolledBy(owner=%s, mover=%s)によらず同じ結果になる", (ownerControl, moverControl) => {
    startTwoPlayerGame(["human", "human"]);
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY], controlledBy: moverControl },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION], controlledBy: ownerControl },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterFormId: "sake",
      troubleCharacterPossessionCount: 5,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterFormId).toBe("normal");
    expect(after.troubleCharacterPossessionCount).toBe(0);
  });
});

// S-3e: sake→seagullKing変身が、実データ(data/troubleCharacterForms.ts)を通じて実際に
// 成立することを検証する。sake→seagullKingはminProgressRatio: 0.7を持つため、S-3dの
// normal→sakeテストと異なりturn/totalTurnsを明示的に制御する必要がある
// (startTwoPlayerGame()は1年ゲーム=totalTurns12がデフォルト)。
describe("sake→seagullKing変身(advanceToNextTurn経由、実データ)(S-3e)", () => {
  function arriveAtDestinationFocusAtTurn(
    ownerId: "p1" | "p2",
    startCount: number,
    startForm: "sake" | "seagullKing",
    turn: number,
  ): void {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      turn,
      troubleCharacterOwnerId: ownerId,
      troubleCharacterFormId: startForm,
      troubleCharacterPossessionCount: startCount,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();
    useGameStore.getState().continueAfterArrival();
  }

  function advanceToNextPlayer(): void {
    useGameStore.getState().continueAfterDestinationFocus();
  }

  it("進行度70%未満(turn5/12≒42%)では、count=8(100%段階)でもminProgressRatioゲートにより変身しない", () => {
    arriveAtDestinationFocusAtTurn("p2", 8, "sake", 5);
    vi.spyOn(Math, "random").mockReturnValue(0); // 変身判定に最も有利な値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("sake"); // ゲート未達のため変身しない
    expect(after.troubleCharacterPossessionCount).toBe(9); // 8 -> 9(通常通り加算は続く)
  });

  it("進行度70%以上(turn9/12=75%)・count=8(100%段階)で確実にseagullKingへ変身し、seagullKingのmischiefPoolから悪さが抽選され、countは1になる", () => {
    arriveAtDestinationFocusAtTurn("p2", 8, "sake", 9);
    vi.spyOn(Math, "random").mockReturnValue(0.05); // 変身確率100%なのでどんな値でも成立する
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("seagullKing"); // 変身成立
    expect(after.troubleCharacterPossessionCount).toBe(1); // 0へリセットされた直後の1回分
    // S-3f-2: sake→seagullKingも同じ順序(transformを先にtroubleCharacterAnnounceInfoへ、
    // mischiefはtroubleCharacterPendingMischiefAnnounceInfoへ保留)になる。
    expect(after.troubleCharacterAnnounceInfo).toEqual({ kind: "transform", fromFormId: "sake", toFormId: "seagullKing" });
    const pending = after.troubleCharacterPendingMischiefAnnounceInfo;
    expect(pending?.kind).toBe("mischief");
    // seagullKingのmischiefPool由来のメッセージであることを、実データと突き合わせて確認する。
    if (pending?.kind === "mischief") {
      const seagullKingMessages = troubleCharacterMischiefSeagullKingDefs.map((m) => m.message);
      expect(seagullKingMessages).toContain(pending.message);
    }
  });

  it("seagullKing状態で次の悪さが発動しても、変身せずcountが継続加算される(最終形態のためtransformを持たない)", () => {
    arriveAtDestinationFocusAtTurn("p2", 2, "seagullKing", 9);
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterFormId).toBe("seagullKing"); // 進化先が無いため変身しない
    expect(after.troubleCharacterPossessionCount).toBe(3); // 2 -> 3(通常通り加算)
    // S-3f-2: 変身しなかったターンはpendingが使われない(mischiefのみ即座に表示、従来通り)。
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("mischief");
    expect(after.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
  });

  it("transformを閉じるとpending mischiefがtroubleCharacterAnnounceInfoへ昇格する(sake→seagullKing)", () => {
    arriveAtDestinationFocusAtTurn("p2", 8, "sake", 9);
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    advanceToNextPlayer();

    const afterTransform = useGameStore.getState();
    expect(afterTransform.troubleCharacterAnnounceInfo?.kind).toBe("transform");
    const pendingBeforeDismiss = afterTransform.troubleCharacterPendingMischiefAnnounceInfo;
    expect(pendingBeforeDismiss?.kind).toBe("mischief");

    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterFirstDismiss = useGameStore.getState();
    expect(afterFirstDismiss.troubleCharacterAnnounceInfo).toEqual(pendingBeforeDismiss);
    expect(afterFirstDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();

    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterSecondDismiss = useGameStore.getState();
    expect(afterSecondDismiss.troubleCharacterAnnounceInfo).toBeNull();
    expect(afterSecondDismiss.troubleCharacterPendingMischiefAnnounceInfo).toBeNull();
  });

  it("seagullKing状態でhandoffが成功すると、normal/count 0へリセットされる(最終形態のまま他人へ渡らない)", () => {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterFormId: "seagullKing",
      troubleCharacterPossessionCount: 5,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterFormId).toBe("normal"); // seagullKingのまま渡らない
    expect(after.troubleCharacterPossessionCount).toBe(0);
  });

  it.each([
    ["human", "cpu"],
    ["cpu", "human"],
    ["cpu", "cpu"],
  ] as const)("seagullKing状態からのhandoffリセットはcontrolledBy(owner=%s, mover=%s)によらず同じ結果になる", (ownerControl, moverControl) => {
    startTwoPlayerGame(["human", "human"]);
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY], controlledBy: moverControl },
        { ...s.players[1], currentNodeId: DESTINATION, moveHistory: [DESTINATION], controlledBy: ownerControl },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: "p2",
      troubleCharacterFormId: "seagullKing",
      troubleCharacterPossessionCount: 5,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);

    useGameStore.getState().rollDice();
    driveToLanding();

    const after = useGameStore.getState();
    expect(after.troubleCharacterOwnerId).toBe("p1");
    expect(after.troubleCharacterFormId).toBe("normal");
    expect(after.troubleCharacterPossessionCount).toBe(0);
  });
});

// S-3c: skipNextRollで所有者の手番が飛ばされる場合、悪さ・憑依カウントの加算・変身判定の
// いずれも発生しないことを検証する。カード(お休みカード/card_debuff_skip)を使って、移動を
// 一切介さずにskipNextRollを付与する(既存のgameStore.card.test.tsの
// 「confirmTargetSelection(): 対象プレイヤーにデバフが付与され、カードが消費され、手番が進む」
// テストと同じ経路: 2人プレイでは付与直後のadvanceToNextTurn()がそのままskipを検知して
// 消費し、キャスター側の手番に戻ってくる)。
describe("skipNextRollで所有者の手番が飛ばされる場合(S-3c)", () => {
  it("悪さの発動・憑依カウントの加算・変身判定のいずれも発生しない", () => {
    useGameStore.setState((s) => ({
      players: s.players.map((p, i) => (i === 0 ? { ...p, cardIds: ["card_debuff_skip"] } : p)),
      troubleCharacterOwnerId: "p2",
      troubleCharacterFormId: "normal",
      // かなり危険な状態(閾値到達間近)を模擬しても、スキップされれば一切進行しないことを確認する。
      troubleCharacterPossessionCount: 6,
      troubleCharacterAnnounceInfo: null,
    }));

    useGameStore.getState().useCard("card_debuff_skip");
    useGameStore.getState().confirmTargetSelection("p2"); // p2(所有者)へskipNextRollを付与

    const after = useGameStore.getState();
    // 2人プレイなので、p2のskipNextRollは付与直後のadvanceToNextTurn()内でそのまま消費され、
    // p1(自分)の番に戻ってくる。
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.status).toBe("rolling");
    expect(after.troubleCharacterOwnerId).toBe("p2"); // 所有者は変わらない
    expect(after.troubleCharacterFormId).toBe("normal"); // 変身判定も走っていない
    expect(after.troubleCharacterPossessionCount).toBe(6); // 悪さが発動していないので増えない
    expect(after.troubleCharacterAnnounceInfo).toBeNull(); // 悪さ通知も出ない(handoffも別途起きていない)
  });
});

// Polish Phase P1 S-3f-5: severity/highlightAmount/highlightTextが、実データ(seagullKingの
// mischiefPool)を通じてgameStore.ts側で正しく配線されることを、advanceToNextTurn()経由の
// 公開アクションだけで検証する(troubleCharacter.test.tsのjudgeMischiefSeverity()/
// deriveMischiefAnnounceHighlight()単体テストとは別に、実際にgameStoreへ反映されることを
// end-to-endで確認する)。seagullKingはtransformを持たない(最終形態)ため、Math.random()は
// drawTroubleCharacterMischief()の抽選(および必要な場合のみpickRandomDistinct())にしか
// 使われず、単一のmockReturnValueで決定論的に狙ったmischiefを選べる。
describe("重大mischief(severity heavy)のgameStore配線(advanceToNextTurn経由、実データ)(Polish Phase P1 S-3f-5)", () => {
  function arriveAtDestinationFocusAsSeagullKing(ownerId: "p1" | "p2"): void {
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: START_3_AWAY, moveHistory: [START_3_AWAY] },
        { ...s.players[1], currentNodeId: OTHER_HUB, moveHistory: [OTHER_HUB] },
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
      troubleCharacterOwnerId: ownerId,
      troubleCharacterFormId: "seagullKing",
      troubleCharacterPossessionCount: 2,
      troubleCharacterAnnounceInfo: null,
    }));
    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();
    driveToLanding();
    useGameStore.getState().continueAfterArrival();
  }

  function advanceToNextPlayer(): void {
    useGameStore.getState().continueAfterDestinationFocus();
  }

  it("money_smash(実データ-150万円)が選ばれると、severity:heavy・highlightAmount:-150で通知され、highlightTextは持たない", () => {
    arriveAtDestinationFocusAsSeagullKing("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.4); // weight配分(35/25/20/20)でmoney_smash(累積範囲[35,60))になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({
      kind: "mischief",
      mischiefKind: "money",
      highlightAmount: -150,
      severity: "heavy",
    });
    if (after.troubleCharacterAnnounceInfo?.kind === "mischief") {
      expect(after.troubleCharacterAnnounceInfo.highlightText).toBeUndefined();
    }
  });

  it("property_seize(所有物件0件→fallback実データ-100万円)は、「物件を失った」とは表示せずseverity:heavy・highlightAmount:-100で通知される", () => {
    arriveAtDestinationFocusAsSeagullKing("p2"); // p2はownedPropertyIds未設定(0件)のまま
    vi.spyOn(Math, "random").mockReturnValue(0.1); // weight配分でproperty_seize(累積範囲[0,35))になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({
      kind: "mischief",
      mischiefKind: "propertyLoss",
      highlightAmount: -100,
      severity: "heavy",
    });
    if (after.troubleCharacterAnnounceInfo?.kind === "mischief") {
      expect(after.troubleCharacterAnnounceInfo.highlightText).toBeUndefined(); // 物件名は表示しない(実際に失っていないため)
    }
  });

  it("card_annihilate(所持カード2枚)は、実際に破壊された枚数(2枚、maxCount=3ではない)を反映したhighlightText・severity:heavyで通知される", () => {
    useGameStore.setState((s) => ({
      players: s.players.map((p, i) => (i === 1 ? { ...p, cardIds: ["card_dice_again", "card_double_move"] } : p)),
    }));
    arriveAtDestinationFocusAsSeagullKing("p2");
    vi.spyOn(Math, "random").mockReturnValue(0.9); // weight配分でcard_annihilate(累積範囲[80,100))になる値
    advanceToNextPlayer();

    const after = useGameStore.getState();
    expect(after.troubleCharacterAnnounceInfo).toMatchObject({
      kind: "mischief",
      mischiefKind: "cardDestroy",
      highlightText: "カードを2枚失った!",
      severity: "heavy",
    });
    expect(after.players.find((p) => p.id === "p2")!.cardIds).toEqual([]); // 所持していた2枚とも破壊された
  });
});
