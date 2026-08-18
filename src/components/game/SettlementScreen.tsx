"use client";

import { useState } from "react";
import type { SettlementInfo, SettlementEntry, NetWorthHistoryEntry, Player } from "@/types/game";
import { formatMoney, formatMoneyDelta } from "@/lib/format";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";
import { getPropertyDef } from "@/data/properties";
import { PROPERTY_GENRE_ICON, PROPERTY_GENRE_LABEL, propertyGenreOf } from "@/lib/game/propertyDisplay";
import { getYearEventDef } from "@/lib/game/yearEvent";
import type { YearEventDef } from "@/types/game";
import { NetWorthTrendChart } from "./NetWorthTrendChart";

interface SettlementScreenProps {
  info: SettlementInfo;
  history: NetWorthHistoryEntry[];
  players: Player[];
  onContinue: () => void;
}

/**
 * 決算専用画面。status: "settlement" のときGameScreenがBoard/HUD/Diceを一切マウントせず
 * これに完全差し替える(StartScreenと同じ「早期return」パターン)。
 *
 * 表示専用コンポーネント: 受け取ったinfo/historyを並べ替え・集計して表示するだけで、
 * money・所有物件・netWorthHistoryなどのgameStore状態は一切変更しない
 * (呼べるstoreアクションはonContinueの1つだけ)。順位変動・決算アワードも、
 * calculateSettlement()が既に計算済みのentries/historyから画面側で導出するだけで、
 * GameState・決算計算ロジックには一切手を入れていない。
 *
 * レイアウトはlg(1024px)を境に、スマホ幅は1カラムのランキング+下部にチャート、
 * PC幅はランキング2カラム+右側にスティッキーなチャートパネルに切り替える
 * (アワード帯だけはsm(640px)で先に3列化する。チップ自体が小さく、ランキング+チャートの
 * 本格的な再配置より早い段階で横並びにしても窮屈にならないため)。
 */
