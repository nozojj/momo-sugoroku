"use client";

import { useEffect, useRef, useState } from "react";
import type { RankedPlayer } from "@/lib/game/engine";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { playSE } from "@/lib/audio/soundManager";

interface FinalRaceSequenceProps {
  /** finished確定直後にrankPlayers(players)で計算した結果をそのまま渡す(1位が先頭)。
   *  このコンポーネント自身は順位の計算・再計算・並べ替えを一切行わない: 受け取った配列の
   *  順序とRankedPlayer.rank(既に同着を考慮した競技式順位)だけを読み、脱落発表の
   *  タイミング(=いつ表示するか)だけを管理する。 */
  ranked: RankedPlayer[];
  /** gameStore.computeWinnerIds()の結果(同着1位を判定するためだけに使う)。 */
  winnerIds: string[];
  /** 演出が最後まで完了した(=結果画面へ進んでよい)ときに1回だけ呼ばれる。 */
  onFinish: () => void;
}

/**
 * 最終順位発表演出(P11とは独立したフェーズ、仮称「湘南レースイベント」)のPhase A:
 * phase/state machine基盤のみ。見た目はプレースホルダー(色付きラベル+carIcon列挙)で、
 * 背景・観客・レースコースのビジュアル作り込みはPhase B以降で行う。
 *
 * 設計上の大原則(P11ミーティング決定事項): 最終順位はgameStore側で既に確定済みの
 * source of truthであり、このコンポーネントのアニメーション・タイマーが順位に影響することは
 * 絶対にない。ranked/winnerIdsはpropsとして1回だけ受け取り、内部のuseGameStore購読は
 * 一切行わない(DestinationCelebrationScreen.tsxと同じ「表示専用コンポーネント」の設計)。
 */
type RacePhase = "intro" | "running" | "eliminating" | "finalTwo" | "winnerSprint" | "finish" | "celebration" | "done";

/** 演出タイミング(調整用定数)。DestinationCelebrationScreen.tsxと同じく、
 *  prefers-reduced-motion時は演出自体を消さずに大幅短縮するだけにする。 */
const TIMING_MS = {
  intro: 1200,
  running: 900,
  eliminationStep: 700,
  finalTwo: 1500, // ユーザー要求どおり、ここだけ意図的に長めに引っ張る
  winnerSprint: 800,
  finish: 400,
  celebration: 1600,
};
const REDUCED_TIMING_MS = {
  intro: 300,
  running: 200,
  eliminationStep: 200,
  finalTwo: 400,
  winnerSprint: 200,
  finish: 100,
  celebration: 400,
};

