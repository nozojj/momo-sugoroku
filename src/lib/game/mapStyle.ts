import type { NodeType, RoadType } from "@/types/game";

export const NODE_STYLE: Record<NodeType, { fill: string; stroke: string; icon: string; label: string }> = {
  normal: { fill: "#f5f1e6", stroke: "#9c9284", icon: "", label: "通常" },
  money: { fill: "#ffd166", stroke: "#e0a400", icon: "¥", label: "お金" },
  moneyGain: { fill: "#7ab8f5", stroke: "#2f6fc9", icon: "+", label: "青(お金+)" },
  moneyLoss: { fill: "#f28b82", stroke: "#c9392f", icon: "−", label: "赤(お金−)" },
  card: { fill: "#c9a4ff", stroke: "#8b5cf6", icon: "🎴", label: "カード" },
  property: { fill: "#ffadc6", stroke: "#e0447a", icon: "🏠", label: "物件" },
  gasStation: { fill: "#8fd3c7", stroke: "#2ea896", icon: "⛽", label: "GS" },
  warp: { fill: "#a5b4fc", stroke: "#6366f1", icon: "🌀", label: "ワープ" },
  event: { fill: "#ffb37b", stroke: "#e8730f", icon: "!", label: "イベント" },
};

/** 実在店舗ランドマークの専用スタイル(架空物件のピンクと区別する金色)。 */
export const LANDMARK_STYLE = { fill: "#fff8e6", stroke: "#caa23d", labelBg: "#fff8e6" };

/** 主要8駅(isMajorHub)専用のマスデザイン。station.webp画像の読み込みに失敗した場合に
 *  見える、マス本体<rect>のfill/strokeフォールバック色。 */
export const STATION_STYLE = {
  fill: "#efe6d0",
  stroke: "#7a6f56",
};

export const ROAD_STYLE: Record<RoadType, { base: string; top: string; width: number; dash?: string }> = {
  // 国道(紙地図で国道が赤く強調されるのに倣い、ひときわ太い朱色で描く
  national: { base: "#a5381d", top: "#e2692f", width: 20 },
  main: { base: "#6f665a", top: "#9c9284", width: 15 },
  coastal: { base: "#2c86ac", top: "#3fa9dd", width: 15 },
  residential: { base: "#4f9d55", top: "#6fbf73", width: 15 },
  shortcut: { base: "#8b5cf6", top: "#b58af5", width: 11, dash: "2 8" },
};

// 600マス化でマス同士の間隔が詰まった区画(住宅街メッシュ・小さな衛星の輪)が増えたため、
// マス自体を一回り小さくし、短い区間でも道が隠れないようにしている。
export const NODE_RADIUS = 10;
export const MAJOR_HUB_RADIUS = 18;

/** 交差点接合パッチ(Board.tsx)で「その交差点を代表する道路」を1つ選ぶための優先順位。
 *  national > coastal/main(同格) > residential > shortcut。新しい色を作らず、
 *  代表roadTypeのbase/top色をそのままパッチに使うことで、道路の舗装がそのまま
 *  交差点まで続いて見えるようにする(パッチ単体を目立たせるのが目的ではない)。 */
const ROAD_TYPE_PRIORITY: RoadType[] = ["national", "main", "coastal", "residential", "shortcut"];

/** 交差点に接続する道路種別の一覧から、パッチに使う代表roadTypeを1つ選ぶ。
 *  ROAD_TYPE_PRIORITY の先頭に近いものを優先する(national最優先、以下同格グループ内は
 *  配列の並び順で決定的に決まるだけで優劣の意味は無い)。 */
export function dominantRoadType(types: RoadType[]): RoadType {
  for (const candidate of ROAD_TYPE_PRIORITY) {
    if (types.includes(candidate)) return candidate;
  }
  return types[0] ?? "residential";
}

