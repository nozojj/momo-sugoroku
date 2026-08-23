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

/**
 * rankedのindexが「現時点で脱落済み(=順位発表済みで、静的なレーンから外れて良い)」かどうかを
 * 判定する純粋関数。新しい状態は一切追加せず、既存のphase/eliminatedCountとplayerCountだけから
 * 毎回導出する(P11-3-A設計原則: 順位・脱落状態の再計算は行わず、既に確定したデータの
 * 読み方だけを変える)。
 *
 * index<2(上位2人)は、eliminating中はもちろんfinalTwo以降(winnerSprint/finish/celebration/done)
 * でも絶対に脱落扱いにしない。eliminating中は「発表済み(eliminatedCount件)」に加えて
 * 「現在アナウンス中の1人」も同時に脱落扱いにする(Phase B-1では脱落transitionを実装しない
 * ため、アナウンスと同時に静的な「脱落済み」表示へ切り替える)。
 */
function isEliminatedIndex(index: number, phase: RacePhase, eliminatedCount: number, playerCount: number): boolean {
  if (index < 2) return false;
  if (phase === "intro" || phase === "running") return false;
  if (phase === "eliminating") {
    const eliminationOrder = playerCount - index; // このindexが末尾から数えて何番目に脱落するか(1始まり)
    return eliminationOrder <= eliminatedCount + 1;
  }
  return true; // finalTwo以降は上位2人以外すべて脱落済み
}

/**
 * player.idから決定論的に「揺れ/漂いアニメーションの開始遅延(ms)」を求める(P11-3-B2a)。
 * Math.random()は使わない: 同じゲーム状態(同じplayer.id)なら常に同じ見た目になることを
 * 優先するため(リロード・再レンダーのたびに揺れ方が変わって不自然に見えるのを避ける)。
 * 単純な文字コード合計ではなく乗算込みの簡易ハッシュにして、"p1"/"p2"のような連番id同士でも
 * バケットが偏りにくいようにしている。bucketCountで割った余りだけを使うため、
 * 実際の見た目の均等さより「決定論的でズレを作れること」を優先した最小実装。
 */
