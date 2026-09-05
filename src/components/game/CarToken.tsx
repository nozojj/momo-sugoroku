"use client";

import type { VehicleMode } from "@/types/game";
import { VEHICLE_PLACEHOLDER_STYLE, resolveVehicleAssetUrl } from "@/lib/game/vehicleStyle";

interface CarTokenProps {
  x: number;
  y: number;
  color: string;
  label: string;
  /** 同じマスに複数台重なるときのオフセット(横・縦) */
  offsetX: number;
  offsetY: number;
  isCurrentTurn: boolean;
  /** PLAYER_COLORS/CAR_ICONSと同じ順序のインデックス(0〜3)。normalモードの本番車画像を
   *  プレイヤーカラー別に解決するために使う(resolveVehicleAssetUrl参照)。 */
  colorIndex: number;
  /** 急行系カード使用中に一時的に切り替わる車の見た目。省略時は通常車("normal")。 */
  vehicleMode?: VehicleMode;
  /** trueの間は位置トランジションを無効化し、x/yの変更を即座に反映する(ぶっとび系カードの
   *  瞬間移動用。Board.tsxのinstantCameraTransitionと同じ「カットで見せる」目的で使う)。 */
  instant?: boolean;
}

/** プレイヤーの車コマ。位置(x,y)の変化はCSSトランジションでアニメーションする(instant時を除く)。
 *  vehicleMode(+normalはcolorIndex)に対応する画像が解決できればそれを描画し、
 *  無ければ手続き的SVGのプレースホルダー(VEHICLE_PLACEHOLDER_STYLE)を描画する
 *  (CharacterSprite.tsxと同じ「画像→プレースホルダー」の解決順序)。 */
export function CarToken({ x, y, color, label, offsetX, offsetY, isCurrentTurn, colorIndex, vehicleMode = "normal", instant = false }: CarTokenProps) {
  const assetUrl = resolveVehicleAssetUrl(vehicleMode, colorIndex);
  const placeholder = VEHICLE_PLACEHOLDER_STYLE[vehicleMode];

  return (
    <g
      style={{
        transform: `translate(${x + offsetX}px, ${y - 22 + offsetY}px)`,
        transition: instant ? "none" : "transform 420ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {isCurrentTurn && (
        <circle
          r={13}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.55}
          className="animate-ping-slow"
        />
      )}
      {/* 変身演出: vehicleModeが通常以外に変わるたびkeyで再マウントされ、一度だけ光の輪が広がる。
          車体の位置トランジション(親<g>)には影響しない。将来ここにスピードライン/タイヤ煙/残像等の
          周辺演出レイヤーを足す場合も、この位置に子要素を追加するだけでよい。 */}
      {vehicleMode !== "normal" && (
        <circle
          key={vehicleMode}
          r={14}
          fill="none"
          stroke={placeholder.accent}
          strokeWidth={2.5}
          className="animate-vehicle-transform-flash"
        />
      )}
      {/* 車体 */}
      <g style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))" }}>
        {assetUrl ? (
          <image href={assetUrl} x={-13} y={-13} width={26} height={26} />
        ) : (
          <g style={{ transform: `scale(${placeholder.scale})`, transformBox: "fill-box", transformOrigin: "center" }}>
            {placeholder.spoiler && (
              <rect x={-12.5} y={-4} width={2.5} height={7} rx={1} fill={placeholder.accent} stroke="#1f2937" strokeWidth={0.8} />
            )}
            <rect x={-11} y={-7} width={22} height={14} rx={5} fill={color} stroke={placeholder.accent} strokeWidth={1.4} />
            <rect x={-6} y={-11} width={12} height={8} rx={3} fill={color} stroke={placeholder.accent} strokeWidth={1.2} opacity={0.9} />
            <circle cx={-6} cy={7} r={2.6} fill="#1f2937" />
            <circle cx={6} cy={7} r={2.6} fill="#1f2937" />
          </g>
        )}
      </g>
      <text
        y={-16}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill="#1f2937"
        stroke="#fff"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  );
}
