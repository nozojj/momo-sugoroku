import { describe, expect, it } from "vitest";
import type { BuildingOverride, MapNode, PropertyGroup } from "@/types/game";
import { resolveBuildingForNode, resolveBuildingAssetUrl } from "@/lib/game/buildingStyle";

function makeStationNode(overrides: Partial<MapNode> = {}): MapNode {
  return {
    id: "hub_fujisawa",
    name: "藤沢",
    type: "normal",
    x: 0,
    y: 0,
    connections: [],
    isDestinationCandidate: true,
    isMajorHub: true,
    ...overrides,
  };
}

function makePropertyNode(overrides: Partial<MapNode> = {}): MapNode {
  return {
    id: "prop_1",
    name: "物件マス",
    type: "property",
    x: 0,
    y: 0,
    connections: [],
    propertyGroupId: "grp_rokkai",
    ...overrides,
  };
}

const rokkaiGroup: PropertyGroup = { id: "grp_rokkai", name: "六会エリア", region: "藤沢", buildingType: "shop" };

describe("resolveBuildingForNode(): 主要駅の自動推測stationは非表示になる", () => {
  it("上書き無しの主要駅ノードはnullを返す(駅マス側のデザインに任せる)", () => {
    const node = makeStationNode();
    expect(resolveBuildingForNode(node, undefined, undefined)).toBeNull();
  });

  it("buildingType以外のoverride(offsetX等)だけならstationはやはり非表示のまま", () => {
    const node = makeStationNode();
    const override: BuildingOverride = { nodeId: node.id, offsetX: 10 };
    expect(resolveBuildingForNode(node, undefined, override)).toBeNull();
  });

  it("buildingType:'station'を明示的に上書きした場合は従来どおり表示される(逃げ道の維持)", () => {
    const node = makeStationNode();
    const override: BuildingOverride = { nodeId: node.id, buildingType: "station" };
    const result = resolveBuildingForNode(node, undefined, override);
    expect(result).not.toBeNull();
    expect(result?.buildingType).toBe("station");
  });

  it("hidden指定は station 除外より優先してnullを返す(既存挙動)", () => {
    const node = makeStationNode();
    const override: BuildingOverride = { nodeId: node.id, buildingType: "station", hidden: true };
    expect(resolveBuildingForNode(node, undefined, override)).toBeNull();
  });
});

describe("resolveBuildingForNode(): 他のBuildingTypeは今回の変更で回帰しない", () => {
  it("物件ノード(shop)は今まで通り解決される", () => {
    const node = makePropertyNode();
    const result = resolveBuildingForNode(node, rokkaiGroup, undefined);
    expect(result).not.toBeNull();
    expect(result?.buildingType).toBe("shop");
  });

  it("駅ではない目的地候補ノード(isMajorHubがfalse)は対象外(station自動推測にすら該当しない)", () => {
    const node = makeStationNode({ isMajorHub: false, id: "wp_minor" });
    // isMajorHubでなくても isDestinationCandidate なら inferBuildingType は "station" を返す
    // (現状の推測ロジック通り)ため、こちらも除外対象になることを確認する。
    const result = resolveBuildingForNode(node, undefined, undefined);
    expect(result).toBeNull();
  });
});

describe("resolveBuildingAssetUrl(): landmarkはgroupId経由でエリア別素材を解決する", () => {
  it("grp_enoshimaは江の島専用素材を返す", () => {
    expect(resolveBuildingAssetUrl("landmark", "grp_enoshima")).toBe("/tiles/landmark-enoshima.webp");
  });

  it("grp_inamuragasakiは稲村ヶ崎専用素材を返す", () => {
    expect(resolveBuildingAssetUrl("landmark", "grp_inamuragasaki")).toBe("/tiles/landmark-inamuragasaki.webp");
  });

  it("未登録のgroupIdはBUILDING_ASSET_URLS.landmark(現状未登録)にフォールバックしundefinedになる(プレースホルダー表示)", () => {
    expect(resolveBuildingAssetUrl("landmark", "grp_未来のランドマーク")).toBeUndefined();
  });

  it("groupIdが無いlandmarkもプレースホルダーにフォールバックする(undefined)", () => {
    expect(resolveBuildingAssetUrl("landmark", undefined)).toBeUndefined();
  });

  it("landmark以外のbuildingTypeは従来通りBUILDING_ASSET_URLSのみを見る(groupIdは無視)", () => {
    expect(resolveBuildingAssetUrl("shop", "grp_enoshima")).toBe("/tiles/shop.webp");
    expect(resolveBuildingAssetUrl("restaurant", undefined)).toBe("/tiles/restaurant.webp");
    expect(resolveBuildingAssetUrl("hotel", undefined)).toBe("/tiles/hotel.webp");
    expect(resolveBuildingAssetUrl("commercial", undefined)).toBe("/tiles/commercial.webp");
  });

  it("本番素材未登録のbuildingType(house/generic)はundefinedのまま(回帰なし)", () => {
    expect(resolveBuildingAssetUrl("house", undefined)).toBeUndefined();
    expect(resolveBuildingAssetUrl("generic", undefined)).toBeUndefined();
  });
});
