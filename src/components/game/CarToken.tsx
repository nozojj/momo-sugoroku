"use client";

interface CarTokenProps {
  x: number;
  y: number;
  color: string;
  label: string;
  /** 同じマスに複数台重なるときのオフセット(横・縦) */
  offsetX: number;
  offsetY: number;
  isCurrentTurn: boolean;
}

/** プレイヤーの車コマ。位置(x,y)の変化はCSSトランジションでアニメーションする。 */
export function CarToken({ x, y, color, label, offsetX, offsetY, isCurrentTurn }: CarTokenProps) {
  return (
    <g
      style={{
        transform: `translate(${x + offsetX}px, ${y - 22 + offsetY}px)`,
        transition: "transform 420ms cubic-bezier(0.4, 0, 0.2, 1)",
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
      {/* 車体 */}
      <g style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))" }}>
        <rect x={-11} y={-7} width={22} height={14} rx={5} fill={color} stroke="#1f2937" strokeWidth={1.2} />
        <rect x={-6} y={-11} width={12} height={8} rx={3} fill={color} stroke="#1f2937" strokeWidth={1} opacity={0.9} />
        <circle cx={-6} cy={7} r={2.6} fill="#1f2937" />
        <circle cx={6} cy={7} r={2.6} fill="#1f2937" />
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
