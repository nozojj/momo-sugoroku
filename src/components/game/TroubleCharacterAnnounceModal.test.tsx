// @vitest-environment jsdom
//
// TroubleCharacterAnnounceModal.tsx(Polish Phase P1 S-3f-2で"transform" kindを追加)の
// 自動テスト。重点: 変身アナウンスが「変身後」のcharacterId(S-3f-1で登録した本番アセット)を
// 正しく解決すること、変身前後の表示名がdata/troubleCharacterForms.ts由来であること、
// 既存kind(appeared/handoff/mischief)の描画に回帰が無いこと。
//
// CharacterAnnouncerは初期表示(phase:"entering")ではセリフ(SpeechBubble)をまだ描画しない
// (entering→lineへの遷移待ちタイマーが必要)。セリフ文言を検証するテストだけ、フェイクタイマーで
// CHARACTER_ANNOUNCER_TIMING.slideInMs+bounceMs分だけ進めてphase:"line"にしてから見る。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { TroubleCharacterAnnounceInfo } from "@/types/game";
import { CHARACTER_ANNOUNCER_TIMING } from "@/lib/game/characterAnnouncerTiming";
import { playSE } from "@/lib/audio/soundManager";
import { TroubleCharacterAnnounceModal } from "./TroubleCharacterAnnounceModal";

// Polish Phase P1 S-3f-3: 変身SE(playSE)の発火有無だけを検証したいので、実際の音声再生
// (soundManager.tsのHTMLAudioElement周り)はMonopolyAnnounceModal.test.tsx等と同じくモック化する。
vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));
const playSEMock = vi.mocked(playSE);

afterEach(() => {
  cleanup();
  playSEMock.mockClear();
});

// jsdomはwindow.matchMediaを実装していない(既知の既定動作)。CharacterAnnouncerが使う
// usePrefersReducedMotion()/useIsMobileViewport()のためだけの最小スタブ
// (MonopolyAnnounceModal.test.tsx等と同じもの)。
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function imgSrc(container: HTMLElement): string | null {
  return container.querySelector("img")?.getAttribute("src") ?? null;
}

describe("TroubleCharacterAnnounceModal: kind:\"transform\"は変身後の本番アセットを表示する(S-3f-1連携)", () => {
  it("normal→sakeはtroubleChar_sake(sake.webp)を表示する", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    expect(imgSrc(container)).toBe("/characters/troubleChar/sake.webp");
  });

  it("sake→seagullKingはtroubleChar_seagullKing(seagullKing.webp)を表示する", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "sake", toFormId: "seagullKing" };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    expect(imgSrc(container)).toBe("/characters/troubleChar/seagullKing.webp");
  });

  describe("セリフ内容(phase:\"line\"まで進めて確認)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // 1行目(entering→line遷移)へ進めた後、さらにlineHoldMs分進めて2行目(変身前後の表示名を
    // 含む行)まで自動送りさせる。2行構成(STEP4の演出案)を前提にした固定2ステップ。
    function advanceToSecondLine(): void {
      act(() => {
        vi.advanceTimersByTime(CHARACTER_ANNOUNCER_TIMING.slideInMs + CHARACTER_ANNOUNCER_TIMING.bounceMs);
      });
      act(() => {
        vi.advanceTimersByTime(CHARACTER_ANNOUNCER_TIMING.lineHoldMs);
      });
    }

    it("normal→sakeのセリフには変身前後の表示名(妨害キャラ/酒モンスター)が両方含まれる", () => {
      const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
      const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
      advanceToSecondLine();
      expect(container.textContent).toContain("妨害キャラ");
      expect(container.textContent).toContain("酒モンスター");
    });

    it("sake→seagullKingのセリフには変身前後の表示名(酒モンスター/カモメ魔王)が両方含まれる", () => {
      const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "sake", toFormId: "seagullKing" };
      const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
      advanceToSecondLine();
      expect(container.textContent).toContain("酒モンスター");
      expect(container.textContent).toContain("カモメ魔王");
    });
  });
});

describe("TroubleCharacterAnnounceModal: 既存kindの描画に回帰が無い", () => {
  it("appeared/handoff/mischiefは引き続きtroubleChar(normal形態、S-3f-1で登録済みの本番アセット)のまま描画される", () => {
    const cases: TroubleCharacterAnnounceInfo[] = [
      { kind: "appeared", ownerId: "p1", ownerName: "プレイヤー1" },
      { kind: "handoff", fromPlayerId: "p1", fromPlayerName: "プレイヤー1", toPlayerId: "p2", toPlayerName: "プレイヤー2" },
      { kind: "mischief", playerId: "p1", playerName: "プレイヤー1", mischiefKind: "money", message: "なにかが起きた" },
    ];

    for (const info of cases) {
      const { container, unmount } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
      // troubleChar(normal形態、S-3f-1)は本番アセット登録済みのため、期待するsrcはnormal.webp。
      expect(imgSrc(container)).toBe("/characters/troubleChar/normal.webp");
      unmount();
    }
  });
});

