"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArrivalInfo } from "@/types/game";
import type { CharacterLine } from "@/types/characterAnnouncer";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { CharacterSprite } from "./CharacterSprite";
import { SpeechBubble } from "./SpeechBubble";
import { AnnouncerEffectLayer } from "./AnnouncerEffectLayer";

interface DestinationCelebrationScreenProps {
  arrivalInfo: ArrivalInfo;
  /** ルーレット演出で高速切替させる候補地名一覧(演出専用の見せかけ)。GameScreen側で
   *  destinationCandidateNodes(map)から渡される。空の場合はarrivalInfo.nextDestinationNameのみで回す。 */
  candidateDestinationNames: string[];
  /** 演出完了時に呼ぶ。既存のcontinueAfterArrival()をそのまま渡す想定
   *  (destinationArrived→destinationFocusという既存の遷移には一切関与しない)。 */
  onContinue: () => void;
}

/** ルーレット演出(調整用定数)。候補地の抽選ロジックには一切関与しない、見た目のタイミングのみ。
 *  MoneyRouletteModal.tsxと同じ「後半ほど間隔が長くなる(減速する)」手法を踏襲する。 */
const SPIN_DURATION_MS = 1200; // 減速しながら地名が確定するまでの時間
const SPIN_STEP_COUNT = 10; // 確定前に切り替わる回数
const HOLD_DURATION_MS = 700; // 確定地名を表示してから閉じるまでの時間
// prefers-reduced-motion時は切替回数・時間を大きく縮める(演出自体は消さず、短く見せるだけ)。
const REDUCED_SPIN_DURATION_MS = 350;
const REDUCED_SPIN_STEP_COUNT = 3;

/** 第1段階: 目的地到着セリフ(おめでとう〜到着援助金〜次の目的地を決めましょう、まで)を
 * 全画面の「お祝いイベント画面」として表示する。ゲーム状態は一切書き換えない表示専用
 * コンポーネントで、arrivalInfo(既にgameStore側で確定済みのボーナス・次の目的地名等)を
 * そのまま読んで組み立てるだけ(ArrivalModal.tsxが担っていたのと同じアダプター役)。
 *
 * フェーズごとにセリフを組み立てる関数を分けておくことで、将来「目的地別セリフ」「季節別演出」
 * などを追加する際も、この関数の中身だけを差し替えれば済むようにしている
 * (呼び出し側のシーケンス管理・GameScreen側の配線には影響しない)。
 */
function buildCelebrationLines(arrivalInfo: ArrivalInfo): CharacterLine[] {
  return [
    { text: "おめでとうございます!" },
    { text: `${arrivalInfo.playerName}さんが「${arrivalInfo.destinationName}」に到着しました!` },
    { text: "到着援助金!", highlight: { amount: arrivalInfo.bonus } },
    { text: "それでは次の目的地を決めましょう!" },
  ];
}

/** 後半ほど間隔が長くなる(減速していく)スピン間隔を、合計がtotalMsになるよう生成する。
 *  MoneyRouletteModal.tsxのbuildSpinIntervals()と同じ式(候補は数値/文字列いずれでも
 *  タイミング生成そのものはstep数だけに依存するため式を複製している)。 */
function buildSpinIntervals(totalMs: number, steps: number): number[] {
  const weights = Array.from({ length: steps }, (_, i) => Math.pow((i + 1) / steps, 1.8));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(30, Math.round((w / weightSum) * totalMs)));
}

/** 演出用の見せかけ候補列を組み立てる純関数。ゲーム内部の抽選(pickRandomDestination)は
 *  一切呼ばない。最後の要素には必ずfinalName(=arrivalInfo.nextDestinationName、既に確定済み)
 *  を置く。隣り合う要素が同じ地名にならないようにして、切り替わって見えるようにする。 */
function buildDestinationSpinSequence(candidateNames: string[], finalName: string, stepCount: number): string[] {
  const pool = candidateNames.length > 0 ? candidateNames : [finalName];
  const seq: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < stepCount; i++) {
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && pick === prev) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    seq.push(pick);
    prev = pick;
  }
  seq.push(finalName);
  return seq;
}

