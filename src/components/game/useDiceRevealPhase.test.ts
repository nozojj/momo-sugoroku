// @vitest-environment jsdom
//
// useDiceRevealPhase.ts(Polish Phase 3a)の自動テスト。
// 「diceResultがnull→非nullになった瞬間に"rolling"へ入り、時間経過だけで
// "settling"→"idle"へ自動的に戻る」という表示専用のフェーズ遷移だけを検証する
// (ゲームロジック側の乱数決定・rollDice()自体はこのフックが一切呼ばない)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { DICE_FAKE_ROLL_MS, DICE_SETTLE_MS, useDiceRevealPhase } from "./useDiceRevealPhase";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDiceRevealPhase", () => {
  it("diceResultがnullのままなら常に'idle'", () => {
    const { result } = renderHook(() => useDiceRevealPhase(null));
    expect(result.current).toBe("idle");
  });

  it("diceResultがnull→非nullになった瞬間に'rolling'へ入る", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ diceResult }) => useDiceRevealPhase(diceResult), {
      initialProps: { diceResult: null as number | null },
    });
    expect(result.current).toBe("idle");

    rerender({ diceResult: 4 });
    expect(result.current).toBe("rolling");
  });

  it("初回mount時点で既にdiceResultが非nullでも'rolling'へは入らない(誤発火防止)", () => {
    vi.useFakeTimers();
    // 永続化された保存データの復元直後など、diceResultが最初から確定済みのケースを想定。
    const { result } = renderHook(() => useDiceRevealPhase(4));
    expect(result.current).toBe("idle");
  });

  it("DICE_FAKE_ROLL_MS経過で'rolling'→'settling'、さらにDICE_SETTLE_MS経過で'settling'→'idle'になる", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ diceResult }) => useDiceRevealPhase(diceResult), {
      initialProps: { diceResult: null as number | null },
    });

    rerender({ diceResult: 4 });
    expect(result.current).toBe("rolling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS - 1);
    });
    expect(result.current).toBe("rolling"); // まだ切り替わらない

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBe("settling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS - 1);
    });
    expect(result.current).toBe("settling"); // まだ切り替わらない

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBe("idle");
  });

  it("同じdiceResultのまま再レンダーしても'rolling'を再トリガーしない", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ diceResult }) => useDiceRevealPhase(diceResult), {
      initialProps: { diceResult: null as number | null },
    });

    rerender({ diceResult: 4 });
    // FinalRaceSequence.test.tsxのadvanceSteps()と同じ理由で、1回のadvanceTimersByTimeAsync
    // にまとめず、フェーズごとに分けて進める(直前のsetPhase()に対するReactの再レンダー・
    // useEffect登録=次のsetTimeout予約が間に合わないまま時間だけ進んでしまうため)。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
    });
    expect(result.current).toBe("idle");

    rerender({ diceResult: 4 }); // 同じ値のまま再レンダー(CPU/人間の他の状態変化を模す)
    expect(result.current).toBe("idle");
  });

  it("null経由でリセットされた次のロールでは再度'rolling'に入る(1ターンごとに1回)", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ diceResult }) => useDiceRevealPhase(diceResult), {
      initialProps: { diceResult: null as number | null },
    });

    rerender({ diceResult: 4 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_FAKE_ROLL_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICE_SETTLE_MS);
    });
    expect(result.current).toBe("idle");

    rerender({ diceResult: null }); // endTurn()相当のリセット
    expect(result.current).toBe("idle");

    rerender({ diceResult: 2 }); // 次のプレイヤーのロール
    expect(result.current).toBe("rolling");
  });

  it("unmount時にタイマーが残らない(その後の操作でエラーにならない)", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ diceResult }) => useDiceRevealPhase(diceResult), {
      initialProps: { diceResult: null as number | null },
    });
    rerender({ diceResult: 4 });
    unmount();
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});
