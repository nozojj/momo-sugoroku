"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapData, MapDecoration, Player, RouteOption } from "@/types/game";
import { NODE_STYLE, ROAD_STYLE, LANDMARK_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, getClusterOffset, straightRoadPath } from "@/lib/game/mapStyle";
import { getPropertyDef } from "@/data/properties";
import { CarToken } from "./CarToken";

interface BoardProps {
  map: MapData;
  players: Player[];
  currentPlayerIndex: number;
  destinationNodeId: string;
  routeOptions: RouteOption[];
  onSelectRoute: (nodeId: string) => void;
}

const PADDING = 80;

function smoothPathThroughPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    const midY = (prev.y + cur.y) / 2;
    d += ` Q${prev.x},${prev.y} ${midX},${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

export function Board({ map, players, currentPlayerIndex, destinationNodeId, routeOptions, onSelectRoute }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.55);
  const dragState = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [debugClickPos, setDebugClickPos] = useState<{ x: number; y: number } | null>(null);

  const { width, height, edges } = useMemo(() => {
    const xs = map.nodes.map((n) => n.x);
    const ys = map.nodes.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + PADDING * 2;
    const h = Math.max(...ys) - Math.min(...ys) + PADDING * 2;

    const seen = new Set<string>();
    const edgeList: { from: string; to: string; roadType: (typeof map.nodes)[number]["connections"][number]["roadType"]; requiresCardId?: string }[] = [];
    for (const node of map.nodes) {
      for (const edge of node.connections) {
        const key = [node.id, edge.to].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        edgeList.push({ from: node.id, to: edge.to, roadType: edge.roadType, requiresCardId: edge.requiresCardId });
      }
    }
    return { width: w, height: h, edges: edgeList };
  }, [map]);

  const minX = Math.min(...map.nodes.map((n) => n.x)) - PADDING;
  const minY = Math.min(...map.nodes.map((n) => n.y)) - PADDING;
  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const selectableIds = new Set(routeOptions.map((o) => o.nodeId));
  const currentPlayer = players[currentPlayerIndex];

  function clampZoom(z: number) {
    // マップが広がった分、全体を1画面に収めるズームが0.2を下回る場合があるため下限を緩めている
    return Math.min(2.2, Math.max(0.08, z));
  }

  // マップ全体(縦・横どちらの余白も余らせない側)が初回表示で画面内に収まるズームへ合わせる
  useEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const fitZoom = clampZoom(Math.min(rect.width / width, rect.height / height) * 0.94);
    setZoom(fitZoom);
    setPan({ x: (rect.width - width * fitZoom) / 2, y: (rect.height - height * fitZoom) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy });
  }
  function onPointerUp() {
    dragState.current = null;
    setDragging(false);
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => clampZoom(z - e.deltaY * 0.0012));
  }

  // デバッグ用: クリックした画面位置をズーム・パンを逆算してゲーム内座標に変換
  function onDebugClick(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gameX = (e.clientX - rect.left - pan.x) / zoom + minX;
    const gameY = (e.clientY - rect.top - pan.y) / zoom + minY;
    setDebugClickPos({ x: Math.round(gameX), y: Math.round(gameY) });
  }

  function recenterOnCurrentPlayer() {
    const node = nodeById.get(currentPlayer?.currentNodeId ?? map.startNodeId);
    if (!node || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPan({
      x: rect.width / 2 - (node.x - minX) * zoom,
      y: rect.height / 2 - (node.y - minY) * zoom,
    });
  }

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className="relative h-[58vh] sm:h-[68vh] w-full overflow-hidden rounded-2xl border border-black/10 bg-linear-to-b from-sky-100 to-emerald-50 dark:from-slate-800 dark:to-slate-900 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onClick={onDebugClick}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
        >
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
              <filter id="board-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              <pattern id="board-houses" width="26" height="26" patternUnits="userSpaceOnUse">
                <rect x="4" y="10" width="8" height="8" rx="1.5" fill="#d8c9a3" opacity="0.55" />
                <rect x="17" y="4" width="7" height="7" rx="1.5" fill="#d8c9a3" opacity="0.4" />
              </pattern>
              <pattern id="board-city" width="30" height="30" patternUnits="userSpaceOnUse">
                <rect x="3" y="4" width="9" height="22" rx="1.5" fill="#c98fa0" opacity="0.35" />
                <rect x="16" y="10" width="10" height="16" rx="1.5" fill="#c98fa0" opacity="0.28" />
              </pattern>
              <pattern id="board-forest" width="34" height="34" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="10" r="6" fill="#2f6b47" opacity="0.55" />
                <circle cx="24" cy="6" r="5" fill="#2f6b47" opacity="0.45" />
                <circle cx="18" cy="22" r="7" fill="#2f6b47" opacity="0.5" />
                <circle cx="30" cy="26" r="5" fill="#2f6b47" opacity="0.4" />
              </pattern>
              <pattern id="board-farmland" width="40" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
                <rect width="40" height="16" fill="none" />
                <rect y="0" width="40" height="7" fill="#c2b978" opacity="0.4" />
              </pattern>
            </defs>

            {/* 背景装飾 */}
            {(map.decorations ?? []).map((deco, i) => (
              <Decoration key={i} deco={deco} minX={minX} minY={minY} />
            ))}

            {/* 道路 */}
            {edges.map((edge) => {
              const from = nodeById.get(edge.from)!;
              const to = nodeById.get(edge.to)!;
              const style = ROAD_STYLE[edge.roadType];
              const x1 = from.x - minX;
              const y1 = from.y - minY;
              const x2 = to.x - minX;
              const y2 = to.y - minY;
              const d = straightRoadPath(x1, y1, x2, y2);
              const isSelectableEdge =
                routeOptions.length > 0 &&
                ((from.id === currentPlayer?.currentNodeId && selectableIds.has(to.id)) ||
                  (to.id === currentPlayer?.currentNodeId && selectableIds.has(from.id)));
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={isSelectableEdge ? 1 : 0.92} className={isSelectableEdge ? "animate-pulse-node" : undefined}>
                  <path d={d} fill="none" stroke={style.base} strokeWidth={style.width} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={style.top} strokeWidth={style.width * 0.72} strokeLinecap="round" strokeDasharray={style.dash} />
                  {!style.dash && (
                    <path d={d} fill="none" stroke="#f3ecd9" strokeWidth={1.6} strokeDasharray="8 10" strokeLinecap="round" opacity={0.75} />
                  )}
                </g>
              );
            })}

            {/* マス */}
            {map.nodes.map((node) => {
              const style = NODE_STYLE[node.type];
              const propDef = node.type === "property" && node.propertyId ? getPropertyDef(node.propertyId) : undefined;
              const isLandmark = !!propDef?.isRealLandmark;
              const fillColor = isLandmark ? LANDMARK_STYLE.fill : (ownerColor(node.propertyId, players) ?? style.fill);
              const strokeColor = isLandmark ? LANDMARK_STYLE.stroke : style.stroke;
              const icon = propDef?.icon ?? style.icon;
              const isDestination = node.id === destinationNodeId;
              const isSelectable = selectableIds.has(node.id);
              const radius = node.isMajorHub ? MAJOR_HUB_RADIUS : NODE_RADIUS;
              const cx = node.x - minX;
              const cy = node.y - minY;
              return (
                <g key={node.id} onClick={() => isSelectable && onSelectRoute(node.id)} style={{ cursor: isSelectable ? "pointer" : "default" }}>
                  {node.isMajorHub && <circle cx={cx} cy={cy} r={radius + 20} fill="#fff8e6" opacity={0.5} filter="url(#board-soft)" />}
                  {isDestination && (
                    <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke="#f5a623" strokeWidth={3} className="animate-ping-slow" />
                  )}
                  {isSelectable && <circle cx={cx} cy={cy} r={radius + 6} fill="#fde68a" opacity={0.55} className="animate-pulse-node" />}
                  {isLandmark && <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#caa23d" strokeWidth={1.5} opacity={0.6} />}
                  <rect
                    x={cx - radius}
                    y={cy - radius}
                    width={radius * 2}
                    height={radius * 2}
                    rx={6}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={node.isMajorHub ? 3.5 : isLandmark ? 3 : 2.5}
                  />
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={node.isMajorHub ? 16 : 13} pointerEvents="none">
                    {icon}
                  </text>
                  {isDestination && (
                    <text x={cx} y={cy - radius - 14} textAnchor="middle" fontSize={14} pointerEvents="none">
                      🎯
                    </text>
                  )}
                  {(node.isDestinationCandidate || node.type === "property" || node.isMajorHub) && (
                    <text
                      x={cx}
                      y={cy + radius + 13}
                      textAnchor="middle"
                      fontSize={node.isMajorHub ? 11.5 : 10.5}
                      fontWeight={node.isMajorHub ? 800 : node.isDestinationCandidate ? 700 : 400}
                      fill={isLandmark ? "#7a5c14" : "#3f3a30"}
                      stroke="#fff"
                      strokeWidth={3}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 車コマ */}
            {players.map((player, i) => {
              const node = nodeById.get(player.currentNodeId)!;
              const samePlace = players.filter((p) => p.currentNodeId === player.currentNodeId);
              const indexInCluster = samePlace.findIndex((p) => p.id === player.id);
              const { dx, dy } = getClusterOffset(indexInCluster, samePlace.length);
              return (
                <CarToken
                  key={player.id}
                  x={node.x - minX}
                  y={node.y - minY}
                  color={player.color}
                  label={player.carIcon}
                  offsetX={dx}
                  offsetY={dy}
                  isCurrentTurn={i === currentPlayerIndex}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {debugClickPos && (
        <div className="absolute right-3 top-3 rounded bg-black/80 px-2 py-1 text-xs font-mono text-white pointer-events-none">
          クリック位置: x={debugClickPos.x}, y={debugClickPos.y}
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + 0.15))}
          className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white"
          aria-label="拡大"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - 0.15))}
          className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white"
          aria-label="縮小"
        >
          −
        </button>
        <button
          type="button"
          onClick={recenterOnCurrentPlayer}
          className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-base dark:bg-slate-700 dark:text-white"
          aria-label="現在地に戻る"
          title="現在地に戻る"
        >
          🚗
        </button>
      </div>
    </div>
  );
}

function Decoration({ deco, minX, minY }: { deco: MapDecoration; minX: number; minY: number }) {
  if (deco.kind === "river") {
    const points = deco.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    const d = smoothPathThroughPoints(points);
    return (
      <g opacity={0.85}>
        <path d={d} fill="none" stroke="#6fc3e0" strokeWidth={20} strokeLinecap="round" />
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.8} strokeDasharray="2 10" opacity={0.55} />
      </g>
    );
  }
  if (deco.kind === "parkBlob") {
    return (
      <ellipse
        cx={deco.cx - minX}
        cy={deco.cy - minY}
        rx={deco.rx}
        ry={deco.ry}
        fill="#6fbf73"
        opacity={0.3}
        filter="url(#board-soft)"
      />
    );
  }
  if (deco.kind === "terrain") {
    const cx = deco.cx - minX;
    const cy = deco.cy - minY;
    const rotation = deco.rotation ?? 0;
    if (deco.variant === "hills") {
      // 少しずつずらした3つの楕円を重ね、なだらかな丘の輪郭に見せる
      return (
        <g opacity={0.5} filter="url(#board-soft)">
          <ellipse cx={cx - deco.rx * 0.35} cy={cy + deco.ry * 0.15} rx={deco.rx * 0.7} ry={deco.ry * 0.55} fill="#8a9a5b" />
          <ellipse cx={cx + deco.rx * 0.3} cy={cy + deco.ry * 0.2} rx={deco.rx * 0.6} ry={deco.ry * 0.5} fill="#7d8f52" />
          <ellipse cx={cx} cy={cy} rx={deco.rx} ry={deco.ry} fill="#8fa363" />
        </g>
      );
    }
    const fill = deco.variant === "forest" ? "url(#board-forest)" : "url(#board-farmland)";
    const baseFill = deco.variant === "forest" ? "#e3efe2" : "#f1ecd5";
    return (
      <g opacity={0.8} transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        <ellipse cx={cx} cy={cy} rx={deco.rx} ry={deco.ry} fill={baseFill} />
        <ellipse cx={cx} cy={cy} rx={deco.rx} ry={deco.ry} fill={fill} />
      </g>
    );
  }
  if (deco.kind === "texture") {
    return (
      <rect
        x={deco.x - minX}
        y={deco.y - minY}
        width={deco.width}
        height={deco.height}
        rx={26}
        fill={`url(#board-${deco.variant})`}
      />
    );
  }
  if (deco.kind === "sea") {
    return deco.edge === "right" ? (
      <rect x={deco.pos - minX} y={-2000} width={5000} height={6000} fill="#3fa9dd" opacity={0.85} />
    ) : (
      <rect x={-2000} y={deco.pos - minY} width={6000} height={5000} fill="#3fa9dd" opacity={0.85} />
    );
  }
  if (deco.kind === "coastline") {
    const points = deco.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    if (points.length === 0) return null;
    const curveD = smoothPathThroughPoints(points);
    const first = points[0];
    const last = points[points.length - 1];
    const farY = 6000; // 曲線から十分下(海側)まで塗りつぶす
    const fillD = `${curveD} L${last.x},${farY} L${first.x},${farY} Z`;
    return (
      <g>
        <path d={fillD} fill="#3fa9dd" opacity={0.85} />
        <path d={curveD} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="2 12" opacity={0.6} />
      </g>
    );
  }
  if (deco.kind === "beach") {
    const points = deco.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    if (points.length === 0) return null;
    const curveD = smoothPathThroughPoints(points);
    const first = points[0];
    const last = points[points.length - 1];
    const farY = 6000;
    const fillD = `${curveD} L${last.x},${farY} L${first.x},${farY} Z`;
    return <path d={fillD} fill="#efdfae" />;
  }
  return null;
}

function ownerColor(propertyId: string | undefined, players: Player[]): string | undefined {
  if (!propertyId) return undefined;
  const owner = players.find((p) => p.ownedPropertyIds.includes(propertyId));
  return owner?.color;
}
