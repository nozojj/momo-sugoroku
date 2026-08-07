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