export function DestinationCelebrationScreen({
  arrivalInfo,
  candidateDestinationNames,
  onContinue,
}: DestinationCelebrationScreenProps) {
  const lines = useMemo(() => buildCelebrationLines(arrivalInfo), [arrivalInfo]);
  const reduceMotion = usePrefersReducedMotion();
  const isMobile = useIsMobileViewport();

  // フェーズ管理はこのコンポーネント内のローカルstateのみで完結させる(GameState/statusは増やさない)。
  // "lines": 既存のお祝い4行(セリフ送り)。"roulette": 今回追加する見た目だけの次の目的地ルーレット。
  const [phase, setPhase] = useState<"lines" | "roulette">("lines");
  const [lineIndex, setLineIndex] = useState(0);
  const linesCompletedRef = useRef(false);

  function advance() {
    if (phase !== "lines") return; // ルーレット中はタップしても何も起きない(今回は早送り機能を作らない)
    if (lineIndex < lines.length - 1) {
      setLineIndex((i) => i + 1);
      return;
    }
    if (linesCompletedRef.current) return;
    linesCompletedRef.current = true;
    setPhase("roulette");
  }

  // セリフの自動送り(タップされなければ保持時間後に進む)。CharacterAnnouncer.tsxと同じ
  // タイミング定数(CHARACTER_ANNOUNCER_TIMING)を再利用し、演出のテンポを統一する。
  useEffect(() => {
    if (phase !== "lines") return;
    const current = lines[lineIndex];
    const holdExtraMs = current?.highlight ? CHARACTER_ANNOUNCER_TIMING.highlightHoldExtraMs : 0;
    const timer = window.setTimeout(advance, CHARACTER_ANNOUNCER_TIMING.lineHoldMs + holdExtraMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIndex, lines]);

  const spinStepCount = reduceMotion ? REDUCED_SPIN_STEP_COUNT : SPIN_STEP_COUNT;
  const spinDurationMs = reduceMotion ? REDUCED_SPIN_DURATION_MS : SPIN_DURATION_MS;

  // 見せかけの候補列。マウント中は候補・確定地名が変わらない前提(このコンポーネントは
  // arrivalInfoが非nullの間だけGameScreen側でマウントされ続ける)なので、依存が変わっても
  // 再抽選はしない(MoneyRouletteModal.tsxのsequenceと同じ考え方)。
  const spinSequence = useMemo(
    () => buildDestinationSpinSequence(candidateDestinationNames, arrivalInfo.nextDestinationName, spinStepCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const spinIntervals = useMemo(
    () => buildSpinIntervals(spinDurationMs, spinSequence.length - 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spinSequence.length],
  );

  const [spinStep, setSpinStep] = useState(0);
  const spinning = phase === "roulette" && spinStep < spinSequence.length - 1;
  const spinSettled = phase === "roulette" && !spinning;

  // スピン中: 次の目へ切り替える(減速するintervalsに沿って進む)。
  useEffect(() => {
    if (phase !== "roulette") return;
    if (spinStep >= spinSequence.length - 1) return;
    const timer = window.setTimeout(() => setSpinStep((s) => s + 1), spinIntervals[spinStep]);
    return () => window.clearTimeout(timer);
  }, [phase, spinStep, spinSequence.length, spinIntervals]);

  // 確定後: 強調表示をHOLD_DURATION_MSだけ見せてから自動でonContinue()を呼ぶ。
  // rouletteCompletedRefで二重発火を防ぐ(cleanupでの取り消しに加え、念のための保険。
  // MoneyRouletteModal.tsxのfiredRefと同じ役割)。
  const rouletteCompletedRef = useRef(false);
  useEffect(() => {
    if (!spinSettled) return;
    const timer = window.setTimeout(() => {
      if (rouletteCompletedRef.current) return;
      rouletteCompletedRef.current = true;
      onContinue();
    }, HOLD_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [spinSettled, onContinue]);

  const currentLine = lines[lineIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto bg-gradient-to-b from-amber-200 via-orange-300 to-rose-300 p-4 dark:from-amber-900 dark:via-orange-950 dark:to-rose-950 sm:gap-5 sm:p-8"
      onClick={advance}
      role="button"
      tabIndex={0}
      aria-label="次へ"
      aria-live="polite"
    >
      {phase === "lines" && (
        <>
          <p className="animate-arrival-pop text-center text-sm font-black tracking-widest text-white drop-shadow sm:text-lg">
            🎉 目的地到着 🎉
          </p>
          <p className="animate-arrival-pop text-center text-3xl font-black text-white drop-shadow-lg sm:text-6xl">
            「{arrivalInfo.destinationName}」
          </p>
        </>
      )}

      {phase === "roulette" && (
        <p className="animate-arrival-pop text-center text-sm font-black tracking-widest text-white drop-shadow sm:text-lg">
          🎯 次の目的地は…? 🎯
        </p>
      )}

      <div className="relative mt-1 h-40 w-40 shrink-0 sm:h-64 sm:w-64">
        <CharacterSprite characterId="navi" expression="happy" className="h-full w-full" />
        {!reduceMotion && <AnnouncerEffectLayer effect={{ confetti: true, sparkle: true }} mobile={isMobile} />}
      </div>

      {phase === "lines" && currentLine && (
        <div key={lineIndex} className="w-full max-w-sm sm:max-w-md">
          <SpeechBubble line={currentLine} side="left" theme="celebratory" />
        </div>
      )}

      {phase === "roulette" && (
        <div className="w-full max-w-sm rounded-2xl border-2 border-white/50 bg-white/10 px-4 py-6 text-center shadow-xl backdrop-blur-sm sm:max-w-md">
          <p
            key={spinStep}
            className={`animate-arrival-pop text-3xl font-black drop-shadow-lg sm:text-5xl ${
              spinning ? "text-white/80" : "text-white"
            }`}
          >
            {spinSequence[spinStep]}
          </p>
        </div>
      )}

      {phase === "lines" && (
        <p className="mt-1 text-xs font-bold text-white/90 drop-shadow sm:text-sm">タップして次へ</p>
      )}
    </div>
  );
}
