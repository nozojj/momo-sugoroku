// 年度末の決算(settlement)まわりのstatus/turn遷移の自動テスト。
//
// freshGame()(testHelpers)はtotalYears:1固定のため、複数年をまたぐケースを検証するこの
// ファイルではresetGame()/startGame()を直接呼ぶ。移動先はlandingEffects.tsのハンドラを
// 持たない(=着地しても何も割り込まない)ノードを使い、1ターンを最後まで完了させてendTurn()を
// 自然に発火させる(private関数を直接呼ばない、既存テストと同じ方針)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import { getYearEventDef } from "@/lib/game/yearEvent";
import { placePlayerAt, mockSingleDiceFace, driveToLandingToward } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const UNRELATED_DESTINATION = "hub_kamakura";
// r_fjrt_gate_fjrt_e_1(moneyGain) → fjrt_e(normal、単一経路)。landingEffects.test.tsの
// moneyGainマステストで確認済みの経路をそのまま再利用する。着地させるのはfjrt_e側なので、
// 型がlandingEffects.tsにハンドラの無い"normal"であることだけをこのファイルでも確認する。
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

/** 現在の手番プレイヤーを1ターン分だけ最後まで完了させる(着地効果に割り込まれない前提)。 */
function playOutOneTurn() {
  placePlayerAt(START, UNRELATED_DESTINATION);
  mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
  useGameStore.getState().rollDice();
  driveToLandingToward(TARGET);
}

describe("年度末の決算: status/turn遷移", () => {
  beforeEach(() => {
    assertFixturePreconditions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("最終年度でない年度末: settlementIntro → settlement → 次年度のrollingへ遷移する", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 2); // totalTurns = 24

    // 1人プレイなので毎ターンcurrentPlayerIndexが0に巻き戻る=毎ターンisYearStart判定が走る。
    // turnを1年目の最終月(12)まで直接進め、この1ターンだけを実プレイで完了させる。
    useGameStore.setState({ turn: 12 });

    playOutOneTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo).not.toBeNull();
    expect(settled.settlementInfo?.year).toBe(1);
    expect(settled.settlementInfo?.isFinalSettlement).toBe(false);
    expect(settled.netWorthHistory).toHaveLength(1);
    expect(settled.netWorthHistory[0].year).toBe(1);

    useGameStore.getState().continueAfterSettlementIntro();
    expect(useGameStore.getState().status).toBe("settlement");

    useGameStore.getState().continueAfterSettlement();
    const next = useGameStore.getState();
    expect(next.status).toBe("rolling");
    expect(next.turn).toBe(13);
    expect(next.settlementInfo).toBeNull();
  });

  it("最終年度の年度末: settlementIntro(isFinalSettlement:true) → settlement → finishedへ遷移し、winnerIdsが決まる", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 1); // totalTurns = 12

    useGameStore.setState({ turn: 12 }); // 唯一の年度の最終月

    playOutOneTurn();

    const settled = useGameStore.getState();
    expect(settled.status).toBe("settlementIntro");
    expect(settled.settlementInfo?.isFinalSettlement).toBe(true);

    useGameStore.getState().continueAfterSettlementIntro();
    expect(useGameStore.getState().status).toBe("settlement");

    useGameStore.getState().continueAfterSettlement();
    const finished = useGameStore.getState();
    expect(finished.status).toBe("finished");
    expect(finished.winnerIds).not.toBeNull();
    expect(finished.winnerIds).toEqual(["p1"]); // 1人プレイなので唯一のプレイヤーが必ず勝者
  });
});

describe("年度イベント(「今年の湘南」): 抽選タイミング・GameStateへの反映", () => {
  beforeEach(() => {
    assertFixturePreconditions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ゲーム開始(1年目)時点でcurrentYearEventId・yearEventAnnounceInfoが設定されている", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 1);

    const state = useGameStore.getState();
    expect(getYearEventDef(state.currentYearEventId)).toBeDefined();
    expect(state.yearEventAnnounceInfo).toEqual({ year: 1, eventId: state.currentYearEventId });
  });

  it("dismissYearEventAnnounce()はyearEventAnnounceInfoだけをnullにし、currentYearEventIdは変えない", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 1);
    const before = useGameStore.getState();
    expect(before.yearEventAnnounceInfo).not.toBeNull();

    useGameStore.getState().dismissYearEventAnnounce();
    const after = useGameStore.getState();

    expect(after.yearEventAnnounceInfo).toBeNull();
    expect(after.currentYearEventId).toBe(before.currentYearEventId);
    expect(after.status).toBe(before.status);
  });

  it("決算をまたぐとcurrentYearEventIdが再抽選され、settlementInfo.yearEventIdは決算対象年度(またぐ前)の値と一致する", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 2); // totalTurns = 24
    useGameStore.setState({ turn: 12 });

    const yearEventIdBeforeCrossing = useGameStore.getState().currentYearEventId;
    expect(getYearEventDef(yearEventIdBeforeCrossing)).toBeDefined();

    playOutOneTurn();

    const settled = useGameStore.getState();
    // 決算(1年目分)にはまだ新年度の抽選が反映されていないこと。
    expect(settled.settlementInfo?.yearEventId).toBe(yearEventIdBeforeCrossing);
    expect(settled.currentYearEventId).toBe(yearEventIdBeforeCrossing);

    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const next = useGameStore.getState();
    expect(next.turn).toBe(13);
    expect(getYearEventDef(next.currentYearEventId)).toBeDefined();
    expect(next.yearEventAnnounceInfo).toEqual({ year: 2, eventId: next.currentYearEventId });
  });

  it("最終年度終了時は次年度の年度イベントを抽選しない(currentYearEventIdが変化せず、yearEventAnnounceInfoも更新されない)", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 1); // totalTurns = 12(1年のみ)
    useGameStore.setState({ turn: 12, yearEventAnnounceInfo: null });

    const yearEventIdBeforeFinal = useGameStore.getState().currentYearEventId;

    playOutOneTurn();
    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const finished = useGameStore.getState();
    expect(finished.status).toBe("finished");
    expect(finished.currentYearEventId).toBe(yearEventIdBeforeFinal);
    expect(finished.yearEventAnnounceInfo).toBeNull();
  });
});
