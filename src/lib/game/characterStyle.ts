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

/** characterIdごとのアセット登録。expression別画像に加え、そのキャラの表情差分が
 *  まだ揃っていない間に使う`default`(フォールバック)画像を持てる。
 *  CharacterSpriteの解決順序: ①指定expressionの画像 → ②そのcharacterIdのdefault画像
 *  → ③絵文字プレースホルダー。 */
type CharacterAssetEntry = Partial<Record<CharacterExpression, string>> & { default?: string };

/** 本番アセット(PNG/WebP等)への差し替え用。characterId→expression→画像URLで登録すると、
 *  CharacterSpriteはプレースホルダー絵文字の代わりにその画像を描画する。
 *  navi(湘南すごろく案内キャラ、momotetu-main-kyara.png基準)は現状happyのみ用意済みなので、
 *  defaultにも同じ画像を登録し、未実装のnormal/surprised/troubledはhappyで代用する。
 *  各表情の画像を追加したら、そのexpressionキーを登録するだけで自動的にそちらが優先される。 */
export const CHARACTER_ASSET_URLS: Partial<Record<string, CharacterAssetEntry>> = {
  navi: { default: "/characters/navi/happy.webp", happy: "/characters/navi/happy.webp" },
};
