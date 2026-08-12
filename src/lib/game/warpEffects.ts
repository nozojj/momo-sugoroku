import type { CharacterAnnouncementTheme } from "@/types/characterAnnouncer";
import type { GameState, MapData, Player, WarpScope } from "@/types/game";
import { pickWarpTarget } from "./mapGraph";

/**
 * ぶっとび系カード(WarpEffect)のワープ先を種別ごとに解決するレジストリ。
 *
 * gameStore.tsのuseCard()は、ここで決まったtargetNodeIdをcardWarpInfoへ積むだけの薄い処理にする。
 * landingEffects.tsのLANDING_HANDLERSと同じ考え方: 新しいscopeを足すときはこのファイルに
 * 1エントリ足すだけでよい。
 */
export interface WarpTargetContext {
  state: GameState;
  map: MapData;
  player: Player;
}

export const WARP_HANDLERS: Record<WarpScope, (ctx: WarpTargetContext) => string> = {
  anywhere: (ctx) => pickWarpTarget(ctx.map, "anywhere", ctx.player.currentNodeId, ctx.player.cardIds),
  nearby: (ctx) => pickWarpTarget(ctx.map, "nearby", ctx.player.currentNodeId, ctx.player.cardIds),
  destination: (ctx) => ctx.state.destinationNodeId,
};

/**
 * ワープ発動直後(CharacterAnnouncer、まだ着地先は明かさない)のテーマ。scopeごとの静的な値で、
 * 実際に引いた着地結果(お金/カード/物件/目的地到着)には依存しない。
 *
 * 着地「後」の演出(celebratory/negative)は、resolveLanding()が返すLandingOutcome/
 * checkDestinationArrival()の結果を見て初めて決まるものなので、この関数とは意図的に分離してある。
 * 将来「着地結果に応じた振り返り演出」を追加する場合も、ここは変更せず、resolveLanding()の
 * 呼び出し元(gameStore.ts continueAfterCardWarpFocus())側に新しい分岐を1つ足すだけでよい。
 */
export const WARP_ANNOUNCE_THEME: Record<WarpScope, CharacterAnnouncementTheme> = {
  anywhere: "warning", // マップ全体のどこに飛ばされるか分からないハラハラ感
  nearby: "normal", // 近場なので落ち着いたトーン
  destination: "normal", // 行き先は確定しているが、この時点ではまだ明かさない(カメラ演出での種明かしを主役にする)
};
