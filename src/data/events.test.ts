// 地域イベント(eventPoolForNode)の自動テスト。
// EVENT_NODE_REGION_MAP/REGIONAL_EVENT_POOLSはいずれも純粋なデータ+純粋関数なので、
// useGameStore(zustand)には一切触れない。
import { describe, expect, it } from "vitest";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import {
  EVENT_NODE_REGION_MAP,
  REGIONAL_EVENT_POOLS,
  eventPoolForNode,
  localEventPool,
  eventPoolForNode as eventPoolForNodeAlias,
} from "@/data/events";

const MAP_ID = "shonan-full";

describe("EVENT_NODE_REGION_MAP: 実マップとの整合性", () => {
  it("全キーが実マップ上に存在し、type === 'event' である", () => {
    const map = getMap(MAP_ID);
    for (const nodeId of Object.keys(EVENT_NODE_REGION_MAP)) {
      const node = getNode(map, nodeId);
      expect(node, `node "${nodeId}" が実マップに存在しない`).toBeDefined();
      expect(node.type, `node "${nodeId}" のtypeがeventではない(実際: ${node.type})`).toBe("event");
    }
  });

  it("判定不能だった3件(r_north_spine_1_5/r_hills_road3_1/ed_mshor9ec_g6nz)は意図的に未登録のまま", () => {
    for (const nodeId of ["r_north_spine_1_5", "r_hills_road3_1", "ed_mshor9ec_g6nz"]) {
      expect(EVENT_NODE_REGION_MAP[nodeId]).toBeUndefined();
    }
  });
});

describe("eventPoolForNode(): フォールバック", () => {
  it("EVENT_NODE_REGION_MAPに未登録のノードidはlocalEventPoolへフォールバックする", () => {
    for (const nodeId of ["r_north_spine_1_5", "r_hills_road3_1", "ed_mshor9ec_g6nz", "no_such_node"]) {
      expect(eventPoolForNode(nodeId)).toBe(localEventPool);
    }
  });

  it("地域は判明しているがREGIONAL_EVENT_POOLSにまだそのエントリが無い地域(段階導入中)もlocalEventPoolへフォールバックする", () => {
    // 藤沢/茅ヶ崎/平塚/寒川はEVENT_NODE_REGION_MAPには登録済みだが、
    // 第1段階(鎌倉・江の島のみ)では意図的にREGIONAL_EVENT_POOLSへ未収録。
    const notYetImplementedNodeIds = ["r_rk_fj_2", "cgsp_sw", "r_tm_hr_5", "r_sm_tm_6"];
    for (const nodeId of notYetImplementedNodeIds) {
      expect(EVENT_NODE_REGION_MAP[nodeId]).toBeDefined(); // 地域自体は登録されている
      expect(REGIONAL_EVENT_POOLS[EVENT_NODE_REGION_MAP[nodeId]!]).toBeUndefined(); // プールは未実装
      expect(eventPoolForNode(nodeId)).toBe(localEventPool);
    }
  });

  it("鎌倉のノードidはREGIONAL_EVENT_POOLS.kamakuraを返す", () => {
    expect(eventPoolForNode("kmlp_se")).toBe(REGIONAL_EVENT_POOLS.kamakura);
  });

  it("江の島のノードidはREGIONAL_EVENT_POOLS.enoshimaを返す", () => {
    expect(eventPoolForNode("r_kg_ks_2")).toBe(REGIONAL_EVENT_POOLS.enoshima);
  });

  it("同じ関数を別名でimportしても同じ結果になる(参照の健全性確認)", () => {
    expect(eventPoolForNodeAlias("kmlp_se")).toBe(eventPoolForNode("kmlp_se"));
  });
});

describe("eventPoolForNode(): 地域間の分離(取り違え防止)", () => {
  it("鎌倉のeventノードから江の島イベントは選ばれない", () => {
    const kamakuraNodeIds = Object.entries(EVENT_NODE_REGION_MAP)
      .filter(([, region]) => region === "kamakura")
      .map(([id]) => id);
    expect(kamakuraNodeIds.length).toBeGreaterThan(0);

    const enoshimaIds = new Set((REGIONAL_EVENT_POOLS.enoshima ?? []).map((e) => e.id));
    for (const nodeId of kamakuraNodeIds) {
      const pool = eventPoolForNode(nodeId);
      expect(pool).toBe(REGIONAL_EVENT_POOLS.kamakura);
      for (const entry of pool) {
        expect(enoshimaIds.has(entry.id)).toBe(false);
        expect(entry.id.startsWith("event_kamakura_")).toBe(true);
      }
    }
  });

  it("江の島のeventノードから鎌倉イベントは選ばれない", () => {
    const enoshimaNodeIds = Object.entries(EVENT_NODE_REGION_MAP)
      .filter(([, region]) => region === "enoshima")
      .map(([id]) => id);
    expect(enoshimaNodeIds.length).toBeGreaterThan(0);

    const kamakuraIds = new Set((REGIONAL_EVENT_POOLS.kamakura ?? []).map((e) => e.id));
    for (const nodeId of enoshimaNodeIds) {
      const pool = eventPoolForNode(nodeId);
      expect(pool).toBe(REGIONAL_EVENT_POOLS.enoshima);
      for (const entry of pool) {
        expect(kamakuraIds.has(entry.id)).toBe(false);
        expect(entry.id.startsWith("event_enoshima_")).toBe(true);
      }
    }
  });
});

describe("REGIONAL_EVENT_POOLS: データの健全性", () => {
  it("実装済みの各プールが空でなく、3〜4件程度である", () => {
    for (const [regionId, pool] of Object.entries(REGIONAL_EVENT_POOLS)) {
      expect(pool!.length, `${regionId}のプールが空`).toBeGreaterThanOrEqual(3);
      expect(pool!.length, `${regionId}のプールが多すぎる(想定3〜4件)`).toBeLessThanOrEqual(4);
    }
  });

  it("全イベントidが(地域プール横断・localEventPool含めて)一意である", () => {
    const allIds = [
      ...localEventPool.map((e) => e.id),
      ...Object.values(REGIONAL_EVENT_POOLS).flatMap((pool) => pool!.map((e) => e.id)),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("各地域プールのidが event_<regionId>_ で始まり、地域が判別できる命名になっている", () => {
    for (const [regionId, pool] of Object.entries(REGIONAL_EVENT_POOLS)) {
      for (const entry of pool!) {
        expect(entry.id.startsWith(`event_${regionId}_`), `${entry.id} が event_${regionId}_ で始まっていない`).toBe(
          true,
        );
      }
    }
  });
});
