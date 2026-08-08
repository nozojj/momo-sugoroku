import type { CardDef, CardRarity } from "@/types/game";

export const cardDefs: CardDef[] = [
  {
    id: "card_dice_again",
    name: "もういちどサイコロ",
    description: "手札から使うと、その場でもう一度サイコロを振れる。",
    kind: "usable",
    effect: "diceAgain",
    rarity: "common",
    icon: "🎲",
  },
  {
    id: "card_double_move",
    name: "スピードアップ",
    description: "手札から使うと、次に振るサイコロの出目が2倍になる。",
    kind: "usable",
    effect: "doubleMove",
    rarity: "rare",
    icon: "⚡",
  },
  {
    id: "card_shortcut",
    name: "裏道パス",
    description:
      "持っているだけで、藤沢宿(藤沢本町)の旧東海道の裏道を通行できるようになる。",
    kind: "key",
    rarity: "superRare",
    icon: "🗝️",
    drawable: false,
  },
];

export function getCardDef(id: string): CardDef | undefined {
  return cardDefs.find((c) => c.id === id);
}

/** カード獲得マスに止まったときの抽選対象。drawable: false のカード(近道パス等の特別枠)は除外する。 */
export function getDrawableCards(): CardDef[] {
  return cardDefs.filter((c) => c.drawable !== false);
}

/**
 * レア度ごとの抽選重み。数値が大きいほど出やすい。
 * カードを増やす際はこの表とcardDefsの各カードのrarityだけで確率調整が完結する
 * (gameStore側の抽選ロジックには一切手を入れなくてよい)。
 */
export const RARITY_WEIGHT: Record<CardRarity, number> = {
  common: 70,
  rare: 25,
  superRare: 5,
};
