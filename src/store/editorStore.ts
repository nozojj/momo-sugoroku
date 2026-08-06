import { create } from "zustand";
import type { PropertyDef, RoadType } from "@/types/game";
import { applyMapOverrides, EMPTY_OVERRIDES, type MapOverrides, type ModifiedEdge, type NodePatch } from "@/data/maps/applyOverrides";
import { shonanFullMap as baseMap } from "@/data/maps/shonan-full";

export type EditorMode = "select" | "draw" | "erase";

export interface EdgeRef {
  from: string;
  to: string;
}

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function newNodeId(): string {
  return `ed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function applyNodeMove(overrides: MapOverrides, id: string, x: number, y: number): MapOverrides {
  const addedIdx = overrides.addedNodes.findIndex((n) => n.id === id);
  if (addedIdx !== -1) {
    const addedNodes = [...overrides.addedNodes];
    addedNodes[addedIdx] = { ...addedNodes[addedIdx], x, y };
    return { ...overrides, addedNodes };
  }
  const movedIdx = overrides.movedNodes.findIndex((n) => n.id === id);
  const movedNodes = [...overrides.movedNodes];
  if (movedIdx !== -1) movedNodes[movedIdx] = { id, x, y };
  else movedNodes.push({ id, x, y });
  return { ...overrides, movedNodes };
}

function applyNodePatch(overrides: MapOverrides, id: string, patch: NodePatch): MapOverrides {
  const addedIdx = overrides.addedNodes.findIndex((n) => n.id === id);
  if (addedIdx !== -1) {
    const addedNodes = [...overrides.addedNodes];
    addedNodes[addedIdx] = { ...addedNodes[addedIdx], ...patch };
    return { ...overrides, addedNodes };
  }
  const modifiedIdx = overrides.modifiedNodes.findIndex((n) => n.id === id);
  const modifiedNodes = [...overrides.modifiedNodes];
  if (modifiedIdx !== -1) {
    modifiedNodes[modifiedIdx] = { id, patch: { ...modifiedNodes[modifiedIdx].patch, ...patch } };
  } else {
    modifiedNodes.push({ id, patch });
  }
  return { ...overrides, modifiedNodes };
}

const MAX_HISTORY = 100;

interface EditorStore {
  // --- データ ---
  overrides: MapOverrides;
  lastSaved: MapOverrides;
  loaded: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  history: MapOverrides[];
  future: MapOverrides[];

  // --- モード・選択 ---
  mode: EditorMode;
  roadType: RoadType;
  selection: Set<string>;
  selectedEdge: EdgeRef | null;
  pendingFrom: string | null;

  // --- viewport ---
  pan: { x: number; y: number };
  zoom: number;
  gridSnapEnabled: boolean;
  gridSize: number;

  // --- 一時UI ---
  message: string | null;
  /** 「変更を破棄」だけは影響範囲が大きいため2段階確認を残す。それ以外の削除は
   * Undoが安全網になるので即実行+トースト通知に統一している(Step4)。 */
  discardArmed: boolean;
  toast: string | null;
  toastToken: number;

  // --- actions ---
  load: (overrides: MapOverrides) => void;
  setMode: (mode: EditorMode) => void;
  setRoadType: (rt: RoadType) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  setGridSnapEnabled: (v: boolean) => void;
  setSelection: (ids: Set<string>) => void;
  toggleSelection: (id: string) => void;
  addToSelection: (ids: Set<string>) => void;
  setSelectedEdge: (edge: EdgeRef | null) => void;
  setPendingFrom: (id: string | null) => void;
  setMessage: (msg: string | null) => void;
  setDiscardArmed: (v: boolean) => void;
  showToast: (msg: string) => void;

  /** overridesを直接置き換え、直前の状態をUndo履歴へ積む。 */
  commit: (next: MapOverrides) => void;
  undo: () => void;
  redo: () => void;
  addEdge: (a: string, b: string, type: RoadType, existingConnections: (from: string, to: string) => boolean) => void;
  removeEdge: (a: string, b: string) => void;
  addNodeAt: (x: number, y: number, from: string, roadType: RoadType, addedCount: number) => string;
  removeNode: (id: string, isAdded: boolean) => void;
  removeNodes: (ids: string[], addedIds: Set<string>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveNodes: (moves: { id: string; x: number; y: number }[]) => void;
  updateNode: (id: string, patch: NodePatch) => void;
  updateEdge: (a: string, b: string, patch: { roadType?: RoadType; requiresCardId?: string | null }) => void;
  upsertCustomProperty: (propDef: PropertyDef) => void;
  setStartNode: (id: string) => void;

  save: () => Promise<void>;
  discard: () => void;
}

export const snapToGrid = (v: number, gridSize: number): number => Math.round(v / gridSize) * gridSize;

export const useEditorStore = create<EditorStore>()((set, get) => ({
  overrides: EMPTY_OVERRIDES,
  lastSaved: EMPTY_OVERRIDES,
  loaded: false,
  saveStatus: "idle",
  history: [],
  future: [],

  mode: "select",
  roadType: "residential",
  selection: new Set(),
  selectedEdge: null,
  pendingFrom: null,

  pan: { x: 20, y: 20 },
  zoom: 0.55,
  gridSnapEnabled: true,
  gridSize: 10,

  message: null,
  discardArmed: false,
  toast: null,
  toastToken: 0,

  load: (overrides) => set({ overrides, lastSaved: overrides, loaded: true, history: [], future: [] }),
  setMode: (mode) => set({ mode, pendingFrom: null, message: null, selection: new Set(), selectedEdge: null }),
  setRoadType: (roadType) => set({ roadType }),
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom }),
  setGridSnapEnabled: (gridSnapEnabled) => set({ gridSnapEnabled }),
  setSelection: (selection) => set({ selection, selectedEdge: null }),
  toggleSelection: (id) => {
    const next = new Set(get().selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selection: next, selectedEdge: null });
  },
  addToSelection: (ids) => {
    const next = new Set(get().selection);
    for (const id of ids) next.add(id);
    set({ selection: next, selectedEdge: null });
  },
  setSelectedEdge: (edge) => set({ selectedEdge: edge, selection: new Set() }),
  setPendingFrom: (pendingFrom) => set({ pendingFrom }),
  setMessage: (message) => set({ message }),
  setDiscardArmed: (discardArmed) => set({ discardArmed }),
  showToast: (msg) => {
    const token = get().toastToken + 1;
    set({ toast: msg, toastToken: token });
    setTimeout(() => {
      if (get().toastToken === token) set({ toast: null });
    }, 4000);
  },

  commit: (next) => {
    const history = [...get().history, get().overrides].slice(-MAX_HISTORY);
    set({ overrides: next, history, future: [], discardArmed: false });
  },

  undo: () => {
    const { history, overrides, future } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      overrides: prev,
      history: history.slice(0, -1),
      future: [overrides, ...future].slice(0, MAX_HISTORY),
      selection: new Set(),
      selectedEdge: null,
      discardArmed: false,
    });
  },

  redo: () => {
    const { future, overrides, history } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      overrides: next,
      history: [...history, overrides].slice(-MAX_HISTORY),
      future: future.slice(1),
      selection: new Set(),
      selectedEdge: null,
      discardArmed: false,
    });
  },

  addEdge: (a, b, type, alreadyConnected) => {
    if (a === b) return;
    const prev = get().overrides;
    if (alreadyConnected(a, b)) return;
    const key = edgeKey(a, b);
    get().commit({
      ...prev,
      removedEdges: prev.removedEdges.filter((e) => edgeKey(e.from, e.to) !== key),
      addedEdges: [...prev.addedEdges, { from: a, to: b, roadType: type }],
    });
  },

  removeEdge: (a, b) => {
    const prev = get().overrides;
    const key = edgeKey(a, b);
    const wasAdded = prev.addedEdges.some((e) => edgeKey(e.from, e.to) === key);
    if (wasAdded) {
      get().commit({ ...prev, addedEdges: prev.addedEdges.filter((e) => edgeKey(e.from, e.to) !== key) });
      return;
    }
    get().commit({ ...prev, removedEdges: [...prev.removedEdges, { from: a, to: b }] });
  },

  addNodeAt: (x, y, from, roadType, addedCount) => {
    const { gridSnapEnabled, gridSize } = get();
    const snappedX = gridSnapEnabled ? snapToGrid(x, gridSize) : x;
    const snappedY = gridSnapEnabled ? snapToGrid(y, gridSize) : y;
    const id = newNodeId();
    const prev = get().overrides;
    get().commit({
      ...prev,
      addedNodes: [...prev.addedNodes, { id, name: `新しい交差点${addedCount + 1}`, x: snappedX, y: snappedY }],
      addedEdges: [...prev.addedEdges, { from, to: id, roadType }],
    });
    return id;
  },

  removeNode: (id, isAdded) => {
    const prev = get().overrides;
    get().commit({
      ...prev,
      addedNodes: prev.addedNodes.filter((n) => n.id !== id),
      addedEdges: prev.addedEdges.filter((e) => e.from !== id && e.to !== id),
      removedNodes: isAdded || prev.removedNodes.includes(id) ? prev.removedNodes : [...prev.removedNodes, id],
    });
  },

  removeNodes: (ids, addedIds) => {
    const idSet = new Set(ids);
    const prev = get().overrides;
    const newlyRemovedBase = ids.filter((id) => !addedIds.has(id) && !prev.removedNodes.includes(id));
    get().commit({
      ...prev,
      addedNodes: prev.addedNodes.filter((n) => !idSet.has(n.id)),
      addedEdges: prev.addedEdges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to)),
      movedNodes: prev.movedNodes.filter((n) => !idSet.has(n.id)),
      modifiedNodes: prev.modifiedNodes.filter((n) => !idSet.has(n.id)),
      removedNodes: [...prev.removedNodes, ...newlyRemovedBase],
    });
    set({ selection: new Set() });
  },

  moveNode: (id, x, y) => {
    get().commit(applyNodeMove(get().overrides, id, x, y));
  },

  moveNodes: (moves) => {
    let next = get().overrides;
    for (const m of moves) next = applyNodeMove(next, m.id, m.x, m.y);
    get().commit(next);
  },

  updateNode: (id, patch) => {
    get().commit(applyNodePatch(get().overrides, id, patch));
  },

  updateEdge: (a, b, patch) => {
    const prev = get().overrides;
    const key = edgeKey(a, b);
    const addedIdx = prev.addedEdges.findIndex((e) => edgeKey(e.from, e.to) === key);
    if (addedIdx !== -1) {
      const addedEdges = [...prev.addedEdges];
      const cur = addedEdges[addedIdx];
      addedEdges[addedIdx] = {
        ...cur,
        roadType: patch.roadType ?? cur.roadType,
        requiresCardId: patch.requiresCardId === undefined ? cur.requiresCardId : (patch.requiresCardId ?? undefined),
      };
      get().commit({ ...prev, addedEdges });
      return;
    }
    const modifiedIdx = prev.modifiedEdges.findIndex((e) => edgeKey(e.from, e.to) === key);
    const modifiedEdges: ModifiedEdge[] = [...prev.modifiedEdges];
    if (modifiedIdx !== -1) {
      modifiedEdges[modifiedIdx] = { ...modifiedEdges[modifiedIdx], ...patch };
    } else {
      modifiedEdges.push({ from: a, to: b, ...patch });
    }
    get().commit({ ...prev, modifiedEdges });
  },

  upsertCustomProperty: (propDef) => {
    const prev = get().overrides;
    const idx = prev.customProperties.findIndex((p) => p.id === propDef.id);
    const customProperties = [...prev.customProperties];
    if (idx !== -1) customProperties[idx] = propDef;
    else customProperties.push(propDef);
    get().commit({ ...prev, customProperties });
  },

  setStartNode: (id) => {
    get().commit({ ...get().overrides, startNodeId: id });
  },

  save: async () => {
    if (get().saveStatus === "saving") return;
    set({ saveStatus: "saving" });
    try {
      const current = get().overrides;
      // 物件タイプのノードから参照されなくなったcustomPropertiesを保存時に整理する
      // (削除・種別変更・Undo/Redoの繰り返しでゴミが溜まらないようにするため)。
      const merged = applyMapOverrides(baseMap, current);
      const referencedPropIds = new Set(
        merged.nodes.filter((n) => n.propertyId).map((n) => n.propertyId as string),
      );
      const customProperties = current.customProperties.filter((p) => referencedPropIds.has(p.id));
      const overrides =
        customProperties.length === current.customProperties.length ? current : { ...current, customProperties };

      const res = await fetch("/api/editor/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      if (!res.ok) throw new Error(await res.text());
      set({ overrides, lastSaved: overrides, saveStatus: "saved" });
    } catch {
      set({ saveStatus: "error" });
    }
  },

  discard: () => {
    get().commit(get().lastSaved);
    set({ pendingFrom: null, discardArmed: false, message: null, selection: new Set(), selectedEdge: null });
  },
}));
