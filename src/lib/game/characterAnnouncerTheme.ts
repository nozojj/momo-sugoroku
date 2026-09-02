import type { AnnouncerEffectConfig, CharacterAnnouncementTheme } from "@/types/characterAnnouncer";

interface CharacterAnnouncerThemeStyle {
  /** 吹き出し上部のアクセント枠に使うクラス(border-t-4と組み合わせる想定) */
  accentBorderClass: string;
  /** highlightの金額テキストに使う文字色クラス */
  accentTextClass: string;
  /** このテーマの既定演出。CharacterAnnouncement.effectで個別フラグ単位に上書きできる */
  defaultEffect: AnnouncerEffectConfig;
  /** warnRing表示時の枠色クラス(border-*-400を想定)。Polish Phase P1 S-3f-3までは
   *  warnRingがwarningテーマでしか実質使われておらずborder-orange-400固定だったが、negative
   *  テーマ(妨害キャラの最終形態変身)でも明示的にwarnRingを使うようになったため、テーマごとに
   *  持たせて自然に色を変える。normal/celebratoryは現状warnRingを使わないが、将来の
   *  上書き利用に備えて一貫した値を用意しておく。 */
  warnRingClass: string;
}

/** テーマごとの見た目/既定演出の一覧。新しいテーマを足すときはCharacterAnnouncementTheme型と
 *  ここに1エントリ足すだけでよい(characterStyle.tsのCHARACTER_PLACEHOLDER_STYLEと同じパターン)。 */
export const CHARACTER_ANNOUNCER_THEME_STYLE: Record<CharacterAnnouncementTheme, CharacterAnnouncerThemeStyle> = {
  normal: {
    accentBorderClass: "border-t-slate-300 dark:border-t-slate-600",
    accentTextClass: "text-amber-500",
    defaultEffect: {},
    warnRingClass: "border-slate-400",
  },
  celebratory: {
    accentBorderClass: "border-t-amber-400",
    accentTextClass: "text-amber-500",
    defaultEffect: { confetti: true, sparkle: true },
    warnRingClass: "border-amber-400",
  },
  warning: {
    accentBorderClass: "border-t-orange-400",
    accentTextClass: "text-orange-500",
    defaultEffect: { warnRing: true },
    // 既存のwarnRing色(appeared/handoff/通常進化のtransformが使う)を1文字も変えていない。
    warnRingClass: "border-orange-400",
  },
  negative: {
    accentBorderClass: "border-t-rose-400",
    accentTextClass: "text-rose-500",
    defaultEffect: { shakeOnHighlight: true },
    // Polish Phase P1 S-3f-3: 最終形態変身のwarnRingをローズ系にし、warningテーマ(オレンジ)と
    // 明確に区別する。
    warnRingClass: "border-rose-400",
  },
};

/** テーマに応じたwarnRingの枠色クラスを返す(AnnouncerEffectLayer.tsxが参照)。 */
export function resolveWarnRingClass(theme: CharacterAnnouncementTheme): string {
  return CHARACTER_ANNOUNCER_THEME_STYLE[theme].warnRingClass;
}

/** テーマの既定演出とCharacterAnnouncement.effect(個別フラグ)をマージする。
 *  例: celebratoryのまま effect: { confetti: false } を渡すとキラキラだけ残せる。 */
export function resolveAnnouncerEffect(
  theme: CharacterAnnouncementTheme,
  override?: AnnouncerEffectConfig
): AnnouncerEffectConfig {
  return { ...CHARACTER_ANNOUNCER_THEME_STYLE[theme].defaultEffect, ...override };
}
