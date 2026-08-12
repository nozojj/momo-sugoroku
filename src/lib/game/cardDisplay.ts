import type { CardDef, CardRarity } from "@/types/game";
import { effectKind } from "./cardEffects";

/** カードのレア度表示(ラベル・配色)。CardDrawModal/CardOverflowModal/PlayerHudで共通利用する。 */
export const RARITY_LABEL: Record<CardRarity, string> = {
  common: "コモン",
  rare: "レア",
  superRare: "スーパーレア",
};

export const RARITY_BADGE_CLASS: Record<CardRarity, string> = {
  common:
    "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
  rare: "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-400/10 dark:text-sky-200",
  superRare:
    "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-400/10 dark:text-amber-200",
};

/**
 * カードの表示用カテゴリ。CardDef自体にはフィールドを持たせず、effect.type(ゲームロジック側の
 * 内部種別)から都度導出する「見た目専用」の分類にしてある(二重管理を避けるため)。
 * PlayerHud/CardDetailSheet/CardOverflowModal/CardDrawModalは全てcardCategoryOf()と
 * 以下のラベル/色定義だけを参照し、カテゴリの判定ロジック自体はこのファイルにしか無い。
 */
export type CardCategory = "support" | "express" | "warp" | "targetWarp" | "sabotage" | "key";

/** 表示順序。今回は「カテゴリ順にソートするだけ」で使うが、将来カード種類が増えて
 *  カテゴリ見出し付きのグループ表示に拡張する際も、この配列とcardCategoryOf()だけで
 *  Record<CardCategory, CardDef[]>を組み立てられる(表示側の追加実装だけで対応できる)。 */
export const CARD_CATEGORY_ORDER: CardCategory[] = ["support", "express", "warp", "targetWarp", "sabotage", "key"];

export const CARD_CATEGORY_LABEL: Record<CardCategory, string> = {
  support: "サポート",
  express: "急行系",
  warp: "ぶっとび系",
  targetWarp: "場所指定系",
  sabotage: "妨害系",
  key: "キー",
};

/** カード詳細(CardDetailSheet/CardOverflowModal/CardDrawModal)で使う、通常サイズのバッジ配色。 */
export const CARD_CATEGORY_BADGE_CLASS: Record<CardCategory, string> = {
  support: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-400/10 dark:text-sky-300",
  express:
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-400/10 dark:text-orange-300",
  warp: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/50 dark:bg-violet-400/10 dark:text-violet-300",
  targetWarp:
    "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-500/50 dark:bg-teal-400/10 dark:text-teal-300",
  sabotage:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-400/10 dark:text-rose-300",
  key: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-400/10 dark:text-amber-300",
};

/** PlayerHudの手札ピルのような省スペース表示向けの、カテゴリを示す小さいドットの背景色。
 *  色そのものはCARD_CATEGORY_BADGE_CLASSと同じパレットに揃えてある(表現形は違うが、
 *  「このカテゴリ=この色」という対応はこのファイル1箇所だけで決めている)。 */
export const CARD_CATEGORY_DOT_CLASS: Record<CardCategory, string> = {
  support: "bg-sky-400",
  express: "bg-orange-400",
  warp: "bg-violet-400",
  targetWarp: "bg-teal-400",
  sabotage: "bg-rose-400",
  key: "bg-amber-400",
};

/** CardDefからカテゴリを導出する。kind:"key"のカード(裏道パス等)は無条件でkey、
 *  それ以外はeffect.type(effectKind()と同じ正規化)で分岐する。 */
export function cardCategoryOf(def: CardDef): CardCategory {
  if (def.kind === "key" || !def.effect) return "key";
  const kind = effectKind(def.effect);
  switch (kind) {
    case "diceAgain":
    case "doubleMove":
      return "support";
    case "multiDice":
      return "express";
    case "warp":
      return "warp";
    case "targetSelect":
      return "targetWarp";
    case "rivalDebuff":
      return "sabotage";
    default:
      return "support";
  }
}