/** 同じマスに複数の車が重なるときの散らし配置(最大4台まで想定)。 */
export function getClusterOffset(indexInCluster: number, clusterSize: number): { dx: number; dy: number } {
  if (clusterSize <= 1) return { dx: 0, dy: 0 };
  const layouts: Record<number, { dx: number; dy: number }[]> = {
    2: [
      { dx: -13, dy: 0 },
      { dx: 13, dy: 0 },
    ],
    3: [
      { dx: -14, dy: -8 },
      { dx: 14, dy: -8 },
      { dx: 0, dy: 12 },
    ],
    4: [
      { dx: -13, dy: -11 },
      { dx: 13, dy: -11 },
      { dx: -13, dy: 11 },
      { dx: 13, dy: 11 },
    ],
  };
  const layout = layouts[Math.min(clusterSize, 4)];
  return layout[indexInCluster] ?? { dx: 0, dy: 0 };
}

/** 2点を直線でつなぐSVGパスを生成する。 */
export function straightRoadPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1},${y1} L${x2},${y2}`;
}

/** computeRoadCrossingGaps()の入力1件分。道路(RoadEdge)そのものではなく、Board.tsxが
 *  既に持っているSVG座標(node.x/y - minX/minY を引く前の生座標でよい。差分計算しか
 *  しないため原点の取り方に依存しない)とwidth(ROAD_STYLE[roadType].width)だけを渡す、
 *  ゲームロジック非依存の純粋な幾何情報。 */
export interface RoadEdgeGeometry {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** ROAD_STYLE[roadType].width。2本の道路が交差した際、道幅が細い方に途切れを入れる判定に使う。 */
  width: number;
}

/** 端点付近(t/uがこの値未満、または1-この値超)での交差は誤検出防止のため無視する。
 *  ノードのすぐ近くを別の道路がかすめる、丸め誤差でほぼ同じ座標を通る、といったケースを
 *  「途切れが必要な交差」として拾わないための余白。 */
const CROSSING_ENDPOINT_MARGIN = 0.06;

/** 2線分(どちらもx1,y1→x2,y2の向きを持つ)の交差をパラメトリックに解く。
 *  t=aの始点からの位置、u=bの始点からの位置(共に0〜1の範囲内のときだけ交差ありとしてtoo)。
 *  平行(分母がほぼ0)、またはどちらかの線分の範囲外ならnullを返す。線分交差判定の標準的な
 *  外積ベースの解法で、ゲームロジック・座標系そのものには一切依存しない。 */
function segmentIntersection(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): { t: number; u: number } | null {
  const dax = a.x2 - a.x1;
  const day = a.y2 - a.y1;
  const dbx = b.x2 - b.x1;
  const dby = b.y2 - b.y1;

  const denominator = dax * dby - day * dbx;
  if (Math.abs(denominator) < 1e-9) return null; // 平行(またはほぼ平行)、交差なし扱い

  const dx = b.x1 - a.x1;
  const dy = b.y1 - a.y1;
  const t = (dx * dby - dy * dbx) / denominator;
  const u = (dx * day - dy * dax) / denominator;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** computeRoadCrossingGaps()が返すMapのキー形式。boardEdgeHighlight.tsのedgeKey(a, b)
 *  (=[a,b].sort().join("|"))と全く同じ形式にしておくことで、呼び出し側(Board.tsx)は
 *  道路描画ループで既に計算しているedgeKey()の戻り値でそのままこのMapを引ける。
 *  boardEdgeHighlight.ts側の関数を直接importしない(mapStyle.tsは道路の見た目・幾何だけを
 *  扱う低レベルモジュールとして、ゲーム状態由来のハイライト計算モジュールに依存させたくない)
 *  ため、同じ1行のロジックをここに独立して持つだけに留める。 */
function roadEdgeGeometryKey(from: string, to: string): string {
  return [from, to].sort().join("|");
}

/**
 * ノードを共有しない道路同士(実際には繋がっていない辺同士)が、SVG上の見た目ではただの
 * 線分として交差してしまうケースを検出し、道幅が細い方の道路に「途切れ」を入れるための
 * t値(0〜1、その道路自身のfrom→to方向で測った位置)をedgeごとに返す。
 *
 * 同じノードを共有する辺同士(実際にその点で接続している=正当な交差点)は最初から対象外
 * とする。そちらは「途切れ」ではなく、Board.tsxのintersectionPatches(舗装パッチ)側が
 * 継ぎ目を隠す形で見た目を繋ぐ役割を担う(このファイルの責務は分けない)。
 *
 * 端点付近(CROSSING_ENDPOINT_MARGIN未満/超)の交差は誤検出防止のため無視する。
 * 2本の道幅が同じ場合はtie-breakとして後者(引数配列で後に出てくる方)に途切れを入れる
 * (どちらに入れても見た目の破綻はないため、決定的であれば十分)。
 *
 * O(E^2)(Eはedges.length)の総当たり判定。呼び出し側がuseMemoで1回だけ計算しキャッシュする
 * 前提のため、道路本数が数百程度のマップでも実用上問題ない。
 */
export function computeRoadCrossingGaps(edges: RoadEdgeGeometry[]): Map<string, number[]> {
  const gaps = new Map<string, number[]>();

  function addGap(edge: RoadEdgeGeometry, t: number) {
    const key = roadEdgeGeometryKey(edge.from, edge.to);
    const existing = gaps.get(key);
    if (existing) {
      existing.push(t);
    } else {
      gaps.set(key, [t]);
    }
  }

  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j];
      // 同じノードを共有する辺同士(正当な交差点)は対象外。
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;

      const intersection = segmentIntersection(a, b);
      if (!intersection) continue;
      const { t, u } = intersection;
      if (
        t < CROSSING_ENDPOINT_MARGIN ||
        t > 1 - CROSSING_ENDPOINT_MARGIN ||
        u < CROSSING_ENDPOINT_MARGIN ||
        u > 1 - CROSSING_ENDPOINT_MARGIN
      ) {
        continue;
      }

      if (a.width < b.width) {
        addGap(a, t);
      } else {
        addGap(b, u);
      }
    }
  }

  for (const list of gaps.values()) list.sort((x, y) => x - y);
  return gaps;
}

/**
 * 指定したt値(0〜1、線分のx1,y1→x2,y2方向で測った位置)の位置で線分を分割し、複数の
 * SVG path d文字列を返す。gapTsが未指定/空配列なら、従来通りstraightRoadPath()と全く
 * 同じ1本のd文字列だけを返す(computeRoadCrossingGaps()で交差が見つからなかった大多数の
 * 道路は、この関数を経由しても見た目・要素数とも変わらない)。
 *
 * 各tの位置を中心に、gapHalfWidthPx(SVG座標系のピクセル距離。線分の長さに対する比率
 * gapHalfWidthTへ変換して使う)ぶんだけ前後を切り取ることで、strokeLinecap="round"の
 * 丸い端点どうしの隙間として「他の道路の下を通っている」ように見える途切れを作る。
 * 隙間同士が近接/重複する場合や、線分の始点・終点をはみ出す場合は0〜1の範囲にクランプし、
 * 破綻したパス(長さが負など)を作らないようにする。
 */
export function roadPathSegments(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gapTs?: number[],
  gapHalfWidthPx: number = 6,
): string[] {
  if (!gapTs || gapTs.length === 0) return [straightRoadPath(x1, y1, x2, y2)];

  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1e-6) return [straightRoadPath(x1, y1, x2, y2)];
  const gapHalfWidthT = gapHalfWidthPx / length;

  function pointAt(t: number): { x: number; y: number } {
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  }

  const sortedTs = [...gapTs].sort((a, b) => a - b);
  const segments: string[] = [];
  let cursor = 0;

  for (const t of sortedTs) {
    const gapStart = Math.max(cursor, t - gapHalfWidthT);
    const gapEnd = Math.min(1, t + gapHalfWidthT);
    if (gapStart > cursor) {
      const start = pointAt(cursor);
      const end = pointAt(gapStart);
      segments.push(straightRoadPath(start.x, start.y, end.x, end.y));
    }
    cursor = Math.max(cursor, gapEnd);
  }

  if (cursor < 1) {
    const start = pointAt(cursor);
    segments.push(straightRoadPath(start.x, start.y, x2, y2));
  }

  // 理論上到達しない防御的分岐(隙間が線分全体を覆い尽くした場合)。道路が完全に消えて
  // 見えなくなるより、途切れ無しの1本のまま表示する方が安全側に倒れる。
  return segments.length > 0 ? segments : [straightRoadPath(x1, y1, x2, y2)];
}
