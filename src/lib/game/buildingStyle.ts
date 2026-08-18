import type { BuildingOverride, BuildingType, MapNode, PropertyGroup } from "@/types/game";
import { NODE_RADIUS, MAJOR_HUB_RADIUS } from "@/lib/game/mapStyle";

/** プレースホルダーの見た目定義(仮の2.5D建物)。本番アセットに差し替えるときは
 *  BUILDING_ASSET_URLS に画像URLを追加するだけでよく、このファイル以外の変更は不要。 */
export const BUILDING_STYLE: Record<
  BuildingType,
  { bodyColor: string; roofColor: string; width: number; height: number; icon: string }
> = {
  station: { bodyColor: "#e7ecf3", roofColor: "#5b6b8c", width: 34, height: 24, icon: "🚉" },
  restaurant: { bodyColor: "#fbe3d0", roofColor: "#c0532f", width: 26, height: 20, icon: "🍽️" },
  shop: { bodyColor: "#e2f3ea", roofColor: "#2f8f5f", width: 24, height: 18, icon: "🛍️" },
  house: { bodyColor: "#f6ead9", roofColor: "#a15c3b", width: 22, height: 16, icon: "🏠" },
  commercial: { bodyColor: "#e6e6ee", roofColor: "#5a5a72", width: 26, height: 30, icon: "🏢" },
  landmark: { bodyColor: "#f6e9c8", roofColor: "#b5862f", width: 26, height: 24, icon: "⛩️" },
  hotel: { bodyColor: "#e3edf0", roofColor: "#2f6f7a", width: 28, height: 26, icon: "🏨" },
  generic: { bodyColor: "#eee7da", roofColor: "#8a7a5c", width: 22, height: 16, icon: "🏘️" },
};

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  station: "駅舎",
  restaurant: "飲食店",
  shop: "商店",
  house: "住宅",
  commercial: "商業施設",
  landmark: "観光施設",
  hotel: "ホテル/旅館",
  generic: "その他",
};

export const BUILDING_TYPE_OPTIONS: BuildingType[] = [
  "station",
  "restaurant",
  "shop",
  "house",
  "commercial",
  "landmark",
  "hotel",
  "generic",
];

/** 本番アセットへの差し替え用。buildingTypeごとに画像URLを登録すると、
 *  BuildingSpriteはプレースホルダー図形の代わりにその画像を描画する。 */
export const BUILDING_ASSET_URLS: Partial<Record<BuildingType, string>> = {
  shop: "/tiles/shop.webp",
  restaurant: "/tiles/restaurant.webp",
  hotel: "/tiles/hotel.webp",
  commercial: "/tiles/commercial.webp",
};

/** landmarkだけは1 buildingType=1画像ではなく、物件グループ(propertyGroup.id)ごとに
 *  地域性の強い専用素材を割り当てる。未登録のgroupIdはBUILDING_ASSET_URLS.landmark
 *  (今は未登録=プレースホルダー図形)へ安全にフォールバックする(BuildingSprite側で処理)。 */
export const LANDMARK_ASSET_URLS: Partial<Record<string, string>> = {
  grp_enoshima: "/tiles/landmark-enoshima.webp",
  grp_inamuragasaki: "/tiles/landmark-inamuragasaki.webp",
};

/** BuildingSpriteが実際に描画する画像URLを解決する。landmarkだけgroupId経由で
 *  LANDMARK_ASSET_URLSを優先し、未登録ならBUILDING_ASSET_URLS.landmark(現状未登録)へ
 *  安全にフォールバックする。それ以外のbuildingTypeは従来通りBUILDING_ASSET_URLSのみを見る。 */
export function resolveBuildingAssetUrl(buildingType: BuildingType, groupId: string | undefined): string | undefined {
  if (buildingType === "landmark") {
    return (groupId ? LANDMARK_ASSET_URLS[groupId] : undefined) ?? BUILDING_ASSET_URLS.landmark;
  }
  return BUILDING_ASSET_URLS[buildingType];
}

const KEYWORD_RULES: [BuildingType, string[]][] = [
  ["hotel", ["ホテル", "旅館", "民宿", "ゲストハウス"]],
  ["landmark", ["水族館", "神社", "寺", "灯台", "シーキャンドル", "タワー", "展望", "公園", "資料館", "土産物店"]],
  ["commercial", ["デパート", "ビル", "モール", "ショッピングセンター"]],
  ["restaurant", ["ラーメン", "居酒屋", "レストラン", "カフェ", "和菓子", "寿司", "焼肉", "カレー", "食堂", "バー", "料理"]],
  ["house", ["住宅", "アパート", "マンション"]],
  ["shop", ["スーパー", "カラオケ", "ショップ", "マーケット", "雑貨", "店"]],
];

/** 物件グループの名前やノードの状態から建物タイプを推測する(あくまで既定値。エディタ・グループ側で個別上書き可能)。 */
export function inferBuildingType(node: MapNode, group: PropertyGroup | undefined): BuildingType {
  if (group) {
    if (group.buildingType) return group.buildingType;
    for (const [type, keywords] of KEYWORD_RULES) {
      if (keywords.some((k) => group.name.includes(k))) return type;
    }
    return "commercial";
  }
  if (node.isDestinationCandidate) return "station";
  return "generic";
}

/** 建物の既定オフセット。道路・マスを隠さないよう、ノードの少し上に配置する。 */
export function defaultBuildingOffset(node: MapNode): { x: number; y: number } {
  const radius = node.isMajorHub ? MAJOR_HUB_RADIUS : NODE_RADIUS;
  return { x: 0, y: -(radius + 24) };
}

export interface ResolvedBuilding {
  nodeId: string;
  buildingType: BuildingType;
  offsetX: number;
  offsetY: number;
  scale: number;
  /** エディタでの表示用: 個別上書きが存在するか(自動推測のままかどうか) */
  hasOverride: boolean;
}

/**
 * ノード・物件グループ・エディタでの個別上書きから、実際に描画すべき建物を1件解決する。
 * マス(MapNode)・物件グループ(PropertyGroup)は読み取るだけで一切変更しない。
 * 対象外(物件でも駅でもなく、上書きも無い)ならnullを返す。
 */
export function resolveBuildingForNode(
  node: MapNode,
  group: PropertyGroup | undefined,
  override: BuildingOverride | undefined,
): ResolvedBuilding | null {
  if (override?.hidden) return null;
  const eligible = node.type === "property" || !!node.isDestinationCandidate;
  if (!eligible && !override) return null;

  const buildingType = override?.buildingType ?? inferBuildingType(node, group);
  // 主要8駅は駅マス自体(Board.tsxのSTATION_STYLE)で駅らしさを表現するようになったため、
  // 自動推測で"station"になる場合(=override.buildingTypeを明示していない場合)は
  // 浮遊する駅舎の建物アイコンを出さない(タイル側のデザインと二重に「駅」を主張させない)。
  // エディタが個別ノードに明示的にbuildingType:"station"を上書き設定した場合は
  // 従来どおり表示する(逃げ道は維持する)。
  if (buildingType === "station" && !override?.buildingType) return null;

  const defaultOffset = defaultBuildingOffset(node);
  return {
    nodeId: node.id,
    buildingType,
    offsetX: override?.offsetX ?? defaultOffset.x,
    offsetY: override?.offsetY ?? defaultOffset.y,
    scale: override?.scale ?? 1,
    hasOverride: !!override,
  };
}
