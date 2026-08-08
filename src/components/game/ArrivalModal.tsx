"use client";

import type { ArrivalInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface ArrivalModalProps {
  arrivalInfo: ArrivalInfo;
  onContinue: () => void;
}

/** 既存のArrivalInfo(到着金・次の目的地など、gameStore.tsが既に確定させた結果)から、
 *  キャラクターアナウンス用の演出データを組み立てるアダプター。ゲームロジック側には一切触れない。 */
function buildAnnouncement(info: ArrivalInfo): CharacterAnnouncement {
  return {
    characterId: "navi",
    expression: "happy",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    lines: [
      { text: "おめでとうございます!", expression: "happy" },
      { text: `${info.playerName}さんが「${info.destinationName}」に一番乗りです!`, expression: "surprised" },
      { text: "到着ボーナス!", expression: "happy", highlight: { amount: info.bonus } },
      { text: `次の目的地は「${info.nextDestinationName}」`, expression: "normal" },
    ],
  };
}

export function ArrivalModal({ arrivalInfo, onContinue }: ArrivalModalProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(arrivalInfo)} onComplete={onContinue} />;
}
