// カードシステム(useCard/confirmTargetSelection/cancelTargetSelection/resolveCardOverflow、
// および妨害デバフの付与・消費)の回帰テスト。
//
// 目的: 既存仕様・ゲームロジックは一切変更せず、現在の挙動をテストとして固定すること。
// gameStore.property.test.ts/gameStore.troubleCharacter.test.ts等と同じ方針: privateな内部関数
// (resolveLanding()/endTurn()/advanceToNextTurn()等)には触れず、公開アクションだけを使う。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode, destinationCandidateNodes } from "@/lib/game/mapGraph";
import { getAllPropertyGroupDefs } from "@/data/propertyGroups";
import { getCardDef } from "@/data/cards";
import { MAX_CARDS_PER_PLAYER } from "@/lib/game/engine";
import { freshGame, placePlayerAt, mockSingleDiceFace } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const START = "hub_fujisawa";
const DESTINATION = "hub_kamakura";

/** endTurn()の予約状態リセット・デバフ消費(skipNextRoll)テスト専用の、決め打ち1歩経路。
 *  hub_hiratsuka(4方向分岐) → hrlp_s(normal、着地してもmoneyRoulette等の追加確認待ちにならない)。 */
const NORMAL_LANDING_START = "hub_hiratsuka";
const NORMAL_LANDING_TARGET = "hrlp_s";

function giveCurrentPlayerCards(cardIds: string[]): void {
  useGameStore.setState((s) => ({
    players: s.players.map((p, i) => (i === s.currentPlayerIndex ? { ...p, cardIds } : p)),
  }));
}

function currentPlayer() {
  const s = useGameStore.getState();
  return s.players[s.currentPlayerIndex];
}

function lastLogMessage(): string {
  const log = useGameStore.getState().log;
  return log[log.length - 1]?.message ?? "";
}

