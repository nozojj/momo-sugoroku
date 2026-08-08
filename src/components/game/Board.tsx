"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameStatus, MapData, MapDecoration, Player, PropertyDef, RouteOption } from "@/types/game";
import { NODE_STYLE, ROAD_STYLE, LANDMARK_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, getClusterOffset, straightRoadPath } from "@/lib/game/mapStyle";
import { getPropertiesInGroup } from "@/data/properties";
import { getPropertyGroupDef } from "@/data/propertyGroups";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { resolveBuildingForNode } from "@/lib/game/buildingStyle";
import { CarToken } from "./CarToken";
import { BuildingSprite } from "./BuildingSprite";

interface BoardProps {
  map: MapData;
  players: Player[];
  currentPlayerIndex: number;
  destinationNodeId: string;
  routeOptions: RouteOption[];
  onSelectRoute: (nodeId: string) => void;
  status: GameStatus;
}

const PADDING = 80;

/** スマホの通常時(移動していないとき)の初期ズーム倍率。全体を見渡すことより、
 *  マス/道路/プレイヤーの視認性を優先した値。実機確認後はこの1箇所だけ変更すればよい。 */
const MOBILE_INITIAL_ZOOM = 2.0;
/** スマホで移動中(サイコロを振った後)に使う、通常時より車周辺を大きく見せるズーム倍率。
 *  マスの種類(+/−/カード/イベント)を一目で判別できることを優先して2.5に設定。 */
const MOBILE_MOVEMENT_ZOOM = 2.5;
/** PCで移動中に使うズーム倍率。通常時は全体フィット(かなり小さい)なので、移動中だけこの倍率に寄せる。
 *  調整用定数。実機確認後はこの1箇所だけ変更すればよい。 */
const DESKTOP_MOVEMENT_ZOOM = 1.4;
/** パン/ズームのCSSトランジション時間。CarTokenの移動アニメーション(420ms)と揃え、
 *  カメラ追従が駒の移動に自然に同期して見えるようにする。 */
const CAMERA_TRANSITION_MS = 420;
/** このズーム未満は「全体表示」段階(建物イラストを間引き、マスの色分け表示だけにする)。
 *  移動中(isMovingPhase)はズーム値に関わらず常に詳細表示にする。 */
const ZOOM_DETAIL_THRESHOLD = 0.9;

/**
 * マスの大きさ・アイコンサイズのLOD(3段階)。
 * 「全体表示」より大きくする段階でも、マス同士の最小間隔(24, mapBuilder.tsのMIN_NODE_DIST)を
 * 超えて重ならないよう、通常ズーム・移動中ズームの半径はどちらも12(直径24)に揃えている。
 * 見やすさの向上はアイコンサイズの拡大側で稼ぐ。主要ハブは間隔に余裕があることが多いため
 * やや大きめだが、密集地では見た目を確認して調整すること。
 */
type BoardLodTier = "overview" | "normal" | "movement";

const LOD_RADIUS: Record<BoardLodTier, { node: number; hub: number }> = {
  overview: { node: NODE_RADIUS, hub: MAJOR_HUB_RADIUS },
  normal: { node: 12, hub: 20 },
  movement: { node: 12, hub: 22 },
};
const LOD_ICON_SIZE: Record<BoardLodTier, { node: number; hub: number }> = {
  overview: { node: 13, hub: 16 },
  normal: { node: 15, hub: 18 },
  movement: { node: 18, hub: 20 },
};

function resolveLodTier(zoom: number, isMovingPhase: boolean): BoardLodTier {
  if (isMovingPhase) return "movement";
  return zoom >= ZOOM_DETAIL_THRESHOLD ? "normal" : "overview";
}

type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: { x: number; y: number } }
  | {
      kind: "pinch";
      idA: number;
      idB: number;
      startDist: number;
      startMidX: number;
      startMidY: number;
      startZoom: number;
      startPan: { x: number; y: number };
    };

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

