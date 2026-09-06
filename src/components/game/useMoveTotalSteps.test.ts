// @vitest-environment jsdom
//
// useMoveTotalSteps.ts(Polish Phase 3b「車移動の気持ちよさ」)の自動テスト。
// 「diceResultがnull→非nullになった瞬間のremainingMovesを1回だけtotalStepsとして
// キャプチャし、diceResultがnullへ戻ったら明示的にリセットする」という表示専用の
// フェーズ管理だけを検証する(gameStore.ts側の乱数決定・remainingMoves自体の計算には
// 一切関与しない)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMoveTotalSteps } from "./useMoveTotalSteps";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useMoveTotalSteps", () => {
  it("diceResultがnullのままならtotalStepsは常にnull", () => {
    const { result } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });
    expect(result.current).toBeNull();
  });

  it("diceResultがnull→非nullになった瞬間のremainingMovesを1回だけキャプチャする(ロール開始)", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });
    expect(result.current).toBeNull();

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 6 }); // rollDice()直後を模す(出目6、doubleMove等なし)
    });
    expect(result.current).toBe(6);
  });

  it("doubleMove等でdiceResultとremainingMovesがズレていても、totalStepsはremainingMoves側を採用する", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });

    // 出目(diceResult)は4だが、doubleMoveで実際の移動マス数(remainingMoves)は8。
    await act(async () => {
      rerender({ diceResult: 4, remainingMoves: 8 });
    });
    expect(result.current).toBe(8);
    expect(result.current).not.toBe(4);
  });

  it("分岐(selectingRoute)でremainingMovesが変化しても、totalStepsは最初にキャプチャした値のまま変わらない", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 6 }); // ロール開始(6マス)
    });
    expect(result.current).toBe(6);

    // 2マス進んで分岐(chooseRoute()はdiceResultを書き換えない)。
    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 4 });
    });
    expect(result.current).toBe(6); // 変わらない(再発進扱いにしない)

    // 分岐後さらに進んでも同様。
    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 2 });
    });
    expect(result.current).toBe(6);
  });

  it("次ターン(diceResultがnullへリセット)でtotalStepsもnullへリセットされる", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 6 });
    });
    expect(result.current).toBe(6);

    await act(async () => {
      rerender({ diceResult: null, remainingMoves: 0 }); // advanceToNextTurn()相当のリセット
    });
    expect(result.current).toBeNull();
  });

  it("次のロールでは新しいtotalStepsを取得する(1ターンごとに1回だけキャプチャ)", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 6 });
    });
    expect(result.current).toBe(6);

    await act(async () => {
      rerender({ diceResult: null, remainingMoves: 0 });
    });
    await act(async () => {
      rerender({ diceResult: 3, remainingMoves: 3 }); // 次のプレイヤー(または延長ロール)の出目3
    });
    expect(result.current).toBe(3);
  });

  it("mount直後、保存状態の復元等でdiceResultが最初から非nullでも誤ってキャプチャしない", () => {
    const { result } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: 4 as number | null, remainingMoves: 2 }, // 既にロール済み・移動途中の保存状態を想定
    });
    expect(result.current).toBeNull();
  });

  it("同じdiceResultのまま再レンダーしても、totalStepsを再キャプチャしない(remainingMovesの変化だけでは反応しない)", async () => {
    const { result, rerender } = renderHook(({ diceResult, remainingMoves }) => useMoveTotalSteps(diceResult, remainingMoves), {
      initialProps: { diceResult: null as number | null, remainingMoves: 0 },
    });

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 6 });
    });
    expect(result.current).toBe(6);

    await act(async () => {
      rerender({ diceResult: 6, remainingMoves: 5 }); // 1マス進んだだけ(diceResultは同じ)
    });
    expect(result.current).toBe(6); // 変わらない
  });
});