beforeEach(() => {
  freshGame();
  placePlayerAt(START, DESTINATION);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("前提確認", () => {
  it(`${NORMAL_LANDING_START} → ${NORMAL_LANDING_TARGET} は距離1・type:"normal"である`, () => {
    const map = getMap(MAP_ID);
    const target = getNode(map, NORMAL_LANDING_TARGET);
    const hub = getNode(map, NORMAL_LANDING_START);
    if (target.type !== "normal" || !hub.connections.some((c) => c.to === NORMAL_LANDING_TARGET)) {
      throw new Error(
        `テスト前提が崩れています: ${NORMAL_LANDING_START}→${NORMAL_LANDING_TARGET}は距離1・type:"normal"の前提だが、実際はtype:"${target.type}"でした。マップデータが変更された可能性があります。`,
      );
    }
    expect(target.type).toBe("normal");
  });
});

describe("useCard(): 使用条件のガード", () => {
  it("status !== 'rolling' のときは何も起きない", () => {
    giveCurrentPlayerCards(["card_dice_again"]);
    useGameStore.setState({ status: "moving" });
    useGameStore.getState().useCard("card_dice_again");

    const s = useGameStore.getState();
    expect(s.status).toBe("moving");
    expect(s.extraRollGranted).toBe(false);
    expect(currentPlayer().cardIds).toContain("card_dice_again");
  });

  it("既にサイコロを振った後(diceResult !== null)は何も起きない", () => {
    giveCurrentPlayerCards(["card_dice_again"]);
    useGameStore.setState({ diceResult: 4 });
    useGameStore.getState().useCard("card_dice_again");

    expect(useGameStore.getState().extraRollGranted).toBe(false);
    expect(currentPlayer().cardIds).toContain("card_dice_again");
  });

  it("持っていないカードIDを指定しても何も起きない", () => {
    giveCurrentPlayerCards([]);
    useGameStore.getState().useCard("card_dice_again");

    const s = useGameStore.getState();
    expect(s.extraRollGranted).toBe(false);
    expect(s.status).toBe("rolling");
  });

  it("kind:'key'のカード(card_shortcut、effect無し)を指定しても何も起きない", () => {
    giveCurrentPlayerCards(["card_shortcut"]);
    const logLenBefore = useGameStore.getState().log.length;
    useGameStore.getState().useCard("card_shortcut");

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling");
    expect(currentPlayer().cardIds).toEqual(["card_shortcut"]);
    expect(s.log.length).toBe(logLenBefore); // ログも増えない(何も処理していない)
  });
});

describe("useCard(): 予約型カード(diceAgain/doubleMove/multiDice)", () => {
  it("diceAgain: extraRollGrantedがtrueになり、カードが消費される", () => {
    giveCurrentPlayerCards(["card_dice_again"]);
    useGameStore.getState().useCard("card_dice_again");

    const s = useGameStore.getState();
    expect(s.extraRollGranted).toBe(true);
    expect(currentPlayer().cardIds).not.toContain("card_dice_again");
    expect(lastLogMessage()).toContain("もういちどサイコロ");
  });

  it("diceAgain: 既に他の予約系カード(multiDice)が予約済みでもブロックされず使える(isDiceModifierEffect対象外)", () => {
    giveCurrentPlayerCards(["card_dice_again"]);
    useGameStore.setState({ pendingDiceCount: 3 });
    useGameStore.getState().useCard("card_dice_again");

    const s = useGameStore.getState();
    expect(s.extraRollGranted).toBe(true);
    expect(currentPlayer().cardIds).not.toContain("card_dice_again");
  });

  it("doubleMove: pendingDoubleMoveがtrueになり、カードが消費される", () => {
    giveCurrentPlayerCards(["card_double_move"]);
    useGameStore.getState().useCard("card_double_move");

    const s = useGameStore.getState();
    expect(s.pendingDoubleMove).toBe(true);
    expect(currentPlayer().cardIds).not.toContain("card_double_move");
  });

  it("multiDice(card_drive): pendingDiceCount・activeVehicleModeが効果通りに設定され、カードが消費される", () => {
    giveCurrentPlayerCards(["card_drive"]);
    useGameStore.getState().useCard("card_drive");

    const s = useGameStore.getState();
    expect(s.pendingDiceCount).toBe(2);
    expect(s.activeVehicleMode).toBe("expressLv1");
    expect(currentPlayer().cardIds).not.toContain("card_drive");
  });

  it("multiDice使用後、rollDice()でpendingDiceCountが消費されdiceFacesが2個になる", () => {
    giveCurrentPlayerCards(["card_drive"]);
    useGameStore.getState().useCard("card_drive");

    mockSingleDiceFace(3);
    useGameStore.getState().rollDice();

    const s = useGameStore.getState();
    expect(s.diceFaces).toEqual([3, 3]);
    expect(s.diceResult).toBe(6); // rawSum(修飾前)
    expect(s.remainingMoves).toBe(6); // doubleMove/halveDebuffなしなのでrawSumのまま
    expect(s.pendingDiceCount).toBe(1); // 消費されて既定値へ戻る
    expect(s.status).toBe("moving");
  });

  it.each([
    ["doubleMove(pendingDoubleMove予約済み)", { pendingDoubleMove: true }, "card_double_move"],
    ["multiDice(pendingDiceCount予約済み)", { pendingDiceCount: 4 }, "card_drive"],
  ] as const)("%s: 既に予約系カードの効果が予約されているとブロックされ、消費もstate変化もしない", (_label, patch, cardId) => {
    giveCurrentPlayerCards([cardId]);
    useGameStore.setState(patch);
    useGameStore.getState().useCard(cardId);

    const s = useGameStore.getState();
    expect(currentPlayer().cardIds).toContain(cardId); // 消費されていない
    expect(s.status).toBe("rolling");
    expect(lastLogMessage()).toContain("予約されているため使えなかった");
  });
});

describe("useCard(): 即時ワープ型(warp)", () => {
  it("card_warp_destination: 現在の目的地マスへ即座にワープ予定になり、カードが即消費される", () => {
    giveCurrentPlayerCards(["card_warp_destination"]);
    useGameStore.getState().useCard("card_warp_destination");

    const s = useGameStore.getState();
    expect(s.status).toBe("cardWarpAnnounce");
    expect(s.cardWarpInfo?.targetNodeId).toBe(DESTINATION);
    expect(s.cardWarpInfo?.cardId).toBe("card_warp_destination");
    expect(currentPlayer().cardIds).not.toContain("card_warp_destination"); // useCard()の時点で既に消費済み
  });

  it.each(["card_warp_anywhere", "card_warp_nearby"] as const)(
    "%s: 現在地とは異なる実在ノードへワープ予定になる",
    (cardId) => {
      giveCurrentPlayerCards([cardId]);
      useGameStore.getState().useCard(cardId);

      const s = useGameStore.getState();
      expect(s.status).toBe("cardWarpAnnounce");
      const targetNodeId = s.cardWarpInfo?.targetNodeId;
      expect(targetNodeId).toBeDefined();
      expect(targetNodeId).not.toBe(START);
      expect(() => getNode(getMap(MAP_ID), targetNodeId!)).not.toThrow();
    },
  );

  it("既に予約系カードの効果が予約されているとブロックされ、カードは消費されない", () => {
    giveCurrentPlayerCards(["card_warp_destination"]);
    useGameStore.setState({ pendingDoubleMove: true });
    useGameStore.getState().useCard("card_warp_destination");

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling");
    expect(s.cardWarpInfo).toBeNull();
    expect(currentPlayer().cardIds).toContain("card_warp_destination");
    expect(lastLogMessage()).toContain("予約されているため使えなかった");
  });
});

describe("useCard(): 場所指定型(targetSelect) → confirmTargetSelection()/cancelTargetSelection()", () => {
  it("card_warp_select_station: 8駅ぶんの選択肢が出て、この時点ではまだカードは消費されない", () => {
    giveCurrentPlayerCards(["card_warp_select_station"]);
    useGameStore.getState().useCard("card_warp_select_station");

    const s = useGameStore.getState();
    expect(s.status).toBe("selectingCardTarget");
    expect(s.targetSelectInfo?.selectKind).toBe("station");
    expect(s.targetSelectInfo?.options.length).toBe(destinationCandidateNodes(getMap(MAP_ID)).length);
    expect(currentPlayer().cardIds).toContain("card_warp_select_station"); // まだ手札に残る
  });

  it("card_warp_select_property_group: 物件グループ数ぶんの選択肢が出る", () => {
    giveCurrentPlayerCards(["card_warp_select_property_group"]);
    useGameStore.getState().useCard("card_warp_select_property_group");

    const s = useGameStore.getState();
    expect(s.targetSelectInfo?.selectKind).toBe("propertyGroup");
    expect(s.targetSelectInfo?.options.length).toBe(getAllPropertyGroupDefs().length);
  });

  it("confirmTargetSelection(): station選択を確定すると、選んだ駅へワープ予定になりカードが消費される", () => {
    giveCurrentPlayerCards(["card_warp_select_station"]);
    useGameStore.getState().useCard("card_warp_select_station");
    const options = useGameStore.getState().targetSelectInfo!.options;
    const chosen = options.find((o) => o.optionId !== START)!;

    useGameStore.getState().confirmTargetSelection(chosen.optionId);

    const s = useGameStore.getState();
    expect(s.status).toBe("cardWarpAnnounce");
    expect(s.targetSelectInfo).toBeNull();
    expect(s.cardWarpInfo?.targetNodeId).toBe(chosen.optionId);
    expect(currentPlayer().cardIds).not.toContain("card_warp_select_station");
  });

  it("confirmTargetSelection(): propertyGroup選択を確定すると、そのグループに属するノードへ解決される", () => {
    giveCurrentPlayerCards(["card_warp_select_property_group"]);
    useGameStore.getState().useCard("card_warp_select_property_group");
    const options = useGameStore.getState().targetSelectInfo!.options;
    const chosenGroupId = options[0].optionId;

    useGameStore.getState().confirmTargetSelection(chosenGroupId);

    const s = useGameStore.getState();
    const targetNode = getNode(getMap(MAP_ID), s.cardWarpInfo!.targetNodeId);
    expect(targetNode.propertyGroupId).toBe(chosenGroupId);
  });

  it("confirmTargetSelection(): 存在しないoptionIdを渡すと何も起きない(選択画面のまま)", () => {
    giveCurrentPlayerCards(["card_warp_select_station"]);
    useGameStore.getState().useCard("card_warp_select_station");

    useGameStore.getState().confirmTargetSelection("no_such_node_id");

    const s = useGameStore.getState();
    expect(s.status).toBe("selectingCardTarget");
    expect(s.targetSelectInfo).not.toBeNull();
    expect(currentPlayer().cardIds).toContain("card_warp_select_station");
  });

  it("confirmTargetSelection(): status !== 'selectingCardTarget' のときは何も起きない", () => {
    useGameStore.getState().confirmTargetSelection("hub_kamakura");
    expect(useGameStore.getState().status).toBe("rolling");
  });

  it("cancelTargetSelection(): rollingへ戻り、カードは手札に残る", () => {
    giveCurrentPlayerCards(["card_warp_select_station"]);
    useGameStore.getState().useCard("card_warp_select_station");

    useGameStore.getState().cancelTargetSelection();

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling");
    expect(s.targetSelectInfo).toBeNull();
    expect(currentPlayer().cardIds).toContain("card_warp_select_station"); // 消費されていない
    expect(s.pendingDoubleMove).toBe(false);
    expect(s.pendingDiceCount).toBe(1);
  });

  it("cancelTargetSelection(): status !== 'selectingCardTarget' のときは何も起きない", () => {
    useGameStore.getState().cancelTargetSelection();
    expect(useGameStore.getState().status).toBe("rolling");
  });

  it("targetSelect系も、既に予約系カードの効果が予約されているとブロックされる", () => {
    giveCurrentPlayerCards(["card_warp_select_station"]);
    useGameStore.setState({ pendingDoubleMove: true });
    useGameStore.getState().useCard("card_warp_select_station");

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling");
    expect(s.targetSelectInfo).toBeNull();
    expect(currentPlayer().cardIds).toContain("card_warp_select_station");
  });
});

describe("useCard(): 妨害型(rivalDebuff) → confirmTargetSelection()", () => {
  // 注意: placePlayerAt()はplayers配列を先頭1人だけに置き換えてしまう(1人プレイ専用ヘルパー)ため、
  // 複数人プレイのテストでは使わない。startGame()直後は既にstatus:"rolling"・diceResult:nullなので、
  // このdescribe内のテストは配置(currentNodeId/destinationNodeId)を気にする必要がなくそのまま使える。
  function startTwoPlayerGame(): void {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["P1", "P2"], 1);
  }

  beforeEach(() => {
    startTwoPlayerGame();
  });

  it("card_debuff_skip: 選択肢は自分以外の全プレイヤーになり、この時点ではまだ何も起きない", () => {
    giveCurrentPlayerCards(["card_debuff_skip"]);
    useGameStore.getState().useCard("card_debuff_skip");

    const s = useGameStore.getState();
    expect(s.status).toBe("selectingCardTarget");
    expect(s.targetSelectInfo?.selectKind).toBe("rivalPlayer");
    expect(s.targetSelectInfo?.options.map((o) => o.optionId)).toEqual([s.players[1].id]);
    expect(s.players[1].activeDebuffs).toHaveLength(0); // まだ付与されていない
    expect(currentPlayer().cardIds).toContain("card_debuff_skip"); // まだ消費されていない
  });

  it("confirmTargetSelection(): 対象プレイヤーにデバフが付与され、カードが消費され、手番が進む", () => {
    giveCurrentPlayerCards(["card_debuff_skip"]);
    useGameStore.getState().useCard("card_debuff_skip");
    const targetId = useGameStore.getState().players[1].id;

    useGameStore.getState().confirmTargetSelection(targetId);

    const s = useGameStore.getState();
    // 2人プレイなので、付与直後にadvanceToNextTurn()がP2の手番へ進もうとし、
    // 今まさに付与したskipNextRollを検知してP2をお休みにし、P1(自分)へ戻ってくる。
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.status).toBe("rolling");
    expect(s.players[0].cardIds).not.toContain("card_debuff_skip"); // 使用者のカードは消費済み
    expect(s.players[1].activeDebuffs).toHaveLength(0); // 付与された直後に消費されている
    expect(lastLogMessage()).toContain("お休み");
  });

  it("confirmTargetSelection(): デバフ付与が3人プレイでは即座に消費されず、対象者に残る", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["P1", "P2", "P3"], 1);
    giveCurrentPlayerCards(["card_debuff_skip"]);

    useGameStore.getState().useCard("card_debuff_skip");
    const p3Id = useGameStore.getState().players[2].id;
    useGameStore.getState().confirmTargetSelection(p3Id);

    const s = useGameStore.getState();
    expect(s.currentPlayerIndex).toBe(1); // P2(無関係)の番になっただけ
    expect(s.status).toBe("rolling");
    const p3 = s.players.find((p) => p.id === p3Id)!;
    expect(p3.activeDebuffs).toHaveLength(1);
    expect(p3.activeDebuffs[0]).toMatchObject({ kind: "skipNextRoll", sourcePlayerId: s.players[0].id, sourceCardName: "お休みカード" });
  });

  it("妨害系も、既に予約系カードの効果が予約されているとブロックされる", () => {
    giveCurrentPlayerCards(["card_debuff_skip"]);
    useGameStore.setState({ pendingDiceCount: 2 });
    useGameStore.getState().useCard("card_debuff_skip");

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling");
    expect(s.targetSelectInfo).toBeNull();
    expect(currentPlayer().cardIds).toContain("card_debuff_skip");
  });
});

