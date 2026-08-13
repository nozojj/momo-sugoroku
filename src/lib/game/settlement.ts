import type { Player, SettlementEntry, NetWorthHistoryEntry } from "@/types/game";
import { getPropertyDef, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { calculateAnnualRevenue } from "@/lib/game/propertyRevenue";
import { ownershipTier } from "@/lib/game/propertyOwnership";
import { propertyValueOf, STARTING_MONEY } from "@/lib/game/engine";
import { propertyGenreOf } from "@/lib/game/propertyDisplay";
import { getYearEventDef, yearEventGenreMultiplier } from "@/lib/game/yearEvent";

/**
 * 決算の計算だけを行う純関数。gameStore.tsはこの結果をset()するだけのオーケストレーション役に徹し、
 * SettlementScreen/SettlementIntroAnnouncerはこの結果を表示するだけで、お金や履歴を一切変更しない。
 *
 * netWorthBeforeは「年度開始時点(前年決算直後、1年目はゲーム開始時点)の総資産」。
 * historyの最後の要素(=前回の決算時点のスナップショット)から引き、historyが空(1年目)なら
 * 全員が開始時点で同じSTARTING_MONEY・所有物件0だったことから一律STARTING_MONEYを使う。
 *
 * yearEventIdは決算対象年度(settledYear)の間ずっと適用されていた年度イベントのid。省略時は
 * getYearEventDef(undefined)がundefinedを返し、yearEventGenreMultiplier()経由で全ジャンル
 * ×1(補正なし)にフォールバックするため、既存の呼び出し側(このパラメータを渡さないテスト等)の
 * 挙動は変わらない。
 */
export function calculateSettlement(
  players: Player[],
  settledYear: number,
  history: NetWorthHistoryEntry[],
  yearEventId?: string,
): { entries: SettlementEntry[]; updatedPlayers: Player[]; historyEntry: NetWorthHistoryEntry } {
  const previousSnapshot = history[history.length - 1];
  const previousNetWorthByPlayer = new Map(previousSnapshot?.values.map((v) => [v.playerId, v.netWorth]) ?? []);
  const yearEvent = getYearEventDef(yearEventId);

  const entries: SettlementEntry[] = players.map((player) => {
    const propertyBreakdown = player.ownedPropertyIds.map((propertyId) => {
      const def = getPropertyDef(propertyId);
      if (!def) return { propertyId, propertyName: propertyId, amount: 0 };
      const tier = ownershipTier(def, player.id, players, propertyDefs, propertyGroupDefs);
      const yearEventMultiplier = yearEventGenreMultiplier(yearEvent, propertyGenreOf(def));
      const amount = calculateAnnualRevenue(def, tier, yearEventMultiplier);
      const group = getPropertyGroupDef(def.groupId);
      return {
        propertyId,
        propertyName: def.name,
        amount,
        tier,
        groupName: group?.name,
        region: group?.region,
        yearEventMultiplier,
      };
    });
    const propertyRevenue = propertyBreakdown.reduce((sum, e) => sum + e.amount, 0);
    const propertyValue = propertyValueOf(player);
    const cash = player.money + propertyRevenue;
    const netWorthAfter = cash + propertyValue;
    const netWorthBefore = previousNetWorthByPlayer.get(player.id) ?? STARTING_MONEY;

    return {
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      propertyBreakdown,
      propertyRevenue,
      cash,
      propertyValue,
      propertyCount: player.ownedPropertyIds.length,
      netWorthBefore,
      netWorthAfter,
      netWorthDelta: netWorthAfter - netWorthBefore,
    };
  });

  const updatedPlayers = players.map((player) => {
    const entry = entries.find((e) => e.playerId === player.id)!;
    return entry.propertyRevenue !== 0 ? { ...player, money: entry.cash } : player;
  });

  const historyEntry: NetWorthHistoryEntry = {
    year: settledYear,
    values: entries.map((e) => ({ playerId: e.playerId, netWorth: e.netWorthAfter })),
  };

  return { entries, updatedPlayers, historyEntry };
}
