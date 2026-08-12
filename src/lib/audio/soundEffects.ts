/**
 * 効果音(SE)のid一覧と音源パスのレジストリ。
 *
 * 新しい効果音を追加するときはここに1行足し、public/sounds/ に対応するファイルを
 * 置くだけでよい(soundManager.ts側の変更は不要)。音源がまだ無いidを先に登録しても
 * 問題ない: soundManager.tsのplaySE()は再生失敗(音源未配置・404)を静かに無視するため、
 * コンポーネント側の配線だけ先に済ませ、音源を後から1つずつ追加する進め方に対応できる。
 *
 * 第1弾(2026-08-13時点)の内訳と割り当て済み状況は以下の通り。
 *   dice_roll / step_move / roulette_tick / money_gain / money_loss / card_get /
 *   card_use / property_buy / monopoly_group(✅音源あり) / monopoly_region /
 *   destination_arrive / destination_reveal / game_over_fanfare / ui_select
 */
export type SoundEffectId =
  | "dice_roll"
  | "step_move"
  | "roulette_tick"
  | "money_gain"
  | "money_loss"
  | "card_get"
  | "card_use"
  | "property_buy"
  | "monopoly_group"
  | "monopoly_region"
  | "destination_arrive"
  | "destination_reveal"
  | "game_over_fanfare"
  | "ui_select";

export const SOUND_EFFECT_SRC: Record<SoundEffectId, string> = {
  dice_roll: "/sounds/dice_roll.mp3",
  step_move: "/sounds/step_move.mp3",
  roulette_tick: "/sounds/roulette_tick.mp3",
  money_gain: "/sounds/money_gain.mp3",
  money_loss: "/sounds/money_loss.mp3",
  card_get: "/sounds/card_get.mp3",
  card_use: "/sounds/card_use.mp3",
  property_buy: "/sounds/property_buy.mp3",
  monopoly_group: "/sounds/monopoly_group.mp3",
  monopoly_region: "/sounds/monopoly_region.mp3",
  destination_arrive: "/sounds/destination_arrive.mp3",
  destination_reveal: "/sounds/destination_reveal.mp3",
  game_over_fanfare: "/sounds/game_over_fanfare.mp3",
  ui_select: "/sounds/ui_select.mp3",
};
