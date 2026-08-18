"use client";

import type { TroubleCharacterAnnounceInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface TroubleCharacterAnnounceModalProps {
  info: TroubleCharacterAnnounceInfo;
  onDismiss: () => void;
}

/** 妨害キャラ(仮称)専用のキャラクターID。CHARACTER_ASSET_URLSに未登録のため、
 *  CharacterSpriteが自動的に絵文字プレースホルダー(😟の灰色丸)にフォールバックする。
 *  正式なキャラクター名・アセットは別フェーズで用意する(MVPでは仮アイコン・仮名称のまま)。 */
const TROUBLE_CHARACTER_ID = "troubleChar";

/** 妨害キャラの登場/所有者交代/悪さ発生を、monopolyAchievement/yearEventAnnounceInfoと同じ
 *  「statusとは独立した一時通知」として表示するアダプター。既存のCharacterAnnouncerをそのまま使い、
 *  新しい演出コンポーネントは作らない。3種類(kind)をここで出し分けるだけで、ゲームの状態遷移
 *  (GameStatus)には一切関与しない。 */
function buildAnnouncement(info: TroubleCharacterAnnounceInfo): CharacterAnnouncement {
  if (info.kind === "appeared") {
    return {
      characterId: TROUBLE_CHARACTER_ID,
      expression: "troubled",
      enterDirection: "bottom",
      side: "left",
      animationType: "slide",
      theme: "warning",
      lines: [
        { text: "……フフフ。" },
        { text: `妨害キャラが現れた! ${info.ownerName}さんに取り憑いた!`, expression: "troubled" },
      ],
    };
  }

  if (info.kind === "handoff") {
    return {
      characterId: TROUBLE_CHARACTER_ID,
      expression: "troubled",
      enterDirection: "bottom",
      side: "left",
      animationType: "slide",
      theme: "warning",
      lines: [{ text: `妨害キャラが${info.fromPlayerName}さんから${info.toPlayerName}さんへ移った!`, expression: "troubled" }],
    };
  }

  return {
    characterId: TROUBLE_CHARACTER_ID,
    expression: "troubled",
    enterDirection: "bottom",
    side: "left",
    animationType: "slide",
    theme: "negative",
    lines: [{ text: `${info.playerName}さん: ${info.message}`, expression: "troubled" }],
  };
}

export function TroubleCharacterAnnounceModal({ info, onDismiss }: TroubleCharacterAnnounceModalProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(info)} onComplete={onDismiss} />;
}