describe("デバフの消費: halveDiceNextRoll(rollDice()内)", () => {
  it("出目(合計)が切り上げで半分になり、デバフが消費される。diceResultは修飾前の値のまま", () => {
    useGameStore.setState((s) => ({
      players: s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? { ...p, activeDebuffs: [{ id: "d1", kind: "halveDiceNextRoll" as const, sourcePlayerId: "other", sourceCardName: "のろまカード" }] }
          : p,
      ),
    }));

    mockSingleDiceFace(3); // rawSum=3 → 切り上げ半減で2
    useGameStore.getState().rollDice();

    const s = useGameStore.getState();
    expect(s.diceResult).toBe(3); // 修飾前の合計(表示用)
    expect(s.remainingMoves).toBe(2); // Math.ceil(3/2)
    expect(currentPlayer().activeDebuffs).toHaveLength(0); // 消費済み
    expect(s.status).toBe("moving");
  });

  it("halveDiceNextRoll と pendingDoubleMove が両方かかっている場合、半減→倍化の順で適用される", () => {
    useGameStore.setState((s) => ({
      players: s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? { ...p, activeDebuffs: [{ id: "d1", kind: "halveDiceNextRoll" as const, sourcePlayerId: "other", sourceCardName: "のろまカード" }] }
          : p,
      ),
      pendingDoubleMove: true,
    }));

    mockSingleDiceFace(3); // rawSum=3 → 半減ceil(3/2)=2 → 倍化 4
    useGameStore.getState().rollDice();

    const s = useGameStore.getState();
    expect(s.remainingMoves).toBe(4);
    expect(currentPlayer().activeDebuffs).toHaveLength(0);
    expect(s.pendingDoubleMove).toBe(false); // こちらも消費される
  });

  it("デバフが無ければ通常通りremainingMoves===diceResultになる", () => {
    mockSingleDiceFace(5);
    useGameStore.getState().rollDice();

    const s = useGameStore.getState();
    expect(s.diceResult).toBe(5);
    expect(s.remainingMoves).toBe(5);
  });
});

