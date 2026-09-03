"use client";

import { useEffect } from "react";
import type { TroubleCharacterAnnounceInfo } from "@/types/game";
import type { CharacterAnnouncement, CharacterLineHighlight } from "@/types/characterAnnouncer";
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

    case "mischief": {
      // highlight(Polish Phase P1 S-3f-4で金額系、S-3f-5で非金額系のtextに拡張):
      // gameStore.ts側で既に確定済みの実被害(info.highlightAmount/highlightText、
      // troubleCharacter.tsのderiveMischiefAnnounceHighlight()参照)をCharacterLine.highlightへ
      // そのまま渡す(ここでは再計算しない)。DestinationCelebrationScreen.tsxの到着ボーナス
      // 表示と同じ、既存のhighlight機構をそのまま再利用しているだけで、演出コンポーネント
      // 自体は追加していない。同じ1行にhighlightを載せる(行を増やさない)ことで、
      // highlightHoldExtraMs分だけ保持時間が伸びる以外はテンポに影響しない。
      // amount/textのどちらも無い(undefined)場合はhighlightフィールド自体を付けない
      // (S-3f-4/S-3f-5のいずれでも、debuffや非heavyのpropertyLoss/cardDestroyはhighlight無しの
      // まま=既存のLIGHT/MEDIUM演出を1つも変えない)。
      const highlight: CharacterLineHighlight | undefined =
        info.highlightAmount !== undefined
          ? { kind: "money", amount: info.highlightAmount }
          : info.highlightText !== undefined
            ? { kind: "text", text: info.highlightText }
            : undefined;
      // isHeavy(Polish Phase P1 S-3f-5): severity省略時(S-3f-4以前のテスト等)はfalse扱いにし、
      // 従来通りheavy専用の演出(impactFlash・heavy SE)を一切追加しない。impactFlashは
      // S-3f-3で追加した既存effectをそのまま再利用するだけで、新しいCSS effectは増やさない。
      // negativeテーマの既定演出(shakeOnHighlight)はeffectを個別指定してもresolveAnnouncerEffect()
      // がマージするため、ここでimpactFlashだけ足してもshakeOnHighlightは維持される。warnRingは
      // 追加しない(ループが長く、毎ターン発生しうるmischiefには過剰なため)。
      const isHeavy = info.severity === "heavy";
      return {
        characterId: TROUBLE_CHARACTER_ID,
        expression: "troubled",
        enterDirection: "bottom",
        side: "left",
        animationType: "slide",
        theme: "negative",
        ...(isHeavy ? { effect: { impactFlash: true } } : {}),
        lines: [
          {
            text: `${info.playerName}さん: ${info.message}`,
            expression: "troubled",
            ...(highlight ? { highlight } : {}),
          },
        ],
      };
    }

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
      // Polish Phase P1 S-3f-5: severity==="heavy"のときだけtrouble_mischief_heavyを鳴らし、
      // それ以外(severity省略時のlight相当を含む)は従来通りtrouble_mischiefのまま。
      // if/elseの一方だけが必ず実行されるため、同じmischief通知でtrouble_mischiefと
      // trouble_mischief_heavyが二重に鳴ることはない。
      playSE(info.severity === "heavy" ? "trouble_mischief_heavy" : "trouble_mischief");
    }
  }, [info]);

  // kindごとにkeyを分けることで、troubleCharacterAnnounceInfoがnullを経由せず直接別のkindへ
  // 差し替わった場合(S-3f-2: transformを閉じた瞬間、保留中のmischiefへ即座に切り替わるケース)
  // でもCharacterAnnouncerを強制的に再マウントし、phase("entering"→"line"→"exiting")や
  // completedRefが前の演出の状態を引き継いでしまわないようにする。appeared/handoff/mischief
  // 単独発生時は従来通り一度nullを経由してから新しい通知が来るため、この挙動に影響しない。
  return <CharacterAnnouncer key={info.kind} announcement={buildAnnouncement(info)} onComplete={onDismiss} />;
}
