"use client";

import { useState } from "react";
import type { SettlementInfo, SettlementEntry, NetWorthHistoryEntry, Player } from "@/types/game";
import { formatMoney, formatMoneyDelta } from "@/lib/format";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";
import { getPropertyDef } from "@/data/properties";
import { PROPERTY_GENRE_ICON, PROPERTY_GENRE_LABEL, propertyGenreOf } from "@/lib/game/propertyDisplay";
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
 * 表示専用コンポーネント: 受け取ったinfo/historyを並べ替え・表示するだけで、
 * money・所有物件・netWorthHistoryなどのgameStore状態は一切変更しない
 * (呼べるstoreアクションはonContinueの1つだけ)。
 *
 * 将来の拡張(順位変動アニメーション・独占地域数・今年一番稼いだプレイヤー・
 * キャラクターコメント等)は、ここにセクションを追加するかSettlementRankingRowに
 * propsを足すだけで対応できる。
 */
export function SettlementScreen({ info, history, players, onContinue }: SettlementScreenProps) {
  const ranked = [...info.entries].sort((a, b) => b.netWorthAfter - a.netWorthAfter);

  return (
    <div className="min-h-dvh w-full overflow-y-auto p-4 pb-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="pt-6 text-center">
          <p className="text-4xl">🧾</p>
          <h1 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">{info.year}年目 決算</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">総資産の多い順に表示しています</p>
        </div>

        <div className="mt-4 space-y-3">
          {ranked.map((entry, i) => (
            <SettlementRankingRow key={entry.playerId} entry={entry} rank={i + 1} />
          ))}
        </div>

        <div className="mt-5">
          <h2 className="mb-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">資産推移</h2>
          <NetWorthTrendChart history={history} players={players} />
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-lg bg-slate-800 py-2.5 font-bold text-white dark:bg-white dark:text-slate-900"
          >
            {info.isFinalSettlement ? "結果を見る" : "次の年度へ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** propertyBreakdown(1物件ごとの明細)から、独占による収益増の注記を組み立てる。
 *  同じグループ/地域で複数物件を所有していても、注記は1グループ/1地域につき1行にまとめる
 *  (「藤沢駅前 独占 ×1.5」を所有物件数ぶん繰り返さない)。tier/groupName/regionは旧セーブに
 *  無い場合があるoptional項目なので、揃っている行だけを対象にする。 */
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

function SettlementRankingRow({ entry, rank }: { entry: SettlementEntry; rank: number }) {
  const notes = monopolyNotes(entry);
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-bold text-slate-400 dark:text-slate-500">{rank}位</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.playerColor }} />
        <span className="truncate text-sm font-bold text-slate-800 dark:text-white">{entry.playerName}さん</span>
        <span className="ml-auto shrink-0 text-sm font-black text-slate-800 dark:text-white">
          {formatMoney(entry.netWorthAfter)}
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
                // ここでは表示するだけ: amountはcalculateSettlement()が既に確定させた値をそのまま
                // 出す(再計算しない)。ジャンルだけpropertyDisplay.tsから都度導出する(表示専用)。
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
                    <span className="shrink-0 font-bold text-slate-700 dark:text-slate-300">{formatMoneyDelta(item.amount)}</span>
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
