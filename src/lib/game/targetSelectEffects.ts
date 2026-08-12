import type { GameState, MapData, Player, TargetSelectOption, WarpTargetSelectKind } from "@/types/game";
import { getAllPropertyGroupDefs } from "@/data/propertyGroups";
import { destinationCandidateNodes, getNode, pickWarpTargetAmong, NEARBY_WARP_RADIUS } from "./mapGraph";

/**
 * 場所指定系カード(TargetSelectEffect)の「選択肢一覧」と「選んだ後のワープ先解決」を
 * 種別ごとに解決するレジストリ。
 *
 * gameStore.tsのuseCard()はlistOptions()の結果をtargetSelectInfoへ積むだけ、
 * confirmTargetSelection()はresolveTarget()の結果をcardWarpInfoへ積むだけの薄い処理にする。
 * landingEffects.tsのLANDING_HANDLERS/warpEffects.tsのWARP_HANDLERSと同じ考え方: 新しい
 * selectKindを足すときはこのファイルに1エントリ足すだけでよい。
 */
export interface TargetSelectContext {
  state: GameState;
  map: MapData;
  player: Player;
}

export interface TargetSelectHandlerDef {
  listOptions: (ctx: TargetSelectContext) => TargetSelectOption[];
  resolveTarget: (ctx: TargetSelectContext, optionId: string) => string;
}

/** station/regionで共有する「駅」選択肢一覧。destinationCandidateNodes()と同じ8駅を使う。 */
function stationOptions(map: MapData): TargetSelectOption[] {
  return destinationCandidateNodes(map).map((n) => ({ optionId: n.id, label: n.name }));
}

export const TARGET_SELECT_HANDLERS: Record<WarpTargetSelectKind, TargetSelectHandlerDef> = {
  station: {
    listOptions: (ctx) => stationOptions(ctx.map),
    // optionIdは駅ノードIDそのものなので解決不要でそのまま返す。
    resolveTarget: (_ctx, optionId) => optionId,
  },

  region: {
    listOptions: (ctx) => stationOptions(ctx.map),
    // optionIdは「地域の中心」として選ばれた駅ハブノードID。基準ノード自身を候補プールに
    // 含めた上でpickWarpTargetAmong()に渡す(pickWarpTarget()の"nearby"は現在地=基準ノードを
    // 常に除外する仕様なので、ここではあえて使わずプールを直接組み立てる)。
    resolveTarget: (ctx, optionId) => {
      const hub = getNode(ctx.map, optionId);
      const nearby = ctx.map.nodes.filter(
        (n) => n.id !== optionId && Math.hypot(n.x - hub.x, n.y - hub.y) <= NEARBY_WARP_RADIUS,
      );
      return pickWarpTargetAmong([hub, ...nearby], ctx.player.cardIds);
    },
  },

  propertyGroup: {
    listOptions: () => getAllPropertyGroupDefs().map((g) => ({ optionId: g.id, label: g.name, icon: g.icon })),
    resolveTarget: (ctx, optionId) => {
      const groupNodes = ctx.map.nodes.filter((n) => n.propertyGroupId === optionId);
      // 現状のマップデータでは全物件グループに必ず1件以上ノードが紐づいているが、
      // 将来グループだけ増やしてノード割り当てを忘れた場合に備え、空なら全ノードへ広げる。
      const pool = groupNodes.length > 0 ? groupNodes : ctx.map.nodes;
      return pickWarpTargetAmong(pool, ctx.player.cardIds);
    },
  },
};