describe("TroubleCharacterAnnounceModal: 変身SE(Polish Phase P1 S-3f-3)", () => {
  it("normal→sake(通常進化)はマウント時にplaySE(\"trouble_transform\")を1回だけ呼ぶ", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_transform");
  });

  it("sake→seagullKing(最終形態、formDef.transform不在から導出)はマウント時にplaySE(\"trouble_transform_final\")を1回だけ呼ぶ", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "sake", toFormId: "seagullKing" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_transform_final");
  });

  it("同じinfoでの再レンダーだけでは再発火しない(依存配列[info]が参照不変のため)", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    const { rerender } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    expect(playSEMock).toHaveBeenCalledTimes(1);

    rerender(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
  });

  it("mischiefでは変身SE(trouble_transform/trouble_transform_final)のどちらも鳴らさない", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "mischief", playerId: "p1", playerName: "プレイヤー1", mischiefKind: "money", message: "なにかが起きた" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalledWith("trouble_transform");
    expect(playSEMock).not.toHaveBeenCalledWith("trouble_transform_final");
  });

  it("appearedでは変身SEを鳴らさない", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "appeared", ownerId: "p1", ownerName: "プレイヤー1" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("handoffでは変身SEを鳴らさない", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "handoff",
      fromPlayerId: "p1",
      fromPlayerName: "プレイヤー1",
      toPlayerId: "p2",
      toPlayerName: "プレイヤー2",
    };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("transform→mischiefへinfoが直接差し替わった場合(S-3f-2のtransform→mischiefのつなぎ)、mischief側ではtransform用SEが再発火しない", () => {
    const transformInfo: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    const { rerender } = render(<TroubleCharacterAnnounceModal info={transformInfo} onDismiss={() => {}} />);
    expect(playSEMock).toHaveBeenCalledTimes(1);
    playSEMock.mockClear();

    const mischiefInfo: TroubleCharacterAnnounceInfo = { kind: "mischief", playerId: "p1", playerName: "プレイヤー1", mischiefKind: "money", message: "なにかが起きた" };
    rerender(<TroubleCharacterAnnounceModal info={mischiefInfo} onDismiss={() => {}} />);

    // Polish Phase P1 S-3f-4: mischief側でtrouble_transform(_final)が再発火しないのは従来通りだが、
    // mischief専用SE(trouble_mischief)は新たに1回だけ鳴る(下のS-3f-4テストで詳細に検証)。
    expect(playSEMock).not.toHaveBeenCalledWith("trouble_transform");
    expect(playSEMock).not.toHaveBeenCalledWith("trouble_transform_final");
    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_mischief");
  });
});

// Polish Phase P1 S-3f-4: mischief(妨害キャラの悪さ)専用SE(trouble_mischief)と、金額系mischiefの
// highlight表示(既存CharacterLine.highlight/shakeOnHighlight機構の再利用)。S-3f-3のtransform
// 演出(SE分岐・impactFlash・warnRing)は一切変更していない(上のdescribeで検証済みのまま)。
describe("TroubleCharacterAnnounceModal: mischief専用SE(Polish Phase P1 S-3f-4)", () => {
  it("kind:moneyのmischiefはマウント時にplaySE(\"trouble_mischief\")を1回だけ呼ぶ", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "mischief",
      playerId: "p1",
      playerName: "プレイヤー1",
      mischiefKind: "money",
      message: "財布から少しお金が消えた",
      highlightAmount: -50,
    };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_mischief");
  });

  it("highlightAmountを持たない非金額mischief(例: debuff)でもplaySE(\"trouble_mischief\")は1回だけ鳴る", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "mischief",
      playerId: "p1",
      playerName: "プレイヤー1",
      mischiefKind: "debuff",
      message: "次の手番はお休みになりそう",
    };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_mischief");
  });

  it("appearedではtrouble_mischiefを鳴らさない", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "appeared", ownerId: "p1", ownerName: "プレイヤー1" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("handoffではtrouble_mischiefを鳴らさない", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "handoff",
      fromPlayerId: "p1",
      fromPlayerName: "プレイヤー1",
      toPlayerId: "p2",
      toPlayerName: "プレイヤー2",
    };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("transformではtrouble_mischiefを鳴らさない(S-3f-3のtransform SEのみ従来通り鳴る)", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("trouble_transform");
    expect(playSEMock).not.toHaveBeenCalledWith("trouble_mischief");
  });

  it("同一infoでの再レンダーだけではtrouble_mischiefが再発火しない(依存配列[info]が参照不変のため)", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "mischief",
      playerId: "p1",
      playerName: "プレイヤー1",
      mischiefKind: "money",
      message: "財布から少しお金が消えた",
      highlightAmount: -50,
    };
    const { rerender } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    expect(playSEMock).toHaveBeenCalledTimes(1);

    rerender(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
  });
});

