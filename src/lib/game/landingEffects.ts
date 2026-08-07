import type { GameState, MapData, MapNode, MoneyEventDef, MoneyRouletteInfo, NodeType, Player } from "@/types/game";
import { getPropertyDef } from "@/data/properties";
import { drawableCardIds, getCardDef } from "@/data/cards";
import { moneyEventPool, localEventPool, drawFromPool } from "@/data/events";
import { getCalendar } from "@/lib/game/engine";
import { seasonalBaseAmount, generateRouletteCandidates, drawRouletteResult } from "@/lib/game/moneyRoulette";

/**
 * マスに止まったときの効果を種別ごとに解決するレジストリ。
 *
 * gameStore.tsの resolveLanding() は、ここで決まった LandingOutcome をstateへ
 * 適用するだけの薄い処理にする。新しいマス種別を足すときは、この
 * ファイルに1エントリ足すだけでよく、gameStore.ts側の分岐を増やす必要はない。
 *
 * 将来の拡張はハンドラの中身だけで完結する想定:
 *   - 季節による金額変動: ctx.state.turn を getCalendar() に通して判定(moneyGain/moneyLossで導入済み)
 *   - 地域限定イベント: ctx.node.area で抽選プールを出し分け
 *   - 特殊マス: NodeType を1つ増やし、ハンドラを1つ登録するだけ
 */
export interface LandingContext {
  state: GameState;
  map: MapData;
  node: MapNode;
  player: Player;
}

export type LandingOutcome =
  | { kind: "money"; amount: number; message: string }
  | { kind: "moneyRoulette"; amount: number; message: string; rouletteInfo: Omit<MoneyRouletteInfo, "playerId" | "playerName"> }
  | { kind: "card"; cardId: string; message: string }
  | { kind: "purchaseOffer"; propertyId: string }
  | { kind: "info"; message: string };

export type LandingHandler = (ctx: LandingContext) => LandingOutcome;

function moneyOutcome(pool: MoneyEventDef[], ctx: LandingContext): LandingOutcome {
  const ev = drawFromPool(pool);
  return {
    kind: "money",
    amount: ev.amount,
    message: `${ctx.player.name}さん「${ctx.node.name}」: ${ev.message}(${ev.amount >= 0 ? "+" : ""}${ev.amount}万円)`,
  };
}

/**
 * プラス/マイナスマス専用: 季節(月)・年数インフレから求めた基準額をもとに
 * ルーレット候補を生成し、その中から結果を1つ確定する。
 * ここで確定するのはあくまで金額(ゲームロジック)で、実際の見た目の
 * 「ルーレットが回る」演出は MoneyRouletteModal 側の責務にする(演出と結果の分離)。
 */
function moneyRouletteOutcome(kind: "moneyGain" | "moneyLoss", ctx: LandingContext): LandingOutcome {
  const { year, month } = getCalendar(ctx.state.turn);
  const base = seasonalBaseAmount(kind, month, year);
  const magnitudes = generateRouletteCandidates(base);
  const pickedMagnitude = drawRouletteResult(magnitudes);

  const sign = kind === "moneyGain" ? 1 : -1;
  const candidates = magnitudes.map((m) => m * sign);
  const amount = pickedMagnitude * sign;

  const label = kind === "moneyGain" ? "プラスマス" : "マイナスマス";
  const message = `${ctx.player.name}さん「${ctx.node.name}」: ${label}(${amount >= 0 ? "+" : ""}${amount}万円)`;

  return {
    kind: "moneyRoulette",
    amount,
    message,
    rouletteInfo: { kind, nodeName: ctx.node.name, amount, candidates },
  };
}

export const LANDING_HANDLERS: Partial<Record<NodeType, LandingHandler>> = {
  money: (ctx) => moneyOutcome(moneyEventPool, ctx),
  moneyGain: (ctx) => moneyRouletteOutcome("moneyGain", ctx),
  moneyLoss: (ctx) => moneyRouletteOutcome("moneyLoss", ctx),
  event: (ctx) => moneyOutcome(localEventPool, ctx),

  card: (ctx) => {
    const cardId = drawableCardIds[Math.floor(Math.random() * drawableCardIds.length)];
    const def = getCardDef(cardId);
    return { kind: "card", cardId, message: `${ctx.player.name}さんがカード「${def?.name}」を手に入れた!` };
  },

  property: (ctx) => {
    const def = ctx.node.propertyId ? getPropertyDef(ctx.node.propertyId) : undefined;
    if (!def) return { kind: "info", message: `${ctx.player.name}さんが「${ctx.node.name}」に到着` };

    const owner = ctx.state.players.find((p) => p.ownedPropertyIds.includes(def.id));
    if (!owner) return { kind: "purchaseOffer", propertyId: def.id };

    const message =
      owner.id === ctx.player.id
        ? `${ctx.player.name}さん「${def.name}」: 自分の物件だ`
        : `${ctx.player.name}さん「${def.name}」: ${owner.name}さんの物件だった`;
    return { kind: "info", message };
  },
};

/** normal/gasStation/warpなど、まだハンドラを持たない種別は到着ログのみのデフォルト挙動になる。 */
export function resolveLandingOutcome(ctx: LandingContext): LandingOutcome {
  const handler = LANDING_HANDLERS[ctx.node.type];
  if (handler) return handler(ctx);
  return { kind: "info", message: `${ctx.player.name}さんが「${ctx.node.name}」に到着` };
}
