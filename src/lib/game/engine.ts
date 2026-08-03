import type { GameState, Player } from "@/types/game";
import { getPropertyDef } from "@/data/properties";
import { getMap } from "@/data/maps";
import { pickRandomDestination } from "./mapGraph";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ["#e6483e", "#2e86de", "#2fa84f", "#8b5cf6"]; // 赤/青/緑/紫
export const PLAYER_COLOR_NAMES = ["赤", "青", "緑", "紫"];
export const CAR_ICONS = ["🚗", "🚙", "🚕", "🚓"];
export const STARTING_MONEY = 1500; // 万円
export const DESTINATION_BONUS = 300; // 万円
export const DEFAULT_TOTAL_TURNS = 15;

let logSeq = 0;
export function makeLogId(): string {
  logSeq += 1;
  return `log_${logSeq}_${Date.now()}`;
}

export function netWorth(player: Player): number {
  const propertyValue = player.ownedPropertyIds.reduce((sum, id) => {
    const def = getPropertyDef(id);
    return sum + (def?.assetValue ?? 0);
  }, 0);
  return player.money + propertyValue;
}

export function computeWinnerIds(players: Player[]): string[] {
  const worths = players.map((p) => ({ id: p.id, worth: netWorth(p) }));
  const max = Math.max(...worths.map((w) => w.worth));
  return worths.filter((w) => w.worth === max).map((w) => w.id);
}

export function createPlayer(id: string, name: string, colorIndex: number, startNodeId: string): Player {
  return {
    id,
    name,
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    carIcon: CAR_ICONS[colorIndex % CAR_ICONS.length],
    currentNodeId: startNodeId,
    previousNodeId: null,
    money: STARTING_MONEY,
    ownedPropertyIds: [],
    cardIds: [],
    destinationsReached: 0,
  };
}

export function createInitialState(mapId: string, playerNames: string[], totalTurns = DEFAULT_TOTAL_TURNS): GameState {
  const map = getMap(mapId);
  const players = playerNames.map((name, i) => createPlayer(`p${i + 1}`, name, i, map.startNodeId));
  const destinationNodeId = pickRandomDestination(map, map.startNodeId);
  return {
    mapId,
    players,
    currentPlayerIndex: 0,
    turn: 1,
    totalTurns,
    destinationNodeId,
    diceResult: null,
    remainingMoves: 0,
    pendingDoubleMove: false,
    extraRollGranted: false,
    status: "rolling",
    routeOptions: [],
    pendingPropertyId: null,
    log: [
      {
        id: makeLogId(),
        turn: 1,
        message: `ゲーム開始! 最初の目的地は「${getMap(mapId).nodes.find((n) => n.id === destinationNodeId)?.name}」`,
      },
    ],
    winnerIds: null,
  };
}
