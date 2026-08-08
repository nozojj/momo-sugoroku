/** キャラクターアナウンスシステムで使用可能なキャラクターの一覧(静的データ)。
 *  絵柄そのものはlib/game/characterStyle.tsが担当し、ここではidと表示名だけを管理する。 */
export interface CharacterDef {
  id: string;
  name: string;
}

export const characterDefs: CharacterDef[] = [{ id: "navi", name: "ナビキャラ" }];

export function getCharacterDef(id: string): CharacterDef | undefined {
  return characterDefs.find((c) => c.id === id);
}
