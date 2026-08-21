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

  const byDirection: Record<Direction, DecoratedOption[]> = { up: [], down: [], left: [], right: [] };
  for (const opt of decorated) byDirection[opt.direction].push(opt);

  const backNodeName = backNodeId ? getNode(map, backNodeId).name : null;

  // P6-4: 「⭐最短」バッジ・最短選択肢だけの強調色は廃止した(ゲーム側が正解を提示するのではなく、
  // プレイヤーが情報を見て判断する方針のため)。距離表示(shortestDistance()由来)自体は
  // 進路の判断材料として維持し、全ボタンを同じ見た目にする。
  function renderButton(opt: DecoratedOption) {
    const { arrow, label } = DIRECTION_LABEL[opt.direction];
    return (
      <button
        key={opt.nodeId}
        type="button"
        onClick={() => onSelectRoute(opt.nodeId)}
        className="flex flex-col items-center gap-0.5 rounded-lg border border-amber-300 bg-white/90 px-2.5 py-1.5 text-amber-800 shadow-sm active:scale-95 dark:bg-slate-800 dark:text-amber-200"
      >
        <span className="text-base font-black leading-none">
          {arrow} {label}
        </span>
        <span className="max-w-20 truncate text-[10px] font-medium opacity-80">{opt.nodeName}</span>
        {opt.distance !== null && (
          <span className="whitespace-nowrap text-[10px] font-bold">目的地まで{opt.distance}マス</span>
        )}
      </button>
    );
  }

  // P6-5: 上下左右のうち実際に選択肢が無い方向は行ごと描画しない(固定3x3グリッドをやめ、
  // 使う分だけ縦に積むflex-colへ変更)。方向数が少ない分岐(2〜3方向)ほどパネルの背が低くなり、
  // モバイルでP6-1のedgeハイライト・分岐ノード自体を隠しにくくなる(P6-2)。
  const hasUp = byDirection.up.length > 0;
  const hasDown = byDirection.down.length > 0;
  const hasLeft = byDirection.left.length > 0;
  const hasRight = byDirection.right.length > 0;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-14 z-20 flex justify-center sm:top-16">
      {/* P6-2: 背景をやや透過させ(旧95%→56%)、パネルの下に隠れがちな分岐edge/ノードが
          はっきり透けて見えるようにする(ボタン自体は個別に不透明な背景を持つため文字の
          可読性はそのまま)。 */}
      <div className="pointer-events-auto max-w-sm rounded-xl border border-amber-300 bg-amber-50/56 p-2.5 shadow-lg backdrop-blur-sm dark:bg-amber-950/50 sm:max-w-md">
        <p className="mb-1.5 text-center text-sm font-bold text-amber-700 dark:text-amber-300">
          分岐点です。進む道を選んでください(地図をタップしてもOK)
        </p>
        {backNodeId && backNodeName && (
          // P7-3: 盤面側の「戻る」候補(トレイルと同じ生成り色、Board.tsx)との対応が分かる程度に、
          // 左端だけごく薄いクリーム色のアクセントを添える。方向ボタン(border-amber-300、下記)より
          // 明らかに控えめな彩度に留め、これが「前進候補」ではないことが一目で分かるようにする。
          <button
            type="button"
            onClick={onStepBack}
            className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-400 border-l-4 border-l-amber-100 bg-slate-100 px-2.5 py-1.5 text-slate-700 shadow-sm active:scale-95 dark:border-slate-500 dark:border-l-amber-100/40 dark:bg-slate-800 dark:text-slate-200"
          >
            <span className="text-base font-black leading-none">← 戻る</span>
            <span className="text-[10px] font-medium opacity-80">({backNodeName}へ)</span>
            <span className="text-[10px] font-bold">残り{remainingMovesAfterBack}マスに戻る</span>
          </button>
        )}
        <div className="flex flex-col items-center gap-1.5">
          {hasUp && <div className="flex flex-col gap-1.5">{byDirection.up.map(renderButton)}</div>}
          <div className="flex items-center justify-center gap-2.5">
            {hasLeft && <div className="flex flex-col gap-1.5">{byDirection.left.map(renderButton)}</div>}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-base dark:bg-amber-900">
              🚗
            </div>
            {hasRight && <div className="flex flex-col gap-1.5">{byDirection.right.map(renderButton)}</div>}
          </div>
          {hasDown && <div className="flex flex-col gap-1.5">{byDirection.down.map(renderButton)}</div>}
        </div>
      </div>
    </div>
  );
}
