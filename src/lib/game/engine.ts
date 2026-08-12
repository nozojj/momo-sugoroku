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
/** プレイヤー1人あたりのカード所持上限。超過分は整理画面(cardOverflow)で入れ替えを選ぶ。 */
export const MAX_CARDS_PER_PLAYER = 8;

/** ゲームカレンダー: 1ターン(全員が1回ずつ行動する1ラウンド)=1か月、4月始まり。 */
export const MONTHS_PER_YEAR = 12;
export const GAME_START_MONTH = 4;
/** 開始画面で選べるプレイ年数。増やしたい場合はここに追加するだけでよい。 */
export const YEAR_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_TOTAL_YEARS = 3;
export const DEFAULT_TOTAL_TURNS = DEFAULT_TOTAL_YEARS * MONTHS_PER_YEAR;

export function totalTurnsForYears(years: number): number {
  return years * MONTHS_PER_YEAR;
}

export interface GameCalendar {
  /** 1始まりの経過年数(1年目、2年目、…) */
  year: number;
  /** 暦月(1〜12) */
  month: number;
  /** この月が年度の始まり(4月)か。将来、年またぎでのみ走らせたい決算・年次イベントのフック地点。 */
  isYearStart: boolean;
}

/** 1始まりのturn番号(ラウンド数)を「○年目○月」のゲームカレンダーに変換する。 */
export function getCalendar(turn: number): GameCalendar {
  const year = Math.floor((turn - 1) / MONTHS_PER_YEAR) + 1;
  const month = (((turn - 1) % MONTHS_PER_YEAR) + (GAME_START_MONTH - 1)) % MONTHS_PER_YEAR + 1;
  return { year, month, isYearStart: month === GAME_START_MONTH };
}

let logSeq = 0;
export function makeLogId(): string {
  logSeq += 1;
  return `log_${logSeq}_${Date.now()}`;
}

let debuffSeq = 0;
export function makeDebuffId(): string {
  debuffSeq += 1;
  return `debuff_${debuffSeq}_${Date.now()}`;
}

/** 所有物件の資産価値(assetValue)合計。netWorth()とcalculateSettlement()の両方から使う。 */
export function propertyValueOf(player: Player): number {
  return player.ownedPropertyIds.reduce((sum, id) => {
    const def = getPropertyDef(id);
    return sum + (def?.assetValue ?? 0);
  }, 0);
}

export function netWorth(player: Player): number {
  return player.money + propertyValueOf(player);
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
    moveHistory: [startNodeId],
    money: STARTING_MONEY,
    ownedPropertyIds: [],
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
  };
}

export function createInitialState(mapId: string, playerNames: string[], totalYears = DEFAULT_TOTAL_YEARS): GameState {
  const map = getMap(mapId);
  const players = playerNames.map((name, i) => createPlayer(`p${i + 1}`, name, i, map.startNodeId));
  const destinationNodeId = pickRandomDestination(map, map.startNodeId);
  const totalTurns = totalTurnsForYears(totalYears);
  return {
    mapId,
    players,
    currentPlayerIndex: 0,
    turn: 1,
    totalTurns,
    destinationNodeId,
    diceResult: null,
    diceFaces: null,
    remainingMoves: 0,
    pendingDoubleMove: false,
    pendingDiceCount: 1,
    extraRollGranted: false,
    activeVehicleMode: null,
    status: "rolling",
    routeOptions: [],
    pendingPropertyGroupId: null,
    monopolyAchievement: null,
    arrivalInfo: null,
    cardWarpInfo: null,
    targetSelectInfo: null,
    moneyRouletteInfo: null,
    cardDrawInfo: null,
    cardOverflowInfo: null,
    settlementInfo: null,
    netWorthHistory: [],
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
