import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { applyMapOverrides, type MapOverrides } from "@/data/maps/applyOverrides";
import { shonanFullMap as shonanFullMapGenerated } from "@/data/maps/shonan-full";

const OVERRIDES_PATH = path.join(process.cwd(), "src", "data", "maps", "overrides.json");

const NODE_TYPES = new Set(["normal", "money", "card", "property", "gasStation", "warp", "event"]);
const ROAD_TYPES = new Set(["national", "main", "coastal", "residential", "shortcut"]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}
function isOptionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === "boolean";
}

function isValidAddedNode(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return (
    isNonEmptyString(n.id) &&
    isNonEmptyString(n.name) &&
    isFiniteNumber(n.x) &&
    isFiniteNumber(n.y) &&
    isOptionalString(n.area) &&
    (n.type === undefined || (typeof n.type === "string" && NODE_TYPES.has(n.type))) &&
    isOptionalString(n.propertyId) &&
    isOptionalBoolean(n.isDestinationCandidate) &&
    isOptionalBoolean(n.isMajorHub)
  );
}
function isValidMovedNode(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return isNonEmptyString(n.id) && isFiniteNumber(n.x) && isFiniteNumber(n.y);
}
function isValidModifiedNode(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  if (!isNonEmptyString(n.id) || !n.patch || typeof n.patch !== "object") return false;
  const p = n.patch as Record<string, unknown>;
  return (
    (p.type === undefined || (typeof p.type === "string" && NODE_TYPES.has(p.type))) &&
    isOptionalString(p.name) &&
    isOptionalString(p.area) &&
    isOptionalString(p.propertyId) &&
    isOptionalBoolean(p.isDestinationCandidate) &&
    isOptionalBoolean(p.isMajorHub)
  );
}
function isValidAddedEdge(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    isNonEmptyString(e.from) &&
    isNonEmptyString(e.to) &&
    typeof e.roadType === "string" &&
    ROAD_TYPES.has(e.roadType) &&
    isOptionalString(e.requiresCardId)
  );
}
function isValidModifiedEdge(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    isNonEmptyString(e.from) &&
    isNonEmptyString(e.to) &&
    (e.roadType === undefined || (typeof e.roadType === "string" && ROAD_TYPES.has(e.roadType))) &&
    (e.requiresCardId === undefined || e.requiresCardId === null || typeof e.requiresCardId === "string")
  );
}
function isValidRemovedEdge(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return isNonEmptyString(e.from) && isNonEmptyString(e.to);
}
function isValidCustomProperty(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    isNonEmptyString(p.id) &&
    isNonEmptyString(p.name) &&
    isNonEmptyString(p.category) &&
    isFiniteNumber(p.price) &&
    isFiniteNumber(p.assetValue) &&
    isNonEmptyString(p.area) &&
    isOptionalString(p.icon) &&
    isOptionalBoolean(p.isRealLandmark)
  );
}

function isValidOverrides(body: unknown): body is MapOverrides {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b.addedNodes) &&
    b.addedNodes.every(isValidAddedNode) &&
    Array.isArray(b.movedNodes) &&
    b.movedNodes.every(isValidMovedNode) &&
    Array.isArray(b.modifiedNodes) &&
    b.modifiedNodes.every(isValidModifiedNode) &&
    Array.isArray(b.removedNodes) &&
    b.removedNodes.every((id) => isNonEmptyString(id)) &&
    Array.isArray(b.addedEdges) &&
    b.addedEdges.every(isValidAddedEdge) &&
    Array.isArray(b.modifiedEdges) &&
    b.modifiedEdges.every(isValidModifiedEdge) &&
    Array.isArray(b.removedEdges) &&
    b.removedEdges.every(isValidRemovedEdge) &&
    Array.isArray(b.customProperties) &&
    b.customProperties.every(isValidCustomProperty) &&
    (b.startNodeId === undefined || isNonEmptyString(b.startNodeId))
  );
}

/** 保存前シミュレーション: 実際にapplyMapOverridesを通し、ゲームが起動できる状態を保つ。 */
function findSemanticErrors(body: MapOverrides): string[] {
  const errors: string[] = [];
  const result = applyMapOverrides(shonanFullMapGenerated, body);

  if (body.startNodeId && result.startNodeId !== body.startNodeId) {
    errors.push(`startNodeId "${body.startNodeId}" が解決後のマップに存在しません`);
  }
  if (!result.nodes.some((n) => n.isDestinationCandidate)) {
    errors.push("目的地候補(isDestinationCandidate)を持つノードが1件もありません");
  }
  const propIds = new Set<string>();
  for (const p of body.customProperties) {
    if (propIds.has(p.id)) errors.push(`物件ID "${p.id}" が重複しています`);
    propIds.add(p.id);
  }

  return errors;
}

export async function GET() {
  const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
  return NextResponse.json(JSON.parse(raw));
}

export async function POST(req: NextRequest) {
  // ローカルでの地図編集専用。本番公開時にファイル書き込みを許可しないための安全弁。
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "editor is dev-only" }, { status: 403 });
  }
  const body = await req.json();
  if (!isValidOverrides(body)) {
    return NextResponse.json({ error: "invalid overrides shape" }, { status: 400 });
  }
  const semanticErrors = findSemanticErrors(body);
  if (semanticErrors.length > 0) {
    return NextResponse.json({ error: "invalid overrides content", details: semanticErrors }, { status: 400 });
  }
  await fs.writeFile(OVERRIDES_PATH, JSON.stringify(body, null, 2) + "\n", "utf8");
  return NextResponse.json({ ok: true });
}
