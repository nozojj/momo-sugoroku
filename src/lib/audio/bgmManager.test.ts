// bgmManager.tsの自動テスト。
//
// soundManager.test.tsと同様、vitestはenvironment:"node"で動作しており、window/Audioは
// 標準では存在しない。ブラウザ相当の挙動を検証するテストだけvi.stubGlobal()でwindow/Audioの
// 最小限のフェイクを注入する。
//
// createBgmManager()はtrackSrc(scene→path)を引数で受け取れる設計にしているため、
// テストではbgmTracks.tsをモックせず、テストごとに独立したフェイクレジストリを直接渡して
// createBgmManager()を毎回新規生成する(モジュールレベルの状態を共有しないため、
// テスト間の干渉やvi.resetModules()は不要)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBgmManager } from "@/lib/audio/bgmManager";
import { BGM_TRACK_SRC } from "@/lib/audio/bgmTracks";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  loop = false;
  currentTime = 0;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
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

const FAKE_TRACKS = {
  title: "/sounds/bgm_title.wav",
  gameplay: "/sounds/bgm_gameplay.wav",
} as const;

describe("bgmManager (ブラウザ環境相当)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.instances = [];
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
    vi.stubGlobal("Audio", FakeAudio);
    useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.5 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("同じsceneへの連続setScene(React StrictModeのeffect二重実行を含む)では二重再生しない", () => {
    const manager = createBgmManager(FAKE_TRACKS);

    manager.setScene("title");
    manager.setScene("title"); // StrictModeのmount→cleanup→再mountで同じsceneが2回来る想定

    const titleInstances = FakeAudio.instances.filter((a) => a.src.includes("bgm_title"));
    expect(titleInstances).toHaveLength(1);
    expect(titleInstances[0].play).toHaveBeenCalledTimes(1);
  });

  it("scene変更時だけtrackが切り替わる", () => {
    const manager = createBgmManager(FAKE_TRACKS);

    manager.setScene("title");
    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;

    manager.setScene("gameplay");
    vi.advanceTimersByTime(2000); // fade out→startNextの完了を確実に進める

    expect(titleEl.pause).toHaveBeenCalled();
    const gameplayInstances = FakeAudio.instances.filter((a) => a.src.includes("bgm_gameplay"));
    expect(gameplayInstances).toHaveLength(1);
  });

  it("bgmEnabled=falseでは再生しない(Audio要素は保持するがplay()は呼ばない)", () => {
    useAudioSettingsStore.getState().setBgmEnabled(false);
    const manager = createBgmManager(FAKE_TRACKS);

    manager.setScene("title");

    const titleInstances = FakeAudio.instances.filter((a) => a.src.includes("bgm_title"));
    expect(titleInstances).toHaveLength(1);
    expect(titleInstances[0].play).not.toHaveBeenCalled();
  });

  it("bgmEnabled=trueへの変更を安全に処理できる(再生中BGMへ即時反映)", () => {
    useAudioSettingsStore.getState().setBgmEnabled(false);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).not.toHaveBeenCalled();

    useAudioSettingsStore.getState().setBgmEnabled(true);

    expect(titleEl.play).toHaveBeenCalledTimes(1);
  });

  it("bgmVolume変更が再生中Audioへ反映される", () => {
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    vi.advanceTimersByTime(2000); // フェードイン完了まで進める(以降のvolume変更が確実に見えるようにする)

    useAudioSettingsStore.getState().setBgmVolume(0.2);

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.volume).toBe(0.2);
  });

  it("最終的なvolumeはbgmVolumeと一致する(フェードイン完了後)", () => {
    useAudioSettingsStore.getState().setBgmVolume(0.7);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    vi.advanceTimersByTime(2000);

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.volume).toBe(0.7);
  });

  it("autoplay拒否由来のplay()rejectionが未処理例外にならない", async () => {
    class RejectingAudio extends FakeAudio {
      play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    }
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);

    expect(() => manager.setScene("title")).not.toThrow();
    // rejectionのcatch()が実際にマイクロタスクキューで処理されるのを待つ。
    await Promise.resolve();
    await Promise.resolve();
    // ここまで到達すれば、rejectionが未処理のまま伝播していないことを意味する
    // (vitestはunhandled rejectionが起きるとテスト自体を失敗させるため)。
    expect(true).toBe(true);
  });

  it("高速にscene変更してもfade timerが増え続けない(直前のtimerは必ずキャンセルされる)", () => {
    const manager = createBgmManager(FAKE_TRACKS);

    manager.setScene("title");
    expect(vi.getTimerCount()).toBe(1);

    manager.setScene("gameplay"); // titleのfade-out timerに置き換わる
    expect(vi.getTimerCount()).toBe(1);

    manager.setScene("title"); // gameplayのfade-out timerに置き換わる
    expect(vi.getTimerCount()).toBe(1);

    manager.setScene("gameplay");
    manager.setScene("title");
    manager.setScene("gameplay");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("未登録のsceneへ切り替えてもAudio要素を生成しない(404を発生させ続けない)", () => {
    const manager = createBgmManager(FAKE_TRACKS); // "settlement"/"gameOver"は未登録
    manager.setScene("title");
    vi.advanceTimersByTime(2000);

    manager.setScene("settlement");
    vi.advanceTimersByTime(2000);

    const unexpectedInstances = FakeAudio.instances.filter((a) => a.src.includes("settlement"));
    expect(unexpectedInstances).toHaveLength(0);
  });
});