function deterministicDelayMs(playerId: string, bucketCount: number, bucketMs: number): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return (hash % bucketCount) * bucketMs;
}

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

  // レース会場に表示する「現役」と、脱落済みエリアに表示する「脱落済み」の分離(Phase B-1)。
  // isEliminatedIndex()はindexとphase/eliminatedCountだけから導出する純粋関数で、ranked自体の
  // 並び順・rank値には一切手を加えない(絞り込む=filterするだけ)。
  const activeRanked = ranked.filter((_, idx) => !isEliminatedIndex(idx, phase, eliminatedCount, playerCount));
  const eliminatedRanked = ranked.filter((_, idx) => isEliminatedIndex(idx, phase, eliminatedCount, playerCount));

  // P11-3-B2a: 通常走行の演出(車体の振動・疑似的な抜きつ抜かれつ・流れるコース線)を
  // 有効にするかどうか。intro中はまだ「よーい」の間なので走行感を出さず、runningに入った
  // 瞬間から立ち上げる(ユーザー要求どおり)。eliminating/finalTwo/winnerSprint等、それ以降の
  // 全フェーズでは現役レーサーは走り続ける(このフラグだけを見ればよく、フェーズごとに
  // 個別分岐する必要はない)。prefers-reduced-motionが有効な間は、情報を持たない純粋な
  // 装飾アニメーションなので丸ごと無効化する(誰が現役/脱落かという情報自体はdata-eliminated
  // 側で既に伝わっており、ここで失われる情報は無い)。
  const decorativeMotionEnabled = phase !== "intro" && !reduceMotion;

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

      {/* レース会場。PC(sm以上)は左→右の水平レーンを縦に積む: 各レーン=1プレイヤー、
          名前を左に固定し、右へ伸びるコース上を車が走る先に「ゴール →」を置く。
          スマホ(sm未満)は上→下の縦レーンを横に並べる: 各レーン=1プレイヤーの列、名前を
          上に固定し、下へ伸びるコース上を車が走る先に「↓ ゴール」を置く(PCレイアウトの
          単純縮小ではなく、縦画面の向きに合わせてレーンの方向自体を変えている)。
          名前ラベル自体は固定し、車・コース側だけに走行演出(P11-3-B2a)を与える。 */}
      <div className="flex w-full max-w-4xl flex-row items-stretch justify-center gap-3 overflow-x-auto px-2 sm:flex-col sm:items-stretch sm:gap-2.5 sm:overflow-visible sm:px-0">
        {activeRanked.map((r) => {
          // P11-3-B2a: 振動(短周期)・漂い(長周期、疑似的な抜きつ抜かれつ)・コース流れの
          // 3つの装飾アニメーションすべてに同じ遅延を再利用する。CSSのanimation-delayは
          // 「開始時刻をずらす」だけで足り、周期の異なる複数アニメーションへ同じ値を渡しても
          // 十分にズレて見える(値そのものは4パターンに丸めているだけの決定論的なもの)。
          const delayMs = deterministicDelayMs(r.player.id, 4, 90);
          return (
            <div
              key={r.player.id}
              data-player-id={r.player.id}
              data-eliminated="false"
              data-running={decorativeMotionEnabled}
              className="flex h-56 w-20 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-white/15 p-2 sm:h-auto sm:w-full sm:flex-row sm:gap-3 sm:rounded-lg sm:bg-white/10 sm:px-3 sm:py-1.5"
            >
              {/* 名前ラベル。sm:w-28で固定幅を持たせることでtruncateの基準を作る(carアイコンを
                  トラック側へ移したため、Phase B-1時点であったname+carの共有ラッパーは廃止し、
                  この要素単体でPC/スマホ双方の幅制約を持つ)。 */}
              <span
                className="w-full min-w-0 truncate text-center text-[11px] font-bold text-white drop-shadow sm:w-28 sm:shrink-0 sm:text-left sm:text-sm"
                title={r.player.name}
              >
                {r.player.name}
              </span>

              {/* コース(トラック)本体。flexで「開始位置=主軸の先頭・中央=交差軸」に車を
                  自然に配置する(絶対配置+transform計算をReact側で行わない)ことで、
                  drift/vibrateの2層transformと衝突しない(centeringにtransformを使わない)。 */}
              <div
                className={`relative flex flex-1 flex-col items-center sm:flex-row sm:items-center ${
                  decorativeMotionEnabled ? "race-track-line" : "bg-white/40"
                } rounded-full`}
              >
                {/* 漂い(疑似的な抜きつ抜かれつ)。PCではX軸、スマホではY軸(globals.cssの
                    @mediaで切り替え)。順位計算には一切関与しない演出専用のtransformで、
                    rankedの並び順・rankを読み書きすることはない。 */}
                <div
                  className={`relative mt-2 sm:mt-0 sm:ml-2 ${decorativeMotionEnabled ? "race-drift" : ""}`}
                  style={decorativeMotionEnabled ? { animationDelay: `${delayMs}ms` } : undefined}
                >
                  {/* 振動(路面の細かな凹凸・車体のブレを表す短周期の揺れ)。漂いとは別要素に
                      分離することで、2つの独立したtransformアニメーションを衝突させずに
                      合成する(1要素に複数transformアニメーションを重ねると片方しか
                      反映されないCSSの制約を、CharacterAnnouncer.tsxと同じ「入れ子」で回避)。
                      Phase B-1ではname+carの共有バッジだったplayer.color表示を、carアイコンが
                      トラック側へ移った今回もこの丸バッジとして維持する。 */}
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg shadow sm:text-xl ${decorativeMotionEnabled ? "animate-race-vibrate" : ""}`}
                    style={{ backgroundColor: r.player.color, animationDelay: decorativeMotionEnabled ? `${delayMs}ms` : undefined }}
                  >
                    {r.player.carIcon}
                  </span>
                </div>
              </div>

              <span className="text-[9px] font-bold text-white/70 sm:hidden">↓ ゴール</span>
              <span className="hidden text-xs font-bold text-white/70 sm:inline">ゴール →</span>
            </div>
          );
        })}
      </div>

      {/* 脱落済み・順位発表済みエリア。完全に消さず、小さなchip一覧として残す
          (Phase Aの仮表示と同じ見た目のパターンを踏襲)。 */}
      {eliminatedRanked.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] font-bold text-white/70">脱落済み・順位発表済み</span>
          {eliminatedRanked.map((r) => (
            <span
              key={r.player.id}
              data-player-id={r.player.id}
              data-eliminated="true"
              className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-slate-800 opacity-80 shadow dark:bg-slate-800/70 dark:text-white"
              style={{ borderLeft: `3px solid ${r.player.color}` }}
            >
              <span className="max-w-16 truncate" title={r.player.name}>
                {r.player.carIcon} {r.player.name}
              </span>
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{r.rank}位</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
