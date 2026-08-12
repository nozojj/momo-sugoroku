// soundManager.tsの自動テスト。
//
// vitestはenvironment:"node"で動作しており、window/Audioが標準では存在しない。
// ブラウザ相当の挙動を検証するテストだけ、vi.stubGlobal()でwindow/Audioの最小限の
// フェイクを注入する(jsdom等の新規依存は追加しない)。テストごとに異なるSoundEffectId
// を使うことで、soundManager内部のモジュールレベルキャッシュ(audioCache/playedThisTick)
// がテスト間で干渉しないようにしている。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playSE } from "@/lib/audio/soundManager";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  currentTime = 0;
  play = vi.fn(() => Promise.resolve());
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("playSE() - ブラウザ環境相当(window/Audioをフェイクで用意)", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
    vi.stubGlobal("Audio", FakeAudio);
    useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.5 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("同一の同期実行内で同じSEを2回呼んでも、1回だけ再生される", () => {
    playSE("dice_roll");
    playSE("dice_roll");

    const instances = FakeAudio.instances.filter((a) => a.src.includes("dice_roll"));
    expect(instances).toHaveLength(1);
    expect(instances[0].play).toHaveBeenCalledTimes(1);
  });

  it("同一の同期実行内でも、異なるSEはそれぞれ再生される", () => {
    playSE("step_move");
    playSE("roulette_tick");

    const stepInstances = FakeAudio.instances.filter((a) => a.src.includes("step_move"));
    const tickInstances = FakeAudio.instances.filter((a) => a.src.includes("roulette_tick"));
    expect(stepInstances[0]?.play).toHaveBeenCalledTimes(1);
    expect(tickInstances[0]?.play).toHaveBeenCalledTimes(1);
  });

  it("マイクロタスク境界を越えれば、同じSEを再度再生できる(roulette_tickのような正規の連続再生を誤って抑止しない)", async () => {
    playSE("card_get");
    await Promise.resolve(); // queueMicrotask()で予約された重複解除を確実に先に流す

    playSE("card_get");

    const instances = FakeAudio.instances.filter((a) => a.src.includes("card_get"));
    expect(instances).toHaveLength(1); // 同じidはaudioCacheで使い回されるので要素は1つ
    expect(instances[0].play).toHaveBeenCalledTimes(2); // ただしplay()は2回とも呼ばれている
  });

  it("seEnabled: false のときは再生されない", () => {
    useAudioSettingsStore.getState().setSeEnabled(false);

    playSE("card_use");

    const instances = FakeAudio.instances.filter((a) => a.src.includes("card_use"));
    expect(instances).toHaveLength(0);
  });

  it("seVolumeの設定値が再生前にHTMLAudioElement.volumeへ反映される", () => {
    useAudioSettingsStore.getState().setSeVolume(0.3);

    playSE("property_buy");

    const instances = FakeAudio.instances.filter((a) => a.src.includes("property_buy"));
    expect(instances[0]?.volume).toBe(0.3);
  });
});

describe("playSE() - SSR/Node環境相当(window/Audioが存在しない)", () => {
  it("windowが無い環境で呼んでも例外を投げない", () => {
    // このdescribeではbeforeEachでwindow/Audioを注入していないため、
    // vitestの既定環境(environment:"node")のまま=windowが無い状態でテストする。
    expect(() => playSE("game_over_fanfare")).not.toThrow();
  });
});
