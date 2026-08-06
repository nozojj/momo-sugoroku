import type { MapData } from "@/types/game";
import { shonanFullMap as shonanFullMapGenerated } from "./shonan-full";
import { applyMapOverrides } from "./applyOverrides";
import overridesData from "./overrides.json";
import type { MapOverrides } from "./applyOverrides";

// /editor で行った道路・交差点の追加/削除(overrides.json)を、生成済みマップに
// 適用したものをゲーム本体・エディタの両方で使う。
const shonanFullMap: MapData = applyMapOverrides(shonanFullMapGenerated, overridesData as MapOverrides);

export const maps: Record<string, MapData> = {
  [shonanFullMap.id]: shonanFullMap,
};

export const defaultMapId = shonanFullMap.id;

export function getMap(mapId: string): MapData {
  const map = maps[mapId];
  if (!map) throw new Error(`Unknown map id: ${mapId}`);
  return map;
}

export { shonanFullMap };