describe("デバフの消費: skipNextRoll(advanceToNextTurn()内、endTurn経由)", () => {
  it("次の手番プレイヤーにskipNextRollが付いていると、その手番を1回飛ばして次のプレイヤーへ進む", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["P1", "P2", "P3"], 1);
    // P1(index0)を通常マス着地1歩の位置に置き、P2(index1、次に手番が来る)にskipNextRollを付与しておく。
    useGameStore.setState((s) => ({
      players: [
        { ...s.players[0], currentNodeId: NORMAL_LANDING_START, moveHistory: [NORMAL_LANDING_START] },
        { ...s.players[1], activeDebuffs: [{ id: "d1", kind: "skipNextRoll" as const, sourcePlayerId: "p3", sourceCardName: "お休みカード" }] },
        s.players[2],
      ],
      destinationNodeId: DESTINATION,
      status: "rolling",
    }));

    mockSingleDiceFace(1); // hub_hiratsuka→hrlp_s、距離1でちょうど着地
    useGameStore.getState().rollDice();
    // hub_hiratsukaは4方向分岐なので、選択肢からhrlp_sを選ぶ。
    let guard = 0;
    while (useGameStore.getState().status === "moving" || useGameStore.getState().status === "selectingRoute") {
      const s = useGameStore.getState();
      if (s.status === "selectingRoute") {
        const opt = s.routeOptions.find((o) => o.nodeId === NORMAL_LANDING_TARGET) ?? s.routeOptions[0];
        useGameStore.getState().chooseRoute(opt.nodeId);
      } else {
        useGameStore.getState().advanceStep();
      }
      if (++guard > 20) throw new Error("advanceStep()が終わらない(テスト前提が崩れている可能性)");
    }

    const s = useGameStore.getState();
    expect(s.players[0].currentNodeId).toBe(NORMAL_LANDING_TARGET);
    // P1の着地(info) → 手番終了 → advanceToNextTurn(): P2はskipNextRoll持ちなのでお休みになり消費、P3へ進む。
    expect(s.currentPlayerIndex).toBe(2); // P3(index2)まで進んでいる
    expect(s.status).toBe("rolling");
    expect(s.players[1].activeDebuffs).toHaveLength(0); // 消費済み
    expect(lastLogMessage()).toContain("お休みです");
  });
});

