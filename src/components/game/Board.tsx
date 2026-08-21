"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameStatus, MapData, MapDecoration, Player, PropertyDef, RoadType, RouteOption, VehicleMode } from "@/types/game";
import {
  NODE_STYLE,
  ROAD_STYLE,
  LANDMARK_STYLE,
  STATION_STYLE,
  NODE_RADIUS,
  MAJOR_HUB_RADIUS,
  getClusterOffset,
  straightRoadPath,
  dominantRoadType,
} from "@/lib/game/mapStyle";
import { resolveVisibleLabelIds, type LabelCandidate } from "@/lib/game/boardLabels";
import { edgeKey, recentTrailEdgeKeys, selectableEdgeKeys } from "@/lib/game/boardEdgeHighlight";
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
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.55);
  const dragState = useRef<DragState | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState(false);
  const [debugClickPos, setDebugClickPos] = useState<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobileViewport();
  /** isMobileの最新値を常に参照するためのref。destinationFocus/cardWarpFocusの終了処理は
   *  マウント時にsetTimeoutで予約され、その時点のisMobile(remount直後は一瞬false)を
   *  クロージャで固定してしまう。setTimeoutのコールバックは後から再生成されないため、
   *  isMobile stateを直接見るとマウント直後の古い値のまま呼ばれてしまい、スマホ復帰後に
   *  PC用のfit-to-mapズームへ戻ってしまう(P0バグの原因)。refならタイマー発火時点の
   *  最新値を読めるので、カメラ計算系の関数(getIdleCamera等)は必ずこちらを使う。 */
  const isMobileRef = useRef(isMobile);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);
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

  /** 交差点接合パッチ(Phase3)の対象一覧。degree(接続数)3以上、かつ接続道路に
   *  main/coastal/nationalのいずれかを含む交差点だけに絞る(residential同士の
   *  住宅街の角は対象外)。パッチの色は新しい色を作らず、接続道路の中で最優先の
   *  roadType(dominantRoadType)のbase/top色をそのまま使うことで、パッチ単体が
   *  「別色の丸いシール」に見えず、道路の舗装がそのまま交差点まで続いて見えるようにする。
   *  半径は接続道路の最大幅から算出し、丸い線端(strokeLinecap)どうしの隙間だけを
   *  埋める控えめなサイズに留める(交差点を目立たせるのが目的ではない)。 */
  const intersectionPatches = useMemo(() => {
    const significant = new Set<RoadType>(["main", "coastal", "national"]);
    const patches: { id: string; x: number; y: number; radius: number; roadType: RoadType }[] = [];
    for (const node of map.nodes) {
      if (node.connections.length < 3) continue;
      const types = node.connections.map((c) => c.roadType);
      if (!types.some((t) => significant.has(t))) continue;
      const maxWidth = Math.max(...node.connections.map((c) => ROAD_STYLE[c.roadType].width));
      patches.push({ id: node.id, x: node.x, y: node.y, radius: maxWidth / 2 + 3, roadType: dominantRoadType(types) });
    }
    return patches;
  }, [map]);

  const minX = Math.min(...map.nodes.map((n) => n.x)) - PADDING;
  const minY = Math.min(...map.nodes.map((n) => n.y)) - PADDING;
  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const selectableIds = new Set(routeOptions.map((o) => o.nodeId));
  const currentPlayer = players[currentPlayerIndex];

  /** P6-1: 現在地→選択可能な次マスへ続くedgeのキー集合。routeOptions(既存のselectableIdsと
   *  同じ情報源)だけから導出する薄い計算で、要素数は分岐先の本数(最大4=mapのdegree上限)しか
   *  無いため、shortestPathEdgeKeys(旧実装)のような重いuseMemoは不要。 */
  const selectableEdgeKeySet = selectableEdgeKeys(currentPlayer?.currentNodeId, routeOptions);

  function clampZoom(z: number) {
    // マップが広がった分、全体を1画面に収めるズームが0.2を下回る場合があるため下限を緩めている
    return Math.min(2.2, Math.max(0.08, z));
  }

  /** 通常時(移動していないとき)のズーム/パン。PCはマップ全体が余白なく収まるズームへ、
   *  スマホは全体を見渡すことよりマス・道路・プレイヤーの視認性を優先した固定ズームで
   *  現在プレイヤー周辺を映す。 */
  function getIdleCamera(rect: DOMRect): { zoom: number; pan: { x: number; y: number } } {
    if (isMobileRef.current) {
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
    const z = clampZoom(isMobileRef.current ? MOBILE_DESTINATION_ZOOM : DESKTOP_DESTINATION_ZOOM);
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
    const z = clampZoom(isMobileRef.current ? MOBILE_MOVEMENT_ZOOM : DESKTOP_MOVEMENT_ZOOM);
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

  /** P6-3: 直前に通過したedgeの短時間トレイル。currentPlayer.moveHistory(今回のロールで
   *  通ったnodeId列、rollDice()のたびにリセットされる既存フィールド)を読むだけで、
   *  moveHistory自体の意味・保存タイミング・他のロジックには一切触れない(表示専用の読み取り)。
   *  isMovingPhaseでない間(着地後の演出・購入確認・手番待ち等)は常に空集合にすることで、
   *  「移動中または通過直後の短時間だけ」を保証し、次の手番まで盤面に残り続けることを防ぐ。 */
  const trailEdgeKeySet = useMemo(() => {
    if (!isMovingPhase || !currentPlayer) return new Set<string>();
    return recentTrailEdgeKeys(currentPlayer.moveHistory);
  }, [isMovingPhase, currentPlayer?.moveHistory]);

  /** マス名ラベルの間引き(Phase5)。駅・目的地候補(priority 0)は常に表示し、物件(priority 1)は
   *  座標だけから決定的に間引く(boardLabels.ts参照)。overview帯はそもそも駅以外ラベルを出さない
   *  既存仕様のままなので、物件は候補にすら含めない(間引き計算のコストも省ける)。 */
  const visibleLabelIds = useMemo(() => {
    const candidates: LabelCandidate[] = [];
    for (const node of map.nodes) {
      const isStationTierLabel = node.isMajorHub || node.isDestinationCandidate;
      if (isStationTierLabel) {
        candidates.push({ id: node.id, x: node.x, y: node.y, priority: 0 });
      } else if (lodTier !== "overview" && node.type === "property") {
        candidates.push({ id: node.id, x: node.x, y: node.y, priority: 1 });
      }
    }
    return resolveVisibleLabelIds(candidates);
  }, [map, lodTier]);

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

  /** P5-1: 「🎯 目的地を見る」ボタン用。destinationFocus演出が使っているgetDestinationFocusCamera
   *  (中身はgetNodeFocusCameraの薄いラッパー)をそのまま呼ぶだけで、新しいカメラ計算は増やさない。
   *  GameState・ゲーム進行には一切触れない、表示上のパン/ズームだけの操作。recenterOnCurrentPlayer
   *  と違いautoFollowRef.currentは有効化しない(+/−ズームボタンと同じく、ユーザーが手動で見ている
   *  間はプレイヤー追従を再開させない)。 */
  function focusOnDestination() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    autoFollowRef.current = false;
    const { zoom: z, pan: p } = getDestinationFocusCamera(rect);
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
              {/* 道路edgeの発光用(P6-1選択可能edge・P6-3通過済みトレイル共通)。board-soft(ハブの
                  丸い後光向け)より弱く、細い道路に合わせたぼかし。 */}
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
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.62" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.24" />
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
              const edgeMapKey = edgeKey(edge.from, edge.to);
              const isSelectableEdge = selectableEdgeKeySet.has(edgeMapKey);
              const isTrailEdge = trailEdgeKeySet.has(edgeMapKey);
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={isSelectableEdge ? 1 : 0.92}>
                  {/* Visual Prototype 1: 道路の下敷き影。ぼかしフィルタは使わず、わずかな下方向オフセット+
                      低不透明度だけで立体感を出す(建物・車の落ち影と同じ「まっすぐ下」の光源方向)。 */}
                  <g transform="translate(0, 2.2)" opacity={0.18}>
                    <path d={d} fill="none" stroke="#241c14" strokeWidth={style.width * 0.9} strokeLinecap="round" />
                  </g>
                  {/* P6-3: 直前に通過したedgeの短時間トレイル。選択可能edge(下記)より優先度を下げる
                      ため、彩度・不透明度とも控えめにし、色相も選択可能edge(暖色系アンバー)とは
                      はっきり別の寒色系にして混同しないようにする。アニメーションは付けない
                      (moveHistoryの窓がスライドすることで自然に消えるため、常時点滅させる必要が無い)。 */}
                  {isTrailEdge && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#7dd3fc"
                      strokeOpacity={0.4}
                      strokeWidth={style.width + 5}
                      strokeLinecap="round"
                      filter="url(#road-glow-soft)"
                    />
                  )}
                  {/* P6-1: 選択可能edge(現在地→選択可能な次マス)のハイライト。道路面(base/top)より
                      奥、影より手前に重ねるだけの追加レイヤーで、既存のroad-glow-soft(旧・最短ルート
                      グローと同じフィルタ)を再利用する。色・アニメーション(animate-pulse-node)とも
                      選択可能マスのリング(#fde68a、Board.tsx内の別箇所)と揃え、「マスの強調→そこへ
                      続く道の強調」が一続きに見えるようにする。 */}
                  {isSelectableEdge && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#ffd166"
                      strokeOpacity={0.75}
                      strokeWidth={style.width + 8}
                      strokeLinecap="round"
                      filter="url(#road-glow-soft)"
                      className="animate-pulse-node"
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

            {/* 交差点接合パッチ(Phase3)。道路(直前)より前面・マス(直後)より背面に置くことで、
                「マスの下に舗装が広がっている」ように見せる。overview帯では建物と同じ条件で
                間引き、俯瞰の道路網の骨格を邪魔しない(要素数の節約も兼ねる)。 */}
            {lodTier !== "overview" &&
              intersectionPatches.map((patch) => {
                const style = ROAD_STYLE[patch.roadType];
                const cx = patch.x - minX;
                const cy = patch.y - minY;
                return (
                  <g key={`patch-${patch.id}`}>
                    <circle cx={cx} cy={cy} r={patch.radius} fill={style.base} />
                    <circle cx={cx} cy={cy} r={patch.radius * 0.72} fill={style.top} />
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
              const groupOwnerHex = groupOwnerColor(groupProperties, players);
              const fillColor = isLandmark
                ? LANDMARK_STYLE.fill
                : (groupOwnerHex ?? (isStation ? STATION_STYLE.fill : style.fill));
              // P5-3: ランドマークのfillは「実在ランドマークである」という意味を守るため独占時も
              // 金色のまま変えない(所有者色に置き換えない)。その代わりstrokeを独占時だけ所有者色に
              // 差し替えることで、「ランドマークであること」(fill)と「独占されていること」(stroke)を
              // 同時に読み取れるようにする(非独占時は従来通りLANDMARK_STYLE.strokeの金枠)。
              const strokeColor = isLandmark
                ? (groupOwnerHex ?? LANDMARK_STYLE.stroke)
                : isStation
                  ? STATION_STYLE.stroke
                  : style.stroke;
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
                  {/* Phase4: マスの接地影。ぼかしフィルタは使わず、わずかな下方向オフセット+低不透明度だけで
                      「地面に接している」感を出す(道路の下敷き影と同じ考え方)。pointerEventsをnoneにして
                      クリック/選択判定(このgのonClick)には一切影響させない。overview帯では598マス分の
                      追加要素をレンダリングするコストに見合わないため間引く。 */}
                  {lodTier !== "overview" && (
                    <rect
                      x={cx - radius}
                      y={cy - radius + 1.8}
                      width={radius * 2}
                      height={radius * 2}
                      rx={6}
                      fill="#1a1208"
                      opacity={0.16}
                      pointerEvents="none"
                    />
                  )}
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
                      destinationFocus中はこちらを消し、既存の到着演出(上のspotlight-glow等)だけを
                      主役にする。 */}
                  {isDestination && !isDestinationFocus && (
                    <>
                      <circle cx={cx} cy={cy} r={radius + 16} fill="#ffcc33" opacity={0.35} filter="url(#destination-glow-soft)" />
                      <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke="#f5a623" strokeWidth={3} />
                    </>
                  )}
                  {/* P5-4: r+4〜+7の近接リング(ランドマーク/地域独占/選択可能)は、半径10〜12のマスに
                      対して3〜4px間隔でしか離れておらず、同時に出ると輪郭が潰れて読み取れなくなる
                      (Phase5 Proposal参照)。「今プレイヤーが操作するために必要な情報」を最優先にし、
                      選択可能 > 所有/独占情報(地域独占) > 装飾的なランドマーク表現の順で排他表示する
                      (下位のリングを非表示にしても、ランドマークの金fill/地域独占の情報自体は他の
                      経路で失われない。選択可能な間だけ一時的に隠れるだけで、選択が終われば元に戻る)。 */}
                  {isSelectable && <circle cx={cx} cy={cy} r={radius + 6} fill="#fde68a" opacity={0.55} className="animate-pulse-node" />}
                  {!isSelectable && regionOwner && (
                    <circle cx={cx} cy={cy} r={radius + 7} fill="none" stroke={regionOwner.color} strokeWidth={3} strokeDasharray="4 3" opacity={0.9} />
                  )}
                  {!isSelectable && !regionOwner && isLandmark && (
                    <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#caa23d" strokeWidth={1.5} opacity={0.6} />
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
                  {/* overview帯(俯瞰・全体表示)では主要8駅名だけを残し、それ以外のマス名は間引く。
                      俯瞰で全マス名を出すと文字が団子状に重なり、道路網の骨格自体が読みにくくなっていた
                      (2026-08-20 盤面ビジュアル監査より)。lodTierはズーム値とisMovingPhaseだけで決まる
                      既存の純粋関数の結果なので、normal/movement/destinationFocusの表示・ズーム値・
                      LOD閾値には一切影響しない。normal/movement帯では、さらにvisibleLabelIds(Phase5、
                      boardLabels.ts)が藤沢ロータリー・鎌倉小路等の密集区画で近接するラベル同士の
                      重なりを間引く。駅・目的地候補は常にvisibleLabelIdsに含まれる(間引かれない)。 */}
                  {visibleLabelIds.has(node.id) && (
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
                const building = resolveBuildingForNode(node, group, override, { node: lodRadius.node, hub: lodRadius.hub });
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

      {/* ホームインジケーター/右エッジのセーフエリアぶん最小オフセットを確保する(PCではenv()が
          0なのでright-3/bottom-3と同じ位置)。gap-2はスマホでのタップ領域拡大(44px)に合わせて
          隣接ボタン同士の誤タップを減らすための間隔で、smではgap-1.5(既存値)に戻す。 */}
      <div
        className="absolute flex flex-col gap-2 sm:gap-1.5"
        style={{
          right: "max(0.75rem, env(safe-area-inset-right, 0px))",
          bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <button
          type="button"
          onClick={() => {
            autoFollowRef.current = false;
            setZoom((z) => clampZoom(z + 0.15));
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white sm:h-9 sm:w-9"
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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white sm:h-9 sm:w-9"
          aria-label="縮小"
        >
          −
        </button>
        <button
          type="button"
          onClick={recenterOnCurrentPlayer}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow border border-black/10 text-base dark:bg-slate-700 dark:text-white sm:h-9 sm:w-9"
          aria-label="現在地に戻る"
          title="現在地に戻る"
        >
          🚗
        </button>
        {/* P5-1: 目的地は常に主要8駅のどれかで盤面全体は広いため、モバイルの通常カメラ(現在地中心の
            固定ズーム)では目的地が画面外にあることが多い。「現在地に戻る」と対になる形でここに置き、
            focusOnDestination()(destinationFocus演出と同じgetNodeFocusCameraを再利用)を呼ぶだけ。 */}
        <button
          type="button"
          onClick={focusOnDestination}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow border border-black/10 text-base dark:bg-slate-700 dark:text-white sm:h-9 sm:w-9"
          aria-label="目的地を見る"
          title="目的地を見る"
        >
          🎯
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
  if (deco.kind === "rotaryMedian") {
    // 駅ハブを中心とした環状路(ロータリー)の、駅ノードとリングのあいだの空白に敷く
    // 控えめな植栽帯。residentialの道路色(緑系)と揃え、新しい色を増やさない。
    // decorations配列(道路より前のレイヤー)で描くため、ゲートのスポーク道路はこの上に
    // 自然に重なる。
    const cx = deco.cx - minX;
    const cy = deco.cy - minY;
    return (
      <g>
        <circle cx={cx} cy={cy} r={deco.radius} fill="#6fbf73" opacity={0.28} filter="url(#board-soft)" />
        <circle cx={cx} cy={cy} r={deco.radius} fill="none" stroke="#4f9d55" strokeWidth={1.5} opacity={0.4} strokeDasharray="3 5" />
      </g>
    );
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
