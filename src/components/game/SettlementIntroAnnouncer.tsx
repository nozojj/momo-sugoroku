"use client";

import type { SettlementInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface SettlementIntroAnnouncerProps {
  info: SettlementInfo;
  onContinue: () => void;
}

/** 既存のSettlementInfo(gameStoreが既に確定させた決算結果)から、決算「導入」演出用の
 *  CharacterAnnouncement を組み立てるアダプター。金額の内訳はここでは出さず、SettlementScreen側の
 *  役割にする(演出と計算/詳細表示を分離する)。ArrivalModalと同じ構成。 */
function buildAnnouncement(info: SettlementInfo): CharacterAnnouncement {
  return {
    characterId: "navi",
    expression: "normal",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    theme: "normal",
    lines: [
      { text: `${info.year}年目の決算です!`, expression: "normal" },
      { text: "今年の資産の変動を確認しましょう", expression: "happy" },
    ],
  };
}

export function SettlementIntroAnnouncer({ info, onContinue }: SettlementIntroAnnouncerProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(info)} onComplete={onContinue} />;
}
