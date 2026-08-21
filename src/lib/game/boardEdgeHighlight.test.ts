import { describe, expect, it } from "vitest";
import { edgeKey, recentTrailEdgeKeys, selectableEdgeKeys, TRAIL_MAX_SEGMENTS } from "@/lib/game/boardEdgeHighlight";

describe("edgeKey", () => {
  it("同じ2ノードなら順序に関わらず同じキーになる", () => {
    expect(edgeKey("a", "b")).toBe(edgeKey("b", "a"));
  });
});

describe("selectableEdgeKeys", () => {
  it("routeOptionsが空(分岐中でない)なら空集合を返す", () => {
    const keys = selectableEdgeKeys("n1", []);
    expect(keys.size).toBe(0);
  });

  it("currentNodeIdが無ければ空集合を返す", () => {
    const keys = selectableEdgeKeys(undefined, [{ nodeId: "n2" }]);
    expect(keys.size).toBe(0);
  });

  it("2方向分岐: 選択可能な2本のedgeだけが抽出される", () => {
    const keys = selectableEdgeKeys("n1", [{ nodeId: "n2" }, { nodeId: "n3" }]);
    expect(keys.size).toBe(2);
    expect(keys.has(edgeKey("n1", "n2"))).toBe(true);
    expect(keys.has(edgeKey("n1", "n3"))).toBe(true);
  });

  it("3方向分岐で安定する", () => {
    const keys = selectableEdgeKeys("n1", [{ nodeId: "n2" }, { nodeId: "n3" }, { nodeId: "n4" }]);
    expect(keys.size).toBe(3);
  });

  it("4方向分岐で安定する", () => {
    const keys = selectableEdgeKeys("n1", [{ nodeId: "n2" }, { nodeId: "n3" }, { nodeId: "n4" }, { nodeId: "n5" }]);
    expect(keys.size).toBe(4);
    for (const to of ["n2", "n3", "n4", "n5"]) {
      expect(keys.has(edgeKey("n1", to))).toBe(true);
    }
  });

  it("非選択edge(routeOptionsに無いノードへの辺)はハイライトされない", () => {
    const keys = selectableEdgeKeys("n1", [{ nodeId: "n2" }]);
    expect(keys.has(edgeKey("n1", "n99"))).toBe(false);
  });

  it("「戻る」選択肢(routeOptionsに含まれないノード)は選択可能edgeに含まれない", () => {
    // stepBack()のbackNodeIdはrouteOptionsとは別経路(RouteChoiceOverlayのボタン)で扱うため、
    // routeOptionsだけを見るこの関数はback先を一切知らない=含めない、が期待される仕様。
    const backNodeId = "n0";
    const keys = selectableEdgeKeys("n1", [{ nodeId: "n2" }, { nodeId: "n3" }]);
    expect(keys.has(edgeKey("n1", backNodeId))).toBe(false);
  });
});

describe("recentTrailEdgeKeys", () => {
  it("moveHistoryが1件(移動開始直後)なら空集合を返す", () => {
    const keys = recentTrailEdgeKeys(["n1"]);
    expect(keys.size).toBe(0);
  });

  it("moveHistoryが空でも空集合を返す(防御)", () => {
    const keys = recentTrailEdgeKeys([]);
    expect(keys.size).toBe(0);
  });

  it("2ステップ進んだら直前1本のedgeを返す", () => {
    const keys = recentTrailEdgeKeys(["n1", "n2"]);
    expect(keys.size).toBe(1);
    expect(keys.has(edgeKey("n1", "n2"))).toBe(true);
  });

  it("既定(TRAIL_MAX_SEGMENTS=2)では直近2本までしか残らない", () => {
    const keys = recentTrailEdgeKeys(["n1", "n2", "n3", "n4"]);
    expect(keys.size).toBe(TRAIL_MAX_SEGMENTS);
    expect(keys.has(edgeKey("n2", "n3"))).toBe(true);
    expect(keys.has(edgeKey("n3", "n4"))).toBe(true);
    // 3本以上前(n1-n2)は古いので含まれない = 長時間残らないことの確認
    expect(keys.has(edgeKey("n1", "n2"))).toBe(false);
  });

  it("移動を続けるほど古いedgeは自然に集合から外れる(短時間表示)", () => {
    const early = recentTrailEdgeKeys(["n1", "n2", "n3"]);
    const later = recentTrailEdgeKeys(["n1", "n2", "n3", "n4", "n5"]);
    expect(early.has(edgeKey("n1", "n2"))).toBe(true);
    expect(later.has(edgeKey("n1", "n2"))).toBe(false);
  });

  it("maxSegmentsを1にすると直前1本だけになる", () => {
    const keys = recentTrailEdgeKeys(["n1", "n2", "n3", "n4"], 1);
    expect(keys.size).toBe(1);
    expect(keys.has(edgeKey("n3", "n4"))).toBe(true);
  });
});
