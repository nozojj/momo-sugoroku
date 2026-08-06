"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MapData, MapNode, RoadType } from "@/types/game";
import { shonanFullMap as baseMap } from "@/data/maps/shonan-full";
import { applyMapOverrides, EMPTY_OVERRIDES, type MapOverrides } from "@/data/maps/applyOverrides";
import { ROAD_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, straightRoadPath } from "@/lib/game/mapStyle";

const PADDING = 80;

const ROAD_TYPE_LABEL: Record<RoadType, string> = {
  national: "国道",
  main: "幹線",
  coastal: "海沿い",
  residential: "住宅街",
  shortcut: "近道",
};

type Mode = "connect" | "delete";

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function newNodeId(): string {
  return `ed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function EditorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.55);
  const dragState = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const didDragRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const [overrides, setOverrides] = useState<MapOverrides>(EMPTY_OVERRIDES);
  const [lastSaved, setLastSaved] = useState<MapOverrides>(EMPTY_OVERRIDES);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [mode, setMode] = useState<Mode>("connect");
  const [roadType, setRoadType] = useState<RoadType>("residential");
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [armedNodeId, setArmedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [discardArmed, setDiscardArmed] = useState(false);

  useEffect(() => {
    fetch("/api/editor/overrides")
      .then((r) => r.json())
      .then((data: MapOverrides) => {
        setOverrides(data);
        setLastSaved(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
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

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
    didDragRef.current = false;
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
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

  function gameCoordsFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left - pan.x) / zoom + minX),
      y: Math.round((e.clientY - rect.top - pan.y) / zoom + minY),
    };
  }

  useEffect(() => {
    setDiscardArmed(false);
  }, [overrides]);

  function addEdge(a: string, b: string, type: RoadType) {
    if (a === b) return;
    setOverrides((prev) => {
      const already = map.nodes.find((n) => n.id === a)?.connections.some((c) => c.to === b);
      if (already) return prev;
      const key = edgeKey(a, b);
      return {
        ...prev,
        removedEdges: prev.removedEdges.filter((e) => edgeKey(e.from, e.to) !== key),
        addedEdges: [...prev.addedEdges, { from: a, to: b, roadType: type }],
      };
    });
  }

  function removeEdge(a: string, b: string) {
    const key = edgeKey(a, b);
    setOverrides((prev) => {
      const wasAdded = prev.addedEdges.some((e) => edgeKey(e.from, e.to) === key);
      if (wasAdded) {
        return { ...prev, addedEdges: prev.addedEdges.filter((e) => edgeKey(e.from, e.to) !== key) };
      }
      return { ...prev, removedEdges: [...prev.removedEdges, { from: a, to: b }] };
    });
  }

  function removeNode(id: string, isAdded: boolean) {
    setOverrides((prev) => ({
      ...prev,
      addedNodes: prev.addedNodes.filter((n) => n.id !== id),
      addedEdges: prev.addedEdges.filter((e) => e.from !== id && e.to !== id),
      removedNodes: isAdded || prev.removedNodes.includes(id) ? prev.removedNodes : [...prev.removedNodes, id],
    }));
  }

  function handleNodeClick(node: MapNode, e: React.MouseEvent) {
    e.stopPropagation();
    if (didDragRef.current) return;
    if (mode === "delete") {
      if (armedNodeId !== node.id) {
        setArmedNodeId(node.id);
        setMessage(`「${node.name}」をもう一度クリックすると削除します(つながっている道も一緒に消えます)`);
        return;
      }
      removeNode(node.id, addedNodeIds.has(node.id));
      setArmedNodeId(null);
      setMessage(null);
      return;
    }
    // connect mode
    if (pendingFrom === null) {
      setPendingFrom(node.id);
    } else if (pendingFrom === node.id) {
      setPendingFrom(null);
    } else {
      addEdge(pendingFrom, node.id, roadType);
      setPendingFrom(node.id);
    }
  }

  function handleEdgeClick(from: string, to: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (didDragRef.current) return;
    if (mode !== "delete") return;
    removeEdge(from, to);
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (didDragRef.current) return;
    if (mode === "delete") {
      setArmedNodeId(null);
      setMessage(null);
      return;
    }
    if (mode !== "connect" || pendingFrom === null) return;
    const { x, y } = gameCoordsFromEvent(e);
    const id = newNodeId();
    const autoName = `新しい交差点${overrides.addedNodes.length + 1}`;
    setOverrides((prev) => ({
      ...prev,
      addedNodes: [...prev.addedNodes, { id, name: autoName, x, y }],
      addedEdges: [...prev.addedEdges, { from: pendingFrom, to: id, roadType }],
    }));
    setPendingFrom(id);
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/editor/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      if (!res.ok) throw new Error(await res.text());
      setLastSaved(overrides);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  function handleDiscard() {
    if (!discardArmed) {
      setDiscardArmed(true);
      setMessage("もう一度「変更を破棄」を押すと、保存していない変更をすべて破棄します");
      return;
    }
    setOverrides(lastSaved);
    setPendingFrom(null);
    setArmedNodeId(null);
    setDiscardArmed(false);
    setMessage(null);
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/10 bg-white px-4 py-2.5 dark:bg-slate-900 dark:border-white/10">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
          ← ゲームに戻る
        </Link>
        <span className="font-bold text-slate-800 dark:text-slate-100">地図エディタ</span>

        <div className="ml-2 flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode("connect");
              setPendingFrom(null);
              setArmedNodeId(null);
              setMessage(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "connect" ? "bg-white shadow text-emerald-700 dark:bg-slate-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}
          >
            道をつくる
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("delete");
              setPendingFrom(null);
              setArmedNodeId(null);
              setMessage(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "delete" ? "bg-white shadow text-rose-700 dark:bg-slate-700 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}
          >
            道を消す
          </button>
        </div>

        {mode === "connect" && (
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
        {mode === "connect" ? (
          <>交差点をクリック→もう一つの交差点(または何もない場所)をクリックで道をつくります。{pendingFrom && `「${nodeById.get(pendingFrom)?.name}」から接続中…(同じ交差点をもう一度クリックで解除)`}</>
        ) : (
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
          onClick={handleBackgroundClick}
          style={{ cursor: dragging ? "grabbing" : mode === "connect" ? "crosshair" : "not-allowed" }}
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
                  const x1 = from.x - minX;
                  const y1 = from.y - minY;
                  const x2 = to.x - minX;
                  const y2 = to.y - minY;
                  const d = straightRoadPath(x1, y1, x2, y2);
                  return (
                    <g key={`${edge.from}-${edge.to}`}>
                      <path d={d} fill="none" stroke={style.base} strokeWidth={style.width} strokeLinecap="round" />
                      <path d={d} fill="none" stroke={style.top} strokeWidth={style.width * 0.72} strokeLinecap="round" strokeDasharray={style.dash} />
                      {/* クリック判定用の太い透明な線 */}
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(style.width * 1.8, 22)}
                        strokeLinecap="round"
                        onClick={(e) => handleEdgeClick(edge.from, edge.to, e)}
                        style={{ cursor: mode === "delete" ? "pointer" : "default" }}
                      />
                    </g>
                  );
                })}

                {map.nodes.map((node) => {
                  const radius = node.isMajorHub ? MAJOR_HUB_RADIUS : NODE_RADIUS;
                  const cx = node.x - minX;
                  const cy = node.y - minY;
                  const isPending = pendingFrom === node.id;
                  const isArmed = armedNodeId === node.id;
                  const isAdded = addedNodeIds.has(node.id);
                  return (
                    <g
                      key={node.id}
                      onClick={(e) => handleNodeClick(node, e)}
                      style={{ cursor: "pointer" }}
                    >
                      {isPending && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#f5a623" strokeWidth={3} />}
                      {isArmed && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#e11d48" strokeWidth={3} />}
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
                      {(node.isMajorHub || isAdded || isArmed || isPending) && (
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
        </div>
      </div>
    </div>
  );
}