describe("GameStatus/pending stateの復帰", () => {
  it("diceAgain使用後、着地(info)してもターンが終わらずrollingへ戻り、extraRollGrantedがリセットされる", () => {
    useGameStore.setState({
      players: useGameStore.getState().players.map((p) => ({ ...p, currentNodeId: NORMAL_LANDING_START, moveHistory: [NORMAL_LANDING_START] })),
      destinationNodeId: DESTINATION,
      status: "rolling",
    });
    giveCurrentPlayerCards(["card_dice_again"]);
    useGameStore.getState().useCard("card_dice_again");
    expect(useGameStore.getState().extraRollGranted).toBe(true);

    const currentIndexBefore = useGameStore.getState().currentPlayerIndex;
    mockSingleDiceFace(1);
    useGameStore.getState().rollDice();
    let guard = 0;
    while (useGameStore.getState().status === "moving" || useGameStore.getState().status === "selectingRoute") {
      const s = useGameStore.getState();
      if (s.status === "selectingRoute") {
        const opt = s.routeOptions.find((o) => o.nodeId === NORMAL_LANDING_TARGET) ?? s.routeOptions[0];
        useGameStore.getState().chooseRoute(opt.nodeId);
      } else {
        useGameStore.getState().advanceStep();
      }
      if (++guard > 20) throw new Error("advanceStep()が終わらない(テスト前提が崩れている可能性)");
    }

    const s = useGameStore.getState();
    expect(s.status).toBe("rolling"); // 手番を渡さずもう一度振れる状態に戻った
    expect(s.currentPlayerIndex).toBe(currentIndexBefore); // 手番は進んでいない
    expect(s.extraRollGranted).toBe(false); // 消費・リセット済み
    expect(s.diceResult).toBeNull();
    expect(s.remainingMoves).toBe(0);
  });

  it("multiDice使用中に着地すると、activeVehicleMode・diceFacesはendTurn()でnullへ戻る", () => {
    // activeVehicleMode/diceFacesがどう設定されたかに関わらず、着地後は必ずリセットされる
    // という endTurn() 側の不変条件を確認する(直接setStateして確認を簡潔にする)。
    useGameStore.setState({
      players: useGameStore.getState().players.map((p) => ({ ...p, currentNodeId: NORMAL_LANDING_START, moveHistory: [NORMAL_LANDING_START] })),
      destinationNodeId: DESTINATION,
      status: "rolling",
      activeVehicleMode: "expressLv1",
      diceFaces: [3, 4],
    });

    mockSingleDiceFace(1);
    useGameStore.getState().rollDice();
    let guard = 0;
    while (useGameStore.getState().status === "moving" || useGameStore.getState().status === "selectingRoute") {
      const s = useGameStore.getState();
      if (s.status === "selectingRoute") {
        const opt = s.routeOptions.find((o) => o.nodeId === NORMAL_LANDING_TARGET) ?? s.routeOptions[0];
        useGameStore.getState().chooseRoute(opt.nodeId);
      } else {
        useGameStore.getState().advanceStep();
      }
      if (++guard > 20) throw new Error("advanceStep()が終わらない(テスト前提が崩れている可能性)");
    }

    const s = useGameStore.getState();
    expect(s.activeVehicleMode).toBeNull();
    expect(s.diceFaces).toBeNull();
  });
});

