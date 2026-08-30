// 年境界 × skipNextRoll のRegressionテスト。
//
// バグの本質: applySettlementIfNeeded()が「直後の1人先」だけを見て年境界を判定していたため、
// その1人先がskipNextRollで飛ばされ、さらにその先で年度が変わる場合に決算そのものが
// 丸ごと欠落していた。ここではgameStore.settlement.test.tsと同じ方針(公開アクションだけを
// 使い、着地効果の無いノードで1ターンを実際に完了させてendTurn()を自然に発火させる)で、
// 4人プレイ・skipNextRoll併用のシナリオを検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import type { ActiveDebuff } from "@/types/game";
import { mockSingleDiceFace, driveToLandingToward } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const UNRELATED_DESTINATION = "hub_kamakura";
// gameStore.settlement.test.tsで検証済みの経路をそのまま再利用する(type:"normal"、単一経路)。
const START = "r_fjrt_gate_fjrt_e_1";
const TARGET = "fjrt_e";

function assertFixturePreconditions() {
  const map = getMap(MAP_ID);
  const start = getNode(map, START);
  const target = getNode(map, TARGET);
  if (!start.connections.some((c) => c.to === TARGET)) {
    throw new Error(`テスト前提が崩れています: ${START} から ${TARGET} への接続が見つかりません。マップデータが変更された可能性があります。`);
  }
  if (target.type !== "normal") {
    throw new Error(
      `テスト前提が崩れています: ${TARGET} はtype:"normal"(着地効果の無いマス)の前提だが、実際はtype:"${target.type}"でした。`,
    );
  }
}

function skipDebuff(id: string): ActiveDebuff {
  return { id, kind: "skipNextRoll", sourcePlayerId: "tester", sourceCardName: "テスト用" };
}

function startFourPlayerGame(totalYears: number): void {
  useGameStore.getState().resetGame();
  useGameStore.getState().startGame(["P1", "P2", "P3", "P4"], totalYears);
}

/** 現在の手番プレイヤー(currentPlayerIndex)を着地効果の無いノードへ配置し、
 *  1マスのダイスを固定してTARGETへぴったり着地させ、endTurn()を自然に発火させる。
 *  他のプレイヤーのcurrentNodeId等はテスト側が事前にsetStateした内容のまま変更しない。 */
