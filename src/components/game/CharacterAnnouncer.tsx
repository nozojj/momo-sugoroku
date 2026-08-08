"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterAnnouncement, CharacterEnterDirection, CharacterExpression } from "@/types/characterAnnouncer";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";
import { CharacterSprite } from "./CharacterSprite";
import { SpeechBubble } from "./SpeechBubble";

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
 * 状態遷移: entering(スライドイン) → line(セリフ表示、自動送り+タップ早送り) → exiting(スライドアウト) → onComplete()
 */
export function CharacterAnnouncer({ announcement, onComplete }: CharacterAnnouncerProps) {
  const { lines, side, enterDirection } = announcement;
  const [phase, setPhase] = useState<Phase>("entering");
  const [lineIndex, setLineIndex] = useState(0);
  const [expression, setExpression] = useState<CharacterExpression>(announcement.expression);
  const completedRef = useRef(false);

  // entering → line (スライドインが終わったらセリフ表示を始める)
  useEffect(() => {
    if (phase !== "entering") return;
    const timer = window.setTimeout(() => setPhase("line"), CHARACTER_ANNOUNCER_TIMING.slideInMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // セリフの自動送り(タップされなければlineHoldMs後に進む)
  useEffect(() => {
    if (phase !== "line") return;
    const timer = window.setTimeout(() => advance(), CHARACTER_ANNOUNCER_TIMING.lineHoldMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIndex]);

  // exiting → onComplete (スライドアウトが終わったら呼び出し元へ制御を返す)
  useEffect(() => {
    if (phase !== "exiting") return;
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, CHARACTER_ANNOUNCER_TIMING.slideOutMs);
    return () => window.clearTimeout(timer);
  }, [phase, onComplete]);

  // 行ごとの表情指定があれば切り替える
  useEffect(() => {
    const current = lines[lineIndex];
    if (current?.expression) setExpression(current.expression);
  }, [lineIndex, lines]);

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
  const transitionMs = phase === "exiting" ? CHARACTER_ANNOUNCER_TIMING.slideOutMs : CHARACTER_ANNOUNCER_TIMING.slideInMs;

  const currentLine = lines[lineIndex];

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
        className={`absolute bottom-0 flex w-full items-end gap-2 p-3 sm:w-auto sm:max-w-2xl sm:p-6 ${
          side === "right" ? "right-0 flex-row-reverse" : "left-0 flex-row"
        }`}
      >
        <div
          className="h-24 w-24 shrink-0 sm:h-40 sm:w-40"
          style={{ transform, transition: `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
        >
          <CharacterSprite characterId={announcement.characterId} expression={expression} className="h-full w-full" />
        </div>
        {isOnscreen && currentLine && <SpeechBubble line={currentLine} side={side} />}
      </div>
    </div>
  );
}
