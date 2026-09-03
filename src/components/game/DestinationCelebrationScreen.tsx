"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArrivalInfo } from "@/types/game";
import type { CharacterLine } from "@/types/characterAnnouncer";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { playSE } from "@/lib/audio/soundManager";
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

/** 演出フェーズ。GameState/statusは増やさず、このコンポーネント内のローカルstateのみで完結させる。
 *  "lines": お祝い4行(セリフ送り)。
 *  "spin": 「次の目的地は……」で候補地名が高速→減速して切り替わる(見た目だけのルーレット)。
 *  "reveal": スピンが確定地名(arrivalInfo.nextDestinationName)で停止し、大きく強調表示する。
 *  "speak": naviが「次は◯◯を目指しましょう!」と話す。この後onContinue()を呼ぶ。 */
type Phase = "lines" | "spin" | "reveal" | "speak";

/** ルーレット演出(調整用定数)。候補地の抽選ロジックには一切関与しない、見た目のタイミングのみ。
 *  MoneyRouletteModal.tsxと同じ「後半ほど間隔が長くなる(減速する)」手法を踏襲する。 */
const SPIN_DURATION_MS = 1200; // 減速しながら地名が確定するまでの時間
const SPIN_STEP_COUNT = 10; // 確定前に切り替わる回数
const REVEAL_HOLD_MS = 900; // 確定地名を強調表示してから、naviが話し始めるまでの時間
// prefers-reduced-motion時は切替回数・時間を大きく縮める(演出自体は消さず、短く見せるだけ)。
const REDUCED_SPIN_DURATION_MS = 350;
const REDUCED_SPIN_STEP_COUNT = 3;
const REDUCED_REVEAL_HOLD_MS = 300;

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
    { text: "到着援助金!", highlight: { kind: "money", amount: arrivalInfo.bonus } },
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

  const [phase, setPhase] = useState<Phase>("lines");
  const [lineIndex, setLineIndex] = useState(0);
  const linesCompletedRef = useRef(false);

  // Phase10/P10-2: 到着した瞬間(マウント時)に1回だけ。このコンポーネントはarrivalInfoが
  // 非nullの間だけGameScreen側でマウントされ続ける(=到着のたびに新規マウントされる)ため、
  // MonopolyToastと同じ「マウントeffect本体で直接呼ぶ」パターンで十分。
  useEffect(() => {
    playSE("destination_arrive");
  }, []);

  const spinStepCount = reduceMotion ? REDUCED_SPIN_STEP_COUNT : SPIN_STEP_COUNT;
  const spinDurationMs = reduceMotion ? REDUCED_SPIN_DURATION_MS : SPIN_DURATION_MS;
  const revealHoldMs = reduceMotion ? REDUCED_REVEAL_HOLD_MS : REVEAL_HOLD_MS;

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

  // onContinue()が二重に呼ばれないようにする唯一のゲート。タップ早送り(handleClick)と
  // 自動タイマー(useEffect)のどちらから呼ばれても、最初の1回だけを通す。
  const continuedRef = useRef(false);
  function finish() {
    if (continuedRef.current) return;
    continuedRef.current = true;
    onContinue();
  }

  // スピン中: 次の目へ切り替える(減速するintervalsに沿って進む)。最後の1歩に達したら
  // spinStepの更新とphase遷移を同じコールバック内で行い(Reactが1レンダーにまとめてくれる)、
  // 「確定名がspin表示のまま一瞬映ってからrevealに切り替わる」ようなチラつきを避ける。
  // Phase10/P10-2: 通常tickはroulette_tickを鳴らすが、最終tick(reveal直前)では鳴らさない。
  // この直後にreveal effect側でdestination_revealを鳴らすため、両方が同時に重なるのを避ける。
  useEffect(() => {
    if (phase !== "spin") return;
    if (spinStep >= spinSequence.length - 1) return;
    const timer = window.setTimeout(() => {
      const next = spinStep + 1;
      setSpinStep(next);
      if (next >= spinSequence.length - 1) {
        setPhase("reveal");
      } else {
        playSE("roulette_tick");
      }
    }, spinIntervals[spinStep]);
    return () => window.clearTimeout(timer);
  }, [phase, spinStep, spinSequence.length, spinIntervals]);

  // reveal: 確定地名をrevealHoldMsだけ強調表示してから、自動でspeakフェーズへ進む。
  // destination_revealはここで鳴らす: 自動進行(上のspin effect)・タップスキップ(handleClickの
  // spin分岐)のどちらの経路でphaseが"reveal"になっても、この1箇所で確実に1回だけ発火する。
  useEffect(() => {
    if (phase !== "reveal") return;
    playSE("destination_reveal");
    const timer = window.setTimeout(() => setPhase("speak"), revealHoldMs);
    return () => window.clearTimeout(timer);
  }, [phase, revealHoldMs]);

  // speak: naviのセリフをCHARACTER_ANNOUNCER_TIMING.lineHoldMsだけ保持してから、
  // 自動でfinish()(=onContinue())を呼ぶ。
  useEffect(() => {
    if (phase !== "speak") return;
    const timer = window.setTimeout(finish, CHARACTER_ANNOUNCER_TIMING.lineHoldMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 全フェーズ共通のタップ/クリックハンドラ。現在のフェーズに応じて、待っている自動タイマーを
  // 早送りするだけ(何かを再抽選したり、フェーズを飛び越したりはしない)。
  function handleClick() {
    if (phase === "lines") {
      if (lineIndex < lines.length - 1) {
        setLineIndex((i) => i + 1);
        return;
      }
      if (linesCompletedRef.current) return;
      linesCompletedRef.current = true;
      setPhase("spin");
      return;
    }
    if (phase === "spin") {
      // スピンの残りをスキップして即座に確定させる(spinStep/phaseを同じイベント内で更新)。
      setSpinStep(spinSequence.length - 1);
      setPhase("reveal");
      return;
    }
    if (phase === "reveal") {
      setPhase("speak");
      return;
    }
    if (phase === "speak") {
      finish();
      return;
    }
  }

  // セリフの自動送り(タップされなければ保持時間後に進む)。CharacterAnnouncer.tsxと同じ
  // タイミング定数(CHARACTER_ANNOUNCER_TIMING)を再利用し、演出のテンポを統一する。
  useEffect(() => {
    if (phase !== "lines") return;
    const current = lines[lineIndex];
    const holdExtraMs = current?.highlight ? CHARACTER_ANNOUNCER_TIMING.highlightHoldExtraMs : 0;
    const timer = window.setTimeout(handleClick, CHARACTER_ANNOUNCER_TIMING.lineHoldMs + holdExtraMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIndex, lines]);

  const currentLine = lines[lineIndex];
  const naviLine: CharacterLine = { text: `次は${arrivalInfo.nextDestinationName}を目指しましょう!` };

  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto bg-gradient-to-b from-amber-200 via-orange-300 to-rose-300 p-4 dark:from-amber-900 dark:via-orange-950 dark:to-rose-950 sm:gap-5 sm:p-8"
      onClick={handleClick}
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

      {phase === "spin" && (
        <p className="animate-arrival-pop text-center text-sm font-black tracking-widest text-white drop-shadow sm:text-lg">
          🎯 次の目的地は…… 🎯
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

      {phase === "spin" && (
        <div className="w-full max-w-sm rounded-2xl border-2 border-white/50 bg-white/10 px-4 py-6 text-center shadow-xl backdrop-blur-sm sm:max-w-md">
          <p key={spinStep} className="animate-arrival-pop text-3xl font-black text-white/80 drop-shadow-lg sm:text-5xl">
            {spinSequence[spinStep]}
          </p>
        </div>
      )}

      {phase === "reveal" && (
        <div className="w-full max-w-sm rounded-2xl border-2 border-white bg-white/20 px-4 py-6 text-center shadow-xl backdrop-blur-sm sm:max-w-md">
          <p className="animate-highlight-slam text-4xl font-black text-white drop-shadow-lg sm:text-6xl">
            {arrivalInfo.nextDestinationName}!!
          </p>
        </div>
      )}

      {phase === "speak" && (
        <div className="w-full max-w-sm sm:max-w-md">
          <SpeechBubble line={naviLine} side="left" theme="celebratory" />
        </div>
      )}

      <p className="mt-1 text-xs font-bold text-white/90 drop-shadow sm:text-sm">タップして次へ</p>
    </div>
  );
}
