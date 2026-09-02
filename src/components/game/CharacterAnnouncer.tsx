"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterAnnouncement, CharacterEnterDirection, CharacterExpression } from "@/types/characterAnnouncer";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";
import { resolveAnnouncerEffect, resolveWarnRingClass } from "@/lib/game/characterAnnouncerTheme";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { CharacterSprite } from "./CharacterSprite";
import { SpeechBubble } from "./SpeechBubble";
import { AnnouncerEffectLayer } from "./AnnouncerEffectLayer";

interface CharacterAnnouncerProps {
  announcement: CharacterAnnouncement;
  onComplete: () => void;
}

type Phase = "entering" | "line" | "exiting";

/** enterDirectionに応じた「画面外」のtransform。退場はここへ戻る(入ってきた側へ引っ込む)。 */
function offscreenTransform(direction: CharacterEnterDirection): string {
  switch (direction) {
    case "left":
      return "translateX(-120%)";
    case "right":
      return "translateX(120%)";
    case "bottom":
      return "translateY(120%)";
  }
}

/**
 * キャラクターアナウンスシステムの共通「舞台」。ゲーム状態は一切知らず、announcementと
 * onCompleteだけを受け取る汎用コンポーネント。各イベント用モーダル(ArrivalModal等)は
 * 既存のxxxInfoからCharacterAnnouncementを組み立てて渡すアダプター役に徹する。
 *
 * 状態遷移: entering(スライドイン+着地bounce) → line(吹き出しpop、セリフ表示、highlightがあれば
 * slam演出、自動送り+タップ早送り) → exiting(スライドアウト) → onComplete()。
 * bounce/pop/highlight演出はすべてentering/lineフェーズの内側で完結させており、
 * 外部から見えるPhase("entering"|"line"|"exiting")・タップ早送り・onCompleteの契約は変更しない。
 */
export function CharacterAnnouncer({ announcement, onComplete }: CharacterAnnouncerProps) {
  const { lines, side, enterDirection } = announcement;
  const theme = announcement.theme ?? "normal";
  const effectConfig = resolveAnnouncerEffect(theme, announcement.effect);
  const warnRingClass = resolveWarnRingClass(theme);
  const reduceMotion = usePrefersReducedMotion();
  const isMobile = useIsMobileViewport();

  const [phase, setPhase] = useState<Phase>("entering");
  const [lineIndex, setLineIndex] = useState(0);
  const [expression, setExpression] = useState<CharacterExpression>(announcement.expression);
  const [isShaking, setIsShaking] = useState(false);
  const completedRef = useRef(false);

  // entering → line (スライドイン+着地bounceが終わったらセリフ表示を始める。reduce-motion時はbounce分の待ちを省く)
  useEffect(() => {
    if (phase !== "entering") return;
    const enteringMs = CHARACTER_ANNOUNCER_TIMING.slideInMs + (reduceMotion ? 0 : CHARACTER_ANNOUNCER_TIMING.bounceMs);
    const timer = window.setTimeout(() => setPhase("line"), enteringMs);
    return () => window.clearTimeout(timer);
  }, [phase, reduceMotion]);

  // セリフの自動送り(タップされなければ保持時間後に進む)。highlightがある行は
  // holdExtraMs(行ごとの指定 or テーマ既定値)ぶん余分に待つ。この保持時間はSpeechBubble側の
  // slamアニメーションの長さ・遅延とは独立して管理する。
  useEffect(() => {
    if (phase !== "line") return;
    const current = lines[lineIndex];
    const holdExtraMs = current?.highlight
      ? (current.highlight.holdExtraMs ?? CHARACTER_ANNOUNCER_TIMING.highlightHoldExtraMs)
      : 0;
    const timer = window.setTimeout(() => advance(), CHARACTER_ANNOUNCER_TIMING.lineHoldMs + holdExtraMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIndex]);

  // exiting → onComplete (スライドアウトが終わったら呼び出し元へ制御を返す)
  useEffect(() => {
    if (phase !== "exiting") return;
    const timer = window.setTimeout(
      () => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete();
      },
      reduceMotion ? 0 : CHARACTER_ANNOUNCER_TIMING.slideOutMs
    );
    return () => window.clearTimeout(timer);
  }, [phase, onComplete, reduceMotion]);

  // 行ごとの表情指定があれば切り替える
  useEffect(() => {
    const current = lines[lineIndex];
    if (current?.expression) setExpression(current.expression);
  }, [lineIndex, lines]);

  // highlightのある行で、テーマがshakeOnHighlightを持つ場合はslamと同じタイミングで軽くshakeさせる
  useEffect(() => {
    setIsShaking(false);
    if (phase !== "line" || reduceMotion || !effectConfig.shakeOnHighlight) return;
    const current = lines[lineIndex];
    if (!current?.highlight) return;
    const timer = window.setTimeout(() => setIsShaking(true), CHARACTER_ANNOUNCER_TIMING.highlightDelayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIndex]);

  function advance() {
    if (lineIndex < lines.length - 1) {
      setLineIndex((i) => i + 1);
    } else {
      setPhase("exiting");
    }
  }

  /** タップ/クリックで現在のセリフを早送りする。entering/exiting中は無視(演出の途中終了を避ける)。 */
  function handleTap() {
    if (phase === "line") advance();
  }

  const isOnscreen = phase === "line";
  const transform = isOnscreen ? "translate(0, 0)" : offscreenTransform(enterDirection);
  const transitionMs = reduceMotion ? 0 : phase === "exiting" ? CHARACTER_ANNOUNCER_TIMING.slideOutMs : CHARACTER_ANNOUNCER_TIMING.slideInMs;

  const currentLine = lines[lineIndex];

  const innerAnimationClass = [
    phase === "entering" && !reduceMotion ? "animate-character-bounce" : "",
    isShaking ? "animate-character-shake" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const innerAnimationStyle =
    phase === "entering" && !reduceMotion ? { animationDelay: `${CHARACTER_ANNOUNCER_TIMING.slideInMs}ms` } : undefined;

  return (
    <div
      className="fixed inset-0 z-50 cursor-pointer"
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-label="次へ"
      aria-live="polite"
    >
      <div
        className={`absolute bottom-0 flex w-full items-end gap-1 p-3 sm:w-auto sm:max-w-3xl sm:items-center sm:gap-3 sm:py-6 sm:pl-6 sm:pr-14 ${
          side === "right" ? "right-0 flex-row-reverse" : "left-0 flex-row"
        }`}
      >
        <div
          className="relative h-36 w-24 shrink-0 sm:h-[360px] sm:w-[240px]"
          style={{ transform, transition: `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
        >
          <div className={`h-full w-full ${innerAnimationClass}`} style={innerAnimationStyle}>
            <CharacterSprite characterId={announcement.characterId} expression={expression} className="h-full w-full" />
          </div>
          {/* 紙吹雪/キラキラ/警告リングはこのキャラクター周辺の枠内に限定し、盤面全体は覆わない。
              key=lineIndexで行が進むたびに演出を再生し直す(highlight表示の行でも確実に発火する)。 */}
          {phase === "line" && !reduceMotion && (
            <AnnouncerEffectLayer key={lineIndex} effect={effectConfig} mobile={isMobile} warnRingClass={warnRingClass} />
          )}
        </div>
        {isOnscreen && currentLine && <SpeechBubble line={currentLine} side={side} theme={theme} />}
      </div>
    </div>
  );
}