describe("bgmManager (本番のbgmTracks.tsをそのまま使った場合)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.instances = [];
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
    vi.stubGlobal("Audio", FakeAudio);
    useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.5 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("BGM_TRACK_SRCがtitle/gameplayをMP3パスで登録し、他の3sceneは未登録(undefined)のままである", () => {
    expect(BGM_TRACK_SRC.title).toBe("/sounds/bgm_title.mp3");
    expect(BGM_TRACK_SRC.gameplay).toBe("/sounds/bgm_gameplay.mp3");
    expect(BGM_TRACK_SRC.destinationCelebration).toBeUndefined();
    expect(BGM_TRACK_SRC.settlement).toBeUndefined();
    expect(BGM_TRACK_SRC.gameOver).toBeUndefined();
  });

  it("P11-2時点ではtitle/gameplayのみBGM_TRACK_SRCに登録されており、未登録の3sceneは例外も投げずAudio要素を生成しない", () => {
    const manager = createBgmManager(); // 引数省略=bgmTracks.tsの実際のBGM_TRACK_SRCを使う

    expect(() => {
      manager.setScene("title");
      manager.setScene("gameplay");
      manager.setScene("destinationCelebration");
      manager.setScene("settlement");
      manager.setScene("gameOver");
    }).not.toThrow();

    const titleInstances = FakeAudio.instances.filter((a) => a.src.includes("bgm_title"));
    const gameplayInstances = FakeAudio.instances.filter((a) => a.src.includes("bgm_gameplay"));
    expect(titleInstances).toHaveLength(1);
    expect(titleInstances[0].src).toBe("/sounds/bgm_title.mp3");
    expect(gameplayInstances).toHaveLength(1);
    expect(gameplayInstances[0].src).toBe("/sounds/bgm_gameplay.mp3");
    expect(FakeAudio.instances.filter((a) => /destinationCelebration|settlement|gameOver/.test(a.src))).toHaveLength(0);
  });
});

describe("bgmManager (SSR/Node環境相当・window/Audioが存在しない)", () => {
  it("windowが無い環境でsetScene()を呼んでも例外を投げない", () => {
    // このdescribeではbeforeEachでwindow/Audioを注入していないため、
    // vitestの既定環境(environment:"node")のまま=windowが無い状態でテストする。
    const manager = createBgmManager(FAKE_TRACKS);
    expect(() => manager.setScene("title")).not.toThrow();
  });
});
