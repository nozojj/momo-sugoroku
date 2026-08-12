"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSafeJSONStorage } from "@/store/persistStorage";

interface AudioSettingsState {
  seEnabled: boolean;
  seVolume: number; // 0-1
  bgmEnabled: boolean;
  bgmVolume: number; // 0-1
  setSeEnabled: (enabled: boolean) => void;
  setSeVolume: (volume: number) => void;
  setBgmEnabled: (enabled: boolean) => void;
  setBgmVolume: (volume: number) => void;
}

/**
 * SE/BGMの有効・音量設定。ゲーム本編のセーブ(shonan-sugoroku-save)とは別の、端末側の
 * 再生設定なのでgameStore.ts/GameStateとは完全に独立したstoreに持つ(決算ロジック等には
 * 一切関与しない)。壊れたlocalStorageでも安全に既定値へフォールバックできるよう、
 * persistStorage.tsのcreateSafeJSONStorage()をそのまま再利用する。
 *
 * BGMは今回まだ再生処理を実装しない。bgmEnabled/bgmVolumeは将来の設定UI・BGM実装に
 * 備えたフィールドとしてここにだけ先に用意しておく。
 */
export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set) => ({
      seEnabled: true,
      seVolume: 0.8,
      bgmEnabled: true,
      bgmVolume: 0.5,
      setSeEnabled: (seEnabled) => set({ seEnabled }),
      setSeVolume: (seVolume) => set({ seVolume: Math.min(1, Math.max(0, seVolume)) }),
      setBgmEnabled: (bgmEnabled) => set({ bgmEnabled }),
      setBgmVolume: (bgmVolume) => set({ bgmVolume: Math.min(1, Math.max(0, bgmVolume)) }),
    }),
    {
      name: "shonan-sugoroku-audio-settings",
      storage: createSafeJSONStorage(() => window.localStorage),
    },
  ),
);
