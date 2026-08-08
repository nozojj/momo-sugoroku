import type { CardRarity } from "@/types/game";

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
