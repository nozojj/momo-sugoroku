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
    id: "card_drive",
    name: "ドライブカード",
    description: "手札から使うと、車がプチ変身してサイコロ2個を同時に振り、合計マス移動する。",
    kind: "usable",
    effect: { type: "multiDice", diceCount: 2, vehicleMode: "expressLv1" },
    rarity: "rare",
    icon: "🚗💨",
  },
  {
    id: "card_sports_car",
    name: "スポーツカーカード",
    description: "手札から使うと、車がスポーツカーに変身してサイコロ3個を同時に振り、合計マス移動する。",
    kind: "usable",
    effect: { type: "multiDice", diceCount: 3, vehicleMode: "expressLv2" },
    rarity: "rare",
    icon: "🏎️",
  },
  {
    id: "card_super_car",
    name: "スーパーカーカード",
    description: "手札から使うと、車がスーパーカーに変身してサイコロ4個を同時に振り、合計マス移動する。",
    kind: "usable",
    effect: { type: "multiDice", diceCount: 4, vehicleMode: "expressLv3" },
    rarity: "superRare",
    icon: "🏁",
  },
  {
    id: "card_shonan_hyper",
    name: "湘南ハイパーカード",
    description: "手札から使うと、車が湘南すごろくオリジナルのハイパーカーに変身してサイコロ5個を同時に振り、合計マス移動する。",
    kind: "usable",
    effect: { type: "multiDice", diceCount: 5, vehicleMode: "expressLv4" },
    rarity: "superRare",
    icon: "✨🚀",
  },
  {
    id: "card_warp_anywhere",
    name: "ぶっとびカード",
    description: "手札から使うと、マップ全体からランダムな1マスへその場でワープする。行き先は誰にも分からない。",
    kind: "usable",
    effect: { type: "warp", scope: "anywhere" },
    rarity: "common",
    icon: "🌀",
  },
  {
    id: "card_warp_nearby",
    name: "地元ぶっとびカード",
    description: "手札から使うと、現在地の近く(半径250m圏内)のランダムな1マスへワープする。",
    kind: "usable",
    effect: { type: "warp", scope: "nearby" },
    rarity: "rare",
    icon: "🧭",
  },
  {
    id: "card_warp_destination",
    name: "目的地ワープカード",
    description: "手札から使うと、現在の目的地マスへ直接ワープする。",
    kind: "usable",
    effect: { type: "warp", scope: "destination" },
    rarity: "superRare",
    icon: "🎯",
  },
  {
    id: "card_warp_select_station",
    name: "駅指定ワープカード",
    description: "手札から使うと、8つの駅から行き先を選んでその駅へ直接ワープする。",
    kind: "usable",
    effect: { type: "targetSelect", selectKind: "station" },
    rarity: "rare",
    icon: "🚉",
  },
  {
    id: "card_warp_select_region",
    name: "エリア指定ワープカード",
    description: "手札から使うと、8つの地域から行き先を選んで、その地域内のランダムな1マスへワープする。",
    kind: "usable",
    effect: { type: "targetSelect", selectKind: "region" },
    rarity: "rare",
    icon: "🗾",
  },
  {
    id: "card_warp_select_property_group",
    name: "狙い撃ち物件ワープカード",
    description: "手札から使うと、物件グループを選んで、そのマスへ直接ワープする。",
    kind: "usable",
    effect: { type: "targetSelect", selectKind: "propertyGroup" },
    rarity: "superRare",
    icon: "🏢",
  },
  {
    id: "card_debuff_skip",
    name: "お休みカード",
    description: "手札から使うと、選んだ相手プレイヤーの次の手番を1回お休みにする。",
    kind: "usable",
    effect: { type: "rivalDebuff", debuffKind: "skipNextRoll" },
    rarity: "rare",
    icon: "😴",
  },
  {
    id: "card_debuff_halve",
    name: "のろまカード",
    description: "手札から使うと、選んだ相手プレイヤーの次のサイコロの合計値を半分(端数切り上げ)にする。",
    kind: "usable",
    effect: { type: "rivalDebuff", debuffKind: "halveDiceNextRoll" },
    rarity: "rare",
    icon: "🐌",
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
