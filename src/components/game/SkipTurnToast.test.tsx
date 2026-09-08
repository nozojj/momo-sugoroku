// @vitest-environment jsdom
//
// SkipTurnToast.tsx(Polish Phase 3f「妨害系カードの結果表示」)の自動テスト。重点:
// - playerName/cardNameから組み立てた文言が表示されること(gameStore.tsのログ文字列とは
//   別に、構造化データ(SkipTurnAnnounceInfo)から表示側で組み立てていることの確認)。
// - AUTO_DISMISS_MS経過での自動消滅、infoが変わったときの旧timerのcleanup。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SkipTurnToast } from "./SkipTurnToast";
import type { SkipTurnAnnounceInfo } from "@/types/game";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const INFO: SkipTurnAnnounceInfo = {
  playerId: "p2",
  playerName: "はなこ",
  playerColor: "#e67e22",
  cardName: "お休みカード",
};

describe("SkipTurnToast: 表示内容(Polish Phase 3f)", () => {
  it("「○○さんは「カード名」の効果でお休み」に相当する情報(playerName/cardName)が表示される", () => {
    const { getByText } = render(<SkipTurnToast info={INFO} onDismiss={() => {}} />);
    expect(getByText("はなこさんの結果")).not.toBeNull();
    expect(getByText("「お休みカード」の効果でお休み")).not.toBeNull();
  });

  it("playerColorのドットが表示される", () => {
    const { container } = render(<SkipTurnToast info={INFO} onDismiss={() => {}} />);
    const dot = container.querySelector('span[style*="background-color"]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("style")).toContain("rgb(230, 126, 34)"); // #e67e22
  });
});

describe("SkipTurnToast: 自動消滅とcleanup", () => {
  it("1200〜1500msの範囲でonDismissが呼ばれる", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<SkipTurnToast info={INFO} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1199);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("infoが変わると旧timerがcleanupされ、新しいinfoのtimerだけが発火する(二重発火しない)", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const otherInfo: SkipTurnAnnounceInfo = { ...INFO, playerId: "p3", playerName: "じろう" };
    const { rerender } = render(<SkipTurnToast info={INFO} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender(<SkipTurnToast info={otherInfo} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("unmountしてもタイマーが残らない", () => {
    vi.useFakeTimers();
    const { unmount } = render(<SkipTurnToast info={INFO} onDismiss={() => {}} />);
    unmount();
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});
