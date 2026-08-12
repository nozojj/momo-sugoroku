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

export function playSE(id: SoundEffectId): void {
  const { seEnabled, seVolume } = useAudioSettingsStore.getState();
  if (!seEnabled) return;

  const el = getAudioElement(id);
  if (!el) return;

  el.volume = seVolume;
  el.currentTime = 0;
  el.play()?.catch(() => {
    // 音源未配置・自動再生ポリシーによる拒否などは静かに無視し、ゲーム進行に影響させない。
  });
}
