// @vitest-environment jsdom
//
// GameScreen.tsx(Polish Phase 3b「車移動の気持ちよさ」)の統合テスト。
// moveTempo.ts自体の単体テスト(tierの境界値)とは別に、ここでは実際にGameScreenを描画した
// 状態で「サイコロ演出→DEPART→CRUISE→ARRIVAL→着地処理」という一連の流れが、実際のタイマー
// (fake timers)とstore更新を通して正しくつながることを確認する。
//
// 出目そのものはuseGameStore.setState()で直接totalStepsを固定する(rollDice()自体の
// 乱数決定・移動先決定ロジックには一切触れない、Phase10以前からの既存パターン)。
// 分岐(status:"selectingRoute")が実際に発生した場合は、そのままstepAdvance()ヘルパーが
// 最初の選択肢を選んで続行する(A案=分岐後も元のstepIndexの続きから、をテストレベルでも
// 前提にしている)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import {
  ARRIVAL_LAST_MS,
  ARRIVAL_SECOND_LAST_MS,
  CRUISE_MS,
  DEPART_MS,
  getStepAnimationMs,
  getStepTransitionMs,
} from "@/lib/game/moveTempo";
import { DICE_FAKE_ROLL_MS, DICE_SETTLE_MS } from "./useDiceRevealPhase";
import { LANDING_SETTLE_MS } from "./useLandingSettlePhase";
import { GameScreen } from "./GameScreen";

// Polish Phase 3c: 着地tick(remainingMoves===0)の待ち時間は、旧来の固定460msから
// 「最後の1マスの視覚transitionが完了する時間(ARRIVAL_LAST_MSから算出) + 着地settle
// (LANDING_SETTLE_MS)」へ変わった。目的地到着ではない通常マスを前提にしたテスト用の合計値。
const LANDING_TICK_MS = getStepTransitionMs(ARRIVAL_LAST_MS) + LANDING_SETTLE_MS;

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function moveHistoryLength(playerIndex = 0): number {
  return useGameStore.getState().players[playerIndex].moveHistory.length;
}

/** 出目(totalSteps)を直接指定してロールを開始する。rollDice()の乱数決定(faces等)は
 *  使わず、rollDice()が行うのと同じ形のstate更新(diceResult/diceFaces/remainingMoves/
 *  status:"moving"を同時に確定させる)だけをそのまま模す。移動先決定ロジック
 *  (mapGraph.ts/playerMovement.ts)には一切触れない。 */
function startRollWithTotalSteps(totalSteps: number): void {
  act(() => {
    useGameStore.setState({
      diceFaces: [totalSteps],
      diceResult: totalSteps,
      remainingMoves: totalSteps,
      status: "moving",
    });
  });
}

/** DICE_FAKE_ROLL_MS+DICE_SETTLE_MSぶん進め、Phase3aの演出が終わって移動タイマーが
 *  動き出せる状態にする。 */
async function finishDiceReveal(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
  });
}

/**
 * 「次の1マスの移動」がexpectedMsぴったりのタイミングで処理されることを確認しつつ1歩進める。
 * 分岐(status:"selectingRoute")になった場合は、最初の選択肢を選んでその場で解決する
 * (A案=分岐後も元のstepIndexの続きから、という設計を統合テストレベルでも前提にする)。
 */
async function expectStepAt(expectedMs: number): Promise<void> {
  const before = moveHistoryLength();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(expectedMs - 1);
  });
  expect(useGameStore.getState().status).toBe("moving"); // まだ処理されていない
  expect(moveHistoryLength()).toBe(before);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  const afterState = useGameStore.getState();
  const moved = afterState.status !== "moving" || moveHistoryLength() > before;
  expect(moved).toBe(true);
  // 1回のtickで2マス以上進む(二重発火)ことがないことも合わせて確認する。
  expect(moveHistoryLength() - before).toBeLessThanOrEqual(1);

  if (afterState.status === "selectingRoute") {
    const nodeId = afterState.routeOptions[0]!.nodeId;
    act(() => {
      useGameStore.getState().chooseRoute(nodeId);
    });
  }
}

