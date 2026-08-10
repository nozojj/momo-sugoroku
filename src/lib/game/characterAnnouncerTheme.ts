import type { AnnouncerEffectConfig, CharacterAnnouncementTheme } from "@/types/characterAnnouncer";

interface CharacterAnnouncerThemeStyle {
  /** 吹き出し上部のアクセント枠に使うクラス(border-t-4と組み合わせる想定) */
  accentBorderClass: string;
  /** highlightの金額テキストに使う文字色クラス */
  accentTextClass: string;
  /** このテーマの既定演出。CharacterAnnouncement.effectで個別フラグ単位に上書きできる */
  defaultEffect: AnnouncerEffectConfig;
}

/** テーマごとの見た目/既定演出の一覧。新しいテーマを足すときはCharacterAnnouncementTheme型と
 *  ここに1エントリ足すだけでよい(characterStyle.tsのCHARACTER_PLACEHOLDER_STYLEと同じパターン)。 */
export const CHARACTER_ANNOUNCER_THEME_STYLE: Record<CharacterAnnouncementTheme, CharacterAnnouncerThemeStyle> = {
  normal: {
    accentBorderClass: "border-t-slate-300 dark:border-t-slate-600",
    accentTextClass: "text-amber-500",
    defaultEffect: {},
  },
  celebratory: {
    accentBorderClass: "border-t-amber-400",
    accentTextClass: "text-amber-500",
    defaultEffect: { confetti: true, sparkle: true },
  },
  warning: {
    accentBorderClass: "border-t-orange-400",
    accentTextClass: "text-orange-500",
    defaultEffect: { warnRing: true },
  },
  negative: {
    accentBorderClass: "border-t-rose-400",
    accentTextClass: "text-rose-500",
    defaultEffect: { shakeOnHighlight: true },
  },
};

/** テーマの既定演出とCharacterAnnouncement.effect(個別フラグ)をマージする。
 *  例: celebratoryのまま effect: { confetti: false } を渡すとキラキラだけ残せる。 */
export function resolveAnnouncerEffect(
  theme: CharacterAnnouncementTheme,
  override?: AnnouncerEffectConfig
): AnnouncerEffectConfig {
  return { ...CHARACTER_ANNOUNCER_THEME_STYLE[theme].defaultEffect, ...override };
}
