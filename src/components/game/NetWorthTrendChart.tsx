"use client";

import type { NetWorthHistoryEntry, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";

interface NetWorthTrendChartProps {
  history: NetWorthHistoryEntry[];
  players: Player[];
}

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 52 };

/**
 * 資産推移の折れ線グラフ。自前SVGで描画する(本アプリはBoard.tsx含め一貫して
 * チャートライブラリを使わずSVGを手書きしているため、それに合わせる)。
 * historyは年度昇順(決算のたびに1件ずつ末尾に追加される)前提。
 *
 * 将来のアニメーション追加(棒グラフ/折れ線グラフのアニメーション)は、この
 * コンポーネント内部の描画詳細として追加できる(props契約は変えなくてよい)。
 */
export function NetWorthTrendChart({ history, players }: NetWorthTrendChartProps) {
  if (history.length === 0) {
    return (
      <p className="rounded-xl border border-black/10 p-4 text-center text-xs text-slate-400 dark:border-white/10 dark:text-slate-500">
        資産推移データがありません
      </p>
    );
  }

  const allValues = history.flatMap((h) => h.values.map((v) => v.netWorth));
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  // 全員の総資産がほぼ横ばいでもグラフが潰れないよう、最低限の幅を確保する。
  const span = Math.max(rawMax - rawMin, Math.max(rawMax, 1) * 0.1);
  const min = rawMin - span * 0.1;
  const max = rawMax + span * 0.1;

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(index: number): number {
    if (history.length <= 1) return PADDING.left + plotWidth / 2;
    return PADDING.left + (plotWidth * index) / (history.length - 1);
  }
  function yFor(value: number): number {
    const ratio = (value - min) / (max - min || 1);
    return PADDING.top + plotHeight * (1 - ratio);
  }

  const canDrawLine = history.length >= 2;
  const gridValues = [min + (max - min) * 0.25, min + (max - min) * 0.75];

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="w-full" role="img" aria-label="資産推移グラフ">
        {/* 補助グリッド線 */}
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <text x={PADDING.left - 6} y={yFor(v) + 3} textAnchor="end" fontSize={9} className="fill-slate-400 dark:fill-slate-500">
              {formatMoney(Math.round(v))}
            </text>
          </g>
        ))}

        {/* 年度ラベル */}
        {history.map((h, i) => (
          <text
            key={h.year}
            x={xFor(i)}
            y={VIEW_HEIGHT - PADDING.bottom + 16}
            textAnchor="middle"
            fontSize={9}
            className="fill-slate-400 dark:fill-slate-500"
          >
            {h.year}年目
          </text>
        ))}

        {/* プレイヤーごとの折れ線/点 */}
        {players.map((player) => {
          const points = history.map((h, i) => {
            const value = h.values.find((v) => v.playerId === player.id)?.netWorth ?? 0;
            return { x: xFor(i), y: yFor(value) };
          });
          return (
            <g key={player.id}>
              {canDrawLine && (
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === points.length - 1 ? 4 : 2.5}
                  fill={player.color}
                  stroke="white"
                  strokeWidth={i === points.length - 1 ? 1.5 : 0}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {!canDrawLine && (
        <p className="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-500">
          2年目以降の決算で推移が線で表示されます
        </p>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {players.map((player) => (
          <span key={player.id} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
            {player.name}
          </span>
        ))}
      </div>
    </div>
  );
}
