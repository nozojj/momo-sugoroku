"use client";

import { useEffect, useRef, useState } from "react";

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/** フェイクロール中に面を切り替える間隔(ms)。実際の乱数(ゲーム結果)には一切使わない、
 *  純粋な表示演出用の値。 */
const FAKE_FACE_INTERVAL_MS = 80;

/** Polish Phase 3a: GameScreen.tsx側が一元管理するロール演出フェーズ。
 *  "idle": 演出なし(通常表示、または未ロール)。
 *  "rolling": rollDice()は既に実行済み(=diceResult/remainingMoves/status:"moving"は
 *    裏側で確定済み)だが、UI上はまだ本当の出目を見せず、ランダムな面を切り替えて
 *    「転がっている」ように見せる段階。
 *  "settling": フェイクロールが終わり、本当のdiceResult/diceFacesを見せて短く弾ませる段階。
 *  GameScreen.tsx側がタイミングを一元管理し、このコンポーネントは受け取ったphaseに応じて
 *  「何を表示するか」だけを決める(このコンポーネント自身はsetTimeoutでフェーズを進めない)。 */
export type DiceRevealPhase = "idle" | "rolling" | "settling";

interface DiceProps {
  diceResult: number | null;
  /** 直近にロールしたサイコロの内訳(表示専用)。ロール前やdiceCount<=1のときはnullでよい。 */
  diceFaces?: number[] | null;
  /** 次に振る(または直近に振った)サイコロの個数。既定1。急行系カード使用中のみ2以上になる。 */
  diceCount?: number;
  canRoll: boolean;
  doubleArmed: boolean;
  onRoll: () => void;
  /** Polish Phase 3a: ロール演出フェーズ(上記参照)。GameScreen.tsxから渡される。 */
  revealPhase: DiceRevealPhase;
  /**
   * Polish Phase 3f: 今回のロールで実際に移動するマス数(halveDiceNextRoll/doubleMove等の
   * 修飾を適用済みの値)。gameStore.ts側のdiceResultは常に修飾前の出目合計のまま(既存の
   * ゲームロジック・他フックが依存する不変条件のため変更しない)なので、この値は
   * GameScreen.tsx側でuseMoveTotalSteps()が既にキャプチャしているremainingMoves初期値
   * (=diceRoll.tsのresolveDiceRoll()が返すresultそのもの)をそのまま渡すだけでよい。
   * 未指定/diceResultと同値ならnullと同じ扱いにし、従来通り「◯マス移動中…」の一段表示のまま
   * にする(通常ロールの見た目を一切変えないため)。修飾で値が変わっている場合だけ
   * 「出目 → 実際の移動マス数」の2段表示にする。ログ用のmodifierSuffix(diceRoll.ts)の文字列を
   * そのままUIへ流用せず、この数値だけを表示に使う。
   */
  actualMoves?: number | null;
}

