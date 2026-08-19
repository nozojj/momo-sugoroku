// @vitest-environment jsdom
//
// CPUのcardDraw停止問題の調査(優先度1・2)。CardDrawModalは人間/CPUを区別せず、
// 内部タイマーだけでonContinue()を1回だけ呼ぶ設計になっている(コードレビュー済み)。
// このテストはその設計が実際に正しく動くこと、特に:
//   - common/rare/superRareそれぞれでonContinueがちょうど1回だけ呼ばれること
//   - 親からの再レンダーでタイマー(内部state)がリセットされず、二重発火もしないこと
// を検証する。
//
// 実装メモ: vi.advanceTimersByTimeAsync()を大きな値で一度に呼ぶと、このコンポーネントのように
// 「setTimeoutの中でstateを更新し、その再レンダー由来のuseEffectが次のsetTimeoutを予約する」
// という何段にも連なるタイマー連鎖では、Reactのact()バッチングと絡んでコールバックが
// 一切発火しない(=フェイクタイマー側の既知の制約であり、本番の実タイマーでは起きない)ことを
// 実験で確認した。そのため、小刻み(50ms刻み)にポーリングしながら進める方式を採用し、
// 「いつ呼ばれたか」ではなく「最終的にちょうど1回だけ呼ばれたか」を検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { CardDrawModal } from "./CardDrawModal";
import type { CardDrawInfo } from "@/types/game";

const COMMON_CARD_ID = "card_dice_again"; // rarity: common
const RARE_CARD_ID = "card_double_move"; // rarity: rare
const SUPER_RARE_CARD_ID = "card_super_car"; // rarity: superRare

const POLL_STEP_MS = 50;

// jsdomはwindow.matchMediaを実装していない(既知の既定動作)。CharacterAnnouncerが使う
// usePrefersReducedMotion()のためだけの最小スタブで、実際のメディアクエリ判定はしない
// (常にreduced-motionではない=falseを返す)。本番のCSS/描画ロジックには一切影響しない。
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

function buildInfo(cardId: string): CardDrawInfo {
  return { playerId: "p1", playerName: "テストP1", cardId };
}

/** onContinueが呼ばれるか、maxMsに達するまで小刻みにフェイクタイマーを進める。
 *  戻り値は「最初に呼ばれた時点の累計経過ms」(呼ばれなかった場合はnull)。 */
async function pollUntilCalled(onContinue: ReturnType<typeof vi.fn>, maxMs: number): Promise<number | null> {
  let elapsed = 0;
  while (elapsed < maxMs) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_STEP_MS);
    });
    elapsed += POLL_STEP_MS;
    if (onContinue.mock.calls.length > 0) return elapsed;
  }
  return null;
}

describe("CardDrawModal: onContinueが1回だけ呼ばれること(優先度1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("common: 即座には呼ばれず、最終的にちょうど1回だけ呼ばれる", async () => {
    const onContinue = vi.fn();
    render(<CardDrawModal info={buildInfo(COMMON_CARD_ID)} onContinue={onContinue} />);

    const calledAt = await pollUntilCalled(onContinue, 5000);
    expect(calledAt).not.toBeNull();
    expect(calledAt).toBeGreaterThan(POLL_STEP_MS); // 演出をすっ飛ばして即時発火していない
    expect(onContinue).toHaveBeenCalledTimes(1);

    // さらに進めても増えない(二重発火・タイマー再スケジュールが無いこと)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("rare: CharacterAnnouncerを経由しても、最終的にちょうど1回だけ呼ばれる", async () => {
    const onContinue = vi.fn();
    render(<CardDrawModal info={buildInfo(RARE_CARD_ID)} onContinue={onContinue} />);

    const calledAt = await pollUntilCalled(onContinue, 10000);
    expect(calledAt).not.toBeNull();
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("superRare: CharacterAnnouncer(2行)を経由しても、最終的にちょうど1回だけ呼ばれる", async () => {
    const onContinue = vi.fn();
    render(<CardDrawModal info={buildInfo(SUPER_RARE_CARD_ID)} onContinue={onContinue} />);

    const calledAt = await pollUntilCalled(onContinue, 15000);
    expect(calledAt).not.toBeNull();
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("CardDrawModal: 親からの再レンダーでタイマーがリセットされないこと(優先度2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("common: 進行中に何度再レンダーされても、リセットされずちょうど1回だけ呼ばれる", async () => {
    const onContinue = vi.fn();
    const info = buildInfo(COMMON_CARD_ID);
    const { rerender } = render(<CardDrawModal info={info} onContinue={onContinue} />);

    let elapsed = 0;
    let rerenderCount = 0;
    const maxMs = 5000;
    while (elapsed < maxMs && onContinue.mock.calls.length === 0) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_STEP_MS);
      });
      elapsed += POLL_STEP_MS;
      // 親のstate変化を模して、毎ステップ新しいprops参照で再レンダーする(内容は同一)。
      rerender(<CardDrawModal info={{ ...info }} onContinue={onContinue} />);
      rerenderCount++;
    }

    expect(rerenderCount).toBeGreaterThan(5); // 実際に複数回の再レンダーを挟んだことの確認
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("superRare: CharacterAnnouncerフェーズ中の再レンダーを挟んでも、リセットされずちょうど1回だけ呼ばれる", async () => {
    const onContinue = vi.fn();
    const info = buildInfo(SUPER_RARE_CARD_ID);
    const { rerender } = render(<CardDrawModal info={info} onContinue={onContinue} />);

    let elapsed = 0;
    let rerenderCount = 0;
    const maxMs = 15000;
    while (elapsed < maxMs && onContinue.mock.calls.length === 0) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_STEP_MS);
      });
      elapsed += POLL_STEP_MS;
      rerender(<CardDrawModal info={{ ...info }} onContinue={onContinue} />);
      rerenderCount++;
    }

    expect(rerenderCount).toBeGreaterThan(20); // superRareは演出が長いため再レンダー回数も多いはず
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