export function FinalRaceSequence({ ranked, winnerIds, onFinish }: FinalRaceSequenceProps) {
  const reduceMotion = usePrefersReducedMotion();
  const timing = reduceMotion ? REDUCED_TIMING_MS : TIMING_MS;

  const [phase, setPhase] = useState<RacePhase>("intro");
  // 何人分の脱落発表が完了したか(0 〜 playerCount-2)。
  const [eliminatedCount, setEliminatedCount] = useState(0);
  // onFinish()の二重発火防止(DestinationCelebrationScreen.tsxのcontinuedRefと同じ役割)。
  const finishedRef = useRef(false);

  const playerCount = ranked.length;
  // 2人プレイなら脱落なしでいきなりfinalTwoへ、3人なら1回、4人なら2回。
  const eliminationTotal = Math.max(0, playerCount - 2);
  const isTie = winnerIds.length > 1;
  const winners = ranked.filter((r) => winnerIds.includes(r.player.id));

  // 現在eliminatingフェーズで発表中のプレイヤー(最下位から順に、eliminationTotal回だけ)。
  // rankedは既に1位が先頭の確定済み配列なので、末尾から読むだけで「最下位から発表」になる。
  const currentEliminationIndex = playerCount - 1 - eliminatedCount;
  const eliminatedEntry = phase === "eliminating" ? ranked[currentEliminationIndex] : undefined;

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }

  // intro: game_over_fanfareをここで1回だけ鳴らす(GameOverModal.tsxのマウント時発火から
  // このintroフェーズへ移設した。GameOverModal側はもう鳴らさない)。
  //
  // timing.introを依存配列に含める理由: usePrefersReducedMotion()はSSR安全性のため
  // 初回レンダーでは必ずfalseを返し、実際の値はマウント後のuseEffectで非同期に確定する
  // (useHasHydrated.ts等と同じ既存パターン)。そのため、このeffectが初回レンダー時点で
  // 一度だけ実行され、timing.intro(古い値)を閉じ込めて終わりだと、reduced-motion環境でも
  // 最初のintroフェーズだけ通常の長さのままになってしまう。timing.introを依存に含めておけば、
  // reduceMotionが1レンダー遅れて確定した瞬間にこのeffectが正しい時間で再実行される。
  useEffect(() => {
    if (phase !== "intro") return;
    playSE("game_over_fanfare");
    const timer = window.setTimeout(() => setPhase("running"), timing.intro);
    return () => window.clearTimeout(timer);
  }, [phase, timing.intro]);

  // running → eliminating(脱落者がいる場合) or finalTwo(2人プレイ等、脱落者が0人の場合)。
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setTimeout(() => {
      setPhase(eliminationTotal > 0 ? "eliminating" : "finalTwo");
    }, timing.running);
    return () => window.clearTimeout(timer);
  }, [phase, eliminationTotal, timing.running]);

  // eliminating: 現在の最下位から1人ずつ、eliminationTotal回だけ脱落発表を繰り返す。
  // setTimeoutの羅列ではなく、1つのuseEffectが「表示→時間経過→次の1人へ(またはfinalTwoへ)」を
  // eliminatedCountを介して繰り返す(DestinationCelebrationScreen.tsxのspinフェーズと同じ設計)。
  useEffect(() => {
    if (phase !== "eliminating") return;
    const timer = window.setTimeout(() => {
      const next = eliminatedCount + 1;
      if (next >= eliminationTotal) {
        setPhase("finalTwo");
      } else {
        setEliminatedCount(next);
      }
    }, timing.eliminationStep);
    return () => window.clearTimeout(timer);
  }, [phase, eliminatedCount, eliminationTotal, timing.eliminationStep]);

  // finalTwo: ユーザー要求どおり意図的に長めに引っ張ってからwinnerSprintへ。
  useEffect(() => {
    if (phase !== "finalTwo") return;
    const timer = window.setTimeout(() => setPhase("winnerSprint"), timing.finalTwo);
    return () => window.clearTimeout(timer);
  }, [phase, timing.finalTwo]);

  // winnerSprint → finish
  useEffect(() => {
    if (phase !== "winnerSprint") return;
    const timer = window.setTimeout(() => setPhase("finish"), timing.winnerSprint);
    return () => window.clearTimeout(timer);
  }, [phase, timing.winnerSprint]);

  // finish → celebration
  useEffect(() => {
    if (phase !== "finish") return;
    const timer = window.setTimeout(() => setPhase("celebration"), timing.finish);
    return () => window.clearTimeout(timer);
  }, [phase, timing.finish]);

  // celebration → done → onFinish()(演出全体の終着点。ここで初めてGameOverModalへ制御を渡す)。
  // finish()自体は依存に含めない(finishedRefで二重発火を防いでいるため関数の再生成は
  // 挙動に影響しない。他の全effectと同じくtiming側の値だけを依存に持たせる)。
  useEffect(() => {
    if (phase !== "celebration") return;
    const timer = window.setTimeout(() => {
      setPhase("done");
      finish();
    }, timing.celebration);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timing.celebration]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky-300 via-sky-200 to-amber-100 p-4 text-center dark:from-sky-950 dark:via-slate-900 dark:to-amber-950"
      aria-live="polite"
      data-race-phase={phase}
    >
      <p className="text-xs font-bold tracking-widest text-white/80 drop-shadow sm:text-sm">湘南レース(Phase A: 仮演出)</p>

      {phase === "intro" && <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">よーい、スタート!</p>}
      {phase === "running" && <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">全員、順調に走行中!</p>}
      {phase === "eliminating" && eliminatedEntry && (
        <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">
          {eliminatedEntry.rank}位! {eliminatedEntry.player.name}さん
        </p>
      )}
      {phase === "finalTwo" && <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">残り2人、デッドヒート!</p>}
      {phase === "winnerSprint" && (
        <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">
          {winners.map((w) => w.player.name).join("・")}さん、加速!
        </p>
      )}
      {phase === "finish" && <p className="text-2xl font-black text-white drop-shadow-lg sm:text-4xl">ゴール!!</p>}
      {(phase === "celebration" || phase === "done") && (
        <p className="text-3xl font-black text-white drop-shadow-lg sm:text-5xl">
          {isTie ? "優勝 引き分け!" : `優勝 ${winners[0]?.player.name}さん!`}
        </p>
      )}

      {/* Phase A時点では全プレイヤーを常時列挙するだけの仮表示。脱落済みのフェードアウト等
          見た目の作り込みはPhase Cで行う。 */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {ranked.map((r) => (
          <span
            key={r.player.id}
            className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-sm font-bold text-slate-800 shadow dark:bg-slate-800/70 dark:text-white"
            style={{ borderLeft: `4px solid ${r.player.color}` }}
          >
            {r.player.carIcon} {r.player.name}
          </span>
        ))}
      </div>
    </div>
  );
}