async function waitForHydration(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GameScreen: 可変移動テンポ(Polish Phase 3b)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // これらのテストはGameScreen全体(Board.tsxのSVGマップ描画を含む)を毎回マウントした上で、
  // fake timersのadvanceTimersByTimeAsync()を1テストあたり最大20回前後(1マスごとに2回×
  // 最大9マス+着地tick)直列に待つ、この中で最も重い部類の統合テスト。フルテストスイート
  // (40ファイル超)を並列実行する負荷下では、既定のtestTimeout(5000ms)を実測で超えることが
  // あった(ロジック自体は本ファイル単体実行時に5回連続成功済みで、フレークの原因は
  // 「CPU競合下でのReactの実時間での再レンダーコスト」であり、テスト対象の実装不具合ではない)。
  // ロジックの誤りを見逃さないための猶予として、他の既存テストファイルより長めのtimeoutだけを
  // 個別に設定する(グローバル設定は変更しない)。
  const HEAVY_TEST_TIMEOUT_MS = 20000;

  it("totalSteps=1(出目1相当): ARRIVAL_LAST_MSのみで1歩進む(高速化しない)", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    startRollWithTotalSteps(1);
    await finishDiceReveal();
    await expectStepAt(ARRIVAL_LAST_MS);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("totalSteps=6(通常の出目相当): DEPART→CRUISE×3→ARRIVAL_SECOND_LAST→ARRIVAL_LASTの順で進む", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    startRollWithTotalSteps(6);
    await finishDiceReveal();

    await expectStepAt(DEPART_MS); // 1マス目: 発進
    await expectStepAt(CRUISE_MS); // 2マス目: 巡航
    await expectStepAt(CRUISE_MS); // 3マス目: 巡航
    await expectStepAt(CRUISE_MS); // 4マス目: 巡航
    await expectStepAt(ARRIVAL_SECOND_LAST_MS); // 5マス目: 減速
    await expectStepAt(ARRIVAL_LAST_MS); // 6マス目: 着地

    // 移動が完了した後、既存のLANDING_TICK_MS(着地処理を呼ぶためだけの間)を経て
    // resolveLanding()相当の状態遷移が起こり、"moving"/"selectingRoute"のどちらでもなくなる。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LANDING_TICK_MS);
    });
    const finalStatus = useGameStore.getState().status;
    expect(finalStatus).not.toBe("moving");
    expect(finalStatus).not.toBe("selectingRoute");
  }, HEAVY_TEST_TIMEOUT_MS);

  it("totalSteps=9(急行系カード等の大きな移動数相当): CRUISE区間が繰り返され、最後の2マスだけARRIVALになる", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    startRollWithTotalSteps(9);
    await finishDiceReveal();

    await expectStepAt(DEPART_MS);
    for (let i = 0; i < 6; i++) await expectStepAt(CRUISE_MS);
    await expectStepAt(ARRIVAL_SECOND_LAST_MS);
    await expectStepAt(ARRIVAL_LAST_MS);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("分岐が発生しても、分岐後は元のstepIndexの続きから再開する(再発進しない)", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    startRollWithTotalSteps(6);
    await finishDiceReveal();

    await expectStepAt(DEPART_MS); // 1マス目(この時点でmoveHistoryLength()は2になっている)
    const afterFirstStep = moveHistoryLength();

    // 2マス目の直前で、意図的に分岐を模す(実マップで分岐が起きなかった場合でも、
    // ここでは「分岐後の継続」ロジック自体をピンポイントで確認するため、直接statusを
    // selectingRouteへ切り替える。remainingMoves/totalStepsはそのまま=分岐を一時停止として
    // 扱うA案の前提)。
    act(() => {
      useGameStore.setState({ status: "selectingRoute" });
    });
    // 分岐中は移動タイマー自体が止まる(status!=="moving")。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(moveHistoryLength()).toBe(afterFirstStep); // 分岐中は増えない(2マス目はまだ進んでいない)

    // 分岐を解決して再開すると、CRUISE(=分岐前と同じテンポの続き、DEPARTへは戻らない)で
    // 次の1マスが進む。分岐の選択肢自体は実マップに依存するため、ここでは「pause→resume」の
    // タイミング挙動だけをピンポイントで見るために直接moving側へ戻す
    // (remainingMoves/totalStepsは変更していないため、A案どおりstepIndexの続きになる)。
    act(() => {
      useGameStore.setState({ status: "moving" });
    });
    await expectStepAt(CRUISE_MS); // DEPARTへ戻らずCRUISEになる
  }, HEAVY_TEST_TIMEOUT_MS);

  it("CPUのロールでも同じテンポ関数(getStepAnimationMs)が適用される(実際の出目に応じてDEPART/CRUISE/ARRIVALが正しく進む)", async () => {
    useGameStore.getState().startGame(["CPU太郎", "じろう"], 1, ["cpu", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    // useCpuAutoplay.tsのCPU_ACTION_DELAY_MS(650ms)経過でCPUが自動的にrollDice()する。
    // cpuDecision.ts/rollDice()の乱数決定には一切触れないため、実際に振られた出目
    // (totalSteps)をそのまま読み取り、期待値の計算に使う(出目1〜2でARRIVALのみになる
    // ケースも含めて成立するよう、ハードコードした固定シーケンスではなくループで検証する)。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(useGameStore.getState().status).toBe("moving");
    const totalSteps = useGameStore.getState().remainingMoves;
    expect(totalSteps).toBeGreaterThanOrEqual(1);

    await finishDiceReveal();

    let remaining = totalSteps;
    let guard = 0;
    while (remaining > 0 && guard < 20) {
      const expectedMs = getStepAnimationMs({ totalSteps, remainingMoves: remaining });
      await expectStepAt(expectedMs);
      remaining = useGameStore.getState().remainingMoves;
      guard += 1;
    }
    expect(remaining).toBe(0); // guardで打ち切られていない(=無限ループ/スタックしていない)
  }, HEAVY_TEST_TIMEOUT_MS);
});
