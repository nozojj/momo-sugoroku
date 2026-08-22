/**
 * 効果音(SE)のid一覧と音源パスのレジストリ。
 *
 * 新しい効果音を追加するときはここに1行足し、public/sounds/ に対応するファイルを
 * 置くだけでよい(soundManager.ts側の変更は不要)。音源がまだ無いidを先に登録しても
 * 問題ない: soundManager.tsのplaySE()は再生失敗(音源未配置・404)を静かに無視するため、
 * コンポーネント側の配線だけ先に済ませ、音源を後から1つずつ追加する進め方に対応できる。
 *
 * 第1弾(2026-08-13時点)の内訳と割り当て済み状況は以下の通り。
 *   dice_roll(✅P10-4-1) / step_move(✅P10-4-1) / roulette_tick(✅P10-4-1) /
 *   money_gain(✅P10-4-1) / money_loss(✅P10-4-1) / card_get(✅P10-4-2) / card_use(✅P10-4-2) /
 *   property_buy(✅P10-4-2) / monopoly_group(✅P10-4-3、出所不明だった旧mp3から自作wavへ置き換え済み) /
 *   monopoly_region(✅P10-4-3) / destination_arrive(✅P10-4-3) / destination_reveal(✅P10-4-3) /
 *   game_over_fanfare / ui_select
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
  // Phase10/P10-4-1: 手続き的生成(scripts/generate-se.mjs)によるWAV。他の未配置idとの
  // 一貫性より「出所不明の素材を使わない」ことを優先し、この5つだけ拡張子が異なる。
  dice_roll: "/sounds/dice_roll.wav",
  step_move: "/sounds/step_move.wav",
  roulette_tick: "/sounds/roulette_tick.wav",
  money_gain: "/sounds/money_gain.wav",
  money_loss: "/sounds/money_loss.wav",
  // Phase10/P10-4-2: 同じくscripts/generate-se.mjsによるWAV。
  card_get: "/sounds/card_get.wav",
  card_use: "/sounds/card_use.wav",
  property_buy: "/sounds/property_buy.wav",
  // Phase10/P10-4-3: 同じくscripts/generate-se.mjsによるWAV。monopoly_groupは出所・ライセンス
  // 確認不可だった旧monopoly_group.mp3を正式に置き換えたもの(旧ファイルは削除済み)。
  monopoly_group: "/sounds/monopoly_group.wav",
  monopoly_region: "/sounds/monopoly_region.wav",
  destination_arrive: "/sounds/destination_arrive.wav",
  destination_reveal: "/sounds/destination_reveal.wav",
  game_over_fanfare: "/sounds/game_over_fanfare.mp3",
  ui_select: "/sounds/ui_select.mp3",
};
