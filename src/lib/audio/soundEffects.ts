/**
 * 効果音(SE)のid一覧と音源パスのレジストリ。
 *
 * 新しい効果音を追加するときはここに1行足し、public/sounds/ に対応するファイルを
 * 置くだけでよい(soundManager.ts側の変更は不要)。音源がまだ無いidを先に登録しても
 * 問題ない: soundManager.tsのplaySE()は再生失敗(音源未配置・404)を静かに無視するため、
 * コンポーネント側の配線だけ先に済ませ、音源を後から1つずつ追加する進め方に対応できる。
 *
 * 第1弾(2026-08-13時点)の内訳と割り当て済み状況は以下の通り。すべて手続き的生成
 * (scripts/generate-se.mjs)によるWAVで揃っており、外部素材への依存は無い。
 *   dice_roll(✅P10-4-1) / step_move(✅P10-4-1) / roulette_tick(✅P10-4-1) /
 *   money_gain(✅P10-4-1) / money_loss(✅P10-4-1) / card_get(✅P10-4-2) / card_use(✅P10-4-2) /
 *   property_buy(✅P10-4-2) / monopoly_group(✅P10-4-3、出所不明だった旧mp3から自作wavへ置き換え済み) /
 *   monopoly_region(✅P10-4-3) / destination_arrive(✅P10-4-3) / destination_reveal(✅P10-4-3) /
 *   game_over_fanfare(✅P10-4-4) / ui_select(✅P10-4-4)
 *
 * P11-3-B2b-3で追加(最終順位発表演出の脱落コースアウト専用): elimination_out。
 * 既存destination_revealはholding(順位発表)側に流用するのみで新規追加していない。
 *
 * Polish Phase P1 S-3f-3で追加(妨害キャラの変身、TroubleCharacterAnnounceModal.tsxの
 * kind:"transform"専用): trouble_transform(通常進化)/trouble_transform_final(最終進化)。
 *
 * Polish Phase P1 S-3f-4で追加(妨害キャラの悪さ、TroubleCharacterAnnounceModal.tsxの
 * kind:"mischief"専用): trouble_mischief。毎ターン鳴る可能性がある高頻度SEのため、
 * trouble_transform_finalのような大げさな尺・音量にはせず、短く軽い「被害確定」の合図に留める。
 *
 * Polish Phase P1 S-3f-5で追加(重大mischief専用): trouble_mischief_heavy。severity判定
 * (lib/game/troubleCharacter.tsのjudgeMischiefSeverity())が"heavy"のときだけ、trouble_mischiefの
 * 代わりにこちらを鳴らす(二者択一、二重再生はしない)。trouble_mischiefより一段重い音にしつつ、
 * trouble_transform_final(最終進化専用、約880ms)よりは明確に短く、毎ターン発生しうる高頻度SEの
 * 尺には収める。
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
  | "ui_select"
  | "elimination_out"
  | "trouble_transform"
  | "trouble_transform_final"
  | "trouble_mischief"
  | "trouble_mischief_heavy";

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
  // Phase10/P10-4-4: 同じくscripts/generate-se.mjsによるWAV。これで全14音が手続き的生成で揃った。
  game_over_fanfare: "/sounds/game_over_fanfare.wav",
  ui_select: "/sounds/ui_select.wav",
  // P11-3-B2b-3: 同じくscripts/generate-se.mjsによるWAV。
  elimination_out: "/sounds/elimination_out.wav",
  // Polish Phase P1 S-3f-3: 同じくscripts/generate-se.mjsによるWAV。
  trouble_transform: "/sounds/trouble_transform.wav",
  trouble_transform_final: "/sounds/trouble_transform_final.wav",
  // Polish Phase P1 S-3f-4: 同じくscripts/generate-se.mjsによるWAV。
  trouble_mischief: "/sounds/trouble_mischief.wav",
  // Polish Phase P1 S-3f-5: 同じくscripts/generate-se.mjsによるWAV。
  trouble_mischief_heavy: "/sounds/trouble_mischief_heavy.wav",
};
