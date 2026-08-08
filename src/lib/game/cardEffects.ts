import type { CardDef, CardEffectType, GameState, Player } from "@/types/game";

/**
 * 手札から使うカード(kind: "usable")の効果を種別ごとに解決するレジストリ。
 *
 * gameStore.tsの useCard() は、ここで決まったstatePatchをstateへ適用するだけの
 * 薄い処理にする。landingEffects.tsのLANDING_HANDLERSと同じ考え方: 新しい効果を
 * 足すときはこのファイルに1エントリ足すだけでよく、gameStore.ts側の分岐を増やす必要はない。
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

export const CARD_EFFECT_HANDLERS: Partial<Record<CardEffectType, CardEffectHandler>> = {
  diceAgain: ({ player, def }) => ({
    statePatch: { extraRollGranted: true },
    logMessage: `${player.name}さんが「${def.name}」を使った! この手番の後、もう一度サイコロを振れる。`,
  }),

  doubleMove: ({ player, def }) => ({
    statePatch: { pendingDoubleMove: true },
    logMessage: `${player.name}さんが「${def.name}」を使った! 次の出目が2倍になる。`,
  }),
};
