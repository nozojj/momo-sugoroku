// moveTempo.ts(Polish Phase 3b「車移動の気持ちよさ」)の自動テスト。
// ゲームstate/DOMに一切依存しない純関数のため、値の組み合わせだけを検証する。
import { describe, expect, it } from "vitest";
import {
  ARRIVAL_LAST_MS,
  ARRIVAL_SECOND_LAST_MS,
  CRUISE_MS,
  DEPART_MS,
  MIN_STEP_TRANSITION_MS,
  STEP_TRANSITION_BUFFER_MS,
  getStepAnimationMs,
  getStepTransitionMs,
} from "./moveTempo";

describe("getStepAnimationMs", () => {
  it("totalSteps=1(出目1相当): 唯一の1マスがARRIVAL_LAST_MS", () => {
    expect(getStepAnimationMs({ totalSteps: 1, remainingMoves: 1 })).toBe(ARRIVAL_LAST_MS);
  });

  it("totalSteps=2(出目2相当): 1マス目=ARRIVAL_SECOND_LAST_MS、2マス目(最後)=ARRIVAL_LAST_MS", () => {
    expect(getStepAnimationMs({ totalSteps: 2, remainingMoves: 2 })).toBe(ARRIVAL_SECOND_LAST_MS);
    expect(getStepAnimationMs({ totalSteps: 2, remainingMoves: 1 })).toBe(ARRIVAL_LAST_MS);
  });

  it("totalSteps=3(出目3相当): DEPART→ARRIVAL_SECOND_LAST_MS→ARRIVAL_LAST_MS(巡航区間を作らない)", () => {
    expect(getStepAnimationMs({ totalSteps: 3, remainingMoves: 3 })).toBe(DEPART_MS);
    expect(getStepAnimationMs({ totalSteps: 3, remainingMoves: 2 })).toBe(ARRIVAL_SECOND_LAST_MS);
    expect(getStepAnimationMs({ totalSteps: 3, remainingMoves: 1 })).toBe(ARRIVAL_LAST_MS);
  });

  it("totalSteps=6(通常4〜6マス相当): DEPART→CRUISE×3→ARRIVAL_SECOND_LAST_MS→ARRIVAL_LAST_MS", () => {
    const sequence = [6, 5, 4, 3, 2, 1].map((remainingMoves) => getStepAnimationMs({ totalSteps: 6, remainingMoves }));
    expect(sequence).toEqual([DEPART_MS, CRUISE_MS, CRUISE_MS, CRUISE_MS, ARRIVAL_SECOND_LAST_MS, ARRIVAL_LAST_MS]);
  });

  it("totalSteps>=7(急行系カード等の大きな移動数): DEPART→CRUISEが続き、最後の2マスだけARRIVALになる", () => {
    const totalSteps = 9;
    const sequence = Array.from({ length: totalSteps }, (_, i) => totalSteps - i).map((remainingMoves) =>
      getStepAnimationMs({ totalSteps, remainingMoves }),
    );
    expect(sequence[0]).toBe(DEPART_MS);
    expect(sequence.slice(1, -2)).toEqual(Array(totalSteps - 3).fill(CRUISE_MS));
    expect(sequence[sequence.length - 2]).toBe(ARRIVAL_SECOND_LAST_MS);
    expect(sequence[sequence.length - 1]).toBe(ARRIVAL_LAST_MS);
  });

  it("優先順位どおりARRIVALがDEPARTより優先される(totalSteps<=2のときstepIndex===0でもDEPARTにならない)", () => {
    // totalSteps=1/2はstepIndexが常に0付近だが、remainingMoves<=2のARRIVAL判定が先に効く。
    expect(getStepAnimationMs({ totalSteps: 1, remainingMoves: 1 })).not.toBe(DEPART_MS);
    expect(getStepAnimationMs({ totalSteps: 2, remainingMoves: 2 })).not.toBe(DEPART_MS);
  });

  it("分岐で一時停止して再開しても、totalSteps/remainingMovesの組み合わせだけで同じ値を返す(再発進しない)", () => {
    // 6マス移動中、2マス進んだ後に分岐で止まり、残り4マスから再開したケースを模す。
    // gameStore.ts側は分岐中もtotalStepsを変えず、remainingMovesの推移をそのまま続けるだけなので、
    // この関数はstepIndex=totalSteps-remainingMovesの続きとして自然にCRUISE/ARRIVALを返す。
    expect(getStepAnimationMs({ totalSteps: 6, remainingMoves: 4 })).toBe(CRUISE_MS); // 分岐前と同じCRUISE
    expect(getStepAnimationMs({ totalSteps: 6, remainingMoves: 4 })).not.toBe(DEPART_MS); // 再発進しない
  });

  it("remainingMovesが不正(NaN/負数)な場合はクラッシュせず、安全側の値(ARRIVAL_LAST_MSと同じ)を返す", () => {
    expect(getStepAnimationMs({ totalSteps: 6, remainingMoves: NaN })).toBe(ARRIVAL_LAST_MS);
    expect(getStepAnimationMs({ totalSteps: -1, remainingMoves: -1 })).toBe(ARRIVAL_LAST_MS);
  });

  it("totalStepsだけが不正(NaN)な場合はremainingMovesへクランプして安全に計算する(クラッシュしない)", () => {
    // totalStepsが読み取れない=stepIndexの基準が無いため、remainingMovesを基準に
    // フォールバックする(このケースではstepIndex=0とみなされDEPARTになる)。
    expect(() => getStepAnimationMs({ totalSteps: NaN, remainingMoves: 3 })).not.toThrow();
    expect(getStepAnimationMs({ totalSteps: NaN, remainingMoves: 3 })).toBe(DEPART_MS);
  });

  it("非整数の入力は整数へ丸めた上で計算される(クラッシュしない)", () => {
    expect(getStepAnimationMs({ totalSteps: 6.7, remainingMoves: 3.9 })).toBe(CRUISE_MS);
  });

  it("remainingMoves<=0(本来はGameScreen側でLANDING_TICK_MSを使う想定の値)でも安全にARRIVAL_LAST_MSを返す", () => {
    expect(getStepAnimationMs({ totalSteps: 6, remainingMoves: 0 })).toBe(ARRIVAL_LAST_MS);
  });

  it("totalStepsがremainingMovesより小さい不整合な値でも、remainingMovesを下限にクランプして安全に処理する", () => {
    expect(() => getStepAnimationMs({ totalSteps: 1, remainingMoves: 5 })).not.toThrow();
    // remainingMoves=5(>2)かつstepIndexが0以下にクランプされるため、DEPARTになる。
    expect(getStepAnimationMs({ totalSteps: 1, remainingMoves: 5 })).toBe(DEPART_MS);
  });
});

describe("getStepTransitionMs", () => {
  it("step interval - STEP_TRANSITION_BUFFER_MS を返す(次のstepまでの余白を残す)", () => {
    expect(getStepTransitionMs(CRUISE_MS)).toBe(CRUISE_MS - STEP_TRANSITION_BUFFER_MS);
    expect(getStepTransitionMs(DEPART_MS)).toBe(DEPART_MS - STEP_TRANSITION_BUFFER_MS);
    expect(getStepTransitionMs(ARRIVAL_LAST_MS)).toBe(ARRIVAL_LAST_MS - STEP_TRANSITION_BUFFER_MS);
  });

  it("下限(MIN_STEP_TRANSITION_MS)を下回らない", () => {
    expect(getStepTransitionMs(100)).toBe(MIN_STEP_TRANSITION_MS);
    expect(getStepTransitionMs(0)).toBe(MIN_STEP_TRANSITION_MS);
  });

  it("不正な入力(NaN)でもクラッシュせず下限値を返す", () => {
    expect(getStepTransitionMs(NaN)).toBe(MIN_STEP_TRANSITION_MS);
  });
});
