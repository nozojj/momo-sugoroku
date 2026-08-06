import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { MapOverrides } from "@/data/maps/applyOverrides";

const OVERRIDES_PATH = path.join(process.cwd(), "src", "data", "maps", "overrides.json");

function isValidOverrides(body: unknown): body is MapOverrides {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b.addedNodes) &&
    Array.isArray(b.addedEdges) &&
    Array.isArray(b.removedEdges) &&
    Array.isArray(b.removedNodes)
  );
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
  await fs.writeFile(OVERRIDES_PATH, JSON.stringify(body, null, 2) + "\n", "utf8");
  return NextResponse.json({ ok: true });
}
