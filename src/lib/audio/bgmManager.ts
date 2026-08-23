"use client";

import { BGM_TRACK_SRC, type BgmSceneId } from "@/lib/audio/bgmTracks";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";

const FADE_STEP_MS = 50;
const FADE_DURATION_MS = 400;

export interface BgmManager {
  setScene(scene: BgmSceneId): void;
}

/**
 * BGM(背景音楽)再生の一元管理。SE用soundManager.tsとは責務を分離する: soundManager.tsは
 * 「短い音を都度currentTime=0で頭出しして鳴らす」fire-and-forget方式で、BGMのloop再生・
 * フェード・一時停止/再開とは根本的に噛み合わないため(既存14 SEの実装・soundManager.ts
 * 自体には一切手を入れない)。
 *
 * 常に最大1つのHTMLAudioElementだけを保持する。setScene()は冪等: 同じsceneが既に
 * 選択されていれば何もしない。これによりReact StrictModeのeffect二重実行
 * (mount→cleanup→再mount)で同じsceneが連続してsetScene()されても、2回目は
 * 即座にno-opになり二重再生は起こらない(soundManager.tsが必要とした「同一tick内の
 * 重複だけ無視する」ような特別なガードは、setScene自体の冪等性だけで十分なため不要)。
 *
 * trackSrcは既定でbgmTracks.tsのBGM_TRACK_SRC(P11-1時点では空)を使う。テストから
 * 差し替えられるよう引数化しているが、アプリ本体は下記の唯一のインスタンス`bgmManager`
 * (常に既定値のまま)だけを使う。
 */
