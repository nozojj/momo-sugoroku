"use client";

import { useMemo } from "react";
import type { MapData, RouteOption } from "@/types/game";
import { getNode, shortestDistance } from "@/lib/game/mapGraph";

type Direction = "up" | "down" | "left" | "right";

const DIRECTION_LABEL: Record<Direction, { arrow: string; label: string }> = {
  up: { arrow: "↑", label: "上" },
  down: { arrow: "↓", label: "下" },
  left: { arrow: "←", label: "左" },
  right: { arrow: "→", label: "右" },
};

/** 座標差から上下左右を判定する。道路はほぼ縦横グリッドなので、優勢な軸で決める。 */
function directionFor(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

interface DecoratedOption extends RouteOption {
  direction: Direction;
  distance: number | null;
}

interface RouteChoiceOverlayProps {
  map: MapData;
  currentNodeId: string;
  routeOptions: RouteOption[];
  destinationNodeId: string;
  ownedCardIds: string[];
  onSelectRoute: (nodeId: string) => void;
  /** 今回のサイコロ移動でここより前に戻れるノードID。移動開始地点まで戻り切っていればnull。 */
  backNodeId: string | null;
  /** 戻った場合の残りマス数(現在のremainingMoves + 1)。ボタンのラベル表示用。 */
  remainingMovesAfterBack: number;
  onStepBack: () => void;
}

export function RouteChoiceOverlay({
  map,
  currentNodeId,
  routeOptions,
  destinationNodeId,
  ownedCardIds,
  onSelectRoute,
  backNodeId,
  remainingMovesAfterBack,
  onStepBack,
}: RouteChoiceOverlayProps) {
  const decorated = useMemo<DecoratedOption[]>(() => {
    const current = getNode(map, currentNodeId);
    return routeOptions.map((opt) => {
      const node = getNode(map, opt.nodeId);
      return {
        ...opt,
        direction: directionFor(node.x - current.x, node.y - current.y),
        distance: shortestDistance(map, opt.nodeId, destinationNodeId, ownedCardIds),
      };
    });
  }, [map, currentNodeId, routeOptions, destinationNodeId, ownedCardIds]);

  const minDistance = useMemo(() => {
    const values = decorated.map((o) => o.distance).filter((d): d is number => d !== null);
    return values.length > 0 ? Math.min(...values) : null;
  }, [decorated]);

  const byDirection: Record<Direction, DecoratedOption[]> = { up: [], down: [], left: [], right: [] };
  for (const opt of decorated) byDirection[opt.direction].push(opt);

  const backNodeName = backNodeId ? getNode(map, backNodeId).name : null;

  function renderButton(opt: DecoratedOption) {
    const isShortest = minDistance !== null && opt.distance === minDistance;
    const { arrow, label } = DIRECTION_LABEL[opt.direction];
    return (
      <button
        key={opt.nodeId}
        type="button"
        onClick={() => onSelectRoute(opt.nodeId)}
        className={`flex flex-col items-center gap-0.5 rounded-lg border px-2.5 py-1.5 shadow-sm active:scale-95 ${
          isShortest
            ? "border-amber-500 bg-amber-400 text-white"
            : "border-amber-300 bg-white/90 text-amber-800 dark:bg-slate-800 dark:text-amber-200"
        }`}
      >
        <span className="text-base font-black leading-none">
          {arrow} {label}
        </span>
        <span className="max-w-20 truncate text-[10px] font-medium opacity-80">{opt.nodeName}</span>
        {opt.distance !== null && (
          <span className="whitespace-nowrap text-[10px] font-bold">
            目的地まで{opt.distance}マス{isShortest ? "(最短)" : ""}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-14 z-20 flex justify-center sm:top-16">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-amber-300 bg-amber-50/95 p-3 shadow-lg backdrop-blur-sm dark:bg-amber-950/90 sm:max-w-md">
        <p className="mb-2 text-center text-sm font-bold text-amber-700 dark:text-amber-300">
          分岐点です。進む道を選んでください(地図をタップしてもOK)
        </p>
        {backNodeId && backNodeName && (
          <button
            type="button"
            onClick={onStepBack}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-slate-700 shadow-sm active:scale-95 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200"
          >
            <span className="text-base font-black leading-none">← 戻る</span>
            <span className="text-[10px] font-medium opacity-80">({backNodeName}へ)</span>
            <span className="text-[10px] font-bold">残り{remainingMovesAfterBack}マスに戻る</span>
          </button>
        )}
        <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-2">
          <div />
          <div className="flex flex-col gap-1.5">{byDirection.up.map(renderButton)}</div>
          <div />
          <div className="flex flex-col gap-1.5">{byDirection.left.map(renderButton)}</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-base dark:bg-amber-900">
            🚗
          </div>
          <div className="flex flex-col gap-1.5">{byDirection.right.map(renderButton)}</div>
          <div />
          <div className="flex flex-col gap-1.5">{byDirection.down.map(renderButton)}</div>
          <div />
        </div>
      </div>
    </div>
  );
}
