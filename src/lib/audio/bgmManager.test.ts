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
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

/** autoplay拒否(NotAllowedError等)を模倣する。実際のブラウザ同様、拒否されたplay()は
 *  再生開始に至らないため、pausedはtrueのまま変化しない。 */
class RejectingAudio extends FakeAudio {
  play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
}

/** document.addEventListener/removeEventListenerの最小限のフェイク。P11-3のunlock
 *  リスナー(pointerdown/keydown)をテストから直接発火・登録数確認できるようにする。 */
class FakeDocument {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, handler: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type: string): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler();
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
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

// P11-3: autoplay unlock(初回ユーザー操作によるplay()再試行)の自動テスト。
// bgmManager.ts側はdocument.pointerdown/keydownを監視するため、このdescribeでは
// window/Audioに加えてdocumentもFakeDocumentへ差し替える(他のdescribeはdocumentを
// 使わないため無関係で、既存テストへの影響はない)。
describe("bgmManager (autoplay unlock, P11-3)", () => {
  let fakeDocument: FakeDocument;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.instances = [];
    fakeDocument = new FakeDocument();
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("Audio", FakeAudio);
    useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.5 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("autoplayが許可されている場合、titleは通常どおり再生され、初回pointerdownで頭出し・再スタートしない", () => {
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).toHaveBeenCalledTimes(1);
    expect(titleEl.paused).toBe(false);
    titleEl.currentTime = 12.5; // 再生がある程度進んだ状態を模す

    fakeDocument.dispatch("pointerdown");

    expect(titleEl.play).toHaveBeenCalledTimes(1); // 再試行されない
    expect(titleEl.currentTime).toBe(12.5); // 頭出し(currentTime=0へのリセット)されていない
    expect(fakeDocument.listenerCount("pointerdown")).toBe(0); // 既に再生中なのでlistenerは解除される
    expect(fakeDocument.listenerCount("keydown")).toBe(0);
  });

  it("autoplay拒否(play()がreject)されてもunhandled rejectionにならない", async () => {
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);

    expect(() => manager.setScene("title")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(true).toBe(true);
  });

  it("autoplay拒否後、pointerdownでcurrent scene(title)のAudioを再試行する", async () => {
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    await Promise.resolve();

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).toHaveBeenCalledTimes(1);
    expect(titleEl.paused).toBe(true); // 拒否されたまま(実際に再生開始できていない)

    fakeDocument.dispatch("pointerdown");

    expect(titleEl.play).toHaveBeenCalledTimes(2);
  });

  it("autoplay拒否後、keydownでもcurrent scene(title)のAudioを再試行する", async () => {
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    await Promise.resolve();

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    fakeDocument.dispatch("keydown");

    expect(titleEl.play).toHaveBeenCalledTimes(2);
  });

  it("title拒否中にgameplayへscene変更した場合、unlock後はgameplayのみ再試行されtitleは再試行されない(古いsceneが後から鳴らない)", async () => {
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    await Promise.resolve();
    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).toHaveBeenCalledTimes(1);

    manager.setScene("gameplay");
    vi.advanceTimersByTime(2000); // fade out→startNextを確実に進める
    await Promise.resolve();

    const gameplayEl = FakeAudio.instances.find((a) => a.src.includes("bgm_gameplay"))!;
    expect(titleEl.pause).toHaveBeenCalled(); // scene変更時点で既にpauseされている
    expect(gameplayEl.play).toHaveBeenCalledTimes(1); // setScene内のplaySafelyで既に1回試行済み

    fakeDocument.dispatch("pointerdown");

    expect(gameplayEl.play).toHaveBeenCalledTimes(2); // unlockによる再試行はgameplay側へ行く
    expect(titleEl.play).toHaveBeenCalledTimes(1); // titleは増えない
  });

  it("bgmEnabled=falseの場合、pointerdown/keydownが発生してもplay()しない(listenerは維持される)", () => {
    useAudioSettingsStore.getState().setBgmEnabled(false);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).not.toHaveBeenCalled();

    fakeDocument.dispatch("pointerdown");

    expect(titleEl.play).not.toHaveBeenCalled();
    expect(fakeDocument.listenerCount("pointerdown")).toBe(1); // OFF中は解除せず監視を継続する
  });

  it("BGM OFF→ONで、現在sceneのAudioがbgmVolumeまでフェードインして再生を開始する(volume=0問題の修正)", () => {
    useAudioSettingsStore.getState().setBgmEnabled(false);
    useAudioSettingsStore.getState().setBgmVolume(0.6);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.volume).toBe(0); // OFF中に生成された要素はvolume=0のまま保持されている

    useAudioSettingsStore.getState().setBgmEnabled(true);
    expect(titleEl.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000); // フェードイン完了まで進める

    expect(titleEl.volume).toBe(0.6); // 現在のbgmVolumeまで復帰している
  });

  it("bgmVolume=0でもbgmEnabled=trueの意味は変わらない(再生は試みるが音量だけ0)", () => {
    useAudioSettingsStore.getState().setBgmVolume(0);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    vi.advanceTimersByTime(2000);

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).toHaveBeenCalledTimes(1);
    expect(titleEl.volume).toBe(0);
  });

  it("pointerdownでunlockが成立したら、keydownリスナーも解除される", () => {
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    expect(fakeDocument.listenerCount("pointerdown")).toBe(1);
    expect(fakeDocument.listenerCount("keydown")).toBe(1);

    fakeDocument.dispatch("pointerdown");

    expect(fakeDocument.listenerCount("pointerdown")).toBe(0);
    expect(fakeDocument.listenerCount("keydown")).toBe(0);
  });

  it("keydownでunlockが成立したら、pointerdownリスナーも解除される", () => {
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");

    fakeDocument.dispatch("keydown");

    expect(fakeDocument.listenerCount("pointerdown")).toBe(0);
    expect(fakeDocument.listenerCount("keydown")).toBe(0);
  });

  it("unlock成立後にさらにpointerdownが発生してもplay()は再試行されない(同一操作内での二重再生も含めて防止)", async () => {
    vi.stubGlobal("Audio", RejectingAudio);
    const manager = createBgmManager(FAKE_TRACKS);
    manager.setScene("title");
    await Promise.resolve();

    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    fakeDocument.dispatch("pointerdown"); // 1回目: 再試行される(RejectingAudioなので今回もpausedのまま)
    expect(titleEl.play).toHaveBeenCalledTimes(2);

    fakeDocument.dispatch("pointerdown"); // 2回目: listenerは既に解除済みのため反応しない
    expect(titleEl.play).toHaveBeenCalledTimes(2);
  });

  it("audioElがまだ無い状態でpointerdownが発生してもlistenerは解除されず、後のsetScene後に再試行できる(unlock機会を失わない)", () => {
    const manager = createBgmManager(FAKE_TRACKS);
    // まだsetScene()を一度も呼んでいない = audioElがnullの状態

    fakeDocument.dispatch("pointerdown");

    expect(fakeDocument.listenerCount("pointerdown")).toBe(1);
    expect(fakeDocument.listenerCount("keydown")).toBe(1);

    vi.stubGlobal("Audio", RejectingAudio);
    manager.setScene("title");
    const titleEl = FakeAudio.instances.find((a) => a.src.includes("bgm_title"))!;
    expect(titleEl.play).toHaveBeenCalledTimes(1);

    fakeDocument.dispatch("pointerdown"); // 今度はaudioElがあるので再試行される

    expect(titleEl.play).toHaveBeenCalledTimes(2);
  });

  it("複数のcreateBgmManager()インスタンスが同じdocumentを共有しても、互いのaudioElを取り違えない", () => {
    const managerA = createBgmManager({ title: "/sounds/a_title.wav" });
    const managerB = createBgmManager({ title: "/sounds/b_title.wav" });
    managerA.setScene("title");
    managerB.setScene("title");

    const elA = FakeAudio.instances.find((a) => a.src.includes("a_title"))!;
    const elB = FakeAudio.instances.find((a) => a.src.includes("b_title"))!;
    expect(elA.play).toHaveBeenCalledTimes(1);
    expect(elB.play).toHaveBeenCalledTimes(1);
    expect(fakeDocument.listenerCount("pointerdown")).toBe(2); // 両方のインスタンスが個別に登録している

    fakeDocument.dispatch("pointerdown");

    // どちらも既に再生中(既定のFakeAudioはplay()が即resolveしpaused=falseになる)なので
    // 再試行は発生せず、双方のlistenerが正しく解除される(取り違え・多重解除エラーもない)。
    expect(elA.play).toHaveBeenCalledTimes(1);
    expect(elB.play).toHaveBeenCalledTimes(1);
    expect(fakeDocument.listenerCount("pointerdown")).toBe(0);
  });
});

describe("bgmManager (SSR/Node環境相当・window/Audioが存在しない)", () => {
  it("windowが無い環境でsetScene()を呼んでも例外を投げない", () => {
    // このdescribeではbeforeEachでwindow/Audioを注入していないため、
    // vitestの既定環境(environment:"node")のまま=windowが無い状態でテストする。
    const manager = createBgmManager(FAKE_TRACKS);
    expect(() => manager.setScene("title")).not.toThrow();
  });

  it("windowはあるがdocumentが無い環境でも、createBgmManager()自体が例外を投げない(P11-3のunlock登録ガード確認)", () => {
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
    vi.stubGlobal("Audio", FakeAudio);
    // documentは意図的にstubしない(undefinedのまま)。
    expect(() => createBgmManager(FAKE_TRACKS)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