describe("TroubleCharacterAnnounceModal: mischiefの金額highlight/shakeOnHighlight(Polish Phase P1 S-3f-4、phase:\"line\"まで進めて確認)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** entering→line遷移だけ進める(highlightDelayMs前、AnnouncerEffectLayer/highlightはまだ発火していない状態)。 */
  function advanceToLine(): void {
    act(() => {
      vi.advanceTimersByTime(CHARACTER_ANNOUNCER_TIMING.slideInMs + CHARACTER_ANNOUNCER_TIMING.bounceMs);
    });
  }

  /** highlightDelayMs分だけ追加で進める(shakeOnHighlightが発火するタイミング)。 */
  function advanceToHighlightDelay(): void {
    act(() => {
      vi.advanceTimersByTime(CHARACTER_ANNOUNCER_TIMING.highlightDelayMs);
    });
  }

  it("kind:moneyのmischiefは金額(-50万円)がhighlightとして表示され、highlightDelayMs後にshakeが発火する", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "mischief",
      playerId: "p1",
      playerName: "プレイヤー1",
      mischiefKind: "money",
      message: "財布から少しお金が消えた",
      highlightAmount: -50,
    };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    advanceToLine();

    expect(container.textContent).toContain("-50万円");
    expect(container.querySelector(".animate-character-shake")).toBeNull(); // highlightDelayMs経過前はまだ発火しない

    advanceToHighlightDelay();
    expect(container.querySelector(".animate-character-shake")).not.toBeNull();
  });

  it("highlightAmountを持たない非金額mischief(例: debuff)はhighlight金額を表示せず、shake/impactFlash/warnRingのいずれも追加されない", () => {
    const info: TroubleCharacterAnnounceInfo = {
      kind: "mischief",
      playerId: "p1",
      playerName: "プレイヤー1",
      mischiefKind: "debuff",
      message: "次の手番はお休みになりそう",
    };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    advanceToLine();
    advanceToHighlightDelay();

    expect(container.textContent).not.toContain("万円");
    expect(container.querySelector(".animate-character-shake")).toBeNull();
    expect(container.querySelector(".animate-announcer-impact-flash")).toBeNull();
    expect(container.querySelector(".animate-announcer-warn-ring")).toBeNull();
  });
});

describe("TroubleCharacterAnnounceModal: 変身演出の強度差(Polish Phase P1 S-3f-3、phase:\"line\"まで進めて確認)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** entering→line遷移(bounce演出込み)だけ進める。AnnouncerEffectLayerはphase:"line"でのみ描画される。 */
  function advanceToLine(): void {
    act(() => {
      vi.advanceTimersByTime(CHARACTER_ANNOUNCER_TIMING.slideInMs + CHARACTER_ANNOUNCER_TIMING.bounceMs);
    });
  }

  it("normal→sakeはimpactFlashなし、warnRingはwarningテーマのオレンジ系のまま", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "normal", toFormId: "sake" };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    advanceToLine();

    expect(container.querySelector(".animate-announcer-impact-flash")).toBeNull();
    const ring = container.querySelector(".animate-announcer-warn-ring");
    expect(ring).not.toBeNull();
    expect(ring!.className).toContain("border-orange-400");
    expect(ring!.className).not.toContain("border-rose-400");
  });

  it("sake→seagullKingはimpactFlashあり、warnRingはnegativeテーマのローズ/赤系になる", () => {
    const info: TroubleCharacterAnnounceInfo = { kind: "transform", fromFormId: "sake", toFormId: "seagullKing" };
    const { container } = render(<TroubleCharacterAnnounceModal info={info} onDismiss={() => {}} />);
    advanceToLine();

    expect(container.querySelector(".animate-announcer-impact-flash")).not.toBeNull();
    const ring = container.querySelector(".animate-announcer-warn-ring");
    expect(ring).not.toBeNull();
    expect(ring!.className).toContain("border-rose-400");
    expect(ring!.className).not.toContain("border-orange-400");
  });
});
