"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MapData, MapNode, RoadType } from "@/types/game";
import { shonanFullMap as baseMap } from "@/data/maps/shonan-full";
import { applyMapOverrides } from "@/data/maps/applyOverrides";
import { ROAD_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, straightRoadPath } from "@/lib/game/mapStyle";
import { useEditorStore, snapToGrid, type EditorMode } from "@/store/editorStore";

const PADDING = 80;

const ROAD_TYPE_LABEL: Record<RoadType, string> = {
  national: "国道",
  main: "幹線",
  coastal: "海沿い",
  residential: "住宅街",
  shortcut: "近道",
};

const MODE_LABEL: Record<EditorMode, string> = {
  select: "選択",
  draw: "道をひく",
  erase: "消す",
};

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

/** DOMホバーに頼らず座標計算でヒットテストする(setPointerCaptureで他ノードのhoverが発火しないため)。 */
function hitTestNode(nodes: MapNode[], gx: number, gy: number, extra = 4): MapNode | null {
  let best: MapNode | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const r = (n.isMajorHub ? MAJOR_HUB_RADIUS : NODE_RADIUS) + extra;
    const dist = Math.hypot(n.x - gx, n.y - gy);
    if (dist <= r && dist < bestDist) {
      best = n;
      bestDist = dist;
    }
  }
  return best;
}

type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: { x: number; y: number } }
  | { kind: "move"; nodeId: string; startGameX: number; startGameY: number; origX: number; origY: number }
  | { kind: "draw"; fromId: string; lastId: string }
  | null;

