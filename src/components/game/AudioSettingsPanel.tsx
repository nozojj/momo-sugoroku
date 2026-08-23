"use client";

import { useAudioSettingsStore } from "@/store/audioSettingsStore";

const labelCls = "text-xs font-bold text-slate-400 dark:text-slate-500";

interface VolumeSectionProps {
  title: string;
  idSuffix: string;
  enabled: boolean;
  volume: number;
  onToggle: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

/**
 * 「ON/OFFトグル + 音量スライダー」の1ブロック分の見た目・挙動。効果音(SE)とBGMの両方が
 * 全く同じUX(トグル→disabled切り替え、%表示、0-1⇔0-100変換)を共有するため、
 * AudioSettingsPanel内だけで完結する非公開ヘルパーとしてここに1つだけ定義する
 * (新規ファイル・新規公開コンポーネントは増やさない)。
 *
 * enabled/volumeは互いに独立したフィールドとして呼び出し側(store)で管理される想定。
 * OFF中もvolumeの値はそのまま保持される。「ミュート前の音量を保持する」ための特別な
 * ロジックはここでも追加しない。単にOFF中はスライダーをdisabledにするだけで、値自体は
 * storeの値をそのまま表示し続ける(0%とOFFは別状態: OFFにしても音量は0にならない)。
 */
function VolumeSection({ title, idSuffix, enabled, volume, onToggle, onVolumeChange }: VolumeSectionProps) {
  const volumePercent = Math.round(volume * 100);
  const rangeId = `${idSuffix}-volume-range`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className={labelCls}>{title}</p>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-500">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => onToggle(value)}
              aria-pressed={enabled === value}
              className={`flex h-11 items-center justify-center px-3 text-xs font-bold transition sm:h-8 ${
                enabled === value
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
        <label htmlFor={rangeId} className={labelCls}>
          音量
        </label>
        <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-300">{volumePercent}%</span>
      </div>
      {/* rangeのつまみ/トラックはネイティブ描画のままaccent-amber-500で色だけ合わせる。
          カスタムサイズ(::-webkit-slider-thumb等)の調整はP10-4のブラウザ監査で扱う。 */}
      <input
        id={rangeId}
        type="range"
        min={0}
        max={100}
        step={5}
        value={volumePercent}
        disabled={!enabled}
        onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
        className="h-11 w-full accent-amber-500 disabled:opacity-40 sm:h-6"
      />
    </div>
  );
}

/**
 * 効果音(SE)・BGMのON/OFF・音量設定。useAudioSettingsStoreへ直接接続する自己完結
 * コンポーネントで、GameDrawerの他のprops(players/status等)を一切必要としない。
 *
 * BGM欄はP11-3-1でSEと同じ構造(VolumeSection)で追加した(Phase10/P10-3時点ではSEのみ、
 * P11-1〜P11-3でBGM再生基盤・音量設定値そのものは既に整っていたが、UIからの公開は
 * このタイミングまで見送っていた)。BGM側の再生への反映はbgmManager.ts側の既存
 * subscribe()が担うため、このコンポーネントはstoreのsetterを呼ぶだけで良く、
 * Audio要素を直接操作する処理は一切持たない。
 */
export function AudioSettingsPanel() {
  const seEnabled = useAudioSettingsStore((s) => s.seEnabled);
  const seVolume = useAudioSettingsStore((s) => s.seVolume);
  const setSeEnabled = useAudioSettingsStore((s) => s.setSeEnabled);
  const setSeVolume = useAudioSettingsStore((s) => s.setSeVolume);

  const bgmEnabled = useAudioSettingsStore((s) => s.bgmEnabled);
  const bgmVolume = useAudioSettingsStore((s) => s.bgmVolume);
  const setBgmEnabled = useAudioSettingsStore((s) => s.setBgmEnabled);
  const setBgmVolume = useAudioSettingsStore((s) => s.setBgmVolume);

  return (
    <div className="flex flex-col gap-4">
      <VolumeSection
        title="効果音"
        idSuffix="se"
        enabled={seEnabled}
        volume={seVolume}
        onToggle={setSeEnabled}
        onVolumeChange={setSeVolume}
      />
      <VolumeSection
        title="BGM"
        idSuffix="bgm"
        enabled={bgmEnabled}
        volume={bgmVolume}
        onToggle={setBgmEnabled}
        onVolumeChange={setBgmVolume}
      />
    </div>
  );
}
