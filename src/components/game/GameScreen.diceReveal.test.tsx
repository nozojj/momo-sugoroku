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
import { ARRIVAL_LAST_MS, DEPART_MS } from "@/lib/game/moveTempo";
import { DICE_FAKE_ROLL_MS, DICE_SETTLE_MS } from "./useDiceRevealPhase";
import { GameScreen } from "./GameScreen";

// 既知のflaky問題(フルスイート実行時のみ本テストが稀にタイムアウト/状態不整合で失敗する。
// 単体実行では常に成功)の根本原因調査の結果判明した対処。
//
// 調査で切り分けた事実:
// - 単体実行/軽い組み合わせでは常に成功、テスト全体で多数のファイルが並行実行される
//   (デフォルトの`forks`プールで複数ワーカープロセスが同時に走る)ときだけ失敗する。
// - `--no-file-parallelism`や`--maxWorkers`を下げるとフルスイートでも安定して成功する
//   (=別ファイルの状態がリークしているのではなく、並行実行によるCPU競合で説明がつく)。
// - `forks`プールは各テストファイルを別OSプロセスで実行するため、他ファイルのfake timer/
//   mock/localStorage/DOM等がプロセスをまたいでこのテストへ状態として漏れることは
//   構造上あり得ない(モジュール変数・グローバルなイベントリスナー等のリーク説は検証の上で
//   否定できる)。
// - hydration完了・GameScreenの初回レンダー(status:"rolling")までは常に正常に完了しており、
//   失敗はその後のvi.advanceTimersByTimeAsync()呼び出し(実時間で計測すると要求した仮想msと
//   同程度〜それ以上の実時間がかかることがある)以降でのみ発生する。
//
// Board.tsx(598ノード分のSVGを毎回フル描画する重いコンポーネント)を実物のままGameScreen配下で
// マウントしていたことが、この重い再レンダーコストの発生源だった。このテストが検証したいのは
// サイコロ演出と移動タイミングの同期(store側のstatus/diceResult/moveHistory)だけで、Boardが
// 実際に何を描画するかは一切見ていない。フルスイートで他のテストファイル(別プロセス)が
// 同時にCPUを使っている状況では、vi.advanceTimersByTimeAsync()のたびに発生するBoardの実
// 再レンダーにかかる実CPU時間が伸び、既定の5000msの実時間テストタイムアウトを稀に超過して
// いた(vi.useFakeTimers()は仮想時間の経過を制御するだけで、実際のレンダリングにかかる実CPU
// 時間までは制御できないため)。Boardを軽量スタブに差し替えることで、この関係のない実描画
// コストをこのテストから完全に取り除く(store側のロジック・GameScreen自体は一切変更していない。
// GameScreen.moveTempo.test.tsx/GameScreen.landingResult.test.tsxも同じ理由で同じ対処をした)。
vi.mock("./Board", () => ({ Board: () => null }));

// Polish Phase 3b: 最初の1マスのstep intervalは、出目(totalSteps)によって
// DEPART_MS(totalSteps>2)〜ARRIVAL_LAST_MS(totalSteps<=1)まで変わりうる(moveTempo.ts参照)。
// このテストでは実際の出目を固定していないため、どちらのティアになっても確実に
// advanceStep()相当の処理が完了しているとみなせるよう、両方の最大値を安全マージンとして使う。
const FIRST_STEP_MAX_MS = Math.max(DEPART_MS, ARRIVAL_LAST_MS);

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
    // Phase3a以前は固定460ms後に既に1歩進んでいたが、DICE_FAKE_ROLL_MS(450ms)だけでは
    // 足りず(+DICE_SETTLE_MS=180ms)、この時点で動いていたら演出とゲーム進行が
    // ズレている(=不具合)。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
    });
    expect(advanceStepHappened(startMoveHistoryLength)).toBe(false); // 演出は終わったが移動タイマーはまだ

    // フェイクロール演出が完全に終わった後、Polish Phase 3bの可変step interval
    // (出目に応じてDEPART_MS〜ARRIVAL_LAST_MS)分だけ経過して、ようやく1歩目
    // (または分岐マスならselectingRouteへの遷移)が処理される。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_STEP_MAX_MS);
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
      await vi.advanceTimersByTimeAsync(FIRST_STEP_MAX_MS);
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