describe("cardOverflow (resolveCardOverflow)", () => {
  const EIGHT_CARDS = [
    "card_dice_again",
    "card_double_move",
    "card_drive",
    "card_sports_car",
    "card_super_car",
    "card_shonan_hyper",
    "card_warp_anywhere",
    "card_warp_nearby",
  ];
  const NEW_CARD = "card_warp_destination";

  function setupOverflowState(): void {
    if (EIGHT_CARDS.length !== MAX_CARDS_PER_PLAYER) {
      throw new Error(
        `テスト前提が崩れています: EIGHT_CARDSは${EIGHT_CARDS.length}件だが、MAX_CARDS_PER_PLAYERは${MAX_CARDS_PER_PLAYER}件でした。`,
      );
    }
    giveCurrentPlayerCards(EIGHT_CARDS);
    const player = currentPlayer();
    useGameStore.setState({
      status: "cardOverflow",
      cardOverflowInfo: { playerId: player.id, playerName: player.name, currentCardIds: [...EIGHT_CARDS], newCardId: NEW_CARD },
    });
  }

  it("discard: 'newCard' を選ぶと、既存の手札は変化せず新カードは破棄される", () => {
    setupOverflowState();
    useGameStore.getState().resolveCardOverflow({ discard: "newCard" });

    const s = useGameStore.getState();
    expect(currentPlayer().cardIds).toEqual(EIGHT_CARDS);
    expect(s.cardOverflowInfo).toBeNull();
    expect(s.status).not.toBe("cardOverflow");
  });

  it("discard: 'existing' を選ぶと、指定indexのカードが新カードに置き換わる", () => {
    setupOverflowState();
    useGameStore.getState().resolveCardOverflow({ discard: "existing", index: 0 });

    const expected = [...EIGHT_CARDS];
    expected[0] = NEW_CARD;
    expect(currentPlayer().cardIds).toEqual(expected);
  });

  it("discard: 'existing' で範囲外indexを渡すと何も起きない", () => {
    setupOverflowState();
    useGameStore.getState().resolveCardOverflow({ discard: "existing", index: 99 });

    const s = useGameStore.getState();
    expect(currentPlayer().cardIds).toEqual(EIGHT_CARDS); // 変化なし
    expect(s.status).toBe("cardOverflow"); // 画面はまだ閉じていない
    expect(s.cardOverflowInfo).not.toBeNull();
  });

  it("status !== 'cardOverflow' のときは何も起きない", () => {
    giveCurrentPlayerCards(EIGHT_CARDS);
    useGameStore.getState().resolveCardOverflow({ discard: "newCard" });

    expect(currentPlayer().cardIds).toEqual(EIGHT_CARDS);
    expect(useGameStore.getState().status).toBe("rolling");
  });
});

describe("cardDisplay/cardsデータとの整合性(前提固定)", () => {
  it("getCardDef()が全カードidを解決できる(typoの検出)", () => {
    for (const id of [
      "card_dice_again",
      "card_double_move",
      "card_drive",
      "card_sports_car",
      "card_super_car",
      "card_shonan_hyper",
      "card_warp_anywhere",
      "card_warp_nearby",
      "card_warp_destination",
      "card_warp_select_station",
      "card_warp_select_region",
      "card_warp_select_property_group",
      "card_debuff_skip",
      "card_debuff_halve",
      "card_shortcut",
    ]) {
      expect(getCardDef(id), `getCardDef("${id}")`).toBeDefined();
    }
  });
});
