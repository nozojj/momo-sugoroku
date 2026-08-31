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
 * CharacterSpriteは引き続き絵文字プレースホルダーへフォールバックする。S-3bでは見た目を
 * 一切変更しない)。
 *
 * weight/minTurnはまだどこからも参照されない(形態変化抽選の導入はS-3c以降)。将来の複数形態
 * 抽選のための静的データとして先行して持たせているだけで、この2つの値自体は今回の挙動に
 * 一切影響しない。weight:100は「今のところ形態がこれ1つしかない」ことを表すだけの仮値。
 */
export const troubleCharacterFormDefs: TroubleCharacterFormDef[] = [
  {
    id: "normal",
    displayName: "妨害キャラ",
    characterId: "troubleChar",
    weight: 100,
    mischiefPool: troubleCharacterMischiefDefs,
  },
];
