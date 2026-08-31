import type { TroubleCharacterFormDef, TroubleCharacterTransformStep } from "@/types/game";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";
import { troubleCharacterMischiefSakeDefs } from "@/data/troubleCharacterMischiefSake";
import { troubleCharacterMischiefSeagullKingDefs } from "@/data/troubleCharacterMischiefSeagullKing";

/**
 * 妨害キャラの形態(フォーム)定義一覧(Polish Phase P1 S-3e)。normal(通常形態)→
 * sake(酒モンスター)→seagullKing(カモメ魔王、最終形態)の3形態が正式に揃った。
 *
 * mischiefPoolはそれぞれ既存のtroubleCharacterMischiefDefs(normal、trouble_money_pinch/
 * trouble_debuff_halve/trouble_debuff_skip、weight 40/40/20、1件も変更していない)・
 * troubleCharacterMischiefSakeDefs(sake)・troubleCharacterMischiefSeagullKingDefs
 * (seagullKing、詳細はそれぞれのファイル参照)をそのまま参照する。値を複製せずここから
 * 直接参照することで、①抽選確率・効果・メッセージが1文字も変わらないことを型レベルで
 * 保証し、②既存のtroubleCharacterMischiefDefsエクスポート・それを直接参照する既存テスト
 * (troubleCharacter.test.ts)との互換性もそのまま保てる。
 *
 * characterId: "troubleChar"(normal)/"troubleChar_sake"(sake)/"troubleChar_seagullKing"
 * (seagullKing)は、いずれもCHARACTER_ASSET_URLSに未登録のため、CharacterSpriteは引き続き
 * 絵文字プレースホルダーへフォールバックする(S-3eでも見た目を一切変更しない。本番アート
 * 登録はS-3f以降)。
 *
 * NORMAL_TO_SAKE_STEPS: normal→sakeの正式な変身確率段階表(count 3=20%〜7=100%)。
 * minProgressRatioは付けない(ゲーム序盤でも、同じプレイヤーが長く持ち続ければ変身しうる)。
 * SAKE_TO_SEAGULL_KING_STEPS: sake→seagullKingの正式な変身確率段階表(count 3=10%〜8=100%)。
 * minProgressRatio: 0.7を付け、ゲーム進行度70%以上でのみ変身可能にする(1年/3年/5年ゲームの
 * どれでも「終盤の大事件」として機能させるため)。seagullKing自身はtransformを持たない
 * (最終形態、進化の終点)。
 */
const NORMAL_TO_SAKE_STEPS: TroubleCharacterTransformStep[] = [
  { atCount: 3, probability: 0.2 },
  { atCount: 4, probability: 0.4 },
  { atCount: 5, probability: 0.6 },
  { atCount: 6, probability: 0.8 },
  { atCount: 7, probability: 1 },
];

const SAKE_TO_SEAGULL_KING_STEPS: TroubleCharacterTransformStep[] = [
  { atCount: 3, probability: 0.1 },
  { atCount: 4, probability: 0.2 },
  { atCount: 5, probability: 0.35 },
  { atCount: 6, probability: 0.5 },
  { atCount: 7, probability: 0.75 },
  { atCount: 8, probability: 1 },
];

export const troubleCharacterFormDefs: TroubleCharacterFormDef[] = [
  {
    id: "normal",
    displayName: "妨害キャラ",
    characterId: "troubleChar",
    mischiefPool: troubleCharacterMischiefDefs,
    transform: {
      targetFormId: "sake",
      probabilitySteps: NORMAL_TO_SAKE_STEPS,
    },
  },
  {
    id: "sake",
    displayName: "酒モンスター",
    characterId: "troubleChar_sake",
    mischiefPool: troubleCharacterMischiefSakeDefs,
    transform: {
      targetFormId: "seagullKing",
      minProgressRatio: 0.7,
      probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
    },
  },
  {
    id: "seagullKing",
    displayName: "カモメ魔王",
    characterId: "troubleChar_seagullKing",
    mischiefPool: troubleCharacterMischiefSeagullKingDefs,
    // transformは意図的に省略: 最終形態のため、これ以上の進化先を持たない
    // (decideTroubleCharacterTransform()はtransformが無い形態を常に進化の終点として扱う)。
  },
];
