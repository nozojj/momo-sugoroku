"use client";

import { useState } from "react";
import type { AnnouncerEffectConfig } from "@/types/characterAnnouncer";

interface AnnouncerEffectLayerProps {
  effect: AnnouncerEffectConfig;
  /** スマホ幅では粒子数を減らして盤面を隠しすぎないようにする */
  mobile: boolean;
  /** warnRingの枠色クラス(border-*-400を想定)。テーマごとにCharacterAnnouncer.tsxが解決して
   *  渡す(Polish Phase P1 S-3f-3、characterAnnouncerTheme.tsのresolveWarnRingClass参照)。
   *  このコンポーネント自身はテーマを知らない(受け取った色クラスをそのまま使うだけ)。
   *  DestinationCelebrationScreen.tsx/FinalRaceSequence.tsx/GameOverModal.tsxはCharacterAnnouncer
   *  を介さず直接このコンポーネントを使い、いずれもconfetti/sparkleのみでwarnRingを使わないため
   *  省略可能にしている(省略時は変更前と同じ既定色を使い、この3箇所の見た目は一切変えない)。 */
  warnRingClass?: string;
  /** Polish Phase「FinalRaceSequence Polish Phase 2b」: trueの場合、warnRing/impactFlashの
   *  サイズ・外側insetをFinalRaceSequenceの車バッジ(h-9/h-10)のような小さな対象向けに縮小する。
   *  confetti/sparkleの見た目やデフォルト(false=CharacterAnnouncer/GameOverModal/
   *  DestinationCelebrationScreenの既存呼び出し)には一切影響しない。 */
  compact?: boolean;
}

const DEFAULT_WARN_RING_CLASS = "border-orange-400";

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
export function AnnouncerEffectLayer({ effect, mobile, warnRingClass = DEFAULT_WARN_RING_CLASS, compact = false }: AnnouncerEffectLayerProps) {
  const confettiCount = mobile ? 4 : 10;
  const sparkleCount = mobile ? 2 : 5;

  // 一度だけ生成し、親の再レンダー(セリフ送り等)で演出が再スタートしないようにする
  const [confetti] = useState(() => (effect.confetti ? makeParticles(confettiCount, 0) : []));
  const [sparkles] = useState(() => (effect.sparkle ? makeParticles(sparkleCount, 1000) : []));

  if (!effect.confetti && !effect.sparkle && !effect.warnRing && !effect.impactFlash) return null;

  return (
    <div className={`pointer-events-none absolute overflow-visible ${compact ? "-inset-1 sm:-inset-2" : "-inset-3 sm:-inset-6"}`} aria-hidden="true">
      {effect.warnRing && (
        <div
          className={`animate-announcer-warn-ring absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border-4 ${compact ? "h-11 w-11 sm:h-14 sm:w-14" : "h-16 w-16 sm:h-28 sm:w-28"} ${warnRingClass}`}
        />
      )}
      {/* Polish Phase P1 S-3f-3: 妨害キャラの最終形態変身専用。キャラクターの足元付近(warnRingと
          同じ位置)に一瞬だけ光が弾ける「衝撃」。mix-blend-mode:screenで暗い部分を透かすため、
          カモメ魔王等のキャラクター本番画像を白一色で覆い隠さない。 */}
      {effect.impactFlash && (
        <div
          className={`animate-announcer-impact-flash absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-white ${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-20 w-20 sm:h-32 sm:w-32"}`}
          style={{ mixBlendMode: "screen", filter: "blur(6px)" }}
        />
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
