import type { PropertyGroup } from "@/types/game";
import { generatedPropertyGroupDefs } from "@/data/maps/shonan-full";

/**
 * 物件グループ(「物件エリア/物件駅」)の静的データ。
 * 1つの物件マス(MapNode.propertyGroupId)はこのグループを1つ指し、グループに属する全
 * PropertyDef(data/properties.ts側でgroupIdを持つ)がまとめて購入対象として一覧表示される。
 *
 * 複数の物件マスが同じグループを指してもよい(例: 藤沢駅前の複数マスすべてが
 * grp_fujisawa_ekimaeを指し、どこに止まっても同じラインナップが出る)。
 *
 * 新しいグループを増やすときはここに1エントリ足すだけでよく、道路グラフ(マップデータ)側は
 * 既存ノードのpropertyGroupIdを書き換えるか、新しいノードにこのidを割り当てるだけで済む。
 */
export const propertyGroupDefs: PropertyGroup[] = [
  { id: "grp_fujisawa_ekimae", name: "藤沢駅前", region: "藤沢", icon: "🏢", buildingType: "commercial" },
  { id: "grp_rokkai", name: "六会エリア", region: "藤沢", icon: "🏘️", buildingType: "shop" },
  { id: "grp_enoshima", name: "江の島", region: "江の島", icon: "⛩️", buildingType: "landmark" },
  { id: "grp_kamakura_koji", name: "鎌倉小路", region: "鎌倉", icon: "🍡", buildingType: "hotel" },
  { id: "grp_inamuragasaki", name: "稲村ヶ崎エリア", region: "鎌倉", icon: "🏄", buildingType: "landmark" },
  { id: "grp_ofuna", name: "大船エリア", region: "鎌倉", icon: "🚉", buildingType: "shop" },
  { id: "grp_koshigoe", name: "腰越エリア", region: "鎌倉", icon: "🎣", buildingType: "shop" },
  { id: "grp_kitakamakura", name: "北鎌倉エリア", region: "鎌倉", icon: "🎋", buildingType: "restaurant" },
  { id: "grp_tsujido_kaigan", name: "辻堂海岸エリア", region: "辻堂", icon: "🏄", buildingType: "commercial" },
  { id: "grp_chigasaki_chuo", name: "茅ヶ崎中央エリア", region: "茅ヶ崎", icon: "🏖️", buildingType: "commercial" },
  { id: "grp_kagawa", name: "香川エリア", region: "茅ヶ崎", icon: "🌾", buildingType: "shop" },
  { id: "grp_hiratsuka_ginza", name: "平塚銀座エリア", region: "平塚", icon: "🏙️", buildingType: "commercial" },
  { id: "grp_tamura", name: "田村エリア", region: "平塚", icon: "🚗", buildingType: "shop" },
  { id: "grp_nakahara", name: "中原エリア", region: "平塚", icon: "🥬", buildingType: "shop" },
  { id: "grp_shinomiya", name: "四之宮エリア", region: "平塚", icon: "☕", buildingType: "shop" },
  { id: "grp_shonandai", name: "湘南台エリア", region: "湘南台", icon: "🚏", buildingType: "commercial" },
  { id: "grp_samukawa", name: "寒川エリア", region: "寒川", icon: "🌿", buildingType: "shop" },
];

const allPropertyGroupDefs: PropertyGroup[] = [...propertyGroupDefs, ...generatedPropertyGroupDefs];

export function getPropertyGroupDef(id: string): PropertyGroup | undefined {
  return allPropertyGroupDefs.find((g) => g.id === id);
}

/** 全物件グループ(明示定義+マップ生成分)の一覧。物件グループ選択系カードの選択肢作成に使う。 */
export function getAllPropertyGroupDefs(): PropertyGroup[] {
  return allPropertyGroupDefs;
}
