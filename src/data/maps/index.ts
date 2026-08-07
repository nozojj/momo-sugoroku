import type { MapData } from "@/types/game";
import { shonanFullMap as shonanFullMapGenerated } from "./shonan-full";
import { applyMapOverrides, EMPTY_OVERRIDES } from "./applyOverrides";
import type { MapOverrides } from "./applyOverrides";
import overridesData from "./overrides.json";

// /editor で行った編集(overrides.json)を、生成済みマップに適用したものを
// ゲーム本体・エディタの両方で使う。overrides.jsonが壊れていても、そのために
// サイト全体が起動できなくなることがないよう、失敗時は無編集の状態にフォールバックする。
function loadShonanFullMap(): MapData {
  try {
    // overrides.jsonがスキーマ追加前(buildingOverrides等)に保存されたものでも読み込めるよう、
    // 既定値とマージしてから渡す。
    return applyMapOverrides(shonanFullMapGenerated, { ...EMPTY_OVERRIDES, ...(overridesData as Partial<MapOverrides>) });
  } catch (err) {
    console.error("overrides.jsonの適用に失敗しました。無編集の状態で起動します。", err);
    return applyMapOverrides(shonanFullMapGenerated, EMPTY_OVERRIDES);
  }
}

const shonanFullMap: MapData = loadShonanFullMap();

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
