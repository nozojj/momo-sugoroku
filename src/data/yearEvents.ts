import type { YearEventDef } from "@/types/game";

/**
 * 年度イベント(「今年の湘南」)の定義。4月の年度開始のたびに1件、重み付き抽選で選ばれ、
 * その年度の決算まで固定される(抽選ロジック本体はlib/game/yearEvent.tsのdrawYearEvent())。
 *
 * 倍率は独占(グループ×1.5・地域×2)より弱い「その年の追い風/向かい風」程度に抑えてある。
 * 新しいイベントを増やすときはここに1エントリ足すだけでよく、weightの合計を100に保つと
 * 「重み=出現率(%)」として読めて調整しやすい(yearEvent.test.tsで合計100を検証している)。
 */
export const yearEventDefs: YearEventDef[] = [
  {
    id: "normal",
    label: "平年",
    icon: "🌤️",
    description: "特に変わったことのない、いつも通りの一年でした。",
    weight: 40,
    genreMultipliers: {},
  },
  {
    id: "heatwave",
    label: "猛暑の年",
    icon: "☀️",
    description: "記録的な暑さで海水浴客が殺到。海の家やレジャー施設が大にぎわいでした。",
    weight: 14,
    genreMultipliers: { leisure: 1.2, food: 1.05, agriculture: 0.95 },
  },
  {
    id: "coolSummer",
    label: "長雨・冷夏の年",
    icon: "🌧️",
    description: "梅雨が長引き海は閑散。畑の実りは上々でした。",
    weight: 12,
    genreMultipliers: { leisure: 0.85, agriculture: 1.1 },
  },
  {
    id: "typhoon",
    label: "台風当たり年",
    icon: "🌀",
    description: "台風の上陸が相次ぎ、海沿いの観光・レジャーが軒並み苦戦しました。",
    weight: 12,
    genreMultipliers: { leisure: 0.8, tourism: 0.9 },
  },
  {
    id: "tourismBoom",
    label: "観光ブームの年",
    icon: "📸",
    description: "ロケ地・SNSで話題になり、観光客が急増しました。",
    weight: 12,
    genreMultipliers: { tourism: 1.2, commercial: 1.1 },
  },
  {
    id: "boomEconomy",
    label: "好景気の年",
    icon: "📈",
    description: "世の中全体が好景気。あらゆる商売の追い風になりました。",
    weight: 5,
    genreMultipliers: { food: 1.1, tourism: 1.1, commercial: 1.1, agriculture: 1.1, leisure: 1.1, community: 1.1 },
  },
  {
    id: "recession",
    label: "不景気の年",
    icon: "📉",
    description: "世の中全体が不景気。財布のひもが固くなった一年でした。",
    weight: 5,
    genreMultipliers: { food: 0.9, tourism: 0.9, commercial: 0.9, agriculture: 0.9, leisure: 0.9, community: 0.9 },
  },
];
