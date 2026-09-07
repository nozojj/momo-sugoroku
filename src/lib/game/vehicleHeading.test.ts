import { describe, expect, it } from "vitest";
import { MAX_CURVE_LEAN_DEG, getCurveLeanDeg, getHeadingDeg, getSignedTurnDelta } from "./vehicleHeading";

describe("getHeadingDeg", () => {
  it("右へ進む(dx>0,dy=0)は0°", () => {
    expect(getHeadingDeg(10, 0)).toBeCloseTo(0);
  });

  it("下へ進む(dx=0,dy>0)は90°", () => {
    expect(getHeadingDeg(0, 10)).toBeCloseTo(90);
  });

  it("左へ進む(dx<0,dy=0)は180°", () => {
    expect(getHeadingDeg(-10, 0)).toBeCloseTo(180);
  });

  it("上へ進む(dx=0,dy<0)は-90°", () => {
    expect(getHeadingDeg(0, -10)).toBeCloseTo(-90);
  });

  it("斜め右下(dx>0,dy>0)は0〜90°の間", () => {
    const heading = getHeadingDeg(10, 10);
    expect(heading).toBeCloseTo(45);
  });

  it("斜め左上(dx<0,dy<0)は-180〜-90°の間", () => {
    const heading = getHeadingDeg(-10, -10);
    expect(heading).toBeCloseTo(-135);
  });
});

describe("getSignedTurnDelta", () => {
  it("0°→90°は+90°", () => {
    expect(getSignedTurnDelta(0, 90)).toBeCloseTo(90);
  });

  it("90°→0°は-90°", () => {
    expect(getSignedTurnDelta(90, 0)).toBeCloseTo(-90);
  });

  it("350°→10°は+20°(360をまたぐ短い経路)", () => {
    expect(getSignedTurnDelta(350, 10)).toBeCloseTo(20);
  });

  it("10°→350°は-20°(360をまたぐ短い経路)", () => {
    expect(getSignedTurnDelta(10, 350)).toBeCloseTo(-20);
  });

  it("変化なし(0°→0°)は0°", () => {
    expect(getSignedTurnDelta(0, 0)).toBeCloseTo(0);
  });

  it("180°Uターン(0°→180°)は決定的に+180°になる", () => {
    expect(getSignedTurnDelta(0, 180)).toBe(180);
  });

  it("180°Uターン(180°→0°、逆方向からの遭遇)も同じく決定的に+180°になる", () => {
    expect(getSignedTurnDelta(180, 0)).toBe(180);
  });

  it("180°Uターン(-90°→90°)も決定的に+180°になる", () => {
    expect(getSignedTurnDelta(-90, 90)).toBe(180);
  });

  it("結果は常に(-180, 180]の範囲に収まる", () => {
    for (let prev = -350; prev <= 350; prev += 37) {
      for (let next = -350; next <= 350; next += 41) {
        const delta = getSignedTurnDelta(prev, next);
        expect(delta).toBeGreaterThan(-180);
        expect(delta).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("getCurveLeanDeg", () => {
  it("turnDelta=0(直進)はlean 0°", () => {
    expect(getCurveLeanDeg(0)).toBe(0);
  });

  it("90°カーブ(右)はMAX_CURVE_LEAN_DEG(+)ちょうどになる", () => {
    expect(getCurveLeanDeg(90)).toBeCloseTo(MAX_CURVE_LEAN_DEG);
  });

  it("90°カーブ(左)は-MAX_CURVE_LEAN_DEGちょうどになる", () => {
    expect(getCurveLeanDeg(-90)).toBeCloseTo(-MAX_CURVE_LEAN_DEG);
  });

  it("45°カーブは90°カーブよりleanが小さい(スケーリングされている)", () => {
    const lean45 = getCurveLeanDeg(45);
    const lean90 = getCurveLeanDeg(90);
    expect(lean45).toBeGreaterThan(0);
    expect(lean45).toBeLessThan(lean90);
  });

  it("小さい方向変化(10°)はさらに小さいleanになる", () => {
    const lean10 = getCurveLeanDeg(10);
    const lean45 = getCurveLeanDeg(45);
    expect(lean10).toBeGreaterThan(0);
    expect(lean10).toBeLessThan(lean45);
  });

  it("180°Uターンでも最大MAX_CURVE_LEAN_DEGに頭打ちされる(超過しない)", () => {
    expect(getCurveLeanDeg(180)).toBeCloseTo(MAX_CURVE_LEAN_DEG);
  });

  it("符号: turnDelta>0(右カーブ)は常に正、turnDelta<0(左カーブ)は常に負", () => {
    expect(getCurveLeanDeg(30)).toBeGreaterThan(0);
    expect(getCurveLeanDeg(-30)).toBeLessThan(0);
  });

  it("どんなturnDeltaでも絶対値がMAX_CURVE_LEAN_DEGを超えない(clamp)", () => {
    for (const delta of [90, 120, 150, 180, -120, -150, -180, 500, -500]) {
      expect(Math.abs(getCurveLeanDeg(delta))).toBeLessThanOrEqual(MAX_CURVE_LEAN_DEG + 1e-9);
    }
  });
});
