// 道路見た目Polish: computeRoadCrossingGaps()/roadPathSegments()(mapStyle.ts)の自動テスト。
// ゲームロジック(移動判定・購入等)には一切関与しない、純粋な幾何計算だけを対象にする。
import { describe, expect, it } from "vitest";
import { computeRoadCrossingGaps, roadPathSegments, straightRoadPath, type RoadEdgeGeometry } from "./mapStyle";

/** "M{x1},{y1} L{x2},{y2}" 形式のパスから座標4つを取り出す(浮動小数の丸め誤差を許容した
 *  比較のためだけのテスト専用ヘルパー)。 */
function parseSegment(d: string): [number, number, number, number] {
  const match = d.match(/^M([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+)$/);
  if (!match) throw new Error(`unexpected path format: ${d}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

describe("roadPathSegments", () => {
  it("gapTs未指定なら、straightRoadPath()と全く同じ1本のd文字列だけを返す", () => {
    expect(roadPathSegments(0, 0, 100, 0)).toEqual([straightRoadPath(0, 0, 100, 0)]);
  });

  it("gapTsが空配列でも同様に1本のまま", () => {
    expect(roadPathSegments(0, 0, 100, 0, [])).toEqual([straightRoadPath(0, 0, 100, 0)]);
  });

  it("線分中央(t=0.5)にgapを指定すると、前後2本のセグメントに分かれる", () => {
    const segments = roadPathSegments(0, 0, 100, 0, [0.5], 6);
    expect(segments).toHaveLength(2);
    // 前半: (0,0)→(44,0)付近(中心50から半径6を引いた位置)。浮動小数の丸め誤差を許容するため
    // 座標を抜き出してtoBeCloseTo()で比較する(文字列の完全一致は求めない)。
    const [x1, y1, x2, y2] = parseSegment(segments[0]);
    expect(x1).toBeCloseTo(0);
    expect(y1).toBeCloseTo(0);
    expect(x2).toBeCloseTo(44);
    expect(y2).toBeCloseTo(0);
    // 後半: (56,0)→(100,0)付近
    const [x3, y3, x4, y4] = parseSegment(segments[1]);
    expect(x3).toBeCloseTo(56);
    expect(y3).toBeCloseTo(0);
    expect(x4).toBeCloseTo(100);
    expect(y4).toBeCloseTo(0);
  });

  it("複数のgapTsを指定すると、その数だけ隙間ができ区間が増える", () => {
    const segments = roadPathSegments(0, 0, 300, 0, [0.2, 0.5, 0.8], 6);
    // 3つの隙間 → 4区間(始点側・中間×2・終点側)
    expect(segments).toHaveLength(4);
  });

  it("端点ぎりぎり(t=0)のgapは始点側の区間が消え、区間数が1つ減る", () => {
    const segments = roadPathSegments(0, 0, 100, 0, [0], 6);
    // 始点側の区間(長さ0)は作られず、終点側の1区間だけになる
    expect(segments).toHaveLength(1);
  });

  it("線分の長さが0(始点=終点)でも例外を投げず、1本のまま返す", () => {
    expect(roadPathSegments(10, 10, 10, 10, [0.5])).toEqual([straightRoadPath(10, 10, 10, 10)]);
  });
});

describe("computeRoadCrossingGaps", () => {
  function edge(from: string, to: string, x1: number, y1: number, x2: number, y2: number, width: number): RoadEdgeGeometry {
    return { from, to, x1, y1, x2, y2, width };
  }

  it("ノードを共有しない2本の道路が中央付近で交差する場合、道幅が細い方にだけgapが立つ", () => {
    // A: (0,50)→(100,50) 横方向、幅20(太い)
    // B: (50,0)→(50,100) 縦方向、幅10(細い)。ちょうど(50,50)で直交する。
    const edges = [edge("a1", "a2", 0, 50, 100, 50, 20), edge("b1", "b2", 50, 0, 50, 100, 10)];
    const gaps = computeRoadCrossingGaps(edges);

    expect(gaps.get(["a1", "a2"].sort().join("|"))).toBeUndefined(); // 太い方(A)には立たない
    const bGaps = gaps.get(["b1", "b2"].sort().join("|"));
    expect(bGaps).toBeDefined();
    expect(bGaps![0]).toBeCloseTo(0.5, 5); // Bのfrom→to方向で中央(t=0.5)
  });

  it("同じノードを共有する辺同士(正当な交差点)はgapを立てない", () => {
    // 共有ノードcを頂点に、見た目上は交差しそうな配置でも対象外になることを確認する。
    const edges = [edge("c", "a2", 0, 0, 100, 100, 10), edge("c", "b2", 100, 0, 0, 100, 20)];
    const gaps = computeRoadCrossingGaps(edges);
    expect(gaps.size).toBe(0);
  });

  it("端点付近(t<0.06)での交差は誤検出防止のため無視する", () => {
    // Bの交差点がAのt=0.02付近(端点ぎりぎり)になるよう配置する。
    const edges = [edge("a1", "a2", 0, 0, 100, 0, 20), edge("b1", "b2", 2, -50, 2, 50, 10)];
    const gaps = computeRoadCrossingGaps(edges);
    expect(gaps.size).toBe(0);
  });

  it("平行な(交差しない)道路同士はgapを立てない", () => {
    const edges = [edge("a1", "a2", 0, 0, 100, 0, 20), edge("b1", "b2", 0, 20, 100, 20, 10)];
    const gaps = computeRoadCrossingGaps(edges);
    expect(gaps.size).toBe(0);
  });

  it("道幅が同じ場合は後者(配列で後に出てくる方)にgapが立つ(決定的なtie-break)", () => {
    const edges = [edge("a1", "a2", 0, 50, 100, 50, 15), edge("b1", "b2", 50, 0, 50, 100, 15)];
    const gaps = computeRoadCrossingGaps(edges);
    expect(gaps.get(["a1", "a2"].sort().join("|"))).toBeUndefined();
    expect(gaps.get(["b1", "b2"].sort().join("|"))).toBeDefined();
  });
});
