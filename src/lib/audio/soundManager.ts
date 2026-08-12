"use client";

import { SOUND_EFFECT_SRC, type SoundEffectId } from "@/lib/audio/soundEffects";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";

/**
 * 効果音の再生を一元管理するモジュール。コンポーネントから直接 new Audio(...) はせず、
 * 必ず playSE() 経由で再生する(同じ音を複数箇所から再利用しやすくするため。例:
 * roulette_tickはMoneyRouletteModal/CardDrawModal/DestinationCelebrationScreenの
 * 3箇所から呼ばれる想定)。gameStore.ts側からは一切呼ばない(状態管理と副作用を分離する)。
 *
 * SSR/テスト環境(vitestはenvironment:"node"でwindow/Audioが無い)ではgetAudioElement()が
 * nullを返し、playSE()は何もしない。useHasHydrated.ts/persistStorage.tsと同じ
 * 「typeof windowで先に判定する」防御パターンに揃えている。
 *
 * 音源idごとにHTMLAudioElementを1つずつ遅延生成してキャッシュし、再生のたびに
 * currentTime=0へ戻してから play() する(同じ音の短時間の連続再生に対応する簡易実装。
 * ターン制ゲームの用途ではこれで十分)。再生失敗(音源未配置・404・自動再生ポリシーに
 * よる拒否等)は画面をクラッシュさせないよう静かに無視する。
 */
const audioCache = new Map<SoundEffectId, HTMLAudioElement>();

function getAudioElement(id: SoundEffectId): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  const cached = audioCache.get(id);
  if (cached) return cached;
  const el = new Audio(SOUND_EFFECT_SRC[id]);
  audioCache.set(id, el);
  return el;
}

/**
 * React StrictMode(開発モードのみ)は同じマウントeffectを「実行→クリーンアップ→再実行」と
 * 同一の同期実行内で二重に呼ぶ。setTimeout等でスケジュールする副作用はクリーンアップの
 * clearTimeoutで自然に後始末されるが、playSE()をeffect本体に直接書くと対応する取り消し
 * 手段が無く、素朴に実装すると2回再生されてしまう(MonopolyToastで実際に確認済み)。
 *
 * ここでは「同一の同期実行(マイクロタスク境界の前)」に限定して同じidの重複だけを無視する。
 * 時間ベースのクールダウン(例: 50ms以内は無視)にしないのは、roulette_tickのように
 * 正規の仕様で最短30ms間隔の連続再生を行うSEを誤って抑止しないため。setTimeoutで
 * スケジュールされた正規の連続呼び出しは、次のマクロタスクが実行される前に必ず
 * マイクロタスクキューが空になる(=このSetからidが取り除かれる)ため、この区別が成立する。
 */
const playedThisTick = new Set<SoundEffectId>();

function isDuplicateWithinSameTick(id: SoundEffectId): boolean {
  if (playedThisTick.has(id)) return true;
  playedThisTick.add(id);
  queueMicrotask(() => {
    playedThisTick.delete(id);
  });
  return false;
}

export function playSE(id: SoundEffectId): void {
  const { seEnabled, seVolume } = useAudioSettingsStore.getState();
  if (!seEnabled) return;
  if (isDuplicateWithinSameTick(id)) return;

  const el = getAudioElement(id);
  if (!el) return;

  el.volume = seVolume;
  el.currentTime = 0;
  el.play()?.catch(() => {
    // 音源未配置・自動再生ポリシーによる拒否などは静かに無視し、ゲーム進行に影響させない。
  });
}
