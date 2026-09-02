"use client";

import { useEffect } from "react";
import type { TroubleCharacterAnnounceInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { getTroubleCharacterFormDef, isFinalTroubleCharacterForm } from "@/lib/game/troubleCharacter";
import { playSE } from "@/lib/audio/soundManager";
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
      // highlightAmount(Polish Phase P1 S-3f-4): money/moneyNearby種別のmischiefのみ、
      // gameStore.ts側で既に確定済みの被害額(info.highlightAmount、troubleCharacter.tsの
      // mischiefHighlightAmount()参照)をCharacterLine.highlightへそのまま渡す(ここでは
      // 再計算しない)。DestinationCelebrationScreen.tsxの到着ボーナス表示と同じ、既存の
      // highlight機構をそのまま再利用しているだけで、演出コンポーネント自体は追加していない。
      // 同じ1行にhighlightを載せる(行を増やさない)ことで、highlightHoldExtraMs分だけ
      // 保持時間が伸びる以外はテンポに影響しない。debuff/propertyLoss/cardDestroy等
      // highlightAmountが無い(undefined)種別は、highlightフィールド自体を付けない
      // (S-3f-4のスコープは金額系mischiefの底上げのみ、非金額mischiefの演出強化はS-3f-5候補)。
      return {
        characterId: TROUBLE_CHARACTER_ID,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: "negative",
        lines: [
          {
            text: `${info.playerName}さん: ${info.message}`,
            expression: "troubled",
            ...(info.highlightAmount !== undefined ? { highlight: { amount: info.highlightAmount } } : {}),
          },
        ],
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
      // sake→seagullKingのような最終変身をnormal→sakeより明確に強い演出にする(Polish Phase
      // P1 S-3f-3でisFinalTroubleCharacterForm()へ切り出し。"seagullKing"という具体的な
      // formId文字列には一切依存しない)。最終形態はwarnRingに加えてimpactFlash(一瞬の閃光、
      // AnnouncerEffectLayer.tsx参照)を重ね、通常進化(warnRingのみ)より明確に強い演出にする。
      const isFinalForm = isFinalTroubleCharacterForm(info.toFormId);

      return {
        characterId: toCharacterId,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: isFinalForm ? "negative" : "warning",
        ...(isFinalForm ? { effect: { warnRing: true, impactFlash: true } } : {}),
        lines: [
          { text: isFinalForm ? "な、なんだこの気配は……!" : "ん……? 様子がおかしいぞ……" },
          { text: `${fromDisplayName}が ${toDisplayName} に変身した!`, expression: "troubled" },
        ],
      };
    }
  }
}

export function TroubleCharacterAnnounceModal({ info, onDismiss }: TroubleCharacterAnnounceModalProps) {
  // 変身SE(Polish Phase P1 S-3f-3)+悪さSE(Polish Phase P1 S-3f-4)。MonopolyAnnounceModal.tsxと
  // 同じ「マウント/依存値変化時に直接playSE()」パターンで、gameStore.tsからは呼ばない
  // (soundManager.tsの方針)。
  //
  // 依存配列を[info]にする(kindやtoFormIdだけでなく、objectそのもの)ことで、gameStore.ts側が
  // 新しいtroubleCharacterAnnounceInfoをset()するたび(=新しい変身/mischief/appeared/handoffが
  // 発生するたび)にだけ実行され、無関係な再レンダーでは再実行されない。これはS-3f-2で追加された
  // 「transform→mischief切り替え時、troubleCharacterAnnounceInfoがnullを経由せず直接次のkindへ
  // 差し替わる」経路(gameStore.ts参照)でも、infoの参照が変わるため正しく検知できる
  // (transform→mischiefの直接切り替えでは、この1つのuseEffectがinfo変化のたびに再実行され、
  // 1回目はtransform分岐でtrouble_transform(_final)を、2回目はmischief分岐でtrouble_mischiefを
  // それぞれ1回ずつ鳴らす。グローバルなフラグ等の追加状態管理は持たない)。
  //
  // kind:"appeared"/"handoff"では何も鳴らさない(S-3f-4のスコープ外、既存の無音のまま)。
  //
  // React StrictMode(開発モードのみ)によるeffectの二重実行はsoundManager.tsの
  // isDuplicateWithinSameTick()が既に吸収するため、ここでは追加のガードを持たない
  // (MonopolyAnnounceModal.tsxと同じ)。
  useEffect(() => {
    if (info.kind === "transform") {
      playSE(isFinalTroubleCharacterForm(info.toFormId) ? "trouble_transform_final" : "trouble_transform");
      return;
    }
    if (info.kind === "mischief") {
      playSE("trouble_mischief");
    }
  }, [info]);

  // kindごとにkeyを分けることで、troubleCharacterAnnounceInfoがnullを経由せず直接別のkindへ
  // 差し替わった場合(S-3f-2: transformを閉じた瞬間、保留中のmischiefへ即座に切り替わるケース)
  // でもCharacterAnnouncerを強制的に再マウントし、phase("entering"→"line"→"exiting")や
  // completedRefが前の演出の状態を引き継いでしまわないようにする。appeared/handoff/mischief
  // 単独発生時は従来通り一度nullを経由してから新しい通知が来るため、この挙動に影響しない。
  return <CharacterAnnouncer key={info.kind} announcement={buildAnnouncement(info)} onComplete={onDismiss} />;
}
