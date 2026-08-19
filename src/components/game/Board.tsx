"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameStatus, MapData, MapDecoration, Player, PropertyDef, RouteOption, VehicleMode } from "@/types/game";
import { NODE_STYLE, ROAD_STYLE, LANDMARK_STYLE, STATION_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, getClusterOffset, straightRoadPath } from "@/lib/game/mapStyle";
import { shortestPath } from "@/lib/game/mapGraph";
import { getPropertiesInGroup, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { isRegionMonopolized } from "@/lib/game/propertyOwnership";
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
  /** destinationFocus演出(カメラ移動+目的地強調)が完了した(自動 or タップスキップ)ときに呼ばれる */
  onDestinationFocusComplete: () => void;
  /** cardWarpFocus中にカメラを合わせる対象ノード(ワープ先)。status:"cardWarpFocus"のときのみ使う。 */
  cardWarpTargetNodeId?: string | null;
  /** cardWarpFocus演出(カメラ瞬間移動+ワープ先強調)が完了した(自動 or タップスキップ)ときに呼ばれる */
  onCardWarpFocusComplete?: () => void;
  /** 急行系カード使用中に一時的に切り替わる車の見た目。currentPlayerIndexの駒にのみ適用する。 */
  activeVehicleMode: VehicleMode | null;
  /** 現在地→目的地の最短ルートを道路上に発光表示するか。既定true。
   *  将来「最短ルート表示 ON/OFF」設定を追加する際は、呼び出し側(GameScreen.tsx)で
   *  この値をstate/設定から渡すだけでよく、Board.tsx側の変更は不要な設計にしている。 */
  showShortestRoute?: boolean;
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
/** 目的地カメラ演出(destinationFocus)で使うズーム倍率。移動中(MOVEMENT_ZOOM)より少し引いた
 *  見え方にして、目的地マスだけでなく周辺の道も見えるようにする。実機確認後はこの1箇所だけ変更すればよい。 */
const DESKTOP_DESTINATION_ZOOM = 1.25;
const MOBILE_DESTINATION_ZOOM = 2.1;
/** 目的地カメラ演出の所要時間。パン(カメラ移動)にかける時間と、到着後に停止して見せる時間を分離した
 *  調整用定数。タップでスキップした場合はDESTINATION_FOCUS_SKIP_HOLD_MSの方を使う。 */
const DESTINATION_FOCUS_PAN_MS = 420;
const DESTINATION_FOCUS_HOLD_MS = 1200;
/** タップでスキップした場合、目的地中央の最終位置へ即座にジャンプしてからこの時間だけ表示を保持する。 */
const DESTINATION_FOCUS_SKIP_HOLD_MS = 450;
/** cardWarpFocus(ワープ先カメラ演出)で表示を保持する時間。destinationFocusと違いパン演出は無く
 *  (瞬間移動の「カット」を主役にするため)、この時間だけ静止表示してから通常カメラへ戻る。 */
const CARD_WARP_FOCUS_HOLD_MS = 1100;
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

export function Board({
  map,
  players,
  currentPlayerIndex,
  destinationNodeId,
  routeOptions,
  onSelectRoute,
  status,
  onDestinationFocusComplete,
  cardWarpTargetNodeId = null,
  onCardWarpFocusComplete,
  activeVehicleMode,
  showShortestRoute = true,
}: BoardProps) {
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
  /** trueの間はCSSトランジションを無効化し、pan/zoomの変更を即座に反映する(destinationFocusのタップスキップ用)。 */
  const [instantCameraTransition, setInstantCameraTransition] = useState(false);
  const wasDestinationFocusRef = useRef(false);
  const destinationFocusTimerRef = useRef<number | null>(null);
  /** このdestinationFocusサイクルで既にonDestinationFocusCompleteを呼んだか(二重発火防止) */
  const destinationFocusResolvedRef = useRef(false);
  /** このdestinationFocusサイクルで既にタップスキップ済みか(複数タップでの多重スキップ防止) */
  const destinationFocusSkippedRef = useRef(false);
  /** cardWarpFocus(ワープ先カメラ演出)用。destinationFocus系refと同じ役割分担。 */
  const wasCardWarpFocusRef = useRef(false);
  const cardWarpFocusTimerRef = useRef<number | null>(null);
  const cardWarpFocusResolvedRef = useRef(false);

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

  /** 現在地→目的地の最短ルート案内(表示専用)。GameStateには保存せず、その場でBFSするだけ。
   *  到着済み(現在地===目的地)のときはnullにして発光を出さない。 */
  const shortestPathNodeIds = useMemo(() => {
    if (!currentPlayer || currentPlayer.currentNodeId === destinationNodeId) return null;
    return shortestPath(map, currentPlayer.currentNodeId, destinationNodeId, currentPlayer.cardIds);
  }, [map, currentPlayer?.currentNodeId, destinationNodeId, currentPlayer?.cardIds]);

  /** shortestPathNodeIdsの隣接ノード対を、edges(道路)の重複排除キーと同じ形式("from|to"をsort)で
   *  Set化したもの。道路描画側はこのSetにキーが含まれるかだけを見ればよい。 */
  const shortestPathEdgeKeys = useMemo(() => {
    if (!shortestPathNodeIds || shortestPathNodeIds.length < 2) return null;
    const keys = new Set<string>();
    for (let i = 0; i < shortestPathNodeIds.length - 1; i++) {
      keys.add([shortestPathNodeIds[i], shortestPathNodeIds[i + 1]].sort().join("|"));
    }
    return keys;
  }, [shortestPathNodeIds]);

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

  /** 指定ノードを中心に据えたカメラ(ズーム/パン)を計算する共通ヘルパー。
   *  destinationFocus(次の目的地)・cardWarpFocus(ワープ先)のどちらもこれを使う:
   *  「対象ノードを中心に、通常より寄ったズームで見せる」という演出の本体はここに1つだけ持つ。 */
  function getNodeFocusCamera(rect: DOMRect, targetNodeId: string | null): { zoom: number; pan: { x: number; y: number } } {
    const z = clampZoom(isMobile ? MOBILE_DESTINATION_ZOOM : DESKTOP_DESTINATION_ZOOM);
    const node = targetNodeId ? nodeById.get(targetNodeId) : undefined;
    return {
      zoom: z,
      pan: node
        ? { x: rect.width / 2 - (node.x - minX) * z, y: rect.height / 2 - (node.y - minY) * z }
        : { x: (rect.width - width * z) / 2, y: (rect.height - height * z) / 2 },
    };
  }

  /** 目的地カメラ演出(destinationFocus)中のズーム/パン。次の目的地マスを中心に、
   *  移動中(getMovementCamera)より少し引いたズームで周辺の道も見えるように映す。 */
  function getDestinationFocusCamera(rect: DOMRect): { zoom: number; pan: { x: number; y: number } } {
    return getNodeFocusCamera(rect, destinationNodeId);
  }

  /** ワープ先カメラ演出(cardWarpFocus)中のズーム/パン。destinationFocusと同じズーム段階を使い、
   *  対象ノードだけをcardWarpTargetNodeIdに差し替える。 */
  function getCardWarpFocusCamera(rect: DOMRect): { zoom: number; pan: { x: number; y: number } } {
    return getNodeFocusCamera(rect, cardWarpTargetNodeId);
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

  const isDestinationFocus = status === "destinationFocus";
  const isCardWarpFocus = status === "cardWarpFocus";

  /** destinationFocus演出を終了する。通常完了・タップスキップどちらの経路からも呼ばれるため、
   *  refで二重発火(=onDestinationFocusCompleteの二重呼び出し)を防ぐ。 */
  function finishDestinationFocus() {
    if (destinationFocusResolvedRef.current) return;
    destinationFocusResolvedRef.current = true;
    if (destinationFocusTimerRef.current !== null) {
      window.clearTimeout(destinationFocusTimerRef.current);
      destinationFocusTimerRef.current = null;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const { zoom: z, pan: p } = getIdleCamera(rect);
      setZoom(z);
      setPan(p);
    }
    autoFollowRef.current = true;
    onDestinationFocusComplete();
  }

  // destinationFocusに入った瞬間、次の目的地マスへカメラをパンし、一定時間(パン+停止)後に
  // 自動でfinishDestinationFocus()を呼ぶ。isMovingPhaseの遷移エフェクトと同じ
  // 「previousをrefで持ち、クリーンアップで戻す」形でStrict Modeの二重実行に対応する。
  useEffect(() => {
    const previous = wasDestinationFocusRef.current;
    if (isDestinationFocus && !previous) {
      destinationFocusResolvedRef.current = false;
      destinationFocusSkippedRef.current = false;
      setInstantCameraTransition(false);
      autoFollowRef.current = false;

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const { zoom: z, pan: p } = getDestinationFocusCamera(rect);
        setZoom(z);
        setPan(p);
      }

      if (destinationFocusTimerRef.current !== null) window.clearTimeout(destinationFocusTimerRef.current);
      destinationFocusTimerRef.current = window.setTimeout(() => {
        finishDestinationFocus();
      }, DESTINATION_FOCUS_PAN_MS + DESTINATION_FOCUS_HOLD_MS);
    }
    wasDestinationFocusRef.current = isDestinationFocus;
    return () => {
      wasDestinationFocusRef.current = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDestinationFocus]);

  /** destinationFocus中のタップスキップ。目的地中央の最終位置へ即座にジャンプしてから
   *  短い時間(DESTINATION_FOCUS_SKIP_HOLD_MS)だけ見せて終了する。 */
  function skipDestinationFocus() {
    if (!isDestinationFocus || destinationFocusResolvedRef.current || destinationFocusSkippedRef.current) return;
    destinationFocusSkippedRef.current = true;

    if (destinationFocusTimerRef.current !== null) {
      window.clearTimeout(destinationFocusTimerRef.current);
      destinationFocusTimerRef.current = null;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const { zoom: z, pan: p } = getDestinationFocusCamera(rect);
      setInstantCameraTransition(true);
      setZoom(z);
      setPan(p);
      // 「トランジション無しの瞬間移動」を1フレーム確実に描画させてから、次のトランジション
      // (終了時のgetIdleCameraへの遷移)を通常通りアニメーションさせるためにフラグを戻す。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setInstantCameraTransition(false));
      });
    }

    destinationFocusTimerRef.current = window.setTimeout(() => {
      finishDestinationFocus();
    }, DESTINATION_FOCUS_SKIP_HOLD_MS);
  }

  /** cardWarpFocus演出を終了する。ワープ先カメラ演出→通常カメラへ戻す→onCardWarpFocusComplete()
   *  という順序はdestinationFocusのfinish関数と同じ考え方(refで二重発火を防ぐ)。 */
  function finishCardWarpFocus() {
    if (cardWarpFocusResolvedRef.current) return;
    cardWarpFocusResolvedRef.current = true;
    if (cardWarpFocusTimerRef.current !== null) {
      window.clearTimeout(cardWarpFocusTimerRef.current);
      cardWarpFocusTimerRef.current = null;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const { zoom: z, pan: p } = getIdleCamera(rect);
      setZoom(z);
      setPan(p);
    }
    autoFollowRef.current = true;
    onCardWarpFocusComplete?.();
  }

  // cardWarpFocusに入った瞬間、ワープ先マスへカメラを「瞬間移動」させる(destinationFocusと違い
  // パン演出は行わない。位置そのものが不連続な瞬間移動なので、なめらかなパンより「カット」で
  // 見せた方が違和感が無い)。instantCameraTransitionはdestinationFocusのタップスキップと同じ
  // 仕組みをそのまま再利用している。
  useEffect(() => {
    const previous = wasCardWarpFocusRef.current;
    if (isCardWarpFocus && !previous) {
      cardWarpFocusResolvedRef.current = false;
      autoFollowRef.current = false;

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const { zoom: z, pan: p } = getCardWarpFocusCamera(rect);
        setInstantCameraTransition(true);
        setZoom(z);
        setPan(p);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setInstantCameraTransition(false));
        });
      }

      if (cardWarpFocusTimerRef.current !== null) window.clearTimeout(cardWarpFocusTimerRef.current);
      cardWarpFocusTimerRef.current = window.setTimeout(() => {
        finishCardWarpFocus();
      }, CARD_WARP_FOCUS_HOLD_MS);
    }
    wasCardWarpFocusRef.current = isCardWarpFocus;
    return () => {
      wasCardWarpFocusRef.current = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardWarpFocus]);

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

  function onBoardClick(e: React.MouseEvent) {
    if (isDestinationFocus) {
      skipDestinationFocus();
      return;
    }
    if (isCardWarpFocus) {
      finishCardWarpFocus();
      return;
    }
    onDebugClick(e);
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
        onClick={onBoardClick}
        style={{ cursor: dragging ? "grabbing" : isDestinationFocus || isCardWarpFocus ? "pointer" : "grab" }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: dragging || instantCameraTransition ? "none" : `transform ${CAMERA_TRANSITION_MS}ms ease-out`,
          }}
        >
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
              <filter id="board-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              {/* 最短ルート発光用。board-soft(ハブの丸い後光向け)より弱く、細い道路に合わせたぼかし。 */}
              <filter id="road-glow-soft" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
              {/* 目的地マスの通常時ソフトグロー用。road-glow-soft(道路の細い発光向け)より広く、
                  board-soft(ハブの丸い後光、範囲が広すぎる)より狭い、点(マス)向けの中間のぼかし。 */}
              <filter id="destination-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="8" />
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
              {/* Visual Prototype 1: 海の深浅グラデーション+波模様。既存のsea/coastline装飾の
                  塗りをこのgradientへ差し替えるだけで、装飾データ(points等)には一切触れない。 */}
              <linearGradient id="sea-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fdcef" />
                <stop offset="55%" stopColor="#3fa9dd" />
                <stop offset="100%" stopColor="#1f6fa8" />
              </linearGradient>
              <pattern id="board-waves" width="52" height="20" patternUnits="userSpaceOnUse">
                <path d="M0,11 Q13,4 26,11 T52,11" fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.4" />
                <path d="M0,17 Q13,10 26,17 T52,17" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.25" />
              </pattern>
              {/* 道路に軽い影を付けるための下敷き用ストローク(道路本体の描画とは別レイヤー、
                  形状データは共有するだけで道路の色分けロジックには触れない)。ぼかしフィルタは
                  使わず、オフセット+低不透明度だけで表現する(598ノード・1456エッジ規模で
                  フィルタを毎エッジに掛けるとラスタライズcoストが増えるための性能配慮)。 */}
              {/* マスを「天面ハイライト+側面シェード」で少し立体的に見せるための上掛けグラデーション。
                  既存のfillColor(所有権・独占色分け)の上に重ねるだけで、色分けロジックは無変更。 */}
              <linearGradient id="node-sheen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
              </linearGradient>
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
              const edgeKey = [edge.from, edge.to].sort().join("|");
              const isShortestRouteEdge = showShortestRoute && (shortestPathEdgeKeys?.has(edgeKey) ?? false);
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={isSelectableEdge ? 1 : 0.92} className={isSelectableEdge ? "animate-pulse-node" : undefined}>
                  {/* Visual Prototype 1: 道路の下敷き影。ぼかしフィルタは使わず、わずかな下方向オフセット+
                      低不透明度だけで立体感を出す(建物・車の落ち影と同じ「まっすぐ下」の光源方向)。 */}
                  <g transform="translate(0, 2.2)" opacity={0.18}>
                    <path d={d} fill="none" stroke="#241c14" strokeWidth={style.width * 0.9} strokeLinecap="round" />
                  </g>
                  {isShortestRouteEdge && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#ffcc33"
                      strokeOpacity={0.7}
                      strokeWidth={style.width + 14}
                      strokeLinecap="round"
                      filter="url(#road-glow-soft)"
                    />
                  )}
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
              // 主要8駅(isMajorHub)は物件グループを持たないため、isLandmark/groupOwnerColorの
              // 判定は常にfalse/undefinedになり、既存の優先順位(isLandmark > 所有色 > 種別色)を
              // 崩さずにこの下にstation分岐を差し込める。鎌倉・江の島等の地域差はここでは付けない
              // (8駅で完全に共通のSTATION_STYLEを使う。地域差は将来のランドマーク/建物側で表現する)。
              const isStation = node.isMajorHub;
              const fillColor = isLandmark
                ? LANDMARK_STYLE.fill
                : (groupOwnerColor(groupProperties, players) ?? (isStation ? STATION_STYLE.fill : style.fill));
              const strokeColor = isLandmark ? LANDMARK_STYLE.stroke : isStation ? STATION_STYLE.stroke : style.stroke;
              // 地域(region)を1人で完全独占しているプレイヤー(いなければundefined)。グループ単位の
              // 色分け(fillColor、既存・無改修)とは別レイヤーとして、そのプレイヤーの色でリングを
              // 重ねるだけ(地域独占の方がグループ独占より稀少なので、視覚的に一段強い表現にする)。
              const regionOwner = group ? regionMonopolyOwner(group.region, players) : undefined;
              const icon = group?.icon ?? style.icon;
              const isDestination = node.id === destinationNodeId;
              const isCardWarpTarget = node.id === cardWarpTargetNodeId;
              const isSelectable = selectableIds.has(node.id);
              const radius = node.isMajorHub ? lodRadius.hub : lodRadius.node;
              const iconSize = node.isMajorHub ? lodIconSize.hub : lodIconSize.node;
              const cx = node.x - minX;
              const cy = node.y - minY;
              return (
                <g key={node.id} onClick={() => isSelectable && onSelectRoute(node.id)} style={{ cursor: isSelectable ? "pointer" : "default" }}>
                  {node.isMajorHub && <circle cx={cx} cy={cy} r={radius + 20} fill="#fff8e6" opacity={0.5} filter="url(#board-soft)" />}
                  {/* 目的地カメラ演出(destinationFocus)中だけ表示する「今だけ強調」の光彩。
                      盤面全体は暗くせず、目的地マス周辺だけに効果を留める。 */}
                  {isDestination && isDestinationFocus && (
                    <circle cx={cx} cy={cy} r={radius + 30} fill="#ffb703" opacity={0.3} className="animate-spotlight-glow" />
                  )}
                  {/* ワープ先カメラ演出(cardWarpFocus)中だけ表示する「今だけ強調」の光彩。
                      destinationFocusの光彩と同じ見た目を再利用するが、🎯(目的地ラベル)は出さない
                      (ワープ先が目的地とは限らないため、目的地専用の表示と混同させない)。 */}
                  {isCardWarpTarget && isCardWarpFocus && (
                    <circle cx={cx} cy={cy} r={radius + 30} fill="#22d3ee" opacity={0.3} className="animate-spotlight-glow" />
                  )}
                  {/* 通常時(destinationFocus中でない)の目的地マス案内。ソフトグロー(面)+静止リング(輪郭)の
                      2層で構成し、常時ループするアニメーションは使わない(上品な強調に留める)。
                      色は最短ルート発光(#ffcc33)と揃えて、道路の発光が目的地マスまで自然に
                      つながって見えるようにしている。destinationFocus中はこちらを消し、
                      既存の到着演出(上のspotlight-glow等)だけを主役にする。 */}
                  {isDestination && !isDestinationFocus && (
                    <>
                      <circle cx={cx} cy={cy} r={radius + 16} fill="#ffcc33" opacity={0.35} filter="url(#destination-glow-soft)" />
                      <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke="#f5a623" strokeWidth={3} />
                    </>
                  )}
                  {isSelectable && <circle cx={cx} cy={cy} r={radius + 6} fill="#fde68a" opacity={0.55} className="animate-pulse-node" />}
                  {isLandmark && <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#caa23d" strokeWidth={1.5} opacity={0.6} />}
                  {/* 地域完全独占リング。fillColor(グループ単位、既存)の上にプレイヤー色の点線リングを
                      重ねるだけで、既存の色分けロジックには一切触れない。 */}
                  {regionOwner && (
                    <circle cx={cx} cy={cy} r={radius + 7} fill="none" stroke={regionOwner.color} strokeWidth={3} strokeDasharray="4 3" opacity={0.9} />
                  )}
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
                  {/* Visual Prototype 1: 天面ハイライト+側面シェードの上掛け。fillColor(所有権・独占の
                      色分け、既存ロジック)はそのまま、視覚的に一段立体的に見せるだけの追加レイヤー。
                      駅マスも含め全マス共通(駅の本番素材は下でこの上に重ねて描くため、素材側の
                      陰影とnode-sheenの艶が二重にならないよう、画像は必ずこのsheenより後に置く)。 */}
                  <rect
                    x={cx - radius}
                    y={cy - radius}
                    width={radius * 2}
                    height={radius * 2}
                    rx={6}
                    fill="url(#node-sheen)"
                    pointerEvents="none"
                  />
                  {/* 主要8駅の本番素材(public/tiles/station.webp)。正方形の画像をマス本体と同じ
                      x/y/width/heightにそのまま敷き込むだけで、8駅とも完全に同じ画像を再利用する
                      (駅名は既存のnameラベルが別途担当)。node-sheenより後に置くことで、
                      素材自体が持つ陰影がPhase1の艶で薄まらないようにする。読み込みに失敗した
                      場合は下のfillColor(STATION_STYLE)がそのまま背景として見える。 */}
                  {isStation && (
                    <>
                      <clipPath id={`station-clip-${node.id}`}>
                        <rect x={cx - radius} y={cy - radius} width={radius * 2} height={radius * 2} rx={6} />
                      </clipPath>
                      <image
                        href="/tiles/station.webp"
                        x={cx - radius}
                        y={cy - radius}
                        width={radius * 2}
                        height={radius * 2}
                        clipPath={`url(#station-clip-${node.id})`}
                        pointerEvents="none"
                      />
                    </>
                  )}
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize={iconSize} fontWeight={700} pointerEvents="none">
                    {icon}
                  </text>
                  {isDestination && (
                    <text
                      x={cx}
                      y={cy - radius - 14}
                      textAnchor="middle"
                      fontSize={isDestinationFocus ? 20 : 14}
                      pointerEvents="none"
                      className={isDestinationFocus ? "animate-spotlight-pop" : undefined}
                    >
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

            {/* 建物(マス・道路とは独立した見た目レイヤー。overview段階はマスの色分けだけで十分見やすいので間引く。
                移動中は常にdetail扱い(lodTier)にするため、zoomの生値ではなくlodTierで判定する。 */}
            {lodTier !== "overview" &&
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
                    groupId={group?.id}
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
                  vehicleMode={i === currentPlayerIndex ? (activeVehicleMode ?? "normal") : "normal"}
                  instant={i === currentPlayerIndex && isCardWarpFocus && instantCameraTransition}
                />
              );
            })}
          </svg>
        </div>
        {/* Visual Prototype 1: 盤面外周のヴィネット+うっすらとした光。パン/ズームの変換対象外
            (viewport基準で常に画面端に効かせる)なので、変換用<div>の外・containerRefの中に置く。
            操作を一切妨げないpointer-events-noneの見た目だけの層。 */}
        <div className="board-atmosphere pointer-events-none absolute inset-0" aria-hidden="true" />
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
    // Visual Prototype 1: 単色塗り(#3fa9dd)から深浅グラデーション+波模様へ。矩形の位置・サイズ
    // (装飾データ由来、既存ロジック)は変更せず、fillだけ差し替える。
    const rectProps =
      deco.edge === "right"
        ? { x: deco.pos - minX, y: -2000, width: 5000, height: 6000 }
        : { x: -2000, y: deco.pos - minY, width: 6000, height: 5000 };
    return (
      <g opacity={0.85}>
        <rect {...rectProps} fill="url(#sea-gradient)" />
        <rect {...rectProps} fill="url(#board-waves)" opacity={0.5} />
      </g>
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
        <path d={fillD} fill="url(#sea-gradient)" opacity={0.85} />
        {/* 波模様は塗りつぶし形状(fillD)と全く同じパスを再利用するので、別途clipPathを
            用意しなくても海の輪郭からはみ出さない。 */}
        <path d={fillD} fill="url(#board-waves)" opacity={0.45} />
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

/** その地域(region)の全グループの全物件を1人のプレイヤーが買い切っているときだけ、
 *  そのプレイヤーを返す(propertyOwnership.tsのisRegionMonopolized()をそのまま使うだけの
 *  薄いラッパー。判定ロジック自体はゲームロジック側のまま、ここでは呼び出すだけ)。 */
function regionMonopolyOwner(region: string, players: Player[]): Player | undefined {
  return players.find((p) => isRegionMonopolized(region, p.id, players, propertyDefs, propertyGroupDefs));
}
