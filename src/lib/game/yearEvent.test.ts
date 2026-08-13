// 年度イベント(「今年の湘南」)の抽選・参照ロジックの自動テスト。
import { afterEach, describe, expect, it, vi } from "vitest";
import { yearEventDefs } from "@/data/yearEvents";
import { drawYearEvent, getYearEventDef, yearEventGenreMultiplier } from "@/lib/game/yearEvent";

const MIN_REASONABLE_MULTIPLIER = 0.5;
const MAX_REASONABLE_MULTIPLIER = 2.0;

describe("yearEventDefs: データ健全性", () => {
  it("weightの合計は100(重み=出現率(%)として読める)", () => {
    const total = yearEventDefs.reduce((sum, e) => sum + e.weight, 0);
    expect(total).toBe(100);
  });

  it('"normal"(平年)が存在し、genreMultipliersが空(全ジャンル×1相当)', () => {
    const normal = yearEventDefs.find((e) => e.id === "normal");
    expect(normal).toBeDefined();
    expect(Object.keys(normal!.genreMultipliers)).toHaveLength(0);
  });

  it("全イベントのgenreMultipliersが想定レンジ内に収まっている(暴走倍率の混入防止)", () => {
    for (const event of yearEventDefs) {
      for (const [genre, multiplier] of Object.entries(event.genreMultipliers)) {
        expect(multiplier, `${event.id}.${genre}`).toBeGreaterThanOrEqual(MIN_REASONABLE_MULTIPLIER);
        expect(multiplier, `${event.id}.${genre}`).toBeLessThanOrEqual(MAX_REASONABLE_MULTIPLIER);
      }
    }
  });

  it("idはすべて一意", () => {
    const ids = yearEventDefs.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getYearEventDef()", () => {
  it("存在するidを渡すと対応する定義を返す", () => {
    expect(getYearEventDef("heatwave")?.label).toBe("猛暑の年");
  });

  it("存在しないidを渡すとundefinedを返す", () => {
    expect(getYearEventDef("no_such_event_id")).toBeUndefined();
  });

  it("undefinedを渡すとundefinedを返す(旧セーブ・省略時のフォールバック経路)", () => {
    expect(getYearEventDef(undefined)).toBeUndefined();
  });
});

describe("yearEventGenreMultiplier()", () => {
  it("eventがundefinedなら常に1(補正なし)", () => {
    expect(yearEventGenreMultiplier(undefined, "leisure")).toBe(1);
  });

  it('"平年"はどのジャンルでも1', () => {
    const normal = getYearEventDef("normal")!;
    expect(yearEventGenreMultiplier(normal, "leisure")).toBe(1);
    expect(yearEventGenreMultiplier(normal, "tourism")).toBe(1);
  });

  it("該当ジャンルが指定されていれば指定倍率を返す", () => {
    const heatwave = getYearEventDef("heatwave")!;
    expect(yearEventGenreMultiplier(heatwave, "leisure")).toBe(1.2);
    expect(yearEventGenreMultiplier(heatwave, "food")).toBe(1.05);
    expect(yearEventGenreMultiplier(heatwave, "agriculture")).toBe(0.95);
  });

  it("イベントに指定の無いジャンルは1にフォールバックする", () => {
    const heatwave = getYearEventDef("heatwave")!;
    expect(yearEventGenreMultiplier(heatwave, "community")).toBe(1);
  });
});

describe("drawYearEvent()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("十分な回数呼んでも、返り値は常にyearEventDefsに含まれるidを持つ", () => {
    const validIds = new Set(yearEventDefs.map((e) => e.id));
    for (let i = 0; i < 1000; i++) {
      expect(validIds.has(drawYearEvent().id)).toBe(true);
    }
  });

  it("Math.randomが0を返すとき、重み配列の先頭要素(1件目)が選ばれる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(drawYearEvent().id).toBe(yearEventDefs[0].id);
  });

  it("Math.randomが1に極めて近いとき、重み配列の末尾要素が選ばれる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(drawYearEvent().id).toBe(yearEventDefs[yearEventDefs.length - 1].id);
  });

  it("重みが0のプールを渡すと、境界計算の丸め誤差でもクラッシュせず何かしらの要素を返す", () => {
    const pool = [{ ...yearEventDefs[0], weight: 0 }, { ...yearEventDefs[1], weight: 0 }];
    expect(() => drawYearEvent(pool)).not.toThrow();
  });
});
