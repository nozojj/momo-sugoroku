import type { VehicleMode } from "@/types/game";

/**
 * express系(expressLv1〜4)の本番車画像(PNG/WebP)への差し替え用。vehicleMode→画像URLを
 * 登録するだけで、CarTokenはプレースホルダー(手続き的SVG)の代わりにその画像を描画する
 * (CharacterSprite/characterStyle.tsのCHARACTER_ASSET_URLSと同じパターン)。
 * 今回はexpress系を本番画像化しないため空のまま(=常にプレースホルダー描画)。
 * 画像を用意したら1行足すだけでよい。例: expressLv4: "/vehicles/express-lv4.webp",
 * normalモードはプレイヤーカラー別の画像が必要なため、この単純なURLマップではなく
 * NORMAL_ASSET_URLS_BY_COLOR_INDEX + resolveVehicleAssetUrl()で解決する(下記)。
 */
export const VEHICLE_ASSET_URLS: Partial<Record<VehicleMode, string>> = {};

/**
 * normalモードの本番車画像。PLAYER_COLORS(engine.ts)と同じ順序(赤/青/緑/紫)で
 * colorIndexに対応させる。4色すべて揃っているため、normalは常にこの配列から解決できる。
 */
const NORMAL_ASSET_URLS_BY_COLOR_INDEX: readonly string[] = [
  "/vehicles/normal-red.webp",
  "/vehicles/normal-blue.webp",
  "/vehicles/normal-green.webp",
  "/vehicles/normal-purple.webp",
];

/**
 * CarTokenが実際に描画する画像URLを解決する。normalはプレイヤーカラー別の本番画像を
 * colorIndex経由で返し、それ以外(express系)は従来通りVEHICLE_ASSET_URLSのみを見る
 * (今は未登録のため常にundefined=プレースホルダーへ安全にフォールバックする)。
 */
export function resolveVehicleAssetUrl(vehicleMode: VehicleMode, colorIndex: number): string | undefined {
  if (vehicleMode === "normal") {
    return NORMAL_ASSET_URLS_BY_COLOR_INDEX[colorIndex];
  }
  return VEHICLE_ASSET_URLS[vehicleMode];
}

export interface VehiclePlaceholderStyle {
  /** 通常車に対する拡大率 */
  scale: number;
  /** キャビンのアクセントカラー(車体色=プレイヤーカラーの上に重ねる差し色) */
  accent: string;
  /** スポイラーを描画するか */
  spoiler: boolean;
}

/**
 * 画像が用意されるまでの仮表示(手続き的SVGのバリエーション)。VEHICLE_ASSET_URLSに
 * 画像が登録されたvehicleModeでは使われない。
 * 将来的にスピードライン/タイヤ煙/残像/光/波の軌跡などの周辺演出を追加する場合は、
 * このスタイル定義を参照する専用の装飾レイヤー(AnnouncerEffectLayer.tsxと同じ位置づけ)を
 * CarToken.tsx側に足すだけでよい。
 */
export const VEHICLE_PLACEHOLDER_STYLE: Record<VehicleMode, VehiclePlaceholderStyle> = {
  normal: { scale: 1, accent: "#1f2937", spoiler: false },
  expressLv1: { scale: 1.05, accent: "#0ea5e9", spoiler: false },
  expressLv2: { scale: 1.12, accent: "#f59e0b", spoiler: true },
  expressLv3: { scale: 1.2, accent: "#ef4444", spoiler: true },
  expressLv4: { scale: 1.3, accent: "#a855f7", spoiler: true },
};
