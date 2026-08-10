"use client";

import { useState } from "react";
import type { AnnouncerEffectConfig } from "@/types/characterAnnouncer";

interface AnnouncerEffectLayerProps {
  effect: AnnouncerEffectConfig;
  /** スマホ幅では粒子数を減らして盤面を隠しすぎないようにする */
  mobile: boolean;
}

const CONFETTI_COLORS = ["#fbbf24", "#fb7185", "#5eead4", "#a3e635"];

interface Particle {
  id: number;
  leftPct: number;
  delayMs: number;
}

function makeParticles(count: number, seedOffset: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: seedOffset + i,
    leftPct: 10 + Math.random() * 80,
    delayMs: Math.random() * 300,
  }));
}

/**
 * CharacterAnnouncerのキャラクター周辺だけに表示する周辺演出(紙吹雪/キラキラ/警告リング)。
 * ゲーム状態は一切知らない純粋な表示コンポーネント(CharacterSprite/SpeechBubbleと同じ役割分担)。
 * 親要素(キャラクターのラッパーdiv)に relative を付けた上で絶対配置し、画面全体ではなく
 * キャラクターの足元付近に限定することで盤面の視認性を優先する。
 */
export function AnnouncerEffectLayer({ effect, mobile }: AnnouncerEffectLayerProps) {
  const confettiCount = mobile ? 4 : 10;
  const sparkleCount = mobile ? 2 : 5;

  // 一度だけ生成し、親の再レンダー(セリフ送り等)で演出が再スタートしないようにする
  const [confetti] = useState(() => (effect.confetti ? makeParticles(confettiCount, 0) : []));
  const [sparkles] = useState(() => (effect.sparkle ? makeParticles(sparkleCount, 1000) : []));

  if (!effect.confetti && !effect.sparkle && !effect.warnRing) return null;

  return (
    <div className="pointer-events-none absolute -inset-3 overflow-visible sm:-inset-6" aria-hidden="true">
      {effect.warnRing && (
        <div className="animate-announcer-warn-ring absolute bottom-0 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-orange-400 sm:h-28 sm:w-28" />
      )}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="animate-confetti-fall absolute top-0 h-3 w-1.5 rounded-sm"
          style={{
            left: `${p.leftPct}%`,
            backgroundColor: CONFETTI_COLORS[p.id % CONFETTI_COLORS.length],
            animationDelay: `${p.delayMs}ms`,
          }}
        />
      ))}
      {sparkles.map((p) => (
        <span
          key={p.id}
          className="animate-announcer-sparkle absolute text-lg sm:text-2xl"
          style={{ left: `${p.leftPct}%`, top: `${20 + (p.id % 3) * 20}%`, animationDelay: `${p.delayMs}ms` }}
        >
          ✨
        </span>
      ))}
    </div>
  );
}
