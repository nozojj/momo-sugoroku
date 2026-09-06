// @vitest-environment jsdom
//
// GameScreen.tsx(Polish Phase 3a「手番の合図+サイコロの気持ちよさ」)の統合テスト。
// 最重要ポイント(ユーザー要求の「6. 最重要: ゲーム進行との同期」)だけに絞って検証する:
// rollDice()自体はサイコロを振った瞬間に同期でdiceResult/remainingMoves/status:"moving"を
// 確定させるが、UI上のフェイクロール演出(useDiceRevealPhase.ts、DICE_FAKE_ROLL_MS+
// DICE_SETTLE_MS)が終わるまでは、実際の車の移動(advanceStep()によるmoveHistoryの増加)を
// 開始しないこと。人間がクリックした場合・CPUが自動でロールした場合の両方で同じ振る舞いに
// なることを確認する(既存のgameStore.ts/cpuDecision.ts/useCpuAutoplay.tsのロジックは
// 一切変更していない)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { DICE_FAKE_ROLL_MS, DICE_SETTLE_MS } from "./useDiceRevealPhase";
import { GameScreen } from "./GameScreen";

const STEP_ANIMATION_MS = 460;

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

/** 現在の手番プレイヤー(index0固定、このテストでは常に最初のプレイヤーを動かす)の
 *  moveHistory件数。advanceStep()が呼ばれて実際に1マス進むと1増える。 */
function moveHistoryLength(): number {
  return useGameStore.getState().players[0].moveHistory.length;
}

/** advanceStep()が実際に1回分処理されたかどうか。分岐の無いマスなら1マス進んで
 *  moveHistoryが増えるが、分岐マス(選択肢が複数)ではまだ位置は動かさずに
 *  status:"selectingRoute"へ遷移する(gameStore.ts既存仕様)。マップ上のどちらに
 *  該当するかはテスト側では決め打ちできないため、「まだstatus:"moving"のまま位置も
 *  変わっていない」でなければadvanceStep()は処理済みとみなす。 */
function advanceStepHappened(prevMoveHistoryLength: number): boolean {
  const state = useGameStore.getState();
  return state.status !== "moving" || moveHistoryLength() > prevMoveHistoryLength;
}

async function waitForHydration(): Promise<void> {
  // useHasHydrated()はuseEffect経由でpersist.hasHydrated()を確認する。jsdom環境では
  // 同期的にtrueになるため、1回actでflushすれば十分(実タイマーは使わない)。
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GameScreen: サイコロ演出と車移動の同期(Polish Phase 3a)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    // jsdomはscrollIntoView/HTMLMediaElement.play()を実装していない。GameDrawer内の
    // EventLog.tsxが自動スクロールに使うだけの副作用のため、テスト用に空実装で埋める
    // (ゲームロジック・本番コードは一切変更しない)。
    Element.prototype.scrollIntoView = vi.fn();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("人間がロールした場合: フェイクロール演出中は車が動き出さず、演出完了後に初めて1歩目が進む", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    expect(useGameStore.getState().status).toBe("rolling");
    fireEvent.click(screen.getByRole("button", { name: "サイコロを振る" }));

    // rollDice()自体は同期実行なので、この時点で既にstatus/diceResult/remainingMovesは
    // 裏側で確定している。しかしまだ1歩も動いていないはず。
    expect(useGameStore.getState().status).toBe("moving");
    expect(useGameStore.getState().diceResult).not.toBeNull();
    const startMoveHistoryLength = moveHistoryLength();

    // フェイクロール演出(rolling→settling→idle)が終わるまで、まだ車は動き出さない。
    // useDiceRevealPhase.test.tsと同じ理由で、1回のadvanceTimersByTimeAsyncにまとめず
    // 段階ごとに分けて進める(直前のsetState()に対するReactの再レンダー・useEffect登録=
    // 次のsetTimeout予約が間に合わないまま時間だけ進んでしまうため)。
    // Phase3a以前はSTEP_ANIMATION_MS=460ms後に既に1歩進んでいたが、DICE_FAKE_ROLL_MS(450ms)
    // だけでは足りず(+DICE_SETTLE_MS=180ms)、この時点で動いていたら演出とゲーム進行が
    // ズレている(=不具合)。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false); // 演出は終わったが移動タイマーはまだ

    // フェイクロール演出が完全に終わった後、既存のSTEP_ANIMATION_MS分だけ経過して
    // ようやく1歩目(または分岐マスならselectingRouteへの遷移)が処理される。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEP_ANIMATION_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(true);
  });

  it("CPUがロールした場合も同じ演出を通り、フェイクロール演出中は車が動き出さない", async () => {
    useGameStore.getState().startGame(["CPU太郎", "じろう"], 1, ["cpu", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    expect(useGameStore.getState().status).toBe("rolling");

    // useCpuAutoplay.tsのCPU_ACTION_DELAY_MS(650ms)経過でCPUが自動的にrollDice()する。
    // ロジック(cpuDecision.ts)には一切触れていないので、ここでは実行タイミングだけを追う。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(useGameStore.getState().status).toBe("moving");
    const startMoveHistoryLength = moveHistoryLength();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false); // まだ動いていない

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false); // まだ動いていない

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEP_ANIMATION_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(true); // 演出完了後に進む
  });

  it("連打してもrollDiceは1回分しか反映されない(diceResultが2回目以降のクリックで変化しない)", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    const button = screen.getByRole("button", { name: "サイコロを振る" });
    fireEvent.click(button);
    const firstDiceResult = useGameStore.getState().diceResult;
    expect(firstDiceResult).not.toBeNull();

    // rollDice()実行直後、Reactの再レンダーでボタンは既にdisabledになっているはずだが、
    // 念のためstore側のガードも直接叩いて二重ロールが反映されないことを確認する
    // (gameStore.tsのrollDice()自体は今回変更していない既存の防御)。
    fireEvent.click(button);
    act(() => {
      useGameStore.getState().rollDice();
    });
    expect(useGameStore.getState().diceResult).toBe(firstDiceResult);
  });
});