export function createBgmManager(trackSrc: Partial<Record<BgmSceneId, string>> = BGM_TRACK_SRC): BgmManager {
  let currentScene: BgmSceneId | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let fadeTimer: ReturnType<typeof setInterval> | null = null;

  function clearFadeTimer(): void {
    if (fadeTimer !== null) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  /** el.volumeをtargetまでdurationMsかけて線形に変化させる。呼び出しの最初に必ず直前の
   *  fadeTimerをキャンセルするため、scene高速切替等でfadeToが連続して呼ばれても
   *  古いtimerが残らない(多重起動防止)。P11-1では実音源が無いため聴感調整は行わず、
   *  「最終的にtargetへ収束する」「timerが多重に残らない」という基盤の性質だけを保証する。 */
  function fadeTo(el: HTMLAudioElement, target: number, durationMs: number, onComplete?: () => void): void {
    clearFadeTimer();
    const start = el.volume;
    const diff = target - start;
    if (diff === 0 || durationMs <= 0) {
      el.volume = target;
      onComplete?.();
      return;
    }
    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    let step = 0;
    fadeTimer = setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      el.volume = start + diff * progress;
      if (progress >= 1) {
        clearFadeTimer();
        onComplete?.();
      }
    }, FADE_STEP_MS);
  }

  /** autoplay拒否・音源読み込み失敗等によるplay()の失敗を安全に無視する。この関数自体は
   *  再試行を行わない(単発のplay()呼び出しをtry/catchするだけ)。初回ユーザー操作後の
   *  再試行はP11-3で本ファイル下部のdocument.pointerdown/keydownリスナー側が担う。
   *  unhandled rejection・console.errorの連鎖・無限retryのいずれも起こさない。 */
  function playSafely(el: HTMLAudioElement): void {
    try {
      el.play()?.catch(() => {
        // 正常系として無視する。
      });
    } catch {
      // play()が同期的に例外を投げる実装でもアプリを落とさない。
    }
  }

  function setScene(scene: BgmSceneId): void {
    if (typeof window === "undefined") return;
    if (scene === currentScene) return; // 冪等: 同じsceneへの再設定では何もしない(再スタートしない)

    const prevEl = audioEl;
    currentScene = scene;

    const startNext = () => {
      if (prevEl) prevEl.pause();
      audioEl = null;

      const src = trackSrc[scene];
      if (!src) return; // このsceneの音源は未登録(P11-2/P11-4で解消)。無音のまま待機する。

      const { bgmEnabled, bgmVolume } = useAudioSettingsStore.getState();
      const el = new Audio(src);
      el.loop = true;
      el.volume = 0;
      audioEl = el;

      if (!bgmEnabled) return; // 無効化中は要素だけ保持し、再生はしない

      playSafely(el);
      fadeTo(el, bgmVolume, FADE_DURATION_MS);
    };

    if (prevEl) {
      fadeTo(prevEl, 0, FADE_DURATION_MS, startNext);
    } else {
      startNext();
    }
  }

  // bgmVolume/bgmEnabledの変更を、再生中のAudio要素へリアルタイムに反映する。
  // SE(soundManager.ts)は再生の都度getState()で読むだけで十分だが、BGMは1トラックを
  // 再生し続けるため、設定変更の瞬間に能動的に反映する必要がありsubscribe()を使う。
  if (typeof window !== "undefined") {
    useAudioSettingsStore.subscribe((state, prevState) => {
      const el = audioEl;
      if (!el) return;
      if (state.bgmVolume !== prevState.bgmVolume) {
        el.volume = state.bgmVolume;
      }
      if (state.bgmEnabled !== prevState.bgmEnabled) {
        if (state.bgmEnabled) {
          // bgmEnabled=false中にsetScene()されたAudio要素はvolumeが0のまま保持されている
          // ことがある(setScene()はbgmEnabled=falseの間fadeToを一切呼ばないため)。ここでも
          // 改めてfadeToをかけることで、無効化中に生成された要素でも現在のbgmVolumeまで
          // 確実にフェードインする(既にvolumeが目標値ならfadeTo自身が即座に収束するだけ
          // なので、「再生中に一時停止→再開」のような既存ケースへの影響はない)。
          playSafely(el);
          fadeTo(el, state.bgmVolume, FADE_DURATION_MS);
        } else {
          el.pause();
        }
      }
    });
  }

  // 初回autoplayがブラウザに拒否された場合の再試行(P11-3)。document.pointerdown/keydownを
  // 「最初の適切なユーザー操作」の代表として一度だけ監視し、発火した瞬間の(クロージャ変数
  // としてライブな)audioElへplay()を再試行する。イベント登録時に特定のAudio要素を
  // 閉じ込めない(常にその時点の最新のaudioElを読む)ことで、「autoplay拒否中にtitle→
  // gameplayへscene変更→その後ユーザー操作」という順序でも、常にその時点のcurrent scene
  // だけを再生する(古いsceneが遅れて鳴り出すことがない)。
  //
  // audioElがまだ存在しない(setScene()が一度も呼ばれていない)場合やbgmEnabled=falseの
  // 場合はリスナーを解除せずに待機し続ける: 最初の1回の操作だけでunlockの機会を永久に
  // 失わないようにするため。bgmEnabled=falseからtrueへの切り替え自体は上のsubscribe()側が
  // 処理する(そのON操作自体がユーザージェスチャーのため、ここで改めて拾う必要はない)。
  // 実際にplay()を再試行できた場合、またはHTMLAudioElement.pausedが既にfalse(autoplayが
  // 最初から許可されていた場合)の場合だけリスナーを解除する: 後者では頭出し・再スタート
  // 等の余計な処理を一切行わない(P11-3の受け入れ要件)。
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const attemptUnlock = () => {
      if (!audioEl) return; // 再生対象がまだ無い: 次の操作に備えて監視を継続する

      if (!audioEl.paused) {
        // 既に再生中(autoplayが最初から許可されていた)。再試行不要、頭出しもしない。
        removeUnlockListeners();
        return;
      }

      if (!useAudioSettingsStore.getState().bgmEnabled) return; // OFF中は監視を継続する

      playSafely(audioEl);
      removeUnlockListeners();
    };

    function removeUnlockListeners(): void {
      document.removeEventListener("pointerdown", attemptUnlock);
      document.removeEventListener("keydown", attemptUnlock);
    }

    document.addEventListener("pointerdown", attemptUnlock);
    document.addEventListener("keydown", attemptUnlock);
  }

  return { setScene };
}

/** アプリ全体で共有する唯一のBGMマネージャ。BGM用Audio要素は常にこのインスタンス配下で
 *  最大1つだけ保持される。GameDrawer/各Modal/Toast/gameStore.tsはこれを直接呼ばず、
 *  useBgmController.ts(GameStatusの変化を監視する薄いフック)だけがsetScene()を呼ぶ。 */
export const bgmManager = createBgmManager();
