// @vitest-environment jsdom
//
// useLandingSettlePhase.ts(Polish Phase 3c「着地→マス効果発生の気持ちよさ」)の自動テスト。
// 「status==='moving' && remainingMoves===0(着地tick)になってからtransitionMs経過後だけ
// 'settling'を返す」という表示専用のフェーズ遷移だけを検証する(resolveLanding()自体の
// 呼び出しタイミングはGameScreen.tsx側の別のuseEffectが管理するため、ここでは扱わない)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { LANDING_SETTLE_MS, useLandingSettlePhase } from "./useLandingSettlePhase";
import type { GameStatus } from "@/types/game";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useLandingSettlePhase", () => {
  it("status:'moving'でremainingMoves>0の間は常に'idle'", () => {
    const { result } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 3 },
    });
    expect(result.current).toBe("idle");
  });

  it("着地tick(status:'moving' && remainingMoves===0)に入った直後はまだ'idle'", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 1 },
    });
    rerender({ status: "moving", remainingMoves: 0 });
    expect(result.current).toBe("idle");
  });

  it("着地tickに入ってからtransitionMs経過後に'settling'へ切り替わる", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 1 },
    });
    rerender({ status: "moving", remainingMoves: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(489);
    });
    expect(result.current).toBe("idle"); // まだ

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBe("settling");
  });

  it("resolveLanding()相当でstatusが'moving'以外へ変わった瞬間に即座に'idle'へ戻る", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 0 },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(490);
    });
    expect(result.current).toBe("settling");

    rerender({ status: "resolvingEvent", remainingMoves: 0 }); // resolveLanding()実行後を模す
    expect(result.current).toBe("idle");
  });

  it("settling中に移動が再開(remainingMoves>0)しても即座に'idle'へ戻る(理論上到達しない保険)", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 0 },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(490);
    });
    expect(result.current).toBe("settling");

    rerender({ status: "moving", remainingMoves: 4 });
    expect(result.current).toBe("idle");
  });

  it("次のターンで再び着地tickに入ると、同じtransitionMsを経てもう一度'settling'になる(二重timerにならない)", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 0 },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(490);
    });
    expect(result.current).toBe("settling");

    rerender({ status: "rolling", remainingMoves: 0 }); // 次プレイヤーへ手番送り
    expect(result.current).toBe("idle");

    rerender({ status: "moving", remainingMoves: 1 }); // 次のロールの移動開始
    rerender({ status: "moving", remainingMoves: 0 }); // 次の着地tick
    expect(result.current).toBe("idle"); // まだ

    await act(async () => {
      await vi.advanceTimersByTimeAsync(490);
    });
    expect(result.current).toBe("settling");
  });

  it("再レンダーだけ(値が変わらない)では二重にtimerを登録しない(同じtransitionMs経過で1回だけ切り替わる)", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 0 },
    });

    rerender({ status: "moving", remainingMoves: 0 }); // 値が変わらない再レンダー
    rerender({ status: "moving", remainingMoves: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(490);
    });
    expect(result.current).toBe("settling");
  });

  it("unmount時にタイマーが残らない(その後の操作でエラーにならない)", async () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ status, remainingMoves }) => useLandingSettlePhase(status, remainingMoves, 490), {
      initialProps: { status: "moving" as GameStatus, remainingMoves: 1 },
    });
    rerender({ status: "moving", remainingMoves: 0 });
    unmount();
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });

  it("LANDING_SETTLE_MSは100〜200msの範囲に収まる(指示どおりの短さを維持していることの回帰確認)", () => {
    expect(LANDING_SETTLE_MS).toBeGreaterThanOrEqual(100);
    expect(LANDING_SETTLE_MS).toBeLessThanOrEqual(200);
  });
});