export function SettlementScreen({ info, history, players, onContinue }: SettlementScreenProps) {
  const ranked = [...info.entries].sort((a, b) => b.netWorthAfter - a.netWorthAfter);
  const rankChanges = computeRankChanges(info.entries, history);
  const awards = computeAwards(info.entries);
  const yearEvent = getYearEventDef(info.yearEventId);

  return (
    // Visual Prototype 1.5: 「一年の成果発表」として、通常のマス演出より一段豪華な暖色グラデーション背景。
    // 情報構造(見出し→アワード→ランキング→チャート→ボタン)は無変更。
    <div className="min-h-dvh w-full overflow-y-auto bg-linear-to-b from-amber-50 via-orange-50/40 to-white p-4 pb-8 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto w-full max-w-sm lg:max-w-5xl">
        <div className="pt-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-400 text-3xl shadow-md dark:from-amber-400/30 dark:to-amber-600/20">
            🧾
          </div>
          <h1 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">{info.year}年目 決算</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">総資産の多い順に表示しています</p>
          {yearEvent && (
            <p
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-900/15 bg-linear-to-b from-white/90 to-amber-50/70 px-3 py-1 text-xs font-bold text-slate-600 dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50 dark:text-slate-300"
              title={yearEvent.description}
            >
              <span className="text-slate-400 dark:text-slate-500">今年の湘南:</span>
              <span>
                {yearEvent.icon} {yearEvent.label}
              </span>
            </p>
          )}
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
            {ranked.map((entry, i) => (
              <SettlementRankingRow
                key={entry.playerId}
                entry={entry}
                rank={i + 1}
                rankChange={rankChanges.get(entry.playerId) ?? null}
                yearEvent={yearEvent}
              />
            ))}
          </div>

          <div className="lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
            <h2 className="mb-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">資産推移</h2>
            <NetWorthTrendChart history={history} players={players} />
          </div>
        </div>

        <div className="mt-6">
          {/* Visual Prototype 1.5: WebサイトのCTAではなく「押せるゲームボタン」に見えるよう、
              下辺を濃色にしたベベル+押下フィードバック(active:translate-y)を付ける。 */}
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-xl border-b-4 border-amber-700 bg-linear-to-b from-amber-400 to-amber-500 py-2.5 font-black text-slate-900 shadow-md transition active:translate-y-0.5 active:border-b-0 dark:border-amber-800"
          >
            {info.isFinalSettlement ? "結果を見る" : "次の年度へ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** entries/historyの値をnetWorth降順に並べたplayerIdの配列にする、ランキング算出の共通処理。
 *  同着の扱いは既存のranked(SettlementScreen本体)と同じ単純な配列順ソートに揃える。 */
function rankPlayerIds(values: { playerId: string; netWorth: number }[]): string[] {
  return [...values].sort((a, b) => b.netWorth - a.netWorth).map((v) => v.playerId);
}

/**
 * 前年決算からの順位変動(前年の順位 - 今年の順位。正なら順位が上がった)をplayerIdごとに返す。
 * historyの末尾は今回の決算で既に追加済みのスナップショットなので、「前年」は
 * 末尾から2番目(history.length - 2)を見る。1年目(比較対象が無い)はnullのまま返し、
 * 呼び出し側でバッジ自体を出さない。
 */
function computeRankChanges(entries: SettlementEntry[], history: NetWorthHistoryEntry[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  const currentRankIds = rankPlayerIds(entries.map((e) => ({ playerId: e.playerId, netWorth: e.netWorthAfter })));

  const previousSnapshot = history.length >= 2 ? history[history.length - 2] : undefined;
  const previousRankIds = previousSnapshot ? rankPlayerIds(previousSnapshot.values) : null;

  for (const entry of entries) {
    const currentRank = currentRankIds.indexOf(entry.playerId) + 1;
    const previousIndex = previousRankIds?.indexOf(entry.playerId) ?? -1;
    result.set(entry.playerId, previousIndex >= 0 ? previousIndex + 1 - currentRank : null);
  }
  return result;
}

interface Award {
  key: string;
  icon: string;
  label: string;
  winners: SettlementEntry[];
}

/**
 * 決算アワード(今年の物件収益王・資産成長No.1・独占マイスター)をinfo.entriesだけから算出する。
 * 「今年"新たに"独占を達成したか」は決算時点のデータからは判定できない
 * (propertyBreakdown.tierは決算時点の現状のみを表し、購入時のmonopolyAchievementは
 * 一時通知でありここまで残らない)ため、"現在保持している独占の数"で数える。
 * 同率の場合は該当者全員をwinnersに含める。
 */
function computeAwards(entries: SettlementEntry[]): Award[] {
  const awards: Award[] = [];

  const maxRevenue = Math.max(...entries.map((e) => e.propertyRevenue));
  if (maxRevenue > 0) {
    awards.push({
      key: "revenue",
      icon: "💹",
      label: "物件収益王",
      winners: entries.filter((e) => e.propertyRevenue === maxRevenue),
    });
  }

  // 資産成長(netWorthDelta)は0円/マイナスでも比較として意味があるため、0件チェックはしない
  // (収益王・独占マイスターと違い「誰も達成していない」という概念が無いため)。
  const maxDelta = Math.max(...entries.map((e) => e.netWorthDelta));
  awards.push({
    key: "growth",
    icon: "📈",
    label: "資産成長No.1",
    winners: entries.filter((e) => e.netWorthDelta === maxDelta),
  });

  const monopolyCounts = entries.map((e) => ({ entry: e, count: monopolyNotes(e).length }));
  const maxMonopolyCount = Math.max(...monopolyCounts.map((m) => m.count));
  if (maxMonopolyCount > 0) {
    awards.push({
      key: "monopoly",
      icon: "🏰",
      label: "独占マイスター",
      winners: monopolyCounts.filter((m) => m.count === maxMonopolyCount).map((m) => m.entry),
    });
  }

  return awards;
}

function AwardChip({ award }: { award: Award }) {
  const names = award.winners.map((w) => w.playerName).join("・");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-amber-900/10 bg-linear-to-b from-white/90 to-amber-50/70 py-1 pl-1 pr-3 shadow-sm dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50 sm:shrink sm:justify-center sm:py-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-300 text-xs dark:from-amber-400/30 dark:to-amber-500/20">
        {award.icon}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="whitespace-nowrap text-[9px] font-bold text-slate-400 dark:text-slate-500">{award.label}</span>
        <span className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{names}</span>
      </span>
    </div>
  );
}

function monopolyNotes(entry: SettlementEntry): { key: string; label: string; region: boolean }[] {
  const notes = new Map<string, { key: string; label: string; region: boolean }>();
  for (const item of entry.propertyBreakdown) {
    if (item.tier === "regionMonopoly" && item.region) {
      const key = `region_${item.region}`;
      if (!notes.has(key)) {
        notes.set(key, {
          key,
          label: `🌐 ${item.region}エリア 完全独占 ×${PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier}`,
          region: true,
        });
      }
    } else if (item.tier === "groupMonopoly" && item.groupName) {
      const key = `group_${item.groupName}`;
      if (!notes.has(key)) {
        notes.set(key, {
          key,
          label: `✨ ${item.groupName} 独占 ×${PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier}`,
          region: false,
        });
      }
    }
  }
  return [...notes.values()];
}

function RankMoveBadge({ rankChange }: { rankChange: number | null }) {
  if (rankChange === null || rankChange === 0) return null;
  const up = rankChange > 0;
  return (
    <span
      className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-bold ${
        up
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
      }`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(rankChange)}
    </span>
  );
}

function SettlementRankingRow({
  entry,
  rank,
  rankChange,
  yearEvent,
}: {
  entry: SettlementEntry;
  rank: number;
  rankChange: number | null;
  /** この決算に適用された年度イベント。物件内訳の各行に補正バッジを出すために使う
   *  (undefinedなら"平年"扱いで一切バッジを出さない)。 */
  yearEvent: YearEventDef | undefined;
}) {
  const notes = monopolyNotes(entry);
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    // Visual Prototype 1.5: PlayerHud(Prototype 1)と同じ「プレイヤーカラーの左帯」で
    // プレイ中の見た目とここを統一。1位だけ暖色グラデーション+強めの影で一段目立たせる。
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        rank === 1
          ? "border-amber-400 bg-linear-to-b from-amber-100 to-amber-50/80 shadow-md dark:border-amber-400/50 dark:from-amber-400/15 dark:to-amber-400/5"
          : "border-amber-900/10 bg-linear-to-b from-white/95 to-amber-50/40 dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50"
      }`}
      style={{ borderLeft: `3px solid ${entry.playerColor}` }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-bold text-slate-400 dark:text-slate-500">
          {rank === 1 ? "👑 " : ""}
          {rank}位
        </span>
        <RankMoveBadge rankChange={rankChange} />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.playerColor }} />
        <span className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-white">{entry.playerName}さん</span>
        <span className="ml-auto shrink-0 text-right">
          <span className="block text-sm font-black text-slate-800 dark:text-white">{formatMoney(entry.netWorthAfter)}</span>
          <span
            className={`block text-[10px] font-bold ${
              entry.netWorthDelta >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            前年比 {formatMoneyDelta(entry.netWorthDelta)}
          </span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <span>現金</span>
          <span>{formatMoney(entry.cash)}</span>
        </div>
        <div className="flex justify-between">
          <span>所有物件数</span>
          <span>{entry.propertyCount}件</span>
        </div>
        <div className="flex justify-between">
          <span>所有物件総額</span>
          <span>{formatMoney(entry.propertyValue)}</span>
        </div>
        <div className="flex justify-between">
          <span>今年度の物件収益</span>
          <span>{formatMoneyDelta(entry.propertyRevenue)}</span>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {notes.map((note) => (
            <span
              key={note.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${note.region ? "bg-sky-500" : "bg-amber-500"}`}
            >
              {note.label}
            </span>
          ))}
        </div>
      )}

      {entry.propertyBreakdown.length > 0 && (
        <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400"
          >
            <span>物件ごとの内訳({entry.propertyBreakdown.length}件)</span>
            <span>{showBreakdown ? "閉じる ▲" : "見る ▼"}</span>
          </button>

          {showBreakdown && (
            <div className="mt-1.5 space-y-1">
              {entry.propertyBreakdown.map((item) => {
                const def = getPropertyDef(item.propertyId);
                const genre = def ? propertyGenreOf(def) : null;
                return (
                  <div key={item.propertyId} className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="min-w-0 truncate">
                      {item.region && <span className="text-slate-400 dark:text-slate-500">{item.region} ・ </span>}
                      {genre && (
                        <span className="text-slate-400 dark:text-slate-500">
                          {PROPERTY_GENRE_ICON[genre]}
                          {PROPERTY_GENRE_LABEL[genre]} ・{" "}
                        </span>
                      )}
                      <span className="text-slate-700 dark:text-slate-300">{item.propertyName}</span>
                      {item.tier === "regionMonopoly" && <span className="ml-1 text-sky-500">🌐</span>}
                      {item.tier === "groupMonopoly" && <span className="ml-1 text-amber-500">✨</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {yearEvent && item.yearEventMultiplier !== undefined && item.yearEventMultiplier !== 1 && (
                        <span
                          className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                            item.yearEventMultiplier > 1
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
                          }`}
                          title={`${yearEvent.icon} ${yearEvent.label}の影響`}
                        >
                          {yearEvent.icon}
                          {item.yearEventMultiplier > 1 ? "+" : ""}
                          {Math.round((item.yearEventMultiplier - 1) * 100)}%
                        </span>
                      )}
                      <span className="font-bold text-slate-700 dark:text-slate-300">{formatMoneyDelta(item.amount)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
