"use client";

import type { PropertyGenre, YearEventAnnounceInfo } from "@/types/game";
import type { CharacterAnnouncement, CharacterAnnouncementTheme, CharacterExpression } from "@/types/characterAnnouncer";
import { getYearEventDef } from "@/lib/game/yearEvent";
import { PROPERTY_GENRE_LABEL } from "@/lib/game/propertyDisplay";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface YearEventAnnounceModalProps {
  info: YearEventAnnounceInfo;
  onDismiss: () => void;
}

/** イベントidごとの演出テーマ。新しいyearEventDefsを追加したら1件足すだけでよい
 *  (未登録のidは"normal"扱いになる)。 */
const THEME_BY_EVENT_ID: Record<string, CharacterAnnouncementTheme> = {
  heatwave: "celebratory",
  tourismBoom: "celebratory",
  boomEconomy: "celebratory",
  coolSummer: "warning",
  typhoon: "warning",
  recession: "warning",
};

function expressionForTheme(theme: CharacterAnnouncementTheme): CharacterExpression {
  if (theme === "celebratory") return "happy";
  if (theme === "warning" || theme === "negative") return "troubled";
  return "normal";
}

/** ジャンル別倍率を「レジャー物件 +20% / 食 +5% / 農林水産 -5%」のような1行に整形する。
 *  genreMultipliersが空(平年)ならfallback(イベントのdescription)をそのまま使う。 */
function formatGenreMultiplierLine(genreMultipliers: Partial<Record<PropertyGenre, number>>, fallback: string): string {
  const entries = Object.entries(genreMultipliers) as [PropertyGenre, number][];
  if (entries.length === 0) return fallback;
  return entries
    .map(([genre, multiplier]) => {
      const percent = Math.round((multiplier - 1) * 100);
      const sign = percent > 0 ? "+" : "";
      return `${PROPERTY_GENRE_LABEL[genre]}物件 ${sign}${percent}%`;
    })
    .join(" / ");
}

/** 既存のSettlementIntroAnnouncer/MonopolyAnnounceModalと同じ構成のアダプター。
 *  info.eventIdがyearEventDefsに存在しない場合(旧セーブの想定外の値など)でも、
 *  "normal"にフォールバックして必ず表示できるようにする(yearEventDefsには"normal"を
 *  常に含めておく前提)。 */
function buildAnnouncement(info: YearEventAnnounceInfo): CharacterAnnouncement {
  const event = getYearEventDef(info.eventId) ?? getYearEventDef("normal")!;
  const theme = THEME_BY_EVENT_ID[event.id] ?? "normal";
  const expression = expressionForTheme(theme);

  return {
    characterId: "navi",
    expression: "normal",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    theme,
    lines: [
      { text: `${info.year}年目が始まります!`, expression: "normal" },
      { text: `${event.icon} 今年の湘南は「${event.label}」!`, expression },
      { text: formatGenreMultiplierLine(event.genreMultipliers, event.description), expression },
    ],
  };
}

export function YearEventAnnounceModal({ info, onDismiss }: YearEventAnnounceModalProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(info)} onComplete={onDismiss} />;
}
