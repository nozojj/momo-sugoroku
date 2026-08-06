"use client";

import { useEffect, useState } from "react";
import type { MapNode, NodeType, PropertyDef, RoadType } from "@/types/game";
import { NODE_STYLE } from "@/lib/game/mapStyle";
import { useEditorStore } from "@/store/editorStore";

const NODE_TYPE_OPTIONS: NodeType[] = ["normal", "money", "card", "property", "gasStation", "warp", "event"];
const ROAD_TYPE_OPTIONS: RoadType[] = ["national", "main", "coastal", "residential", "shortcut"];
const ROAD_TYPE_LABEL: Record<RoadType, string> = {
  national: "国道",
  main: "幹線",
  coastal: "海沿い",
  residential: "住宅街",
  shortcut: "近道",
};

export interface SelectedEdgeInfo {
  from: MapNode;
  to: MapNode;
  roadType: RoadType;
  requiresCardId?: string;
}

interface Props {
  node: MapNode | null;
  edge: SelectedEdgeInfo | null;
  isStartNode: boolean;
  existingAreas: string[];
  existingPropertyDef: PropertyDef | undefined;
  onClose: () => void;
}

const inputCls =
  "w-full rounded border border-black/10 bg-white px-2 py-1 text-sm dark:bg-slate-800 dark:border-white/10 dark:text-slate-100";
const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

export function InspectorPanel({ node, edge, isStartNode, existingAreas, existingPropertyDef, onClose }: Props) {
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const upsertCustomProperty = useEditorStore((s) => s.upsertCustomProperty);
  const setStartNode = useEditorStore((s) => s.setStartNode);
  const showToast = useEditorStore((s) => s.showToast);

  const [name, setName] = useState(node?.name ?? "");
  const [area, setArea] = useState(node?.area ?? "");
  const [propName, setPropName] = useState(existingPropertyDef?.name ?? "");
  const [propCategory, setPropCategory] = useState(existingPropertyDef?.category ?? "");
  const [propPrice, setPropPrice] = useState(String(existingPropertyDef?.price ?? 500));

  useEffect(() => {
    setName(node?.name ?? "");
    setArea(node?.area ?? "");
    setPropName(existingPropertyDef?.name ?? "");
    setPropCategory(existingPropertyDef?.category ?? "");
    setPropPrice(String(existingPropertyDef?.price ?? 500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, edge]);

  if (!node && !edge) return null;

  function commitPropertyDef(nodeId: string, patch: Partial<Pick<PropertyDef, "name" | "category" | "price">>) {
    const price = patch.price ?? existingPropertyDef?.price ?? 500;
    const def: PropertyDef = {
      id: `${nodeId}_prop`,
      name: patch.name ?? existingPropertyDef?.name ?? "新しい物件",
      category: patch.category ?? existingPropertyDef?.category ?? "その他",
      price,
      assetValue: price,
      area: node?.area || "エディタ物件",
    };
    upsertCustomProperty(def);
    if (node?.propertyId !== def.id) updateNode(nodeId, { propertyId: def.id });
  }

  return (
    <div className="absolute right-3 top-3 bottom-16 w-72 overflow-y-auto rounded-xl border border-black/10 bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-slate-900/95 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{node ? "交差点の編集" : "道の編集"}</h2>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="閉じる">
          ✕
        </button>
      </div>

      {node && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>名前</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== node.name && updateNode(node.id, { name: name.trim() })}
            />
          </div>

          <div>
            <label className={labelCls}>種別</label>
            <select
              className={inputCls}
              value={node.type}
              onChange={(e) => {
                const type = e.target.value as NodeType;
                updateNode(node.id, { type, propertyId: type === "property" ? node.propertyId : undefined });
              }}
            >
              {NODE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {NODE_STYLE[t].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>エリア</label>
            <input
              className={inputCls}
              list="editor-area-list"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onBlur={() => area !== (node.area ?? "") && updateNode(node.id, { area: area.trim() || undefined })}
              placeholder="街の名前(空欄可)"
            />
            <datalist id="editor-area-list">
              {existingAreas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!node.isDestinationCandidate}
              onChange={(e) => updateNode(node.id, { isDestinationCandidate: e.target.checked })}
            />
            目的地候補(駅)にする
          </label>

          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!node.isMajorHub}
              onChange={(e) => updateNode(node.id, { isMajorHub: e.target.checked })}
            />
            主要ハブとして大きく表示する
          </label>

          {node.type === "property" && (
            <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-3 dark:border-pink-900 dark:bg-pink-950/30">
              <p className="mb-2 text-xs font-semibold text-pink-700 dark:text-pink-300">物件の設定</p>
              <div className="flex flex-col gap-2">
                <div>
                  <label className={labelCls}>物件名</label>
                  <input
                    className={inputCls}
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    onBlur={() => commitPropertyDef(node.id, { name: propName.trim() || "新しい物件" })}
                  />
                </div>
                <div>
                  <label className={labelCls}>カテゴリ</label>
                  <input
                    className={inputCls}
                    value={propCategory}
                    onChange={(e) => setPropCategory(e.target.value)}
                    onBlur={() => commitPropertyDef(node.id, { category: propCategory.trim() || "その他" })}
                  />
                </div>
                <div>
                  <label className={labelCls}>価格(万円)</label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step={10}
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    onBlur={() => {
                      const n = Number(propPrice);
                      commitPropertyDef(node.id, { price: Number.isFinite(n) && n >= 0 ? n : 500 });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-black/10 pt-3 dark:border-white/10">
            {isStartNode ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">🚩 現在の開始地点です</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStartNode(node.id);
                  showToast(`「${node.name}」を開始地点に設定しました`);
                }}
                className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                🚩 ここを開始地点にする
              </button>
            )}
          </div>
        </div>
      )}

      {edge && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {edge.from.name} ⇄ {edge.to.name}
          </p>

          <div>
            <label className={labelCls}>道の種類</label>
            <select
              className={inputCls}
              value={edge.roadType}
              onChange={(e) => updateEdge(edge.from.id, edge.to.id, { roadType: e.target.value as RoadType })}
            >
              {ROAD_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {ROAD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={!!edge.requiresCardId}
              onChange={(e) =>
                updateEdge(edge.from.id, edge.to.id, { requiresCardId: e.target.checked ? "card_shortcut" : null })
              }
            />
            近道カードが無いと通れない
          </label>
        </div>
      )}
    </div>
  );
}
