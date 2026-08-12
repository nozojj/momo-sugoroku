"use client";

import type { NetWorthHistoryEntry, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { netWorth } from "@/lib/game/engine";
import { propertyDefs } from "@/data/properties";
import { propertyGroupDefs } from "@/data/propertyGroups";
import { isGroupMonopolized, isRegionMonopolized } from "@/lib/game/propertyOwnership";
import { NetWorthTrendChart } from "./NetWorthTrendChart";

interface GameOverModalProps {
  players: Player[];
  winnerIds: string[];
  totalYears: number;
  netWorthHistory: NetWorthHistoryEntry[];
  onRestart: () => void;
}

/**
 * ゲーム終了時の最終結果画面。決算画面(SettlementScreen)と同じデザイン言語
 * (トークン・ランキングカード・アワード帯・チャート配置パターン)を踏襲する。
 *
 * 表示専用: players/winnerIds/netWorthHistoryを並べ替え・集計して表示するだけで、
 * GameState・gameStore側の状態は一切変更しない(呼べるstoreアクションはonRestartの1つだけ)。
 * 最終決算(status:"settlement")からゲーム終了(status:"finished")への遷移は
 * continueAfterSettlement()→advanceToNextTurn()が手番送りするだけでプレイヤー操作を
 * 一切挟まないため、ここで受け取るplayersの所有物件・目的地到着回数は最終決算時点の
 * ものとそのまま一致する(独占状況・物件数もここで安全に再計算できる)。
 */
export function GameOverModal({ players, winnerIds, totalYears, netWorthHistory, onRestart }: GameOverModalProps) {
  const isTie = winnerIds.length > 1;
  const winner = players.find((p) => p.id === winnerIds[0]);
  const ranked = rankPlayers(players);
  const awards = computeFinalAwards(players);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto my-6 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800 lg:max-w-5xl lg:p-8">
        <div className="text-center">
          <p className="text-4xl">🏆</p>
          <h2 className="mt-2 text-xl font-bold text-slate-800 dark:text-white">
            {isTie ? "引き分け!" : `${winner?.name}さんの勝ち!`}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{totalYears}年間のプレイが終了しました</p>
        </div>

        {awards.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {awards.map((award) => (
              <AwardChip key={award.key} award={award} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          <div className="grid grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-2 lg:items-start">
            {ranked.map((r) => (
              <RankingCard key={r.player.id} ranked={r} />
            ))}
          </div>

          <div className="lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
            <h2 className="mb-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">資産推移</h2>
            <NetWorthTrendChart history={netWorthHistory} players={players} />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onRestart}
            className="w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
          >
            もう一度遊ぶ
          </button>
        </div>
      </div>
    </div>
  );
}

interface RankedPlayer {
  player: Player;
  netWorth: number;
  /** 「自分より総資産が多い人数+1」で求める競技式順位(1,2,2,4のように同着の次が飛ぶ)。 */
  rank: number;
  tied: boolean;
}

/** netWorth降順に並べ、同着を正しく扱う順位(1,2,2,4)を振る。1位に限らず何位でも同着を検出する。 */
function rankPlayers(players: Player[]): RankedPlayer[] {
  const withNetWorth = players.map((p) => ({ player: p, netWorth: netWorth(p) }));
  return withNetWorth
    .map((entry) => {
      const rank = 1 + withNetWorth.filter((o) => o.netWorth > entry.netWorth).length;
      const tied = withNetWorth.filter((o) => o.netWorth === entry.netWorth).length > 1;
      return { ...entry, rank, tied };
    })
    .sort((a, b) => b.netWorth - a.netWorth);
}

/** 指定プレイヤーが最終的に独占しているグループ/地域の一覧。PlayerHud.tsxのmonopolyBadges()
 *  と同じ計算(地域を完全独占していれば、その地域に属く個別グループの表示は出さない)を、
 *  この画面専用に独立して持つ(SettlementScreen.tsxのmonopolyNotes()がpropertyBreakdown由来
 *  なのに対し、ここはpropertyBreakdownを持たないため players から直接再計算する)。 */
function monopolyLabelsFor(player: Player): { key: string; label: string; region: boolean }[] {
  const ownedGroupIds = [
    ...new Set(player.ownedPropertyIds.map((id) => propertyDefs.find((p) => p.id === id)?.groupId).filter((id): id is string => !!id)),
  ];
  const ownedGroups = ownedGroupIds
    .map((id) => propertyGroupDefs.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);

  const monopolizedRegions = [...new Set(ownedGroups.map((g) => g.region))].filter((region) =>
    isRegionMonopolized(region, player.id, [player], propertyDefs, propertyGroupDefs),
  );

  const regionBadges = monopolizedRegions.map((region) => ({ key: `region_${region}`, label: `🌐 ${region}エリア 完全独占`, region: true }));

  const groupBadges = ownedGroups
    .filter((g) => !monopolizedRegions.includes(g.region))
    .filter((g) => isGroupMonopolized(g.id, player.id, [player], propertyDefs))
    .map((g) => ({ key: `group_${g.id}`, label: `✨ ${g.name} 独占`, region: false }));

  return [...regionBadges, ...groupBadges];
}

interface Award {
  key: string;
  icon: string;
  label: string;
  winners: Player[];
}

/**
 * 最終アワード(物件王・目的地到着王・独占マイスター)をplayersだけから算出する。
 * 誰も達成していない(最大値が0)場合はそのアワード自体を出さない。同率は該当者全員を
 * winnersに含める。資産成長No.1は今回のスコープには含めない。
 */
function computeFinalAwards(players: Player[]): Award[] {
  const awards: Award[] = [];

  const maxProperties = Math.max(...players.map((p) => p.ownedPropertyIds.length));
  if (maxProperties > 0) {
    awards.push({
      key: "property",
      icon: "🏠",
      label: "物件王",
      winners: players.filter((p) => p.ownedPropertyIds.length === maxProperties),
    });
  }

  const maxDestinations = Math.max(...players.map((p) => p.destinationsReached));
  if (maxDestinations > 0) {
    awards.push({
      key: "destination",
      icon: "🎯",
      label: "目的地到着王",
      winners: players.filter((p) => p.destinationsReached === maxDestinations),
    });
  }

  const monopolyCounts = players.map((p) => ({ player: p, count: monopolyLabelsFor(p).length }));
  const maxMonopolyCount = Math.max(...monopolyCounts.map((m) => m.count));
  if (maxMonopolyCount > 0) {
    awards.push({
      key: "monopoly",
      icon: "🏰",
      label: "独占マイスター",
      winners: monopolyCounts.filter((m) => m.count === maxMonopolyCount).map((m) => m.player),
    });
  }

  return awards;
}

function AwardChip({ award }: { award: Award }) {
  const names = award.winners.map((w) => w.name).join("・");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-black/10 bg-slate-50 py-1 pl-1 pr-3 dark:border-white/10 dark:bg-slate-900/40 sm:shrink sm:justify-center sm:py-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs dark:bg-amber-400/20">
        {award.icon}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="whitespace-nowrap text-[9px] font-bold text-slate-400 dark:text-slate-500">{award.label}</span>
        <span className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{names}</span>
      </span>
    </div>
  );
}

function RankingCard({ ranked }: { ranked: RankedPlayer }) {
  const { player, rank, tied } = ranked;
  const monopolyLabels = monopolyLabelsFor(player);

  return (
    <div
      className={`rounded-xl border p-3 ${
        rank === 1 ? "border-amber-300 bg-amber-50/60 dark:border-amber-400/40 dark:bg-amber-400/5" : "border-black/10 dark:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{rank}位</span>
          {tied && (
            <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-bold text-sky-600 dark:bg-sky-400/10 dark:text-sky-300">
              同率
            </span>
          )}
        </span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
        <span className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-white">{player.name}さん</span>
        <span className="ml-auto shrink-0 text-right">
          <span className="block text-sm font-black text-slate-800 dark:text-white">{formatMoney(ranked.netWorth)}</span>
          <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500">総資産</span>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-center text-xs text-slate-500 dark:text-slate-400">
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">現金</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{formatMoney(player.money)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">所有物件</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{player.ownedPropertyIds.length}件</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">目的地到着</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{player.destinationsReached}回</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {monopolyLabels.length > 0 ? (
          monopolyLabels.map((note) => (
            <span
              key={note.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${note.region ? "bg-sky-500" : "bg-amber-500"}`}
            >
              {note.label}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold text-slate-400 dark:border-white/10 dark:text-slate-500">
            独占なし
          </span>
        )}
      </div>
    </div>
  );
}
