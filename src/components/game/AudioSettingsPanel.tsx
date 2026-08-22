"use client";

import { useAudioSettingsStore } from "@/store/audioSettingsStore";

const labelCls = "text-xs font-bold text-slate-400 dark:text-slate-500";

/**
 * 効果音(SE)のON/OFF・音量設定(Phase10/P10-3)。useAudioSettingsStoreへ直接接続する
 * 自己完結コンポーネントで、GameDrawerの他のprops(players/status等)を一切必要としない。
 * BGM欄はPhase11(BGM再生機能の実装と同時)まで公開しない方針のため、ここではSEのみを扱う。
 *
 * seEnabled/seVolumeは互いに独立したフィールド(soundManager.tsのplaySE()参照)なので、
 * OFF中もseVolumeの値はそのまま保持される。「ミュート前の音量を保持する」ための特別な
 * ロジックはここでも追加しない。単にOFF中はスライダーをdisabledにするだけで、値自体は
 * storeの値をそのまま表示し続ける(0%とSE OFFは別状態: OFFにしてもseVolumeは0にならない)。
 */
export function AudioSettingsPanel() {
  const seEnabled = useAudioSettingsStore((s) => s.seEnabled);
  const seVolume = useAudioSettingsStore((s) => s.seVolume);
  const setSeEnabled = useAudioSettingsStore((s) => s.setSeEnabled);
  const setSeVolume = useAudioSettingsStore((s) => s.setSeVolume);

  const volumePercent = Math.round(seVolume * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className={labelCls}>効果音</p>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-500">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setSeEnabled(value)}
              aria-pressed={seEnabled === value}
              className={`flex h-11 items-center justify-center px-3 text-xs font-bold transition sm:h-8 ${
                seEnabled === value
                  ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                  : "bg-transparent text-slate-500 dark:text-slate-300"
              }`}
            >
              {value ? "ON" : "OFF"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="se-volume-range" className={labelCls}>
          音量
        </label>
        <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-300">{volumePercent}%</span>
      </div>
      {/* rangeのつまみ/トラックはネイティブ描画のままaccent-amber-500で色だけ合わせる。
          カスタムサイズ(::-webkit-slider-thumb等)の調整はP10-4のブラウザ監査で扱う。 */}
      <input
        id="se-volume-range"
        type="range"
        min={0}
        max={100}
        step={5}
        value={volumePercent}
        disabled={!seEnabled}
        onChange={(e) => setSeVolume(Number(e.target.value) / 100)}
        className="h-11 w-full accent-amber-500 disabled:opacity-40 sm:h-6"
      />
    </div>
  );
}
