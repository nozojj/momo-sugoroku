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

/**
 * 地域イベントの分類単位。既存のPropertyGroup.regionと同じ地域名(藤沢/江の島/鎌倉/茅ヶ崎/
 * 平塚/寒川)をそのまま流用し、プレイヤーが地域独占ボーナスで既に見慣れている地域概念と
 * 一致させる(新しい地域概念は作らない)。辻堂・湘南台は現状イベントマスが0件のため
 * 未収録(後続課題。盤面へのノード追加を伴うため別タスクで扱う)。
 */
export type EventRegionId = "fujisawa" | "enoshima" | "kamakura" | "chigasaki" | "hiratsuka" | "samukawa";

/**
 * イベントマス(type: "event")のnodeId→地域idの対応表。
 *
 * 最寄り駅までのホップ数・最寄り物件グループとの座標距離という2つの幾何的な推定方法を
 * 実マップの全30件で比較したところ、40%(12件)で食い違い、しかも食い違うケースの多くで
 * node.name/areaに明記された地名(例:「茅ヶ崎銀座」)と異なる結果になることが判明したため、
 * 幾何計算に頼らずnode.name/areaを目視確認して手動で確定した値をそのまま持たせる。
 * ここに載っていない(=未登録)ノードや、regionIdはあってもREGIONAL_EVENT_POOLSに
 * まだそのエントリが無い地域は、eventPoolForNode()が自動的にlocalEventPoolへ
 * フォールバックする。r_north_spine_1_5・r_hills_road3_1・ed_mshor9ec_g6nzの3件は
 * node.name/areaのどちらにも地名の手がかりが無く地理的にも判定できなかったため、
 * 意図的に未登録のままにしている(無理に地域へ割り当てず全域イベントへ委ねる)。
 */
export const EVENT_NODE_REGION_MAP: Partial<Record<string, EventRegionId>> = {
  // 藤沢(5件)
  r_rk_fj_2: "fujisawa",
  fjkt_e: "fujisawa",
  fjhg_w: "fujisawa",
  fjmesh_n: "fujisawa",
  r_fj_nw_rk1_2: "fujisawa",
  // 江の島(3件)
  r_kg_ks_2: "enoshima",
  encd_sw: "enoshima",
  ed_bend_b12: "enoshima",
  // 鎌倉(6件)
  r_ks_in_3: "kamakura",
  kmlp_se: "kamakura",
  kklp_w: "kamakura",
  onlp_nw: "kamakura",
  kjlp_s: "kamakura",
  yuilp_w: "kamakura",
  // 茅ヶ崎(5件)
  cgsp_sw: "chigasaki",
  cgmesh_sw: "chigasaki",
  r_cgmesh_col2_1: "chigasaki",
  cgcyu_sw: "chigasaki",
  r_local_cg_ts_h1_1: "chigasaki",
  // 平塚(5件)
  r_tm_hr_5: "hiratsuka",
  tmlp_e: "hiratsuka",
  hrsp_s: "hiratsuka",
  hrsk_se: "hiratsuka",
  hrsk_sw: "hiratsuka",
  // 寒川(3件)
  r_sm_tm_6: "samukawa",
  smrt_w: "samukawa",
  smrs_sw: "samukawa",
};

/**
 * 地域ごとのイベントプール(段階導入)。イベントidは全イベント共通で一意にし、
 * event_<regionId>_*という命名にして、どの地域のイベントかログ以外からも判別できるようにする。
 * 未着手の地域はキー自体を持たせない(=undefined)ことで、eventPoolForNode()が自動的に
 * localEventPoolへフォールバックする。段階的に1地域ずつここへエントリを足すだけで拡張でき、
 * eventPoolForNode()・landingEffects.tsの呼び出し元は一切変更不要。
 *
 * 第1段階: 鎌倉・江の島のみ実装。藤沢/茅ヶ崎/平塚/寒川はEVENT_NODE_REGION_MAPには
 * 登録済みだが、このプールが無いためlocalEventPoolへフォールバックする。
 */
export const REGIONAL_EVENT_POOLS: Partial<Record<EventRegionId, MoneyEventDef[]>> = {
  kamakura: [
    {
      id: "event_kamakura_daibutsu",
      message: "鎌倉大仏の御開帳日で観光客が殺到、近くの店が賑わった",
      amount: 130,
    },
    {
      id: "event_kamakura_ajisai",
      message: "紫陽花シーズンで写真スポットが大混雑、休憩処が繁盛した",
      amount: 90,
    },
    {
      id: "event_kamakura_traffic",
      message: "観光渋滞で身動きが取れず、時間を無駄にした…",
      amount: -60,
    },
    {
      id: "event_kamakura_hato",
      message: "名物の鳩サブレーを買い込みすぎて予算オーバー",
      amount: -40,
    },
  ],
  enoshima: [
    {
      id: "event_enoshima_shirasu",
      message: "生しらす丼が評判を呼び、行列ができるほどの人気に",
      amount: 110,
    },
    {
      id: "event_enoshima_sunset",
      message: "江の島の夕日を一目見ようと観光客が押し寄せ、みやげ物が売れた",
      amount: 80,
    },
    {
      id: "event_enoshima_bridge_toll",
      message: "江の島大橋の渡橋料がかさんで、思ったより出費がかさんだ",
      amount: -50,
    },
  ],
};

/**
 * eventマス着地時に使うプールを解決する。地域が特定できない、または該当地域のプールが
 * まだ用意されていない(段階導入中)場合は、既存のlocalEventPool(全域共通)へ安全に
 * フォールバックする。moneyOutcome()は既にpoolを引数で受け取る設計なので、この関数の
 * 戻り値をそのまま渡すだけでよく、landingEffects.ts側のロジックは変更不要。
 */
export function eventPoolForNode(nodeId: string): MoneyEventDef[] {
  const regionId = EVENT_NODE_REGION_MAP[nodeId];
  return (regionId && REGIONAL_EVENT_POOLS[regionId]) || localEventPool;
}
