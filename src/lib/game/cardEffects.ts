import type { CardDef, CardEffect, CardEffectType, GameState, MultiDiceEffect, Player } from "@/types/game";

/**
 * 手札から使うカード(kind: "usable")の効果を種別ごとに解決するレジストリ。
 *
 * gameStore.tsの useCard() は、ここで決まったstatePatchをstateへ適用するだけの
 * 薄い処理にする。landingEffects.tsのLANDING_HANDLERSと同じ考え方: 新しい効果を
 * 足すときはこのファイルに1エントリ足すだけでよく、gameStore.ts側の分岐を増やす必要はない。
 * multiDiceは1つのハンドラを急行系カード全種で使い回し、diceCount/vehicleModeだけを
 * CardDef.effect側のパラメータで変える(data/cards.tsに1エントリ足すだけで新カードを作れる)。
 */
export interface CardEffectContext {
  state: GameState;
  player: Player;
  def: CardDef;
}

export interface CardEffectResult {
  /** setに渡すstateパッチ(players以外。playersはカード除去済みのものをgameStore側で別途反映する) */
  statePatch: Partial<GameState>;
  logMessage: string;
}

export type CardEffectHandler = (ctx: CardEffectContext) => CardEffectResult;

/** CardDef.effectの種別を取り出す。単純な効果(diceAgain/doubleMove)は文字列そのもの、
 *  パラメータを持つ効果(multiDice)は{type: "..."}オブジェクトなので、レジストリの
 *  キーとして扱えるよう正規化する。 */
type EffectKind = CardEffectType | "multiDice";
export function effectKind(effect: CardEffect): EffectKind {
  return typeof effect === "string" ? effect : effect.type;
}

/** サイコロの出目・移動量そのものを修飾する効果か(doubleMove/multiDice)。
 *  この種の効果は同時に2つ以上を予約できない(gameStore.tsのuseCard()が使用)。 */
export function isDiceModifierEffect(effect: CardEffect): boolean {
  return effect === "doubleMove" || (typeof effect === "object" && effect.type === "multiDice");
}

export const CARD_EFFECT_HANDLERS: Partial<Record<EffectKind, CardEffectHandler>> = {
  diceAgain: ({ player, def }) => ({
    statePatch: { extraRollGranted: true },
    logMessage: `${player.name}さんが「${def.name}」を使った! この手番の後、もう一度サイコロを振れる。`,
  }),

  doubleMove: ({ player, def }) => ({
    statePatch: { pendingDoubleMove: true },
    logMessage: `${player.name}さんが「${def.name}」を使った! 次の出目が2倍になる。`,
  }),

  multiDice: ({ player, def }) => {
    // このハンドラが呼ばれるのはeffectKind(def.effect)==="multiDice"のときだけなので、
    // def.effectは必ずMultiDiceEffect(オブジェクト形式)。
    const effect = def.effect as MultiDiceEffect;
    return {
      statePatch: { pendingDiceCount: effect.diceCount, activeVehicleMode: effect.vehicleMode },
      logMessage: `${player.name}さんが「${def.name}」を使った! 車が変身し、サイコロ${effect.diceCount}個で移動する!`,
    };
  },
};
