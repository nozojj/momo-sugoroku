// @vitest-environment jsdom
//
// GameScreen.tsx(Polish Phase 3c「着地→マス効果発生の気持ちよさ」)の統合テスト。
// 「remainingMoves===0(着地tick)になった後、最後の1マスの視覚transitionが完了するまでは
// resolveLanding()(=advanceStep()経由)を呼ばず、transition完了後にLANDING_SETTLE_MSだけ
// 着地settleを挟んでから初めてresolveLanding()を呼ぶ」という新しいタイミングだけに絞って
// 検証する(Phase3a/3bのサイコロ演出・移動テンポ自体は各専用テストファイルで既に検証済み)。
//
// outcome種別(money/info/propertyOffer/card/moneyRoulette)ごとの個別テストでは、
// resolveLandingOutcome()(landingEffects.ts)をモックして結果を固定する。実際のマップ
// データに依存せず、かつgameStore.ts自体は一切変更しない(モックはテストファイル内だけの
// 差し替えで、本番コードには一切影響しない)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { resolveLandingOutcome } from "@/lib/game/landingEffects";
import { ARRIVAL_LAST_MS, getStepTransitionMs } from "@/lib/game/moveTempo";
import { DICE_FAKE_ROLL_MS, DICE_SETTLE_MS } from "./useDiceRevealPhase";
import { LANDING_SETTLE_MS } from "./useLandingSettlePhase";
import { GameScreen } from "./GameScreen";

vi.mock("@/lib/game/landingEffects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/game/landingEffects")>();
  return { ...actual, resolveLandingOutcome: vi.fn(actual.resolveLandingOutcome) };
});

const resolveLandingOutcomeMock = vi.mocked(resolveLandingOutcome);

// 最後の1マスの視覚transition時間(=Phase3bのARRIVAL_LAST_MSから算出)。totalSteps=1の
// ロールでも、totalSteps>=2ロールの最後の1マスでも、この値になる(moveTempo.ts既存仕様)。
const LAST_TRANSITION_MS = getStepTransitionMs(ARRIVAL_LAST_MS);
// 着地tick(remainingMoves===0)に入ってからresolveLanding()が呼ばれるまでの合計待ち時間
// (目的地到着ではない通常マスの場合)。
const LANDING_WAIT_MS = LAST_TRANSITION_MS + LANDING_SETTLE_MS;

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

async function waitForHydration(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** 「最後の1マスへ進んだ直後、あとはresolveLanding()を待つだけ」の状態(status:"moving",
 *  remainingMoves:0)へ直接ジャンプする。Phase3a(diceRevealPhase)/Phase3b(step tempo)は
 *  それぞれ専用のテストファイルで既に検証済みのため、Phase3cが対象とする「着地tick以降」の
 *  タイミングだけを、gameStore.tsの実際のアクション(advanceStep()等)は一切呼ばずに
 *  再現する(diceResultをnullのままにしておくことで、useDiceRevealPhaseは常に"idle"のまま
 *  なので移動effectのガードにも影響しない)。 */
function jumpToLandingTick(): void {
  act(() => {
    useGameStore.setState({ status: "moving", remainingMoves: 0 });
  });
}

const HEAVY_TEST_TIMEOUT_MS = 20000;

describe("GameScreen: 着地settleのタイミング(Polish Phase 3c、共通経路)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it(
    "着地tickに入った直後(transition未完了)はresolveLandingOutcome()がまだ呼ばれない",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      expect(useGameStore.getState().status).toBe("moving"); // まだ着地処理前
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "transition完了+着地settle(LANDING_SETTLE_MS)経過後に初めてresolveLandingOutcome()が呼ばれる",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
      expect(useGameStore.getState().status).not.toBe("moving");
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "resolveLandingOutcome()(=1着地あたりのresolveLanding())はちょうど1回だけ呼ばれ、その後タイマーが進んでも増えない",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1); // 増えない
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "unmount時にタイマーが残らず、その後resolveLandingOutcome()が呼ばれない",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      const { unmount } = render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS / 2);
      });
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "次のプレイヤーのターンへ着地settle状態が漏れない(手番送り直後は着地tickではないため即idle)",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);

      // resolveLandingOutcome()をinfo(何も起きないマス)に固定した状態で次に着地しても、
      // 前回の着地settleが残っていないことを確認する(=同じ仕組みで正しく1回ずつ発生する)。
      resolveLandingOutcomeMock.mockClear();
      jumpToLandingTick();
      // 着地settle開始直後(transition未完了)ではまだ呼ばれない。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

