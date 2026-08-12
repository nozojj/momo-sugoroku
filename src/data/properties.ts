import type { PropertyDef } from "@/types/game";
import { generatedPropertyDefs } from "@/data/maps/shonan-full";
import overridesData from "@/data/maps/overrides.json";

/**
 * 物件の静的データ。
 *
 * 各物件は`groupId`で物件グループ(data/propertyGroups.ts)に所属する。立地(地域・区画名)は
 * グループ側が持つので、PropertyDef自体は地域情報を持たない。同じグループに複数の物件を
 * 増やしていくことで、1つの物件マスから複数物件を購入できる(将来100〜200件規模まで
 * このまま拡張できる)。
 *
 * isRealLandmark: true の物件のみ、実在店舗・実在施設をモデルにしたランドマーク(盤面では
 * 金縁+専用アイコンで区別)。今回は江の島の公共観光施設3件のみに絞っている。個人商店の
 * 実名は使わず、湘南をモチーフにしたオリジナル名にしている。
 *
 * generatedPropertyDefs は自動生成マップの穴埋め物件(shonan-full.tsのwindingFillerが生成)。
 */
const curatedPropertyDefs: PropertyDef[] = [
  // ============================================================
  // 藤沢駅前 (grp_fujisawa_ekimae) / region: 藤沢
  // ============================================================
  { id: "wp_fj_nw_rk_bend_prop", name: "湘南麺場 波止場", category: "ラーメン店", price: 450, assetValue: 450, groupId: "grp_fujisawa_ekimae", revenueRate: 0.13, genre: "food" },
  { id: "r_fj_kg_1_prop", name: "暖簾どき", category: "居酒屋", price: 680, assetValue: 680, groupId: "grp_fujisawa_ekimae", revenueRate: 0.11, genre: "food" },
  { id: "wp_fj_meiten_ent_prop", name: "駅前珈琲舎", category: "カフェ", price: 520, assetValue: 520, groupId: "grp_fujisawa_ekimae", revenueRate: 0.10, genre: "food" },
  { id: "r_fj_kg_2_prop", name: "ふじさわ惣菜堂", category: "惣菜店", price: 380, assetValue: 380, groupId: "grp_fujisawa_ekimae", revenueRate: 0.12, genre: "food" },
  { id: "wp_fj_higashiguchi_prop", name: "フジサワイースト", category: "商業ビル", price: 9000, assetValue: 9000, groupId: "grp_fujisawa_ekimae", revenueRate: 0.08, genre: "commercial" },
  { id: "r_fjrt_ring4_1_prop", name: "湘南セントラル百貨店", category: "駅前デパート", price: 32000, assetValue: 32000, groupId: "grp_fujisawa_ekimae", revenueRate: 0.07, genre: "commercial" },

  // ============================================================
  // 六会エリア (grp_rokkai) / region: 藤沢
  // ============================================================
  { id: "r_rk_fj_4_prop", name: "六会食堂", category: "定食屋", price: 320, assetValue: 320, groupId: "grp_rokkai", revenueRate: 0.14, genre: "food" },
  { id: "prop_rokkai_stationery", name: "六会文具店", category: "文具店", price: 280, assetValue: 280, groupId: "grp_rokkai", revenueRate: 0.15, genre: "commercial" },
  { id: "prop_rokkai_bicycle", name: "六会自転車店", category: "自転車店", price: 350, assetValue: 350, groupId: "grp_rokkai", revenueRate: 0.13, genre: "commercial" },
  { id: "prop_rokkai_izakaya", name: "六会晴れ屋", category: "発酵料理・居酒屋", price: 620, assetValue: 620, groupId: "grp_rokkai", revenueRate: 0.11, genre: "food" },

  // ============================================================
  // 江の島 (grp_enoshima) / region: 江の島
  // ============================================================
  { id: "enlp_se_prop", name: "江の島しらす亭", category: "しらす料理店", price: 600, assetValue: 600, groupId: "grp_enoshima", revenueRate: 0.11, genre: "food" },
  { id: "r_kg_en_bridge_1_prop", name: "江の島山あじさい旅館", category: "旅館", price: 15000, assetValue: 15000, groupId: "grp_enoshima", revenueRate: 0.09, genre: "tourism" },
  { id: "enlp_sw_prop", name: "江の島貝がら堂", category: "土産店", price: 450, assetValue: 450, groupId: "grp_enoshima", revenueRate: 0.13, genre: "commercial" },
  { id: "prop_enoshima_aquarium", name: "新江ノ島水族館", category: "水族館", price: 1500, assetValue: 1500, groupId: "grp_enoshima", revenueRate: 0.09, icon: "🐠", isRealLandmark: true, genre: "tourism" },
  { id: "prop_enoshima_shrine", name: "江島神社", category: "神社", price: 1200, assetValue: 1200, groupId: "grp_enoshima", revenueRate: 0.08, icon: "⛩️", isRealLandmark: true, genre: "tourism" },
  { id: "prop_enoshima_candle", name: "江の島シーキャンドル", category: "展望灯台", price: 1000, assetValue: 1000, groupId: "grp_enoshima", revenueRate: 0.09, icon: "🗼", isRealLandmark: true, genre: "tourism" },

  // ============================================================
  // 鎌倉小路 (grp_kamakura_koji) / region: 鎌倉
  // ============================================================
  { id: "r_kmlp_ring6_1_prop", name: "鎌倉葛庵", category: "和菓子店", price: 700, assetValue: 700, groupId: "grp_kamakura_koji", revenueRate: 0.10, genre: "food" },
  { id: "r_kmlp_gate_kmlp_n_1_prop", name: "古民家カフェ 縁側", category: "古民家カフェ", price: 900, assetValue: 900, groupId: "grp_kamakura_koji", revenueRate: 0.09, genre: "food" },
  { id: "kmmesh_sw_prop", name: "鎌倉山あじさい旅館", category: "旅館", price: 18000, assetValue: 18000, groupId: "grp_kamakura_koji", revenueRate: 0.09, genre: "tourism" },

  // ============================================================
  // 稲村ヶ崎エリア (grp_inamuragasaki) / region: 鎌倉
  // ============================================================
  { id: "inlp_nw_prop", name: "稲村ヶ崎海景テラス", category: "観光施設", price: 2200, assetValue: 2200, groupId: "grp_inamuragasaki", revenueRate: 0.08, genre: "tourism" },
  { id: "prop_inamuragasaki_bakery", name: "稲村ヶ崎サーフベーカリー", category: "パン屋", price: 480, assetValue: 480, groupId: "grp_inamuragasaki", revenueRate: 0.12, genre: "food" },
  { id: "prop_inamuragasaki_inn", name: "稲村ヶ崎シーサイド民宿", category: "民宿", price: 3200, assetValue: 3200, groupId: "grp_inamuragasaki", revenueRate: 0.09, genre: "tourism" },

  // ============================================================
  // 大船エリア (grp_ofuna) / region: 鎌倉
  // ============================================================
  { id: "r_of_kk_1_prop", name: "大船食堂", category: "定食屋", price: 400, assetValue: 400, groupId: "grp_ofuna", revenueRate: 0.13, genre: "food" },
  { id: "prop_ofuna_market", name: "大船青果市場", category: "青果店", price: 380, assetValue: 380, groupId: "grp_ofuna", revenueRate: 0.12, genre: "agriculture" },
  { id: "prop_ofuna_building", name: "大船モノレール商店会館", category: "商業ビル", price: 6000, assetValue: 6000, groupId: "grp_ofuna", revenueRate: 0.08, genre: "commercial" },

  // ============================================================
  // 腰越エリア (grp_koshigoe) / region: 鎌倉
  // ============================================================
  { id: "r_ks_in_2_prop", name: "腰越しらす丸", category: "海鮮店", price: 650, assetValue: 650, groupId: "grp_koshigoe", revenueRate: 0.12, genre: "food" },
  { id: "prop_koshigoe_market", name: "腰越漁協直売所", category: "直売所", price: 420, assetValue: 420, groupId: "grp_koshigoe", revenueRate: 0.13, genre: "agriculture" },
  { id: "prop_koshigoe_boutique", name: "腰越えびす通り洋品店", category: "洋品店", price: 350, assetValue: 350, groupId: "grp_koshigoe", revenueRate: 0.12, genre: "commercial" },

  // ============================================================
  // 北鎌倉エリア (grp_kitakamakura) / region: 鎌倉
  // ============================================================
  { id: "kklp_nw_prop", name: "北鎌倉精進茶寮", category: "精進料理店", price: 750, assetValue: 750, groupId: "grp_kitakamakura", revenueRate: 0.10, genre: "food" },
  { id: "prop_kitakamakura_cafe", name: "北鎌倉竹林カフェ", category: "カフェ", price: 850, assetValue: 850, groupId: "grp_kitakamakura", revenueRate: 0.09, genre: "food" },
  { id: "prop_kitakamakura_antique", name: "北鎌倉古美術店", category: "骨董店", price: 1100, assetValue: 1100, groupId: "grp_kitakamakura", revenueRate: 0.08, genre: "commercial" },

  // ============================================================
  // 辻堂海岸エリア (grp_tsujido_kaigan) / region: 辻堂
  // ============================================================
  { id: "tssp_se_prop", name: "辻堂サーフクルー", category: "サーフショップ", price: 480, assetValue: 480, groupId: "grp_tsujido_kaigan", revenueRate: 0.14, genre: "leisure" },
  { id: "wp_tsujido_kaigan_prop", name: "サンセットテラス", category: "カフェ", price: 600, assetValue: 600, groupId: "grp_tsujido_kaigan", revenueRate: 0.11, genre: "food" },
  { id: "tssp_sw_prop", name: "湘南テラスモール", category: "大型商業施設", price: 45000, assetValue: 45000, groupId: "grp_tsujido_kaigan", revenueRate: 0.07, genre: "commercial" },
  { id: "tsmd_nw_prop", name: "みどりが浜雑貨店", category: "雑貨店", price: 400, assetValue: 400, groupId: "grp_tsujido_kaigan", revenueRate: 0.13, genre: "commercial" },

  // ============================================================
  // 茅ヶ崎中央エリア (grp_chigasaki_chuo) / region: 茅ヶ崎
  // ============================================================
  { id: "cgklp_nw_prop", name: "茅ヶ崎サンビーチハウス", category: "海の家", price: 350, assetValue: 350, groupId: "grp_chigasaki_chuo", revenueRate: 0.16, genre: "leisure" },
  { id: "cgcyu_e_prop", name: "湘南一番亭", category: "ラーメン店", price: 600, assetValue: 600, groupId: "grp_chigasaki_chuo", revenueRate: 0.12, genre: "food" },
  { id: "cgcyu_ne_prop", name: "チガサキサーフガレージ", category: "サーフショップ", price: 520, assetValue: 520, groupId: "grp_chigasaki_chuo", revenueRate: 0.13, genre: "leisure" },
  { id: "r_cg_ne_mesh2_1_prop", name: "茅ヶ崎ステーションプラザ", category: "商業ビル", price: 20000, assetValue: 20000, groupId: "grp_chigasaki_chuo", revenueRate: 0.08, genre: "commercial" },
  { id: "cgklp_sw_prop", name: "茅ヶ崎浜宿定食", category: "定食屋", price: 420, assetValue: 420, groupId: "grp_chigasaki_chuo", revenueRate: 0.12, genre: "food" },
  { id: "prop_chigasaki_hamataro", name: "浜太郎", category: "ラーメン店(人気店)", price: 880, assetValue: 880, groupId: "grp_chigasaki_chuo", revenueRate: 0.10, genre: "food" },

  // ============================================================
  // 香川エリア (grp_kagawa) / region: 茅ヶ崎
  // ============================================================
  { id: "r_kg_rk_8_prop", name: "香川ふれあい市場", category: "直売所", price: 380, assetValue: 380, groupId: "grp_kagawa", revenueRate: 0.11, genre: "agriculture" },
  { id: "prop_kagawa_dango", name: "香川だんご茶屋", category: "甘味処", price: 320, assetValue: 320, groupId: "grp_kagawa", revenueRate: 0.13, genre: "food" },
  { id: "prop_kagawa_garden", name: "香川園芸センター", category: "園芸店", price: 450, assetValue: 450, groupId: "grp_kagawa", revenueRate: 0.11, genre: "agriculture" },

  // ============================================================
  // 平塚銀座エリア (grp_hiratsuka_ginza) / region: 平塚
  // ============================================================
  { id: "wp_hr_sakura_prop", name: "桜ヶ丘酒場", category: "居酒屋", price: 600, assetValue: 600, groupId: "grp_hiratsuka_ginza", revenueRate: 0.11, genre: "food" },
  { id: "wp_hr_shop_prop", name: "湘南麦道", category: "ラーメン店", price: 650, assetValue: 650, groupId: "grp_hiratsuka_ginza", revenueRate: 0.12, genre: "food" },
  { id: "wp_hr_shop_bend_prop", name: "銀座八百屋", category: "青果店", price: 380, assetValue: 380, groupId: "grp_hiratsuka_ginza", revenueRate: 0.13, genre: "agriculture" },
  { id: "r_hrlp_ring0_1_prop", name: "平塚セントラルプラザ", category: "商業施設", price: 28000, assetValue: 28000, groupId: "grp_hiratsuka_ginza", revenueRate: 0.07, genre: "commercial" },

  // ============================================================
  // 田村エリア (grp_tamura) / region: 平塚
  // ============================================================
  { id: "wp_tamura_kado_prop", name: "田村食堂", category: "定食屋", price: 350, assetValue: 350, groupId: "grp_tamura", revenueRate: 0.13, genre: "food" },
  { id: "tmlp_w_prop", name: "田村地域交流館", category: "地域施設", price: 1200, assetValue: 1200, groupId: "grp_tamura", revenueRate: 0.08, genre: "community" },
  { id: "prop_tamura_garage", name: "田村自動車整備工場", category: "自動車整備", price: 700, assetValue: 700, groupId: "grp_tamura", revenueRate: 0.10, genre: "commercial" },

  // ============================================================
  // 中原エリア (grp_nakahara) / region: 平塚
  // ============================================================
  { id: "nklp_nw_prop", name: "中原青空市場", category: "青果店", price: 400, assetValue: 400, groupId: "grp_nakahara", revenueRate: 0.12, genre: "agriculture" },
  { id: "prop_nakahara_meat", name: "中原精肉店", category: "精肉店", price: 340, assetValue: 340, groupId: "grp_nakahara", revenueRate: 0.13, genre: "agriculture" },
  { id: "prop_nakahara_hall", name: "中原文化センター", category: "地域施設", price: 1500, assetValue: 1500, groupId: "grp_nakahara", revenueRate: 0.08, genre: "community" },

  // ============================================================
  // 四之宮エリア (grp_shinomiya) / region: 平塚
  // ============================================================
  { id: "r_sm_sc_shinomiya_gate_1_prop", name: "四之宮喫茶", category: "カフェ", price: 480, assetValue: 480, groupId: "grp_shinomiya", revenueRate: 0.11, genre: "food" },
  { id: "prop_shinomiya_senbei", name: "四之宮せんべい店", category: "せんべい店", price: 300, assetValue: 300, groupId: "grp_shinomiya", revenueRate: 0.14, genre: "food" },
  { id: "prop_shinomiya_museum", name: "四之宮郷土資料館", category: "観光施設", price: 1800, assetValue: 1800, groupId: "grp_shinomiya", revenueRate: 0.08, genre: "tourism" },

  // ============================================================
  // 湘南台エリア (grp_shonandai) / region: 湘南台
  // ============================================================
  { id: "wp_sc_res_bend2_prop", name: "湘南台コミュニティモール", category: "商業施設", price: 15000, assetValue: 15000, groupId: "grp_shonandai", revenueRate: 0.08, genre: "commercial" },
  { id: "r_sc_rk_4_prop", name: "湘南台駅前ビル", category: "駅前店舗", price: 2500, assetValue: 2500, groupId: "grp_shonandai", revenueRate: 0.09, genre: "commercial" },
  { id: "wp_sc_res_spur_prop", name: "湘南台ぱん工房", category: "パン屋", price: 420, assetValue: 420, groupId: "grp_shonandai", revenueRate: 0.13, genre: "food" },
  { id: "r_sc_of_h_4_prop", name: "湘南台大衆酒場", category: "居酒屋", price: 600, assetValue: 600, groupId: "grp_shonandai", revenueRate: 0.11, genre: "food" },

  // ============================================================
  // 寒川エリア (grp_samukawa) / region: 寒川
  // ============================================================
  { id: "wp_samukawa_kita_prop", name: "寒川ファーム市場", category: "直売所", price: 350, assetValue: 350, groupId: "grp_samukawa", revenueRate: 0.12, genre: "agriculture" },
  { id: "r_sm_tm_4_prop", name: "寒川お食事処", category: "定食屋", price: 400, assetValue: 400, groupId: "grp_samukawa", revenueRate: 0.13, genre: "food" },
  { id: "r_sm_sc_h1_1_prop", name: "寒川神社茶屋", category: "観光施設", price: 3000, assetValue: 3000, groupId: "grp_samukawa", revenueRate: 0.09, genre: "tourism" },
  { id: "r_sm_sc_h1_4_prop", name: "寒川交流センター", category: "地域施設", price: 1400, assetValue: 1400, groupId: "grp_samukawa", revenueRate: 0.08, genre: "community" },
];

// /editorで作成した物件定義。overrides.jsonが壊れていてもアプリ全体を落とさないよう防御する。
function loadCustomPropertyDefs(): PropertyDef[] {
  try {
    const list = (overridesData as { customProperties?: unknown }).customProperties;
    return Array.isArray(list) ? (list as PropertyDef[]) : [];
  } catch (err) {
    console.error("overrides.jsonのcustomPropertiesの読み込みに失敗しました。", err);
    return [];
  }
}

export const propertyDefs: PropertyDef[] = [
  ...curatedPropertyDefs,
  ...generatedPropertyDefs,
  ...loadCustomPropertyDefs(),
];

export function getPropertyDef(id: string): PropertyDef | undefined {
  return propertyDefs.find((p) => p.id === id);
}

/** 指定した物件グループに属する全物件(購入画面の一覧表示に使う)。 */
export function getPropertiesInGroup(groupId: string): PropertyDef[] {
  return propertyDefs.filter((p) => p.groupId === groupId);
}
