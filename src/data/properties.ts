import type { PropertyDef } from "@/types/game";
import { generatedPropertyDefs } from "@/data/maps/shonan-full";

/**
 * 物件の静的データ。
 * 架空物件は実在店舗との混同を避けるため名称を創作している。
 * isRealLandmark: true の物件のみ、実在店舗・実在施設をモデルにしたランドマーク(盤面では金縁+専用アイコンで区別)。
 * generatedPropertyDefs は自動生成マップの穴埋め物件(shonan-full.tsのwindingFillerが生成)。
 */
const curatedPropertyDefs: PropertyDef[] = [
  // --- 湘南台 ---
  {
    id: "prop_sc_market",
    name: "サンズマーケット湘南台店",
    category: "スーパー",
    price: 800,
    assetValue: 800,
    area: "湘南台",
  },
  {
    id: "prop_sc_karaoke",
    name: "湘南台カラオケパーク",
    category: "カラオケ店",
    price: 600,
    assetValue: 600,
    area: "湘南台",
  },

  // --- 六会日大前(実在ランドマーク) ---
  {
    id: "prop_rokkai_hareru",
    name: "発幸酒場 晴(ハレル)",
    category: "発酵料理・居酒屋",
    price: 620,
    assetValue: 620,
    area: "六会日大前",
    icon: "🏮",
    isRealLandmark: true,
  },

  // --- 善行 ---
  {
    id: "prop_zen_park_cafe",
    name: "公園そばのカフェ",
    category: "カフェ",
    price: 550,
    assetValue: 550,
    area: "善行",
  },

  // --- 藤沢本町 ---
  {
    id: "prop_hommachi_wagashi",
    name: "藤沢宿の老舗和菓子屋",
    category: "老舗和菓子店",
    price: 700,
    assetValue: 700,
    area: "藤沢本町",
  },

  // --- 藤沢駅 ---
  {
    id: "prop_fujisawa_depaato",
    name: "藤沢駅前デパート",
    category: "駅前デパート",
    price: 1100,
    assetValue: 1100,
    area: "藤沢駅",
  },
  {
    id: "prop_fujisawa_ekibiru",
    name: "藤沢駅ビル",
    category: "駅ビル",
    price: 900,
    assetValue: 900,
    area: "藤沢駅",
  },

  // --- 片瀬江ノ島・江の島(実在ランドマーク) ---
  {
    id: "prop_katase_aquarium",
    name: "新江ノ島水族館",
    category: "水族館",
    price: 1500,
    assetValue: 1500,
    area: "片瀬海岸",
    icon: "🐠",
    isRealLandmark: true,
  },
  {
    id: "prop_enoshima_shrine",
    name: "江島神社",
    category: "神社",
    price: 1200,
    assetValue: 1200,
    area: "江の島",
    icon: "⛩️",
    isRealLandmark: true,
  },
  {
    id: "prop_enoshima_candle",
    name: "江の島シーキャンドル",
    category: "展望灯台",
    price: 1000,
    assetValue: 1000,
    area: "江の島",
    icon: "🗼",
    isRealLandmark: true,
  },

  // --- 茅ヶ崎方面(実在ランドマーク) ---
  {
    id: "prop_fujisawaya",
    name: "藤澤家",
    category: "ラーメン店(人気店)",
    price: 880,
    assetValue: 880,
    area: "茅ヶ崎",
    icon: "🍜",
    isRealLandmark: true,
  },
];

export const propertyDefs: PropertyDef[] = [...curatedPropertyDefs, ...generatedPropertyDefs];

export function getPropertyDef(id: string): PropertyDef | undefined {
  return propertyDefs.find((p) => p.id === id);
}
