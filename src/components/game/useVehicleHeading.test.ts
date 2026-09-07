// @vitest-environment jsdom
//
// useVehicleHeading.ts(Polish Phase 3d「カーブ時の車体リアクション」)の自動テスト。
// 「x/yが変化したstepだけcurve leanを算出し、offsetX/offsetYの変化やidle中は反応しない」
// という表示専用の計算だけを検証する(gameStore/GameStatusには一切依存しない)。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useVehicleHeading } from "./useVehicleHeading";
import { MAX_CURVE_LEAN_DEG } from "@/lib/game/vehicleHeading";

afterEach(() => {
  cleanup();
});

describe("useVehicleHeading", () => {
  it("初回mount時はlean 0、stepKeyは0", () => {
    const { result } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 100, y: 100 },
    });
    expect(result.current.leanDeg).toBe(0);
    expect(result.current.stepKey).toBe(0);
  });

  it("最初の移動ではprevious headingが無いため、安全にlean 0のまま(stepKeyだけ増える)", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 }); // 右へ1マス
    expect(result.current.leanDeg).toBe(0);
    expect(result.current.stepKey).toBe(1);
  });

  it("2step目で方向転換した場合、curve leanが発生する", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 }); // 右へ(heading 0°)
    expect(result.current.leanDeg).toBe(0);

    rerender({ x: 10, y: 10 }); // 下へ(heading 90°、右カーブ=+turn)
    expect(result.current.leanDeg).toBeGreaterThan(0);
    expect(result.current.stepKey).toBe(2);
  });

  it("左カーブはleanが負になる", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 }); // 右へ(heading 0°)
    rerender({ x: 10, y: -10 }); // 上へ(heading -90°、左カーブ=-turn)
    expect(result.current.leanDeg).toBeLessThan(0);
  });

  it("直進が続く間はleanが発生しない", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 });
    rerender({ x: 20, y: 0 });
    expect(result.current.leanDeg).toBe(0);
    rerender({ x: 30, y: 0 });
    expect(result.current.leanDeg).toBe(0);
  });

  it("位置が変化しない間(idle/選択待ち)はstepKeyが増えず、leanも変化しない", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 });
    rerender({ x: 10, y: 10 });
    const afterCurve = { ...result.current };

    rerender({ x: 10, y: 10 }); // 位置据え置き(手番待ち等)
    rerender({ x: 10, y: 10 });
    expect(result.current).toEqual(afterCurve);
  });

  it("offsetX/offsetY相当の変化(x/y自体は変わらない)には反応しない設計であることの確認: 同じx/yを渡す限りstepKeyは増えない", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 5, y: 5 },
    });
    const initialStepKey = result.current.stepKey;
    // cluster offsetが変化しても、Board.tsx/CarToken.tsxはこのhookへoffset適用前のx/yのみを渡す
    // 設計のため、ここでは「同じx/yを複数回渡しても反応しない」ことをそのまま検証する。
    rerender({ x: 5, y: 5 });
    rerender({ x: 5, y: 5 });
    expect(result.current.stepKey).toBe(initialStepKey);
  });

  it("180°Uターン(stepBack相当)でもleanはMAX_CURVE_LEAN_DEGを超えない", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 }); // 右へ
    rerender({ x: 0, y: 0 }); // 来た道を正確に戻る(180°反転)
    expect(Math.abs(result.current.leanDeg)).toBeCloseTo(MAX_CURVE_LEAN_DEG);
  });

  it("分岐相当の座標変更(chooseRoute的な非連続の次ノードへの移動)でも1step遅れずleanが発生する", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 }); // 直進で分岐点まで到達
    rerender({ x: 10, y: 0 }); // selectingRoute中は位置据え置き(反応しないことの確認)
    expect(result.current.stepKey).toBe(1);

    rerender({ x: 10, y: 20 }); // 分岐で下方向を選択(chooseRoute実行)
    expect(result.current.stepKey).toBe(2);
    expect(result.current.leanDeg).toBeGreaterThan(0);
  });

  it("複数回のrerenderを経ても内部状態が壊れない(スナップショット的な一貫性)", () => {
    const { result, rerender } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    const path = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    for (const p of path) rerender(p);
    expect(result.current.stepKey).toBe(path.length);
    expect(Number.isFinite(result.current.leanDeg)).toBe(true);
  });

  it("unmountしてもエラーにならない(cleanup)", () => {
    const { rerender, unmount } = renderHook(({ x, y }) => useVehicleHeading(x, y), {
      initialProps: { x: 0, y: 0 },
    });
    rerender({ x: 10, y: 0 });
    expect(() => unmount()).not.toThrow();
  });
});
