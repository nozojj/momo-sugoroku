"use client";

import type { CardWarpInfo, WarpEffect } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { getCardDef } from "@/data/cards";
import { WARP_ANNOUNCE_THEME } from "@/lib/game/warpEffects";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface WarpAnnounceModalProps {
  info: CardWarpInfo;
  onContinue: () => void;
}

/** 既存のCardWarpInfo(gameStoreが使用時点で確定させたカード・プレイヤー名)から、
 *  ワープ発動アナウンス用のCharacterAnnouncementを組み立てるアダプター。ArrivalModalと同じ構成。
 *
 *  カードの種別によって行き先を明かすかどうかを分ける:
 *  - warp(ランダム): 行き先(targetNodeName)はここでは一切出さない。種明かしはこの後の
 *    cardWarpFocus(カメラ演出)の役割にする(演出と結果の分離)。
 *  - targetSelect(場所指定): プレイヤーが自分で選んだ行き先なので隠す意味が無く、
 *    むしろ選んだ場所を確認する演出にする(行き先を出し、テーマは常にnormal)。
 *  CardWarpInfo自体はドメインデータのみでCharacterAnnouncer固有の設定を持たないため、
 *  種別・テーマはここでカード定義から毎回引き直す。 */
function buildAnnouncement(info: CardWarpInfo): CharacterAnnouncement {
  const def = getCardDef(info.cardId);
  const effect = def?.effect;

  if (effect && typeof effect === "object" && effect.type === "targetSelect") {
    return {
      characterId: "navi",
      expression: "normal",
      enterDirection: "right",
      side: "right",
      animationType: "slide",
      theme: "normal",
      lines: [
        { text: `${info.playerName}さんが「${info.cardName}」を使った!`, expression: "normal" },
        { text: `「${info.targetNodeName}」へ向けて出発!`, expression: "happy" },
      ],
    };
  }

  const scope = effect && typeof effect === "object" && effect.type === "warp" ? (effect as WarpEffect).scope : "anywhere";
  const theme = WARP_ANNOUNCE_THEME[scope];
  const isWarning = theme === "warning";

  return {
    characterId: "navi",
    expression: isWarning ? "surprised" : "normal",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    theme,
    lines: [
      { text: `${info.playerName}さんが「${info.cardName}」を使った!`, expression: isWarning ? "surprised" : "normal" },
      {
        text: isWarning ? "どこに飛ばされるか…!?" : "ワープ発動!",
        expression: isWarning ? "troubled" : "happy",
      },
    ],
  };
}

export function WarpAnnounceModal({ info, onContinue }: WarpAnnounceModalProps) {
  return <CharacterAnnouncer announcement={buildAnnouncement(info)} onComplete={onContinue} />;
}
