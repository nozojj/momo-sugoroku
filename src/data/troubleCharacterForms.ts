import type { TroubleCharacterFormDef, TroubleCharacterTransformStep } from "@/types/game";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";
import { troubleCharacterMischiefSakeDefs } from "@/data/troubleCharacterMischiefSake";

/**
 * 妨害キャラの形態(フォーム)定義一覧(Polish Phase P1 S-3d)。normal(通常形態)に加え、
 * sake(酒モンスター)を正式追加した。カモメ魔王(seagullKing)の実データはまだ追加しない
 * (S-3e以降)。
 *
 * mischiefPoolはそれぞれ既存のtroubleCharacterMischiefDefs(normal、trouble_money_pinch/
 * trouble_debuff_halve/trouble_debuff_skip、weight 40/40/20、1件も変更していない)・
 * troubleCharacterMischiefSakeDefs(sake、詳細はそちらのファイル参照)をそのまま参照する。
 * 値を複製せずここから直接参照することで、①抽選確率・効果・メッセージが1文字も変わらない
 * ことを型レベルで保証し、②既存のtroubleCharacterMischiefDefsエクスポート・それを直接参照
 * する既存テスト(troubleCharacter.test.ts)との互換性もそのまま保てる。
 *
 * characterId: "troubleChar"(normal)/"troubleChar_sake"(sake)は、いずれも
 * CHARACTER_ASSET_URLSに未登録のため、CharacterSpriteは引き続き絵文字プレースホルダーへ
 * フォールバックする(S-3dでは見た目を一切変更しない。本番アート登録はS-3f/S-3g以降)。
 *
 * NORMAL_TO_SAKE_STEPS: normal→sakeの正式な変身確率段階表(count 3=20%〜7=100%)。
 * minProgressRatioは付けない(ゲーム序盤でも、同じプレイヤーが長く持ち続ければ変身しうる)。
 * カモメ魔王(seagullKing)向けのバランス値はlib/game/troubleCharacter.test.tsの合成データ
 * としてのみ先行して検証しており、sake側にはまだtransformを追加しない(=sakeは現時点で
 * 進化の終点として振る舞う)。
 */
const NORMAL_TO_SAKE_STEPS: TroubleCharacterTransformStep[] = [
  { atCount: 3, probability: 0.2 },
  { atCount: 4, probability: 0.4 },
  { atCount: 5, probability: 0.6 },
  { atCount: 6, probability: 0.8 },
  { atCount: 7, probability: 1 },
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
    // transformは意図的に省略: カモメ魔王(seagullKing)の実データはS-3e以降で追加するため、
    // S-3d時点ではsakeは進化の終点として振る舞う(decideTroubleCharacterTransform()参照)。
  },
];
