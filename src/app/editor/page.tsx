"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MapData, MapNode, RoadType } from "@/types/game";
import { shonanFullMap as baseMap } from "@/data/maps/shonan-full";
import { applyMapOverrides } from "@/data/maps/applyOverrides";
import { ROAD_STYLE, NODE_STYLE, NODE_RADIUS, MAJOR_HUB_RADIUS, straightRoadPath } from "@/lib/game/mapStyle";
import { useEditorStore, snapToGrid, type EditorMode } from "@/store/editorStore";
import { InspectorPanel } from "./InspectorPanel";
import { getPropertyDef } from "@/data/properties";

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
  | { kind: "move-group"; anchorId: string; startGameX: number; startGameY: number; origPositions: Map<string, { x: number; y: number }> }
  | { kind: "draw"; fromId: string; lastId: string }
  | { kind: "toggle"; nodeId: string }
  | { kind: "rubberband"; startClientX: number; startClientY: number }
  | null;

export default function EditorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState>(null);
  const didDragRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const overrides = useEditorStore((s) => s.overrides);
  const loaded = useEditorStore((s) => s.loaded);
  const lastSaved = useEditorStore((s) => s.lastSaved);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const mode = useEditorStore((s) => s.mode);
  const roadType = useEditorStore((s) => s.roadType);
  const selection = useEditorStore((s) => s.selection);
  const selectedEdge = useEditorStore((s) => s.selectedEdge);
  const pendingFrom = useEditorStore((s) => s.pendingFrom);
  const pan = useEditorStore((s) => s.pan);
  const zoom = useEditorStore((s) => s.zoom);
  const gridSnapEnabled = useEditorStore((s) => s.gridSnapEnabled);
  const gridSize = useEditorStore((s) => s.gridSize);
  const message = useEditorStore((s) => s.message);
  const discardArmed = useEditorStore((s) => s.discardArmed);
  const toast = useEditorStore((s) => s.toast);
  const historyLength = useEditorStore((s) => s.history.length);
  const futureLength = useEditorStore((s) => s.future.length);

  const load = useEditorStore((s) => s.load);
  const setMode = useEditorStore((s) => s.setMode);
  const setRoadType = useEditorStore((s) => s.setRoadType);
  const setPan = useEditorStore((s) => s.setPan);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setGridSnapEnabled = useEditorStore((s) => s.setGridSnapEnabled);
  const setSelection = useEditorStore((s) => s.setSelection);
  const toggleSelection = useEditorStore((s) => s.toggleSelection);
  const addToSelection = useEditorStore((s) => s.addToSelection);
  const setSelectedEdge = useEditorStore((s) => s.setSelectedEdge);
  const setPendingFrom = useEditorStore((s) => s.setPendingFrom);
  const setMessage = useEditorStore((s) => s.setMessage);
  const setDiscardArmedAction = useEditorStore((s) => s.setDiscardArmed);
  const showToast = useEditorStore((s) => s.showToast);
  const addEdge = useEditorStore((s) => s.addEdge);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const addNodeAt = useEditorStore((s) => s.addNodeAt);
  const removeNode = useEditorStore((s) => s.removeNode);
  const removeNodes = useEditorStore((s) => s.removeNodes);
  const moveNode = useEditorStore((s) => s.moveNode);
  const moveNodes = useEditorStore((s) => s.moveNodes);
  const save = useEditorStore((s) => s.save);
  const discard = useEditorStore((s) => s.discard);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

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

  const existingAreas = useMemo(
    () => [...new Set(map.nodes.map((n) => n.area).filter((a): a is string => !!a))].sort(),
    [map],
  );
  const inspectedNode = mode === "select" && selection.size === 1 ? (nodeById.get([...selection][0]) ?? null) : null;
  const inspectedEdge =
    mode === "select" && selectedEdge
      ? (() => {
          const from = nodeById.get(selectedEdge.from);
          const to = nodeById.get(selectedEdge.to);
          if (!from || !to) return null;
          const conn = from.connections.find((c) => c.to === to.id);
          if (!conn) return null;
          return { from, to, roadType: conn.roadType, requiresCardId: conn.requiresCardId };
        })()
      : null;
  const inspectedPropertyDef = inspectedNode?.propertyId ? getPropertyDef(inspectedNode.propertyId) : undefined;

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // インスペクタのテキスト入力中はブラウザ標準のテキストUndoに譲る。
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOrCmd || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        useEditorStore.getState().redo();
      } else {
        useEditorStore.getState().undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    // 実際のポインタ操作なら基本的に失敗しないが、万一失敗してもドラッグ種別の
    // 判定自体は続行できるようにする(ここで例外が漏れるとハンドラ全体が
    // 中断し、以降のmove/upが一切効かなくなってしまうため)。
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // no-op
    }
    didDragRef.current = false;
    const { x: gx, y: gy } = gameCoordsFromEvent(e);
    const hit = mode !== "erase" ? hitTestNode(map.nodes, gx, gy) : null;

    if (mode === "select" && hit && e.shiftKey) {
      dragStateRef.current = { kind: "toggle", nodeId: hit.id };
    } else if (mode === "select" && hit) {
      if (selection.has(hit.id) && selection.size > 1) {
        const origPositions = new Map<string, { x: number; y: number }>();
        for (const id of selection) {
          const n = nodeById.get(id);
          if (n) origPositions.set(id, { x: n.x, y: n.y });
        }
        dragStateRef.current = { kind: "move-group", anchorId: hit.id, startGameX: gx, startGameY: gy, origPositions };
      } else {
        dragStateRef.current = { kind: "move", nodeId: hit.id, startGameX: gx, startGameY: gy, origX: hit.x, origY: hit.y };
      }
    } else if (mode === "draw" && hit) {
      dragStateRef.current = { kind: "draw", fromId: hit.id, lastId: hit.id };
    } else if (mode === "select" && !hit && e.shiftKey) {
      dragStateRef.current = { kind: "rubberband", startClientX: e.clientX, startClientY: e.clientY };
      setRubberBand({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
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

    if (drag.kind === "toggle") {
      return;
    }

    if (drag.kind === "rubberband") {
      didDragRef.current = true;
      setRubberBand((prev) => (prev ? { ...prev, x2: e.clientX, y2: e.clientY } : prev));
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
      setDragPreview(new Map([[drag.nodeId, { x: nx, y: ny }]]));
      return;
    }

    if (drag.kind === "move-group") {
      const dx = gx - drag.startGameX;
      const dy = gy - drag.startGameY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true;
      const anchorOrig = drag.origPositions.get(drag.anchorId)!;
      let anchorNx = anchorOrig.x + dx;
      let anchorNy = anchorOrig.y + dy;
      if (gridSnapEnabled) {
        anchorNx = snapToGrid(anchorNx, gridSize);
        anchorNy = snapToGrid(anchorNy, gridSize);
      }
      const snapDx = anchorNx - anchorOrig.x;
      const snapDy = anchorNy - anchorOrig.y;
      const preview = new Map<string, { x: number; y: number }>();
      for (const [id, pos] of drag.origPositions) {
        preview.set(id, { x: pos.x + snapDx, y: pos.y + snapDy });
      }
      setDragPreview(preview);
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
        }
      }
      return;
    }

    if (drag.kind === "toggle") {
      toggleSelection(drag.nodeId);
      return;
    }

    if (drag.kind === "rubberband") {
      setRubberBand(null);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const toGame = (clientX: number, clientY: number) => ({
          x: (clientX - rect.left - pan.x) / zoom + minX,
          y: (clientY - rect.top - pan.y) / zoom + minY,
        });
        const p1 = toGame(drag.startClientX, drag.startClientY);
        const p2 = toGame(e.clientX, e.clientY);
        const minGX = Math.min(p1.x, p2.x);
        const maxGX = Math.max(p1.x, p2.x);
        const minGY = Math.min(p1.y, p2.y);
        const maxGY = Math.max(p1.y, p2.y);
        const matched = new Set(
          map.nodes.filter((n) => n.x >= minGX && n.x <= maxGX && n.y >= minGY && n.y <= maxGY).map((n) => n.id),
        );
        addToSelection(matched);
      }
      return;
    }

    if (drag.kind === "move") {
      const preview = dragPreview?.get(drag.nodeId);
      if (didDragRef.current && preview) {
        moveNode(drag.nodeId, preview.x, preview.y);
      } else {
        setSelection(new Set([drag.nodeId]));
      }
      setDragPreview(null);
      return;
    }

    if (drag.kind === "move-group") {
      if (didDragRef.current && dragPreview) {
        moveNodes([...dragPreview.entries()].map(([id, pos]) => ({ id, x: pos.x, y: pos.y })));
      } else {
        setSelection(new Set([drag.anchorId]));
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

  function handleDeleteSelection() {
    if (selection.size === 0) return;
    if (selection.has(map.startNodeId)) {
      showToast("現在の開始地点は削除できません(先に別のノードを開始地点に変更してください)");
      return;
    }
    const count = selection.size;
    removeNodes([...selection], addedNodeIds);
    showToast(`${count}件を削除しました 元に戻す(Ctrl+Z)`);
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
    if (mode === "erase") {
      removeEdge(from, to);
      showToast("道を削除しました 元に戻す(Ctrl+Z)");
    } else if (mode === "select") {
      setSelectedEdge({ from, to });
    }
  }

  function handleNodeEraseClick(node: MapNode, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode !== "erase") return;
    if (node.id === map.startNodeId) {
      showToast("現在の開始地点は削除できません(先に別のノードを開始地点に変更してください)");
      return;
    }
    removeNode(node.id, addedNodeIds.has(node.id));
    showToast(`「${node.name}」を削除しました 元に戻す(Ctrl+Z)`);
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

        {mode === "select" && selection.size > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelection}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium border-black/10 text-slate-600 dark:border-white/10 dark:text-slate-300"
          >
            {`選択を削除(${selection.size}件)`}
          </button>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => undo()}
            disabled={historyLength === 0}
            className="h-8 w-8 rounded-lg border border-black/10 text-sm font-medium text-slate-600 disabled:opacity-30 dark:border-white/10 dark:text-slate-300"
            aria-label="元に戻す"
            title="元に戻す(Ctrl+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={futureLength === 0}
            className="h-8 w-8 rounded-lg border border-black/10 text-sm font-medium text-slate-600 disabled:opacity-30 dark:border-white/10 dark:text-slate-300"
            aria-label="やり直す"
            title="やり直す(Ctrl+Shift+Z)"
          >
            ↷
          </button>
        </div>

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
        {mode === "select" && (
          <>
            ノードをドラッグで移動、クリックで選択します。Shift+クリックで複数選択の追加/解除、Shift+ドラッグで範囲選択できます。空白をクリックすると選択解除。
            {selection.size > 0 && ` ${selection.size}件選択中。`}
          </>
        )}
        {mode === "draw" && (
          <>
            ノードからドラッグすると連続して道を敷設できます(空白でドロップすると新しい交差点を作って接続)。単純なクリックでも1本ずつ接続できます。
            {pendingFrom && `「${nodeById.get(pendingFrom)?.name}」から接続中…`}
          </>
        )}
        {mode === "erase" && (
          <>道(線)や交差点(マス)をクリックすると即削除します(交差点は繋がっている道も一緒に消えます)。誤って消したときはCtrl+Zで元に戻せます。</>
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
          {rubberBand && (
            <div
              className="pointer-events-none fixed border-2 border-blue-500 bg-blue-500/10"
              style={{
                left: Math.min(rubberBand.x1, rubberBand.x2),
                top: Math.min(rubberBand.y1, rubberBand.y2),
                width: Math.abs(rubberBand.x2 - rubberBand.x1),
                height: Math.abs(rubberBand.y2 - rubberBand.y1),
              }}
            />
          )}
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
                  const fromPreview = dragPreview?.get(edge.from);
                  const toPreview = dragPreview?.get(edge.to);
                  const fx = fromPreview?.x ?? from.x;
                  const fy = fromPreview?.y ?? from.y;
                  const tx = toPreview?.x ?? to.x;
                  const ty = toPreview?.y ?? to.y;
                  const x1 = fx - minX;
                  const y1 = fy - minY;
                  const x2 = tx - minX;
                  const y2 = ty - minY;
                  const d = straightRoadPath(x1, y1, x2, y2);
                  const isEdgeSelected =
                    selectedEdge &&
                    ((selectedEdge.from === edge.from && selectedEdge.to === edge.to) ||
                      (selectedEdge.from === edge.to && selectedEdge.to === edge.from));
                  return (
                    <g key={`${edge.from}-${edge.to}`}>
                      {isEdgeSelected && (
                        <path d={d} fill="none" stroke="#2563eb" strokeWidth={style.width + 6} strokeLinecap="round" opacity={0.5} />
                      )}
                      <path d={d} fill="none" stroke={style.base} strokeWidth={style.width} strokeLinecap="round" />
                      <path d={d} fill="none" stroke={style.top} strokeWidth={style.width * 0.72} strokeLinecap="round" strokeDasharray={style.dash} />
                      {(mode === "erase" || mode === "select") && (
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
                  const preview = dragPreview?.get(node.id);
                  const px = preview?.x ?? node.x;
                  const py = preview?.y ?? node.y;
                  const cx = px - minX;
                  const cy = py - minY;
                  const isPending = pendingFrom === node.id;
                  const isAdded = addedNodeIds.has(node.id);
                  const isSelected = selection.has(node.id);
                  const isStart = node.id === map.startNodeId;
                  const icon = NODE_STYLE[node.type].icon;
                  return (
                    <g
                      key={node.id}
                      onClick={(e) => handleNodeEraseClick(node, e)}
                      style={{ cursor: mode === "erase" ? "pointer" : mode === "select" ? "grab" : "crosshair" }}
                    >
                      {isPending && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#f5a623" strokeWidth={3} />}
                      {isSelected && <circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke="#2563eb" strokeWidth={3} />}
                      <rect
                        x={cx - radius}
                        y={cy - radius}
                        width={radius * 2}
                        height={radius * 2}
                        rx={6}
                        fill={isAdded ? "#dbeafe" : "#f5f1e6"}
                        stroke={isAdded ? "#2563eb" : "#9c9284"}
                        strokeWidth={node.isMajorHub ? 3.5 : 2.5}
                      />
                      {icon && (
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={node.isMajorHub ? 15 : 11} pointerEvents="none">
                          {icon}
                        </text>
                      )}
                      {isStart && (
                        <text x={cx} y={cy - radius - 6} textAnchor="middle" fontSize={14} pointerEvents="none">
                          🚩
                        </text>
                      )}
                      {(node.isMajorHub || isAdded || isPending || isSelected) && (
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

        {toast && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100/90 dark:text-slate-900">
            {toast}
          </div>
        )}

        {(inspectedNode || inspectedEdge) && (
          <InspectorPanel
            node={inspectedNode}
            edge={inspectedEdge}
            isStartNode={inspectedNode?.id === map.startNodeId}
            existingAreas={existingAreas}
            existingPropertyDef={inspectedPropertyDef}
            onClose={() => {
              setSelection(new Set());
              setSelectedEdge(null);
            }}
          />
        )}

        {mode === "select" && !inspectedNode && !inspectedEdge && existingAreas.length > 0 && (
          <div className="absolute left-3 top-3 w-48 rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur dark:bg-slate-900/95 dark:border-white/10">
            <h2 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">エリア</h2>
            <ul className="flex flex-col gap-1">
              {existingAreas.map((area) => (
                <li key={area} className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs text-slate-600 dark:text-slate-300" title={area}>
                    {area}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelection(new Set(map.nodes.filter((n) => n.area === area).map((n) => n.id)))}
                    className="shrink-0 rounded border border-black/10 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    選択
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