export function Board({ map, players, currentPlayerIndex, destinationNodeId, routeOptions, onSelectRoute, status }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.55);
  const dragState = useRef<DragState | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState(false);
  const [debugClickPos, setDebugClickPos] = useState<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobileViewport();
  /** falseの間はプレイヤー移動によるカメラ追従を止める(ユーザーが手動でマップを動かした場合)。 */
  const autoFollowRef = useRef(true);

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

  /** 通常時(移動していないとき)のズーム/パン。PCはマップ全体が余白なく収まるズームへ、
   *  スマホは全体を見渡すことよりマス・道路・プレイヤーの視認性を優先した固定ズームで
   *  現在プレイヤー周辺を映す。 */
  function getIdleCamera(rect: DOMRect): { zoom: number; pan: { x: number; y: number } } {
    if (isMobile) {
      const z = clampZoom(MOBILE_INITIAL_ZOOM);
      const node = nodeById.get(currentPlayer?.currentNodeId ?? map.startNodeId);
      return {
        zoom: z,
        pan: node
          ? { x: rect.width / 2 - (node.x - minX) * z, y: rect.height / 2 - (node.y - minY) * z }
          : { x: (rect.width - width * z) / 2, y: (rect.height - height * z) / 2 },
      };
    }
    const z = clampZoom(Math.min(rect.width / width, rect.height / height) * 0.94);
    return { zoom: z, pan: { x: (rect.width - width * z) / 2, y: (rect.height - height * z) / 2 } };
  }

  /** 移動中(サイコロを振った後〜着地まで、分岐選択中も含む)のズーム/パン。現在プレイヤーを中心に、
   *  通常表示より寄ったズームで映す。 */
  function getMovementCamera(rect: DOMRect): { zoom: number; pan: { x: number; y: number } } {
    const z = clampZoom(isMobile ? MOBILE_MOVEMENT_ZOOM : DESKTOP_MOVEMENT_ZOOM);
    const node = nodeById.get(currentPlayer?.currentNodeId ?? map.startNodeId);
    return {
      zoom: z,
      pan: node
        ? { x: rect.width / 2 - (node.x - minX) * z, y: rect.height / 2 - (node.y - minY) * z }
        : { x: (rect.width - width * z) / 2, y: (rect.height - height * z) / 2 },
    };
  }

  const isMovingPhase = status === "moving" || status === "selectingRoute";
  const lodTier = resolveLodTier(zoom, isMovingPhase);
  const lodRadius = LOD_RADIUS[lodTier];
  const lodIconSize = LOD_ICON_SIZE[lodTier];
  const wasMovingPhaseRef = useRef(false);

  // 初回表示、および isMobile が切り替わった瞬間の通常カメラ。
  useEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const { zoom: z, pan: p } = getIdleCamera(rect);
    setZoom(z);
    setPan(p);
    autoFollowRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, isMobile]);

  // サイコロを振った瞬間(移動フェーズ開始)にプレイヤー中心へズームイン、
  // 着地して移動フェーズが終わった瞬間に通常表示へズームアウトする。
  useEffect(() => {
    // クリーンアップでrefを実行前の値に戻す: React Strict Modeの開発時二重実行
    // (mount→cleanup→再mount)でも、2回目の実行が「前回すでに遷移済み」と
    // 誤認して何もしない(結果としてズームが古いままになる)のを防ぐため。
    const previousPhase = wasMovingPhaseRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      if (isMovingPhase && !previousPhase) {
        const { zoom: z, pan: p } = getMovementCamera(rect);
        setZoom(z);
        setPan(p);
        autoFollowRef.current = true;
      } else if (!isMovingPhase && previousPhase) {
        const { zoom: z, pan: p } = getIdleCamera(rect);
        setZoom(z);
        setPan(p);
        autoFollowRef.current = true;
      }
    }
    wasMovingPhaseRef.current = isMovingPhase;
    return () => {
      wasMovingPhaseRef.current = previousPhase;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMovingPhase]);

  // プレイヤーが移動(または手番交代)したら、移動フェーズ中かつ追従が有効な間だけカメラを追いかける。
  // isMovingPhaseを依存に含めない: フェーズが切り替わった瞬間は上のエフェクトが処理するので、
  // ここで二重に発火すると(そちらのsetZoomがまだ反映されていない)古いzoomを使ってパンを計算してしまう。
  useEffect(() => {
    if (!isMovingPhase || !autoFollowRef.current) return;
    const node = nodeById.get(currentPlayer?.currentNodeId ?? "");
    const rect = containerRef.current?.getBoundingClientRect();
    if (!node || !rect) return;
    setPan({ x: rect.width / 2 - (node.x - minX) * zoom, y: rect.height / 2 - (node.y - minY) * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerIndex, currentPlayer?.currentNodeId]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // 2本目の指が触れた: パン中でもピンチ操作へ切り替える
      const ids = [...pointersRef.current.keys()];
      const p1 = pointersRef.current.get(ids[0])!;
      const p2 = pointersRef.current.get(ids[1])!;
      dragState.current = {
        kind: "pinch",
        idA: ids[0],
        idB: ids[1],
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        startMidX: (p1.x + p2.x) / 2,
        startMidY: (p1.y + p2.y) / 2,
        startZoom: zoom,
        startPan: pan,
      };
      autoFollowRef.current = false;
    } else if (pointersRef.current.size === 1) {
      dragState.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const drag = dragState.current;
    if (!drag) return;

    if (drag.kind === "pan") {
      autoFollowRef.current = false;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
      return;
    }

    // ピンチ: 開始時の中点が指すゲーム座標を求め、今の中点の下に来るようズーム/パンを同時に更新する
    // (開始時のスナップショットだけから毎回計算するので、フレームごとの誤差が蓄積しない)
    const rect = containerRef.current?.getBoundingClientRect();
    const p1 = pointersRef.current.get(drag.idA);
    const p2 = pointersRef.current.get(drag.idB);
    if (!rect || !p1 || !p2 || drag.startDist === 0) return;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const targetZoom = clampZoom(drag.startZoom * (dist / drag.startDist));
    const gameX = (drag.startMidX - rect.left - drag.startPan.x) / drag.startZoom;
    const gameY = (drag.startMidY - rect.top - drag.startPan.y) / drag.startZoom;
    setZoom(targetZoom);
    setPan({ x: midX - rect.left - gameX * targetZoom, y: midY - rect.top - gameY * targetZoom });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    // 簡略化: ピンチ中に指が1本減ったら単指パンへ引き継がず、いったん操作をリセットする
    dragState.current = null;
    setDragging(pointersRef.current.size > 0);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    autoFollowRef.current = false;
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
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    autoFollowRef.current = true;
    const { zoom: z, pan: p } = isMovingPhase ? getMovementCamera(rect) : getIdleCamera(rect);
    setZoom(z);
    setPan(p);
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-linear-to-b from-sky-100 to-emerald-50 dark:from-slate-800 dark:to-slate-900 touch-none select-none"
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
            transition: dragging ? "none" : `transform ${CAMERA_TRANSITION_MS}ms ease-out`,
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
              const group = node.type === "property" && node.propertyGroupId ? getPropertyGroupDef(node.propertyGroupId) : undefined;
              const groupProperties = group ? getPropertiesInGroup(group.id) : [];
              const isLandmark = groupProperties.some((p) => p.isRealLandmark);
              const fillColor = isLandmark ? LANDMARK_STYLE.fill : (groupOwnerColor(groupProperties, players) ?? style.fill);
              const strokeColor = isLandmark ? LANDMARK_STYLE.stroke : style.stroke;
              const icon = group?.icon ?? style.icon;
              const isDestination = node.id === destinationNodeId;
              const isSelectable = selectableIds.has(node.id);
              const radius = node.isMajorHub ? lodRadius.hub : lodRadius.node;
              const iconSize = node.isMajorHub ? lodIconSize.hub : lodIconSize.node;
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
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={iconSize} fontWeight={700} pointerEvents="none">
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

            {/* 建物(マス・道路とは独立した見た目レイヤー。低ズーム時はマスの色分けだけで十分見やすいので間引く) */}
            {zoom >= ZOOM_DETAIL_THRESHOLD &&
              map.nodes.map((node) => {
                const group = node.propertyGroupId ? getPropertyGroupDef(node.propertyGroupId) : undefined;
                const override = map.buildingOverrides?.find((o) => o.nodeId === node.id);
                const building = resolveBuildingForNode(node, group, override);
                if (!building) return null;
                return (
                  <BuildingSprite
                    key={node.id}
                    cx={node.x - minX + building.offsetX}
                    cy={node.y - minY + building.offsetY}
                    buildingType={building.buildingType}
                    scale={building.scale}
                  />
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
          onClick={() => {
            autoFollowRef.current = false;
            setZoom((z) => clampZoom(z + 0.15));
          }}
          className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white"
          aria-label="拡大"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            autoFollowRef.current = false;
            setZoom((z) => clampZoom(z - 0.15));
          }}
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

/** そのグループの全物件を1人のプレイヤーが買い切っているときだけ、そのプレイヤーの色を返す
 *  (グループ独占の視覚的な先取り)。部分所有・未所有では通常色のまま。 */
function groupOwnerColor(groupProperties: PropertyDef[], players: Player[]): string | undefined {
  if (groupProperties.length === 0) return undefined;
  for (const player of players) {
    if (groupProperties.every((p) => player.ownedPropertyIds.includes(p.id))) return player.color;
  }
  return undefined;
}
