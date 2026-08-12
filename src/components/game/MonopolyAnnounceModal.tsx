"use client";

import type { MonopolyAchievement } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface MonopolyAnnounceModalProps {
  achievement: MonopolyAchievement;
  onDismiss: () => void;
}

/**
 * 地域完全独占(kind:"region")の瞬間だけ表示するnavi演出。既存のMonopolyAchievement
 * (gameStore.tsのbuyProperty()が既に確定させたkind/name/multiplier)から組み立てるだけの
 * アダプターで、ArrivalModal等と同じ構成。グループ独占(kind:"group")はここでは扱わず、
 * 従来どおりMonopolyToast(非ブロッキング)が担当する(GameScreen.tsx側でkindによって
 * 出し分ける)。
 *
 * このコンポーネント自身はmoney/所有物件/収益倍率を一切計算・変更しない。表示する数値
 * (multiplier)もbuyProperty()がPROPERTY_REVENUE_CONFIGから確定させた値をそのまま出すだけ。
 */
function buildAnnouncement(achievement: MonopolyAchievement): CharacterAnnouncement {
  return {
    characterId: "navi",
    expression: "surprised",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    theme: "celebratory",
    lines: [
      { text: "うわあ、これは…!", expression: "surprised" },
      { text: `${achievement.name}エリアを完全独占しました!`, expression: "happy" },
      { text: `物件収益が${achievement.multiplier}倍になります!`, expression: "happy" },
    ],
  };
}

export function MonopolyAnnounceModal({ achievement, onDismiss }: MonopolyAnnounceModalProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(achievement)} onComplete={onDismiss} />;
}