export default function EditorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState>(null);
  const didDragRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const overrides = useEditorStore((s) => s.overrides);
  const loaded = useEditorStore((s) => s.loaded);
  const lastSaved = useEditorStore((s) => s.lastSaved);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const mode = useEditorStore((s) => s.mode);
  const roadType = useEditorStore((s) => s.roadType);
  const selection = useEditorStore((s) => s.selection);
  const pendingFrom = useEditorStore((s) => s.pendingFrom);
  const pan = useEditorStore((s) => s.pan);
  const zoom = useEditorStore((s) => s.zoom);
  const gridSnapEnabled = useEditorStore((s) => s.gridSnapEnabled);
  const gridSize = useEditorStore((s) => s.gridSize);
  const message = useEditorStore((s) => s.message);
  const armedNodeId = useEditorStore((s) => s.armedNodeId);
  const discardArmed = useEditorStore((s) => s.discardArmed);

  const load = useEditorStore((s) => s.load);
  const setMode = useEditorStore((s) => s.setMode);
  const setRoadType = useEditorStore((s) => s.setRoadType);
  const setPan = useEditorStore((s) => s.setPan);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setGridSnapEnabled = useEditorStore((s) => s.setGridSnapEnabled);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setPendingFrom = useEditorStore((s) => s.setPendingFrom);
  const setMessage = useEditorStore((s) => s.setMessage);
  const setArmedNodeId = useEditorStore((s) => s.setArmedNodeId);
  const setDiscardArmedAction = useEditorStore((s) => s.setDiscardArmed);
  const addEdge = useEditorStore((s) => s.addEdge);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const addNodeAt = useEditorStore((s) => s.addNodeAt);
  const removeNode = useEditorStore((s) => s.removeNode);
  const moveNode = useEditorStore((s) => s.moveNode);
  const save = useEditorStore((s) => s.save);
  const discard = useEditorStore((s) => s.discard);

  useEffect(() => {
    fetch("/api/editor/overrides")
      .then((r) => r.json())
      .then((data) => load(data))
      .catch(() => load(useEditorStore.getState().overrides));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = JSON.stringify(overrides) !== JSON.stringify(lastSaved);
  const addedNodeIds = useMemo(() => new Set(overrides.addedNodes.map((n) => n.id)), [overrides]);

  const map: MapData = useMemo(() => applyMapOverrides(baseMap, overrides), [overrides]);

  const { width, height, edges } = useMemo(() => {
    const xs = map.nodes.map((n) => n.x);
    const ys = map.nodes.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + PADDING * 2;
    const h = Math.max(...ys) - Math.min(...ys) + PADDING * 2;
    const seen = new Set<string>();
    const edgeList: { from: string; to: string; roadType: RoadType }[] = [];
    for (const node of map.nodes) {
      for (const edge of node.connections) {
        const key = edgeKey(node.id, edge.to);
        if (seen.has(key)) continue;
        seen.add(key);
        edgeList.push({ from: node.id, to: edge.to, roadType: edge.roadType });
      }
    }
    return { width: w, height: h, edges: edgeList };
  }, [map]);

  const minX = Math.min(...map.nodes.map((n) => n.x)) - PADDING;
  const minY = Math.min(...map.nodes.map((n) => n.y)) - PADDING;
  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);

  function clampZoom(z: number) {
    return Math.min(3, Math.max(0.08, z));
  }

  useEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const fitZoom = clampZoom(Math.min(rect.width / width, rect.height / height) * 0.94);
    setZoom(fitZoom);
    setPan({ x: (rect.width - width * fitZoom) / 2, y: (rect.height - height * fitZoom) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    setDiscardArmedAction(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides]);

  function gameCoordsFromEvent(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom + minX,
      y: (e.clientY - rect.top - pan.y) / zoom + minY,
    };
  }

  function alreadyConnected(a: string, b: string): boolean {
    return map.nodes.find((n) => n.id === a)?.connections.some((c) => c.to === b) ?? false;
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    didDragRef.current = false;
    const { x: gx, y: gy } = gameCoordsFromEvent(e);
    const hit = mode !== "erase" ? hitTestNode(map.nodes, gx, gy) : null;

    if (mode === "select" && hit) {
      dragStateRef.current = { kind: "move", nodeId: hit.id, startGameX: gx, startGameY: gy, origX: hit.x, origY: hit.y };
    } else if (mode === "draw" && hit) {
      dragStateRef.current = { kind: "draw", fromId: hit.id, lastId: hit.id };
    } else {
      dragStateRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.kind === "pan") {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
      setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
      return;
    }

    const { x: gx, y: gy } = gameCoordsFromEvent(e);

    if (drag.kind === "move") {
      const dx = gx - drag.startGameX;
      const dy = gy - drag.startGameY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true;
      let nx = drag.origX + dx;
      let ny = drag.origY + dy;
      if (gridSnapEnabled) {
        nx = snapToGrid(nx, gridSize);
        ny = snapToGrid(ny, gridSize);
      }
      setDragPreview({ id: drag.nodeId, x: nx, y: ny });
      return;
    }

    if (drag.kind === "draw") {
      didDragRef.current = true;
      const hit = hitTestNode(map.nodes, gx, gy);
      if (hit && hit.id !== drag.lastId) {
        addEdge(drag.lastId, hit.id, roadType, alreadyConnected);
        drag.lastId = hit.id;
      }
      const lastNode = nodeById.get(drag.lastId);
      if (lastNode) {
        setDrawPreview({ x1: lastNode.x - minX, y1: lastNode.y - minY, x2: gx - minX, y2: gy - minY });
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    setDragging(false);

    if (!drag) return;

    if (drag.kind === "pan") {
      if (!didDragRef.current) {
        const { x: gx, y: gy } = gameCoordsFromEvent(e);
        if (mode === "select") {
          setSelection(new Set());
        } else if (mode === "draw" && pendingFrom !== null) {
          const id = addNodeAt(gx, gy, pendingFrom, roadType, overrides.addedNodes.length);
          setPendingFrom(id);
        } else if (mode === "erase") {
          setArmedNodeId(null);
          setMessage(null);
        }
      }
      return;
    }

    if (drag.kind === "move") {
      if (didDragRef.current && dragPreview) {
        moveNode(dragPreview.id, dragPreview.x, dragPreview.y);
      } else {
        setSelection(new Set([drag.nodeId]));
      }
      setDragPreview(null);
      return;
    }

    if (drag.kind === "draw") {
      if (didDragRef.current) {
        const { x: gx, y: gy } = gameCoordsFromEvent(e);
        const hit = hitTestNode(map.nodes, gx, gy);
        if (!hit) {
          const id = addNodeAt(gx, gy, drag.lastId, roadType, overrides.addedNodes.length);
          setPendingFrom(id);
        } else {
          setPendingFrom(drag.lastId);
        }
      } else {
        // 単純クリック(精密配置用のフォールバック)
        if (pendingFrom === null) {
          setPendingFrom(drag.fromId);
        } else if (pendingFrom === drag.fromId) {
          setPendingFrom(null);
        } else {
          addEdge(pendingFrom, drag.fromId, roadType, alreadyConnected);
          setPendingFrom(drag.fromId);
        }
      }
      setDrawPreview(null);
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const svgX = (cursorX - pan.x) / zoom;
    const svgY = (cursorY - pan.y) / zoom;
    const newZoom = clampZoom(zoom - e.deltaY * 0.0012);
    setZoom(newZoom);
    setPan({ x: cursorX - svgX * newZoom, y: cursorY - svgY * newZoom });
  }

  function handleEdgeClick(from: string, to: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode !== "erase") return;
    removeEdge(from, to);
  }

  function handleNodeEraseClick(node: MapNode, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode !== "erase") return;
    if (armedNodeId !== node.id) {
      setArmedNodeId(node.id);
      setMessage(`「${node.name}」をもう一度クリックすると削除します(つながっている道も一緒に消えます)`);
      return;
    }
    removeNode(node.id, addedNodeIds.has(node.id));
    setArmedNodeId(null);
    setMessage(null);
  }

  async function handleSave() {
    await save();
  }

  function handleDiscard() {
    if (!discardArmed) {
      setDiscardArmedAction(true);
      setMessage("もう一度「変更を破棄」を押すと、保存していない変更をすべて破棄します");
      return;
    }
    discard();
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/10 bg-white px-4 py-2.5 dark:bg-slate-900 dark:border-white/10">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
          ← ゲームに戻る
        </Link>
        <span className="font-bold text-slate-800 dark:text-slate-100">地図エディタ</span>

        <div className="ml-2 flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(Object.keys(MODE_LABEL) as EditorMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === m
                  ? m === "erase"
                    ? "bg-white shadow text-rose-700 dark:bg-slate-700 dark:text-rose-300"
                    : "bg-white shadow text-emerald-700 dark:bg-slate-700 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {mode === "draw" && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            道の種類:
            <select
              value={roadType}
              onChange={(e) => setRoadType(e.target.value as RoadType)}
              className="rounded border border-black/10 bg-white px-2 py-1 text-sm dark:bg-slate-800 dark:border-white/10"
            >
              {(Object.keys(ROAD_TYPE_LABEL) as RoadType[]).map((t) => (
                <option key={t} value={t}>
                  {ROAD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={gridSnapEnabled}
            onChange={(e) => setGridSnapEnabled(e.target.checked)}
          />
          グリッド吸着
        </label>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">未保存の変更あり</span>}
          {saveStatus === "saved" && !dirty && <span className="text-xs text-emerald-600 dark:text-emerald-400">保存済み</span>}
          {saveStatus === "error" && <span className="text-xs text-rose-600 dark:text-rose-400">保存失敗</span>}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!dirty}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${discardArmed ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300" : "border-black/10 text-slate-600 dark:border-white/10 dark:text-slate-300"}`}
          >
            {discardArmed ? "もう一度押して破棄" : "変更を破棄"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saveStatus === "saving"}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saveStatus === "saving" ? "保存中…" : "保存する"}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-black/10 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:border-white/10 dark:text-amber-200">
        {mode === "select" && <>ノードをドラッグで移動、クリックで選択します。空白をクリックすると選択解除。</>}
        {mode === "draw" && (
          <>
            ノードからドラッグすると連続して道を敷設できます(空白でドロップすると新しい交差点を作って接続)。単純なクリックでも1本ずつ接続できます。
            {pendingFrom && `「${nodeById.get(pendingFrom)?.name}」から接続中…`}
          </>
        )}
        {mode === "erase" && (
          <>道(線)をクリックすると削除します。交差点(マス)は、クリック→もう一度同じ交差点をクリックで削除します(つながっている道も一緒に消えます)。</>
        )}
        {message && <span className="ml-2 font-semibold">{message}</span>}
      </div>

      <div className="relative flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-hidden touch-none select-none bg-linear-to-b from-sky-100 to-emerald-50 dark:from-slate-800 dark:to-slate-900"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          style={{
            cursor: dragging ? "grabbing" : mode === "draw" ? "crosshair" : mode === "erase" ? "not-allowed" : "default",
          }}
        >
          {loaded && (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                transition: dragging ? "none" : "transform 120ms ease-out",
              }}
            >
              <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                {edges.map((edge) => {
                  const from = nodeById.get(edge.from);
                  const to = nodeById.get(edge.to);
                  if (!from || !to) return null;
                  const style = ROAD_STYLE[edge.roadType];
                  const fx = dragPreview?.id === edge.from ? dragPreview.x : from.x;
                  const fy = dragPreview?.id === edge.from ? dragPreview.y : from.y;
                  const tx = dragPreview?.id === edge.to ? dragPreview.x : to.x;
                  const ty = dragPreview?.id === edge.to ? dragPreview.y : to.y;
                  const x1 = fx - minX;
                  const y1 = fy - minY;
                  const x2 = tx - minX;
                  const y2 = ty - minY;
                  const d = straightRoadPath(x1, y1, x2, y2);
                  return (
                    <g key={`${edge.from}-${edge.to}`}>
                      <path d={d} fill="none" stroke={style.base} strokeWidth={style.width} strokeLinecap="round" />
                      <path d={d} fill="none" stroke={style.top} strokeWidth={style.width * 0.72} strokeLinecap="round" strokeDasharray={style.dash} />
                      {mode === "erase" && (
                        <path
                          d={d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={Math.max(style.width * 1.8, 22)}
                          strokeLinecap="round"
                          onClick={(e) => handleEdgeClick(edge.from, edge.to, e)}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                    </g>
                  );
                })}

                {drawPreview && (
                  <line
                    x1={drawPreview.x1}
                    y1={drawPreview.y1}
                    x2={drawPreview.x2}
                    y2={drawPreview.y2}
                    stroke={ROAD_STYLE[roadType].top}
                    strokeWidth={4}
                    strokeDasharray="6 6"
                    pointerEvents="none"
                  />
                )}

                {map.nodes.map((node) => {
                  const radius = node.isMajorHub ? MAJOR_HUB_RADIUS : NODE_RADIUS;
                  const px = dragPreview?.id === node.id ? dragPreview.x : node.x;
                  const py = dragPreview?.id === node.id ? dragPreview.y : node.y;
                  const cx = px - minX;
                  const cy = py - minY;
                  const isPending = pendingFrom === node.id;
                  const isArmed = armedNodeId === node.id;
                  const isAdded = addedNodeIds.has(node.id);
                  const isSelected = selection.has(node.id);
                  return (
                    <g
                      key={node.id}
                      onClick={(e) => handleNodeEraseClick(node, e)}
                      style={{ cursor: mode === "erase" ? "pointer" : mode === "select" ? "grab" : "crosshair" }}
                    >
                      {isPending && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#f5a623" strokeWidth={3} />}
                      {isArmed && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#e11d48" strokeWidth={3} />}
                      {isSelected && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#2563eb" strokeWidth={3} />}
                      <rect
                        x={cx - radius}
                        y={cy - radius}
                        width={radius * 2}
                        height={radius * 2}
                        rx={6}
                        fill={isArmed ? "#fecdd3" : isAdded ? "#dbeafe" : "#f5f1e6"}
                        stroke={isArmed ? "#e11d48" : isAdded ? "#2563eb" : "#9c9284"}
                        strokeWidth={node.isMajorHub ? 3.5 : 2.5}
                      />
                      {(node.isMajorHub || isAdded || isArmed || isPending || isSelected) && (
                        <text
                          x={cx}
                          y={cy + radius + 13}
                          textAnchor="middle"
                          fontSize={node.isMajorHub ? 11.5 : 10}
                          fontWeight={node.isMajorHub ? 800 : 500}
                          fill="#3f3a30"
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
              </svg>
            </div>
          )}
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setZoom(clampZoom(zoom + 0.15))}
            className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white"
            aria-label="拡大"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(clampZoom(zoom - 0.15))}
            className="h-9 w-9 rounded-full bg-white/90 shadow border border-black/10 text-lg font-bold dark:bg-slate-700 dark:text-white"
            aria-label="縮小"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
