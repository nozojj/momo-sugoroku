import type { TroubleCharacterFormDef } from "@/types/game";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";

/**
 * 妨害キャラの形態(フォーム)定義一覧(Polish Phase P1 S-3b)。S-3aで追加した
 * TroubleCharacterFormDef型の実データ。現時点では"normal"(通常形態)の1件のみで、酒モンスター・
 * カモメ魔王等はまだ追加しない(それらはS-3d/S-3e以降)。
 *
 * mischiefPoolは既存のtroubleCharacterMischiefDefs(data/troubleCharacterMischief.ts、
 * trouble_money_pinch/trouble_debuff_halve/trouble_debuff_skip、weight 40/40/20)を
 * そのまま参照する。値を複製せずここから直接参照することで、①抽選確率・効果・メッセージが
 * 1文字も変わらないことを型レベルで保証し、②既存のtroubleCharacterMischiefDefsエクスポート・
 * それを直接参照する既存テスト(troubleCharacter.test.ts)との互換性もそのまま保てる。
 *
 * characterId: "troubleChar"は、TroubleCharacterAnnounceModal.tsxが元々ハードコードしていた
 * プレースホルダー用の仮IDをそのまま踏襲する(CHARACTER_ASSET_URLSに未登録のため、
 * CharacterSpriteは引き続き絵文字プレースホルダーへフォールバックする。S-3cでも見た目を
 * 一切変更しない)。
 *
 * S-3c: 正式仕様として「normal→sake→seagullKing」の直線進化+確率段階表(transform)が
 * 決まったが、sake/seagullKingの実データはまだ追加しない(S-3d/S-3e以降)。そのため
 * normalの`transform`フィールドは意図的に省略している=このデータからは絶対に変身が
 * 発生しない(decideTroubleCharacterTransform()はtransformが無い形態を進化の終点として
 * 常に{transformed:false}を返す)。バランス値(count 3=20%〜7=100%等)はlib/game/
 * troubleCharacter.test.tsの合成データとしてのみ先行して検証している。
 */
export const troubleCharacterFormDefs: TroubleCharacterFormDef[] = [
  {
    id: "normal",
    displayName: "妨害キャラ",
    characterId: "troubleChar",
    mischiefPool: troubleCharacterMischiefDefs,
  },
];
