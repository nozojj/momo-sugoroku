// 物件マス(MapNode)・PropertyDef・PropertyGroupの整合性テスト。
//
// 手作業で追加したマップノードのpropertyGroupIdと、properties.ts/propertyGroups.ts側の
// データがズレていても、landingEffects.tsのpropertyハンドラは黙って「物件未整備」表示に
// フォールバックするだけで、ビルドでもテストでも検出されない。このテストはそのズレを
// 機械的に検出する(実装は変更しない、検証のみ)。
//
// 双方向を検証する:
//   1. マップ側 → データ側: type:"property"の全ノードについて、propertyGroupIdが
//      設定されていること・そのグループ定義が存在すること・そのグループに物件が1件以上
//      存在すること。
//   2. データ側 → グループ側: 全PropertyDef.groupIdが実在のPropertyGroupDefを指していること。
//
// 「どのマップノードからも参照されていない物件/グループ」(逆方向の孤立検出)は今回はスコープ外。
import { describe, expect, it } from "vitest";
import { maps } from "@/data/maps";
import { propertyDefs, getPropertiesInGroup } from "@/data/properties";
import { getPropertyGroupDef } from "@/data/propertyGroups";

describe("物件マス・物件データ・物件グループの整合性", () => {
  for (const map of Object.values(maps)) {
    const propertyNodes = map.nodes.filter((n) => n.type === "property");

    it(`マップ"${map.id}": type:"property"のノードが少なくとも1件は存在する(テスト自体の前提確認)`, () => {
      expect(propertyNodes.length).toBeGreaterThan(0);
    });

    describe(`マップ"${map.id}": property型ノード → propertyGroupId → 物件データ`, () => {
      for (const node of propertyNodes) {
        it(`"${node.id}"(${node.name}): propertyGroupIdが設定され、対応するグループ・物件が存在する`, () => {
          expect(node.propertyGroupId).toBeTruthy();
          if (!node.propertyGroupId) return; // 型ガード(直前のexpectで既に失敗するが、以降の参照を安全にする)

          const group = getPropertyGroupDef(node.propertyGroupId);
          expect(group).toBeDefined();

          const properties = getPropertiesInGroup(node.propertyGroupId);
          expect(properties.length).toBeGreaterThan(0);
        });
      }
    });
  }

  describe("PropertyDef.groupId → PropertyGroupDef(逆方向)", () => {
    for (const def of propertyDefs) {
      it(`"${def.id}"(${def.name}): groupId "${def.groupId}" に対応するPropertyGroupDefが存在する`, () => {
        expect(getPropertyGroupDef(def.groupId)).toBeDefined();
      });
    }
  });
});
