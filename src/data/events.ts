import type { MoneyEventDef } from "@/types/game";

/** type: "money" のマスに止まったときに抽選される、ちょっとした収支イベント。 */
export const moneyEventPool: MoneyEventDef[] = [
  { id: "money_coin", message: "道端で小銭を拾った！", amount: 30 },
  { id: "money_sale", message: "商店街のセールでお得に買い物できた", amount: 50 },
  { id: "money_parking", message: "駐車違反の反則金を払った…", amount: -80 },
  { id: "money_lunch", message: "評判のランチにお金を使いすぎた", amount: -40 },
  { id: "money_bonus", message: "アルバイト代が入った", amount: 100 },
  { id: "money_tire", message: "パンク修理でお金がかかった", amount: -60 },
];

/** type: "event" のマス(河畔ルートなど)に止まったときの、湘南らしいご当地イベント。 */
export const localEventPool: MoneyEventDef[] = [
  {
    id: "event_typhoon",
    message: "台風接近で河畔の物件の調子がいまひとつ…",
    amount: -70,
  },
  {
    id: "event_fireworks",
    message: "花火大会で賑わって臨時収入！",
    amount: 150,
  },
  {
    id: "event_surf",
    message: "サーフィン大会の観客でちょっと儲かった",
    amount: 90,
  },
  {
    id: "event_flood_caution",
    message: "増水注意で足止め気味…ガソリン代がかさんだ",
    amount: -50,
  },
  {
    id: "event_tv",
    message: "テレビ取材が来て話題になった！",
    amount: 120,
  },
];

export function drawFromPool(pool: MoneyEventDef[]): MoneyEventDef {
  return pool[Math.floor(Math.random() * pool.length)];
}
