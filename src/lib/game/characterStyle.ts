import type { CharacterExpression } from "@/types/characterAnnouncer";

/** 後から追加できる前提の表情一覧。新しい表情を足すときはCharacterExpression型と
 *  ここ(プレースホルダー定義)の両方に1エントリ足すだけでよい。 */
export const CHARACTER_EXPRESSIONS: CharacterExpression[] = ["normal", "happy", "surprised", "troubled"];

/** プレースホルダーの見た目定義(仮の絵文字アイコン)。本番アセットに差し替えるときは
 *  CHARACTER_ASSET_URLS に画像URLを追加するだけでよく、このファイル以外の変更は不要
 *  (buildingStyle.tsのBUILDING_STYLE/BUILDING_ASSET_URLSと同じパターン)。 */
export const CHARACTER_PLACEHOLDER_STYLE: Record<CharacterExpression, { emoji: string; bg: string }> = {
  normal: { emoji: "🙂", bg: "#fef3c7" },
  happy: { emoji: "😄", bg: "#fde68a" },
  surprised: { emoji: "😲", bg: "#bae6fd" },
  troubled: { emoji: "😟", bg: "#e5e7eb" },
};

/** 本番アセット(PNG/WebP等)への差し替え用。characterId→expression→画像URLで登録すると、
 *  CharacterSpriteはプレースホルダー絵文字の代わりにその画像を描画する。今は未登録(空)。 */
export const CHARACTER_ASSET_URLS: Partial<Record<string, Partial<Record<CharacterExpression, string>>>> = {};
