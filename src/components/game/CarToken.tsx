"use client";

import type { CSSProperties } from "react";
import type { VehicleMode } from "@/types/game";
import { VEHICLE_PLACEHOLDER_STYLE, resolveVehicleAssetUrl } from "@/lib/game/vehicleStyle";
import { useVehicleHeading } from "./useVehicleHeading";

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
  /** Polish Phase 3b: 位置transitionの所要時間(ms)。省略時は既存どおり420ms固定
   *  (Phase3a以前の見た目を完全に維持する)。Board.tsxが現在の移動テンポ
   *  (moveTempo.tsのgetStepTransitionMs())から算出した値を、現在の手番プレイヤーの
   *  トークンにだけ渡す想定(他プレイヤーの駒は自分の手番以外で位置が動かないため、
   *  この値を渡しても渡さなくても見た目に影響しない)。 */
  movementDurationMs?: number;
  /** Polish Phase 3c: trueの間だけ、車体(位置transitionを持つ親<g>とは別要素)へ
   *  着地settle(animate-landing-settle、既存animate-character-bounceより控えめな
   *  一発scaleアニメーション)を適用する。省略時(false)は既存どおり何も付かない。 */
  landingSettle?: boolean;
}

/** 位置transitionの既定時間(ms)。Phase3b以前からの値をそのまま定数化しただけで、
 *  movementDurationMs省略時の見た目は一切変えない。 */
const DEFAULT_MOVEMENT_DURATION_MS = 420;

/** プレイヤーの車コマ。位置(x,y)の変化はCSSトランジションでアニメーションする(instant時を除く)。
 *  vehicleMode(+normalはcolorIndex)に対応する画像が解決できればそれを描画し、
 *  無ければ手続き的SVGのプレースホルダー(VEHICLE_PLACEHOLDER_STYLE)を描画する
 *  (CharacterSprite.tsxと同じ「画像→プレースホルダー」の解決順序)。 */
export function CarToken({
  x,
  y,
  color,
  label,
  offsetX,
  offsetY,
  isCurrentTurn,
  colorIndex,
  vehicleMode = "normal",
  instant = false,
  movementDurationMs = DEFAULT_MOVEMENT_DURATION_MS,
  landingSettle = false,
}: CarTokenProps) {
  const assetUrl = resolveVehicleAssetUrl(vehicleMode, colorIndex);
  const placeholder = VEHICLE_PLACEHOLDER_STYLE[vehicleMode];

  // Polish Phase 3d: 「進行方向が変化したstepだけ車体をカーブ方向へ軽く傾ける」curve lean。
  // 調査結果により、normal本番画像(3/4パース)は進行方向そのものへ360°rotateする方式に
  // 向かないため採用しない。代わりにoffsetX/offsetY適用前のx/y(=マス座標そのもの)だけを
  // useVehicleHeadingへ渡し、cluster offsetの変化(同じマスに他プレイヤーが増減した場合)や
  // instant(ワープ)中の不自然な傾きを避ける。normal/expressどちらのvehicleModeでも同じ
  // 演出を適用する(vehicleMode自体はこのhookに渡さないため、切替で挙動が変わらない)。
  const { leanDeg, stepKey } = useVehicleHeading(x, y);
  // instant(瞬間移動)中はcurve leanのアニメーションも表示しない(位置transitionを
  // 無効化するinstantと同じ「カットで見せる」方針。teleport先との間には道路上の
  // 進行方向という意味が無いため、直前の値を引きずって不自然に傾かせない)。
  const curveLeanActive = !instant && leanDeg !== 0;
  // durationはmovementDurationMs(Phase3bの現在のテンポ)にそのまま同期させる
  // (globals.cssの.animate-curve-leanが持つデフォルトdurationをインラインで上書きする)。
  const curveLeanStyle: CSSProperties | undefined = curveLeanActive
    ? ({ "--curve-lean-deg": `${leanDeg}deg`, animationDuration: `${movementDurationMs}ms` } as CSSProperties)
    : undefined;

  return (
    <g
      style={{
        transform: `translate(${x + offsetX}px, ${y - 22 + offsetY}px)`,
        transition: instant ? "none" : `transform ${movementDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
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
      {/* Polish Phase 3d: curve lean wrapper。position(親<g>のtranslate)・landing settle
          (直下の子<g>のscale)とはそれぞれ別要素にすることで、「1要素1transform
          animation責務」を維持する(同一要素にrotateとscaleのCSS animationを重ねると
          後勝ちで一方が消えるため)。key={stepKey}により、同じleanDegが連続しても
          (同じ角度のカーブが続く道等)アニメーションを毎step必ず再生させる
          (CarToken.tsx既存のkey={vehicleMode}による変身flash再生と同じ手法)。
          curveLeanStyleがundefined(直進/初回/instant中)の間は素通しのgとして働く。 */}
      <g key={stepKey} className={curveLeanActive ? "animate-curve-lean" : ""} style={curveLeanStyle}>
        {/* 車体。Polish Phase 3c: landingSettle=trueの間だけanimate-landing-settleを付与する。
            このg自体は位置transitionを持たない(親<g>の役割)ため、scaleアニメーションと
            position transitionが同一要素で衝突することはない(CarToken.tsx既存の
            wrapper/inner分離方針をそのまま踏襲)。 */}
        <g
          className={landingSettle ? "animate-landing-settle" : ""}
          style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))" }}
        >
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
