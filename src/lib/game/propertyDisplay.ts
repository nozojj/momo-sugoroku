import type { PropertyDef, PropertyGenre } from "@/types/game";

/**
 * 物件ジャンル(PropertyGenre)の表示設定。cardDisplay.tsのCARD_CATEGORY_LABEL等と同じ形。
 * 新しいジャンルを増やすときはtypes/game.tsのPropertyGenreに1件足し、ここに表示設定を
 * 1エントリ足すだけでよい。
 */
export const PROPERTY_GENRE_LABEL: Record<PropertyGenre, string> = {
  food: "飲食店",
  tourism: "観光",
  commercial: "商業",
  agriculture: "農林水産",
  leisure: "レジャー",
  community: "地域施設",
};

export const PROPERTY_GENRE_ICON: Record<PropertyGenre, string> = {
  food: "🍴",
  tourism: "⛩️",
  commercial: "🏢",
  agriculture: "🌾",
  leisure: "🏄",
  community: "🏛️",
};

export const PROPERTY_GENRE_BADGE_CLASS: Record<PropertyGenre, string> = {
  food: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-400/10 dark:text-orange-300",
  tourism: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-400/10 dark:text-sky-300",
  commercial:
    "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
  agriculture:
    "border-lime-300 bg-lime-50 text-lime-700 dark:border-lime-500/50 dark:bg-lime-400/10 dark:text-lime-300",
  leisure: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/50 dark:bg-cyan-400/10 dark:text-cyan-300",
  community:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/50 dark:bg-violet-400/10 dark:text-violet-300",
};

/** PlayerHudの所有物件ピルのような省スペース表示向けの、ジャンルを示す小さいドットの背景色。
 *  色そのものはPROPERTY_GENRE_BADGE_CLASSと同じパレットに揃えてある(cardDisplay.tsの
 *  CARD_CATEGORY_DOT_CLASSと同じ考え方)。 */
export const PROPERTY_GENRE_DOT_CLASS: Record<PropertyGenre, string> = {
  food: "bg-orange-400",
  tourism: "bg-sky-400",
  commercial: "bg-slate-400",
  agriculture: "bg-lime-400",
  leisure: "bg-cyan-400",
  community: "bg-violet-400",
};

/** 表示順序。将来ジャンル別にグループ化する場合もこの並びを使い回せる。 */
export const PROPERTY_GENRE_ORDER: PropertyGenre[] = [
  "food",
  "tourism",
  "commercial",
  "agriculture",
  "leisure",
  "community",
];

/**
 * PropertyDefからジャンルを決める。明示的なgenreがあればそれを使い、無ければcategory(自由記述)の
 * キーワードから推測する。generatedPropertyDefs/エディタ作成物件のように明示genreを持たない
 * 大量の物件でも、この関数を通せば必ず何らかのジャンルに分類される(未分類を作らない)。
 */
export function propertyGenreOf(def: PropertyDef): PropertyGenre {
  if (def.genre) return def.genre;
  const category = def.category;
  if (/ラーメン|居酒屋|カフェ|食堂|惣菜|甘味|パン|和菓子|せんべい|しらす料理|精進料理|海鮮/.test(category)) return "food";
  if (/観光|神社|水族館|旅館|民宿|灯台|資料館/.test(category)) return "tourism";
  if (/直売所|青果|精肉|漁協|園芸|市場|農|漁/.test(category)) return "agriculture";
  if (/サーフ|海の家/.test(category)) return "leisure";
  if (/地域施設|交流センター|文化センター|公民館/.test(category)) return "community";
  return "commercial";
}
