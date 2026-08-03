import type { CardDef } from "@/types/game";

export const cardDefs: CardDef[] = [
  {
    id: "card_dice_again",
    name: "もういちどサイコロ",
    description: "手札から使うと、その場でもう一度サイコロを振れる。",
    kind: "usable",
    effect: "diceAgain",
  },
  {
    id: "card_double_move",
    name: "スピードアップ",
    description: "手札から使うと、次に振るサイコロの出目が2倍になる。",
    kind: "usable",
    effect: "doubleMove",
  },
  {
    id: "card_shortcut",
    name: "裏道パス",
    description:
      "持っているだけで、藤沢宿(藤沢本町)の旧東海道の裏道を通行できるようになる。",
    kind: "key",
  },
];

export function getCardDef(id: string): CardDef | undefined {
  return cardDefs.find((c) => c.id === id);
}

/** カード獲得マスに止まったときに引く候補(近道パスは特別枠なので抽選対象は使用系カードのみ)。 */
export const drawableCardIds = ["card_dice_again", "card_double_move"];
