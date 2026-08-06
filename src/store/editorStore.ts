import { create } from "zustand";
import type { RoadType } from "@/types/game";
import { EMPTY_OVERRIDES, type MapOverrides } from "@/data/maps/applyOverrides";

export type EditorMode = "select" | "draw" | "erase";

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function newNodeId(): string {
  return `ed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface EditorStore {
  // --- データ ---
  overrides: MapOverrides;
  lastSaved: MapOverrides;
  loaded: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";

  // --- モード・選択 ---
  mode: EditorMode;
  roadType: RoadType;
  selection: Set<string>;
  pendingFrom: string | null;

  // --- viewport ---
  pan: { x: number; y: number };
  zoom: number;
  gridSnapEnabled: boolean;
  gridSize: number;

  // --- 一時UI ---
  message: string | null;
  armedNodeId: string | null;
  discardArmed: boolean;

  // --- actions ---
  load: (overrides: MapOverrides) => void;
  setMode: (mode: EditorMode) => void;
  setRoadType: (rt: RoadType) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
  setGridSnapEnabled: (v: boolean) => void;
  setSelection: (ids: Set<string>) => void;
  setPendingFrom: (id: string | null) => void;
  setMessage: (msg: string | null) => void;
  setArmedNodeId: (id: string | null) => void;
  setDiscardArmed: (v: boolean) => void;

  /** overridesを直接置き換える(Step4でここに履歴pushを足す)。 */
  commit: (next: MapOverrides) => void;
  addEdge: (a: string, b: string, type: RoadType, existingConnections: (from: string, to: string) => boolean) => void;
  removeEdge: (a: string, b: string) => void;
  addNodeAt: (x: number, y: number, from: string, roadType: RoadType, addedCount: number) => string;
  removeNode: (id: string, isAdded: boolean) => void;
  moveNode: (id: string, x: number, y: number) => void;

  save: () => Promise<void>;
  discard: () => void;
}

export const snapToGrid = (v: number, gridSize: number): number => Math.round(v / gridSize) * gridSize;

export const useEditorStore = create<EditorStore>()((set, get) => ({
  overrides: EMPTY_OVERRIDES,
  lastSaved: EMPTY_OVERRIDES,
  loaded: false,
  saveStatus: "idle",

  mode: "select",
  roadType: "residential",
  selection: new Set(),
  pendingFrom: null,

  pan: { x: 20, y: 20 },
  zoom: 0.55,
  gridSnapEnabled: true,
  gridSize: 10,

  message: null,
  armedNodeId: null,
  discardArmed: false,

  load: (overrides) => set({ overrides, lastSaved: overrides, loaded: true }),
  setMode: (mode) =>
    set({ mode, pendingFrom: null, armedNodeId: null, message: null, selection: new Set() }),
  setRoadType: (roadType) => set({ roadType }),
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom }),
  setGridSnapEnabled: (gridSnapEnabled) => set({ gridSnapEnabled }),
  setSelection: (selection) => set({ selection }),
  setPendingFrom: (pendingFrom) => set({ pendingFrom }),
  setMessage: (message) => set({ message }),
  setArmedNodeId: (armedNodeId) => set({ armedNodeId }),
  setDiscardArmed: (discardArmed) => set({ discardArmed }),

  commit: (next) => set({ overrides: next, discardArmed: false }),

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

  moveNode: (id, x, y) => {
    const prev = get().overrides;
    const addedIdx = prev.addedNodes.findIndex((n) => n.id === id);
    if (addedIdx !== -1) {
      const addedNodes = [...prev.addedNodes];
      addedNodes[addedIdx] = { ...addedNodes[addedIdx], x, y };
      get().commit({ ...prev, addedNodes });
      return;
    }
    const movedIdx = prev.movedNodes.findIndex((n) => n.id === id);
    const movedNodes = [...prev.movedNodes];
    if (movedIdx !== -1) movedNodes[movedIdx] = { id, x, y };
    else movedNodes.push({ id, x, y });
    get().commit({ ...prev, movedNodes });
  },

  save: async () => {
    set({ saveStatus: "saving" });
    try {
      const overrides = get().overrides;
      const res = await fetch("/api/editor/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      if (!res.ok) throw new Error(await res.text());
      set({ lastSaved: overrides, saveStatus: "saved" });
    } catch {
      set({ saveStatus: "error" });
    }
  },

  discard: () => {
    const { lastSaved } = get();
    set({
      overrides: lastSaved,
      pendingFrom: null,
      armedNodeId: null,
      discardArmed: false,
      message: null,
      selection: new Set(),
    });
  },
}));
