"use client";

import type { BuildingType } from "@/types/game";
import { BUILDING_STYLE, resolveBuildingAssetUrl } from "@/lib/game/buildingStyle";

interface BuildingSpriteProps {
  /** 建物の足元(接地点)の座標。マス座標 + オフセット済みの最終位置。 */
  cx: number;
  cy: number;
  buildingType: BuildingType;
  /** landmark専用。物件グループID。LANDMARK_ASSET_URLSから地域別の素材を解決するためだけに使う。
   *  landmark以外のbuildingTypeでは無視される。 */
  groupId?: string;
  scale?: number;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * 仮の2.5D風プレースホルダー建物。マス(MapNode)・物件(PropertyDef)には一切依存せず、
 * 座標・種別・サイズだけを受け取って描く純粋な見た目コンポーネント。
 * buildingType に対応する画像URLが BUILDING_ASSET_URLS に登録されれば、
 * プレースホルダー図形の代わりに自動的に<image>へ差し替わる。
 */
export function BuildingSprite({ cx, cy, buildingType, groupId, scale = 1, selected, onClick }: BuildingSpriteProps) {
  const style = BUILDING_STYLE[buildingType];
  const w = style.width * scale;
  const h = style.height * scale;
  const assetUrl = resolveBuildingAssetUrl(buildingType, groupId);
  const bodyTop = cy - h;
  const roofTop = bodyTop - h * 0.55;

  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      {/* 接地の影(簡易な2.5D感) */}
      <ellipse cx={cx} cy={cy + 2} rx={w * 0.55} ry={w * 0.16} fill="#000" opacity={0.12} />

      {selected && (
        <rect
          x={cx - w / 2 - 4}
          y={roofTop - 4}
          width={w + 8}
          height={cy - roofTop + 8}
          rx={6}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
        />
      )}

      {assetUrl ? (
        <image href={assetUrl} x={cx - w / 2} y={roofTop} width={w} height={cy - roofTop} preserveAspectRatio="xMidYMax meet" />
      ) : (
        <>
          <rect x={cx - w / 2} y={bodyTop} width={w} height={h} rx={2} fill={style.bodyColor} stroke="#3f3a30" strokeWidth={1.2} />
          <polygon
            points={`${cx - w / 2 - 2},${bodyTop} ${cx + w / 2 + 2},${bodyTop} ${cx},${roofTop}`}
            fill={style.roofColor}
            stroke="#3f3a30"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <text x={cx} y={bodyTop + h * 0.72} textAnchor="middle" fontSize={h * 0.62} pointerEvents="none">
            {style.icon}
          </text>
        </>
      )}
    </g>
  );
}
