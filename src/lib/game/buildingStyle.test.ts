import { describe, expect, it } from "vitest";
import type { BuildingOverride, MapNode, PropertyGroup } from "@/types/game";
import { resolveBuildingForNode } from "@/lib/game/buildingStyle";

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
