// @vitest-environment jsdom
//
// MoneyRouletteModal.tsx(Phase10/P10-2で効果音を追加)の自動テスト。
// 通常tickはroulette_tick、最終tick(確定額が見える瞬間)はmoney_gain/money_lossを鳴らし、
// 両方が同時に重ならないことを中心に検証する。抽選ロジック自体・onContinueの発火保証は
// このコンポーネントの既存仕様であり、ここでは対象にしない。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { MoneyRouletteModal } from "./MoneyRouletteModal";
import type { MoneyRouletteInfo } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

const POLL_STEP_MS = 50;
const HOLD_DURATION_MS = 500; // MoneyRouletteModal.tsxのHOLD_DURATION_MSと同じ値
// 実測: buildSpinIntervals(1000, 9)の合計は理論値1037msだが、act()/再レンダーを挟む分の
// オーバーヘッドがあり、余裕を見て2000msあれば確実に確定(settled)まで到達する(実測で確認済み)。
const SETTLE_TIMEOUT_MS = 2000;

function buildInfo(kind: "moneyGain" | "moneyLoss"): MoneyRouletteInfo {
  return {
    playerId: "p1",
    playerName: "テストP1",
    kind,
    nodeName: "テストマス",
    amount: kind === "moneyGain" ? 300 : -300,
    candidates: [100, -100, 300, -300, 500],
  };
}

/** スピン確定(settled)まで小刻みにフェイクタイマーを進める。 */
async function advanceUntilSettled(maxMs = SETTLE_TIMEOUT_MS): Promise<void> {
  let elapsed = 0;
  while (elapsed < maxMs) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_STEP_MS);
    });
    elapsed += POLL_STEP_MS;
  }
}

describe("MoneyRouletteModal", () => {
  beforeEach(() => {
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("確定までroulette_tickが複数回、money_gainが最後に1回だけ、かつ重複しない(moneyGain)", async () => {
    render(<MoneyRouletteModal info={buildInfo("moneyGain")} onContinue={() => {}} />);

    await advanceUntilSettled();

    const calls = playSEMock.mock.calls.map((c) => c[0]);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.filter((id) => id === "money_gain")).toHaveLength(1);
    expect(calls.filter((id) => id === "money_loss")).toHaveLength(0);
    expect(calls.filter((id) => id === "roulette_tick")).toHaveLength(calls.length - 1);
    // 最後に鳴るのは確定音であって、roulette_tickと同時ではない。
    expect(calls[calls.length - 1]).toBe("money_gain");
  });

  it("確定までroulette_tickが複数回、money_lossが最後に1回だけ、かつ重複しない(moneyLoss)", async () => {
    render(<MoneyRouletteModal info={buildInfo("moneyLoss")} onContinue={() => {}} />);

    await advanceUntilSettled();

    const calls = playSEMock.mock.calls.map((c) => c[0]);
    expect(calls.filter((id) => id === "money_loss")).toHaveLength(1);
    expect(calls.filter((id) => id === "money_gain")).toHaveLength(0);
    expect(calls[calls.length - 1]).toBe("money_loss");
  });

  it("確定後、追加でタイマーを進めても再生回数が増えない(HOLD_DURATION_MS経過分)", async () => {
    render(<MoneyRouletteModal info={buildInfo("moneyGain")} onContinue={() => {}} />);
    await advanceUntilSettled();
    const countAfterSettle = playSEMock.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOLD_DURATION_MS + 200);
    });

    expect(playSEMock.mock.calls.length).toBe(countAfterSettle);
  });

  it("途中の親再レンダー(同じinfo)では再生回数が変わらない", async () => {
    const info = buildInfo("moneyGain");
    const { rerender } = render(<MoneyRouletteModal info={info} onContinue={() => {}} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_STEP_MS * 2);
    });
    const countBeforeRerender = playSEMock.mock.calls.length;

    rerender(<MoneyRouletteModal info={info} onContinue={() => {}} />);

    expect(playSEMock.mock.calls.length).toBe(countBeforeRerender);
  });
});
