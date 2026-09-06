// @vitest-environment jsdom
//
// GameHud.tsx(Polish Phase 3a「手番の合図」)の自動テスト。重点: 手番が実際に別プレイヤーへ
// 切り替わった瞬間だけ既存animate-highlight-slam(新規keyframeなし)が一瞬付き、
// 一定時間後に自然に外れること。初回mountや「同じプレイヤーのままの再レンダー」では
// 誤発火しないこと(useGameplaySoundEffects.tsのprevDiceResultRefと同じ設計)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { GameHud } from "./GameHud";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 色ドット+名前をまとめて包む、強調class付与先のspan(document順で最初にヒットする、
 *  「さんの番」を含む最も外側のspan)を取得する。 */
function nameSpan(container: HTMLElement): HTMLElement {
  const span = Array.from(container.querySelectorAll("span")).find((el) => el.textContent?.includes("さんの番"));
  expect(span).not.toBeUndefined();
  return span!;
}

describe("GameHud: 手番開始の強調表示", () => {
  it("初回mountでは強調class(animate-highlight-slam)が付かない(誤発火防止)", () => {
    const { container } = render(
      <GameHud
        currentPlayerId="p1"
        currentPlayerName="たろう"
        currentPlayerColor="#e6483e"
        destinationName="鎌倉"
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("currentPlayerIdが別プレイヤーへ変わった瞬間だけ強調classが付き、時間経過で自然に外れる", async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <GameHud
        currentPlayerId="p1"
        currentPlayerName="たろう"
        currentPlayerColor="#e6483e"
        destinationName="鎌倉"
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");

    rerender(
      <GameHud
        currentPlayerId="p2"
        currentPlayerName="じろう"
        currentPlayerColor="#2e86de"
        destinationName="鎌倉"
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );
    expect(nameSpan(container).className).toContain("animate-highlight-slam");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(480);
    });
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("同じプレイヤーのまま他の情報(destinationName等)だけ変わる再レンダーでは強調classが付かない", () => {
    const { container, rerender } = render(
      <GameHud
        currentPlayerId="p1"
        currentPlayerName="たろう"
        currentPlayerColor="#e6483e"
        destinationName="鎌倉"
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );

    rerender(
      <GameHud
        currentPlayerId="p1"
        currentPlayerName="たろう"
        currentPlayerColor="#e6483e"
        destinationName="小田原" // 目的地だけ変わった(手番は変わっていない)
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("既存の表示内容(プレイヤー名・目的地・年月)は変更されていない(回帰確認)", () => {
    const { getByText } = render(
      <GameHud
        currentPlayerId="p1"
        currentPlayerName="たろう"
        currentPlayerColor="#e6483e"
        destinationName="鎌倉"
        calendarText="1年目 4月"
        onOpenDrawer={() => {}}
      />,
    );
    expect(getByText("たろうさんの番")).not.toBeNull();
    expect(getByText("🎯 鎌倉")).not.toBeNull();
    expect(getByText("1年目 4月")).not.toBeNull();
  });
});
