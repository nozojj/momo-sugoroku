"use client";

import { useEffect, useState } from "react";
import type { BuildingOverride, BuildingType, MapNode, NodeType, PropertyGroup, RoadType } from "@/types/game";
import { NODE_STYLE } from "@/lib/game/mapStyle";
import { BUILDING_TYPE_LABEL, BUILDING_TYPE_OPTIONS, inferBuildingType, defaultBuildingOffset } from "@/lib/game/buildingStyle";
import { propertyGroupDefs } from "@/data/propertyGroups";
import { useEditorStore } from "@/store/editorStore";

const POSITION_STEP = 4;

const NODE_TYPE_OPTIONS: NodeType[] = [
  "normal",
  "money",
  "moneyGain",
  "moneyLoss",
  "card",
  "property",
  "gasStation",
  "warp",
  "event",
];
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
  existingPropertyGroup: PropertyGroup | undefined;
  existingBuildingOverride: BuildingOverride | undefined;
  onClose: () => void;
}

const inputCls =
  "w-full rounded border border-black/10 bg-white px-2 py-1 text-sm dark:bg-slate-800 dark:border-white/10 dark:text-slate-100";
const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";
const nudgeBtnCls =
  "flex h-7 w-7 items-center justify-center rounded border border-sky-300 bg-white text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-sky-900";

export function InspectorPanel({
  node,
  edge,
  isStartNode,
  existingAreas,
  existingPropertyGroup,
  existingBuildingOverride,
  onClose,
}: Props) {
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const upsertBuildingOverride = useEditorStore((s) => s.upsertBuildingOverride);
  const removeBuildingOverride = useEditorStore((s) => s.removeBuildingOverride);
  const setStartNode = useEditorStore((s) => s.setStartNode);
  const showToast = useEditorStore((s) => s.showToast);

  const [name, setName] = useState(node?.name ?? "");
  const [area, setArea] = useState(node?.area ?? "");

  useEffect(() => {
    setName(node?.name ?? "");
    setArea(node?.area ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, edge]);

  if (!node && !edge) return null;

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
                updateNode(node.id, { type, propertyGroupId: type === "property" ? node.propertyGroupId : undefined });
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
              <p className="mb-2 text-xs font-semibold text-pink-700 dark:text-pink-300">物件グループの設定</p>
              <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                このマスに止まると、選んだグループに属する全物件が購入対象として一覧表示される。
                グループの中身(物件の追加・編集)はdata/properties.ts・data/propertyGroups.tsを直接編集する。
              </p>
              <div>
                <label className={labelCls}>物件グループ</label>
                <select
                  className={inputCls}
                  value={node.propertyGroupId ?? ""}
                  onChange={(e) => updateNode(node.id, { propertyGroupId: e.target.value || undefined })}
                >
                  <option value="">(未設定)</option>
                  {propertyGroupDefs.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.region} / {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(node.type === "property" || node.isDestinationCandidate || existingBuildingOverride) && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
              <p className="mb-2 text-xs font-semibold text-sky-700 dark:text-sky-300">建物の設定(見た目のみ・ゲームロジックには影響しません)</p>
              {existingBuildingOverride ? (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!existingBuildingOverride.hidden}
                      onChange={(e) => upsertBuildingOverride(node.id, { hidden: e.target.checked })}
                    />
                    建物を非表示にする
                  </label>

                  <div>
                    <label className={labelCls}>建物タイプ</label>
                    <select
                      className={inputCls}
                      value={existingBuildingOverride.buildingType ?? inferBuildingType(node, existingPropertyGroup)}
                      onChange={(e) => upsertBuildingOverride(node.id, { buildingType: e.target.value as BuildingType })}
                    >
                      {BUILDING_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {BUILDING_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>位置調整</label>
                    <div className="grid grid-cols-3 gap-1">
                      <div />
                      <button
                        type="button"
                        className={`${nudgeBtnCls} mx-auto`}
                        onClick={() => {
                          const y = existingBuildingOverride.offsetY ?? defaultBuildingOffset(node).y;
                          upsertBuildingOverride(node.id, { offsetY: y - POSITION_STEP });
                        }}
                        aria-label="上へ"
                      >
                        ↑
                      </button>
                      <div />
                      <button
                        type="button"
                        className={`${nudgeBtnCls} mx-auto`}
                        onClick={() => {
                          const x = existingBuildingOverride.offsetX ?? defaultBuildingOffset(node).x;
                          upsertBuildingOverride(node.id, { offsetX: x - POSITION_STEP });
                        }}
                        aria-label="左へ"
                      >
                        ←
                      </button>
                      <span className="flex items-center justify-center text-[10px] text-slate-400">
                        {Math.round(existingBuildingOverride.offsetX ?? defaultBuildingOffset(node).x)},
                        {Math.round(existingBuildingOverride.offsetY ?? defaultBuildingOffset(node).y)}
                      </span>
                      <button
                        type="button"
                        className={`${nudgeBtnCls} mx-auto`}
                        onClick={() => {
                          const x = existingBuildingOverride.offsetX ?? defaultBuildingOffset(node).x;
                          upsertBuildingOverride(node.id, { offsetX: x + POSITION_STEP });
                        }}
                        aria-label="右へ"
                      >
                        →
                      </button>
                      <div />
                      <button
                        type="button"
                        className={`${nudgeBtnCls} mx-auto`}
                        onClick={() => {
                          const y = existingBuildingOverride.offsetY ?? defaultBuildingOffset(node).y;
                          upsertBuildingOverride(node.id, { offsetY: y + POSITION_STEP });
                        }}
                        aria-label="下へ"
                      >
                        ↓
                      </button>
                      <div />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>サイズ({(existingBuildingOverride.scale ?? 1).toFixed(2)}倍)</label>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={existingBuildingOverride.scale ?? 1}
                      onChange={(e) => upsertBuildingOverride(node.id, { scale: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeBuildingOverride(node.id)}
                    className="w-full rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                  >
                    この上書きを削除(自動推測に戻す)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    自動推測: {BUILDING_TYPE_LABEL[inferBuildingType(node, existingPropertyGroup)]}
                  </p>
                  <button
                    type="button"
                    onClick={() => upsertBuildingOverride(node.id, {})}
                    className="w-full rounded-lg border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900"
                  >
                    個別設定を追加
                  </button>
                </div>
              )}
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