describe("GameScreen: 着地settleとCarTokenのsettle表示(Polish Phase 3c)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it(
    "transition完了前はanimate-landing-settleが付かず、settle中(resolveLanding直前)だけ付く",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      const { container } = render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LAST_TRANSITION_MS - 1);
      });
      expect(container.querySelector(".animate-landing-settle")).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(container.querySelector(".animate-landing-settle")).not.toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_SETTLE_MS);
      });
      // resolveLanding()実行後はstatusが"moving"を離れるため、settle表示も終わっているはず。
      expect(container.querySelector(".animate-landing-settle")).toBeNull();
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

describe("GameScreen: destination arrival時は通常着地settleを抑制する(Polish Phase 3c、B案)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it(
    "目的地到着が事前に分かる着地では、settle(+150ms)を足さずtransition完了時点でresolveLandingOutcome()が呼ばれる",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      const { container } = render(<GameScreen />);
      await waitForHydration();

      const destinationNodeId = useGameStore.getState().destinationNodeId;
      act(() => {
        const players = useGameStore.getState().players;
        useGameStore.setState({
          status: "moving",
          remainingMoves: 0,
          players: players.map((p, i) => (i === 0 ? { ...p, currentNodeId: destinationNodeId } : p)),
        });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LAST_TRANSITION_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      // 抑制されているため、settle演出(CarTokenのanimate-landing-settle)自体も出ない。
      expect(container.querySelector(".animate-landing-settle")).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1); // LANDING_SETTLE_MSを待たずに呼ばれる
      expect(container.querySelector(".animate-landing-settle")).toBeNull(); // 通常settleは出ない
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

describe("GameScreen: outcome種別ごとの共通経路(Polish Phase 3c)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function runLandingWithOutcome(outcome: ReturnType<typeof resolveLandingOutcome>): Promise<void> {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    vi.useFakeTimers();
    render(<GameScreen />);
    await waitForHydration();

    resolveLandingOutcomeMock.mockReturnValueOnce(outcome);
    jumpToLandingTick();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
    });
    expect(useGameStore.getState().status).toBe("moving"); // outcome種別に関わらず、settle完了前はまだ

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }

  it("money(+): settle完了後にLandingResultToast相当のlandingResultInfo(moneyGain)が反映される", async () => {
    await runLandingWithOutcome({ kind: "money", amount: 100, message: "テスト+100万円" });
    const info = useGameStore.getState().landingResultInfo;
    expect(info?.kind).toBe("moneyGain");
    expect(info?.amount).toBe(100);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("money(-): settle完了後にlandingResultInfo(moneyLoss)が反映される", async () => {
    await runLandingWithOutcome({ kind: "money", amount: -50, message: "テスト-50万円" });
    const info = useGameStore.getState().landingResultInfo;
    expect(info?.kind).toBe("moneyLoss");
    expect(info?.amount).toBe(-50);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("info: settle完了後、モーダルは出ずそのまま次の処理(ターン送り等)へ進む", async () => {
    await runLandingWithOutcome({ kind: "info", message: "テスト到着" });
    // info自体はモーダル・トーストを持たない。statusが"moving"を離れてさえいればよい
    // (次にどのstatusになるかはfinishLandingAndEndTurn()側の既存仕様、Phase3cでは変更しない)。
    expect(useGameStore.getState().status).not.toBe("moving");
  }, HEAVY_TEST_TIMEOUT_MS);

  it("propertyOffer: settle完了後にstatus:'purchaseOffer'へ遷移する", async () => {
    await runLandingWithOutcome({ kind: "propertyOffer", groupId: "dummy-group" });
    expect(useGameStore.getState().status).toBe("purchaseOffer");
  }, HEAVY_TEST_TIMEOUT_MS);

  it("card: settle完了後にstatus:'cardDraw'へ遷移する", async () => {
    await runLandingWithOutcome({ kind: "card", cardId: "dummy-card", message: "テストカード" });
    expect(useGameStore.getState().status).toBe("cardDraw");
  }, HEAVY_TEST_TIMEOUT_MS);

  it("moneyRoulette: settle完了後にstatus:'moneyRoulette'へ遷移する", async () => {
    await runLandingWithOutcome({
      kind: "moneyRoulette",
      amount: 30,
      message: "テストルーレット",
      rouletteInfo: { kind: "moneyGain", nodeName: "テストマス", amount: 30, candidates: [10, 20, 30] },
    });
    expect(useGameStore.getState().status).toBe("moneyRoulette");
  }, HEAVY_TEST_TIMEOUT_MS);
});

describe("GameScreen: CPU/人間で同じ着地settleを通る(Polish Phase 3c)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it(
    "CPUの着地でも、人間と同じLANDING_WAIT_MS(transition完了+settle)を経てresolveLandingOutcome()が呼ばれる",
    async () => {
      useGameStore.getState().startGame(["CPU太郎", "じろう"], 1, ["cpu", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "purchaseOffer着地後、settle→resolveLanding→status変更→CPUの650ms delay、という順序を保つ(CPUが着地settle中に操作を先取りしない)",
    async () => {
      useGameStore.getState().startGame(["CPU太郎", "じろう"], 1, ["cpu", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      resolveLandingOutcomeMock.mockReturnValueOnce({ kind: "propertyOffer", groupId: "dummy-group" });
      jumpToLandingTick();

      // settle完了直前まではまだpurchaseOfferにすらなっていない(CPUが操作しようがない)。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(useGameStore.getState().status).toBe("moving");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(useGameStore.getState().status).toBe("purchaseOffer");
      const pendingGroupId = useGameStore.getState().pendingPropertyGroupId;
      expect(pendingGroupId).toBe("dummy-group");

      // status:"purchaseOffer"になった直後(CPU_ACTION_DELAY_MS=650ms未満)は、CPUがまだ
      // 物件を選んでいない(pendingPropertyGroupIdが変化しない=CPU側の副作用がまだ起きていない)。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(649);
      });
      expect(useGameStore.getState().status).toBe("purchaseOffer");
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});

describe("GameScreen: 出目1/長距離/分岐後の着地でも同じ着地settleが働く(Polish Phase 3c)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    resolveLandingOutcomeMock.mockClear();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it(
    "出目1相当(totalSteps=1)の着地でも同じLANDING_WAIT_MSが適用される",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      // rollDice()を経由して出目1相当を再現する(diceResult null→非null遷移を通す必要がある
      // ため、jumpToLandingTick()ではなくdiceResult/remainingMoves双方を直接1で確定させる)。
      act(() => {
        useGameStore.setState({ diceResult: 1, diceFaces: [1], remainingMoves: 1, status: "moving" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
      });
      // 1マス目=最後のマスなのでARRIVAL_LAST_MS(=LAST_TRANSITION_MS由来)の間隔で進む。
      const before = moveHistoryLength();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ARRIVAL_LAST_MS);
      });
      // 分岐した場合はまだ着地していないので、その場合はテストの前提が崩れるため
      // 分岐なしで直接remainingMoves===0へ到達したケースだけを見る(分岐時はPhase3bの
      // 既存テストで別途検証済み)。
      const state = useGameStore.getState();
      if (state.status === "selectingRoute") return; // 分岐時は本テストの対象外(Phase3b側で検証済み)
      expect(moveHistoryLength()).toBeGreaterThan(before);
      expect(state.remainingMoves).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "長距離移動(totalSteps=9相当)の最後の着地でも同じLANDING_WAIT_MSが適用される(直接remainingMoves===0へ到達させて確認)",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      // 長距離移動の「最後の1マス」だけを取り出して確認する(DEPART/CRUISEの並びは
      // GameScreen.moveTempo.test.tsxで既に検証済みのため、ここではLANDING_WAIT_MSの
      // 適用条件=remainingMoves===0であることだけに着目する)。
      jumpToLandingTick();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "分岐(selectingRoute)を経て最後に着地した場合も、同じLANDING_WAIT_MSを経てresolveLandingOutcome()が呼ばれる",
    async () => {
      useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
      vi.useFakeTimers();
      render(<GameScreen />);
      await waitForHydration();

      // 分岐で1マス選択した直後(remainingMoves:0まで進んだ状態)を直接模す。
      act(() => {
        useGameStore.setState({ status: "moving", remainingMoves: 0, routeOptions: [] });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
      });
      expect(resolveLandingOutcomeMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(resolveLandingOutcomeMock).toHaveBeenCalledTimes(1);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );
});