function randomFace(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function Dice({
  diceResult,
  diceFaces,
  diceCount = 1,
  canRoll,
  doubleArmed,
  onRoll,
  revealPhase,
  actualMoves,
}: DiceProps) {
  // 修飾(halveDiceNextRoll等)で出目と実際の移動マス数が食い違っているときだけ非nullになる。
  // 「6マス移動中…」と表示しつつ実際は3マスしか進まない、という誤情報を防ぐための値で、
  // 一致している通常ロールでは常にnullのまま(=表示は従来と変わらない)。
  const hasMoveMismatch = actualMoves != null && diceResult != null && actualMoves !== diceResult;
  // フェイクロール中だけ表示するランダムな面(演出専用のローカルstate。ゲーム結果には
  // 一切影響しない)。diceCount個ぶんまとめて持つことで、急行系カード(diceCount>1)でも
  // 全ての面が独立してパラパラ切り替わって見える。
  const [fakeFaces, setFakeFaces] = useState<number[]>([]);
  // "idle"/"settling"→"rolling"へ切り替わった最初のレンダーで、本当の出目が1フレームも
  // 見えてしまわないよう、レンダー中に同期でfakeFacesを埋める(Reactが公式にサポートする
  // 「propsの変化に応じてstateを調整する」パターン。effect側の初回setState待ちだと、
  // fakeFacesがまだ空配列のままdiceResult側へフォールバックする1フレームが理論上生じうる)。
  const prevRevealPhaseRef = useRef<DiceRevealPhase>("idle");
  if (revealPhase !== prevRevealPhaseRef.current) {
    prevRevealPhaseRef.current = revealPhase;
    if (revealPhase === "rolling") setFakeFaces(Array.from({ length: Math.max(1, diceCount) }, randomFace));
  }

  useEffect(() => {
    if (revealPhase !== "rolling") return;
    const count = Math.max(1, diceCount);
    const timer = window.setInterval(() => {
      setFakeFaces(Array.from({ length: count }, randomFace));
    }, FAKE_FACE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [revealPhase, diceCount]);

  function handleClick() {
    if (!canRoll) return;
    onRoll();
  }

  const isRolling = revealPhase === "rolling";
  const isSettling = revealPhase === "settling";
  // "rolling"中はrollDice()が既に確定させた本当の出目を隠し、フェイクロールの面だけを見せる。
  // フェイクロールがまだ1周も回っていない最初の1フレーム(fakeFacesが空)の保険として
  // diceResult/diceFacesへフォールバックする(実際には同じeffect内でほぼ同時にセットされるため
  // 到達しないが、念のため)。
  const displayResult = isRolling ? (fakeFaces[0] ?? diceResult) : diceResult;
  const displayFaces = isRolling ? (fakeFaces.length > 0 ? fakeFaces : diceFaces) : diceFaces;
  // "settling"の瞬間だけ、本当の出目が確定したことを示す軽いバウンド(既存animate-character-bounce
  // の再利用、新規keyframeは追加しない)。isRolling中はanimate-dice-rollと共存させない
  // (同一要素に複数のtransform系animationを重ねない、というプロジェクト既存の方針を踏襲)。
  const motionClass = isRolling ? "animate-dice-roll" : isSettling ? "animate-character-bounce" : "";

  // diceCount<=1のときは既存の単一ダイス表示をそのまま使う(見た目・挙動を一切変えない)。
  if (diceCount <= 1) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={!canRoll}
          className={`pop-button flex h-20 w-20 items-center justify-center rounded-2xl border-2 bg-white text-5xl transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-700 ${
            doubleArmed ? "border-fuchsia-400" : "border-slate-300 dark:border-slate-500"
          } ${motionClass}`}
          aria-label="サイコロを振る"
        >
          {displayResult ? DICE_FACES[displayResult] : "🎲"}
        </button>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {canRoll
            ? doubleArmed
              ? "出目 x2 で移動!"
              : "タップしてサイコロを振る"
            : isRolling
              ? "サイコロを振っています…"
              : diceResult
                ? hasMoveMismatch
                  ? `${diceResult} → ${actualMoves}マス移動中…`
                  : `${diceResult}マス移動中…`
                : "-"}
        </span>
      </div>
    );
  }

  // diceCount>1: 急行系カード使用中。ロール前はN個振る旨を、ロール後は内訳+合計を表示する。
  const rolled = displayFaces && displayFaces.length > 0 ? displayFaces : null;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canRoll}
        className={`pop-button flex items-center gap-1 rounded-2xl border-2 border-fuchsia-400 bg-white px-3 py-4 transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-700 ${motionClass}`}
        aria-label={`サイコロ${diceCount}個を振る`}
      >
        {rolled
          ? rolled.map((face, i) => (
              <span key={i} className="text-3xl">
                {DICE_FACES[face]}
              </span>
            ))
          : Array.from({ length: diceCount }, (_, i) => (
              <span key={i} className="text-3xl">
                🎲
              </span>
            ))}
      </button>
      <span className="text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">
        {canRoll
          ? `タップしてサイコロ${diceCount}個を振る!`
          : isRolling
            ? `サイコロ${diceCount}個を振っています…`
            : rolled
              ? hasMoveMismatch
                ? `${rolled.join("+")}=${diceResult} → ${actualMoves}マス移動中…`
                : `${rolled.join("+")}=${diceResult} マス移動中…`
              : "-"}
      </span>
    </div>
  );
}
