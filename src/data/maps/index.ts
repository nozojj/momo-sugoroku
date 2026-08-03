import type { MapData } from "@/types/game";
import { shonanFullMap } from "./shonan-full";

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