function playOutCurrentPlayerTurn(): void {
  const state = useGameStore.getState();
  const idx = state.currentPlayerIndex;
  const players = state.players.map((p, i) => (i === idx ? { ...p, currentNodeId: START, moveHistory: [START] } : p));
  useGameStore.setState({
    players,
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
  mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
  useGameStore.getState().rollDice();
  driveToLandingToward(TARGET);
}

describe("年境界 × skipNextRoll: 決算の欠落/重複が起きないこと", () => {
  beforeEach(() => {
    assertFixturePreconditions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A. 通常の年境界(skipなし): 決算1回、year=1、次はcurrentPlayerIndex=0", () => {
    startFourPlayerGame(3); // totalTurns = 36
    // p4(index3)が最後に行動し、そのままindex0へ折り返して年度が変わる、素朴なケース。
    useGameStore.setState({ turn: 12, currentPlayerIndex: 3 });

    playOutCurrentPlayerTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo?.year).toBe(1);
    expect(settled.settlementInfo?.isFinalSettlement).toBe(false);
    expect(settled.netWorthHistory).toHaveLength(1);
    expect(settled.netWorthHistory[0].year).toBe(1);
    expect(settled.netWorthHistory[0].values).toHaveLength(4);

    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const next = useGameStore.getState();
    expect(next.status).toBe("rolling");
    expect(next.turn).toBe(13);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.settlementInfo).toBeNull();
  });

  it("B. 最後のプレイヤーがskipNextRoll: 決算1回、year=1、skip消費後に正しいプレイヤーから再開する", () => {
    startFourPlayerGame(3); // totalTurns = 36
    // p3(index2)が行動を終え、次のp4(index3)がskipNextRollで飛ばされて年度が変わる、
    // 直後の1人先だけを見ていた旧ロジックでは決算が丸ごと欠落していたシナリオそのもの。
    useGameStore.setState((s) => ({
      turn: 12,
      currentPlayerIndex: 2,
      players: s.players.map((p, i) => (i === 3 ? { ...p, activeDebuffs: [skipDebuff("skip_p4")] } : p)),
    }));

    playOutCurrentPlayerTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo?.year).toBe(1);
    expect(settled.netWorthHistory).toHaveLength(1);
    expect(settled.netWorthHistory[0].year).toBe(1);
    // 決算計算の時点ではまだskipNextRollは消費されていない(advanceToNextTurn()側の仕事)。
    expect(settled.players[3].activeDebuffs).toHaveLength(1);

    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const next = useGameStore.getState();
    expect(next.status).toBe("rolling");
    expect(next.turn).toBe(13);
    expect(next.currentPlayerIndex).toBe(0); // p4がskipされ、p1(index0)から新年度が始まる
    expect(next.players[3].activeDebuffs).toHaveLength(0); // skipNextRollは消費済み
    expect(next.log.some((l) => l.message.includes("お休み"))).toBe(true);
  });

  it("C. 年境界付近で複数人skipNextRoll: 決算1回のみ、全員分のskipが消費されて再開する", () => {
    startFourPlayerGame(3); // totalTurns = 36
    // p2(index1)が行動を終え、p3(index2)・p4(index3)の2人連続でskipされて年度が変わる。
    useGameStore.setState((s) => ({
      turn: 12,
      currentPlayerIndex: 1,
      players: s.players.map((p, i) => {
        if (i === 2) return { ...p, activeDebuffs: [skipDebuff("skip_p3")] };
        if (i === 3) return { ...p, activeDebuffs: [skipDebuff("skip_p4")] };
        return p;
      }),
    }));

    playOutCurrentPlayerTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo?.year).toBe(1);
    expect(settled.netWorthHistory).toHaveLength(1); // 決算は1回だけ

    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const next = useGameStore.getState();
    expect(next.status).toBe("rolling");
    expect(next.turn).toBe(13);
    expect(next.currentPlayerIndex).toBe(0); // p3・p4がともにskipされ、p1から新年度が始まる
    expect(next.players[2].activeDebuffs).toHaveLength(0);
    expect(next.players[3].activeDebuffs).toHaveLength(0);
    expect(next.netWorthHistory).toHaveLength(1); // continueAfterSettlement()後も1回のまま(二重加算なし)
  });

  it("D. 最終年でskipNextRoll: 最終決算1回のみ発生し、ゲームがfinishedへ正しく終了する", () => {
    startFourPlayerGame(1); // totalTurns = 12(1年のみ)
    useGameStore.setState((s) => ({
      turn: 12, // 唯一の年度の最終月
      currentPlayerIndex: 2,
      players: s.players.map((p, i) => (i === 3 ? { ...p, activeDebuffs: [skipDebuff("skip_p4")] } : p)),
    }));

    playOutCurrentPlayerTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo?.isFinalSettlement).toBe(true);
    expect(settled.settlementInfo?.year).toBe(1);
    expect(settled.netWorthHistory).toHaveLength(1);
    expect(settled.netWorthHistory[0].year).toBe(1);

    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const finished = useGameStore.getState();
    expect(finished.status).toBe("finished");
    expect(finished.winnerIds).not.toBeNull();
    expect(finished.netWorthHistory).toHaveLength(1); // 最終決算後もまだ1回のまま(二重加算なし)
    expect(finished.players[3].activeDebuffs).toHaveLength(0); // ゲーム終了時点でもskipは消費されている
  });

  it("決算0回にならない: skipNextRoll併用でも必ずsettlementIntroへ遷移する(直前の欠落バグの直接的な反証)", () => {
    startFourPlayerGame(3);
    useGameStore.setState((s) => ({
      turn: 12,
      currentPlayerIndex: 2,
      players: s.players.map((p, i) => (i === 3 ? { ...p, activeDebuffs: [skipDebuff("skip_p4")] } : p)),
    }));

    playOutCurrentPlayerTurn();

    // 修正前はここでstatusが"rolling"のまま(=決算がスキップされて即座に2年目へ突入)になっていた。
    expect(useGameStore.getState().status).not.toBe("rolling");
    expect(useGameStore.getState().status).toBe("settlementIntro");
  });
});
