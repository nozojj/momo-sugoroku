"use client";

import type { TroubleCharacterAnnounceInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { getTroubleCharacterFormDef } from "@/lib/game/troubleCharacter";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface TroubleCharacterAnnounceModalProps {
  info: TroubleCharacterAnnounceInfo;
  onDismiss: () => void;
}

/** 妨害キャラ(仮称)専用のキャラクターID。CHARACTER_ASSET_URLSに未登録のため、
 *  CharacterSpriteが自動的に絵文字プレースホルダー(😟の灰色丸)にフォールバックする。
 *  正式なキャラクター名・アセットは別フェーズで用意する(MVPでは仮アイコン・仮名称のまま)。 */
const TROUBLE_CHARACTER_ID = "troubleChar";

/** 妨害キャラの登場/所有者交代/悪さ発生/変身を、monopolyAchievement/yearEventAnnounceInfoと同じ
 *  「statusとは独立した一時通知」として表示するアダプター。既存のCharacterAnnouncerをそのまま使い、
 *  新しい演出コンポーネントは作らない。4種類(kind)をここで出し分けるだけで、ゲームの状態遷移
 *  (GameStatus)には一切関与しない。
 *
 *  switch文にしてTypeScriptの網羅性チェックに乗せている(Polish Phase P1 S-3f-2で"transform"を
 *  追加する際、以前のif/if/else最終フォールバック方式だと新kind追加を静かに握りつぶしかねない
 *  ため)。将来さらにkindを増やす場合も、ここでcaseを1つ足し忘れるとコンパイルエラーになる。 */
function buildAnnouncement(info: TroubleCharacterAnnounceInfo): CharacterAnnouncement {
  switch (info.kind) {
    case "appeared":
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

    case "handoff":
      return {
        characterId: TROUBLE_CHARACTER_ID,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: "warning",
        lines: [{ text: `妨害キャラが${info.fromPlayerName}さんから${info.toPlayerName}さんへ移った!`, expression: "troubled" }],
      };

    case "mischief":
      return {
        characterId: TROUBLE_CHARACTER_ID,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: "negative",
        lines: [{ text: `${info.playerName}さん: ${info.message}`, expression: "troubled" }],
      };

    case "transform": {
      // 変身前後の表示名・変身後characterIdはdata/troubleCharacterForms.tsから導出する
      // (TroubleCharacterAnnounceInfo側には重複保持しない、types/game.tsのコメント参照)。
      // toFormDefが万一見つからない(理論上到達しない防御)場合は、既存のTROUBLE_CHARACTER_ID/
      // 汎用名へフォールバックする。
      const fromDisplayName = getTroubleCharacterFormDef(info.fromFormId)?.displayName ?? "妨害キャラ";
      const toFormDef = getTroubleCharacterFormDef(info.toFormId);
      const toCharacterId = toFormDef?.characterId ?? TROUBLE_CHARACTER_ID;
      const toDisplayName = toFormDef?.displayName ?? "妨害キャラ";
      // これ以上の進化先を持たない(=transformが無い)形態への変身を「最終形態」とみなし、
      // sake→seagullKingのような最終変身をnormal→sakeより明確に強い演出にする。新テーマは
      // 追加せず、既存のnegativeテーマ(shakeOnHighlight既定)にwarnRingを重ねるだけに留める
      // (既存effect flagの組み合わせの範囲内、S-3f-2の設計制約)。
      const isFinalForm = !toFormDef?.transform;

      return {
        characterId: toCharacterId,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: isFinalForm ? "negative" : "warning",
        ...(isFinalForm ? { effect: { warnRing: true } } : {}),
        lines: [
          { text: isFinalForm ? "な、なんだこの気配は……!" : "ん……? 様子がおかしいぞ……" },
          { text: `${fromDisplayName}が ${toDisplayName} に変身した!`, expression: "troubled" },
        ],
      };
    }
  }
}

export function TroubleCharacterAnnounceModal({ info, onDismiss }: TroubleCharacterAnnounceModalProps) {
  // kindごとにkeyを分けることで、troubleCharacterAnnounceInfoがnullを経由せず直接別のkindへ
  // 差し替わった場合(S-3f-2: transformを閉じた瞬間、保留中のmischiefへ即座に切り替わるケース)
  // でもCharacterAnnouncerを強制的に再マウントし、phase("entering"→"line"→"exiting")や
  // completedRefが前の演出の状態を引き継いでしまわないようにする。appeared/handoff/mischief
  // 単独発生時は従来通り一度nullを経由してから新しい通知が来るため、この挙動に影響しない。
  return <CharacterAnnouncer key={info.kind} announcement={buildAnnouncement(info)} onComplete={onDismiss} />;
}
