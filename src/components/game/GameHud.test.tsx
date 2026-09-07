// @vitest-environment jsdom
//
// GameHud.tsx(Polish Phase 3a「手番の合図」/ Polish Phase 3e「現在所持金表示」)の自動テスト。
// 重点: 手番が実際に別プレイヤーへ切り替わった瞬間だけ既存animate-highlight-slam(新規keyframe
// なし)が一瞬付き、一定時間後に自然に外れること。初回mountや「同じプレイヤーのままの再レンダー」
// では誤発火しないこと(useGameplaySoundEffects.tsのprevDiceResultRefと同じ設計)。
// Phase 3e: 現在プレイヤーの所持金が表示されること、「同じプレイヤーのままmoneyだけ変化」した
// ときだけmoney flashが発火し、「手番交代でmoneyが別プレイヤーの値へ切り替わっただけ」では
// 発火しないこと(justChangedとの責務分離)。
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

/** 所持金を表示しているspan(万円を含むテキストを持つ、nameSpanとは別の要素)を取得する。 */
function moneySpan(container: HTMLElement): HTMLElement {
  const span = Array.from(container.querySelectorAll("span")).find(
    (el) => el.textContent?.includes("万円") && !el.textContent?.includes("さんの番"),
  );
  expect(span).not.toBeUndefined();
  return span!;
}

const baseProps = {
  currentPlayerId: "p1",
  currentPlayerName: "たろう",
  currentPlayerColor: "#e6483e",
  currentPlayerMoney: 10000,
  destinationName: "鎌倉",
  calendarText: "1年目 4月",
  onOpenDrawer: () => {},
};

describe("GameHud: 手番開始の強調表示", () => {
  it("初回mountでは強調class(animate-highlight-slam)が付かない(誤発火防止)", () => {
    const { container } = render(<GameHud {...baseProps} />);
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("currentPlayerIdが別プレイヤーへ変わった瞬間だけ強調classが付き、時間経過で自然に外れる", async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<GameHud {...baseProps} />);
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");

    rerender(
      <GameHud
        {...baseProps}
        currentPlayerId="p2"
        currentPlayerName="じろう"
        currentPlayerColor="#2e86de"
        currentPlayerMoney={8000}
      />,
    );
    expect(nameSpan(container).className).toContain("animate-highlight-slam");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(480);
    });
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("同じプレイヤーのまま他の情報(destinationName等)だけ変わる再レンダーでは強調classが付かない", () => {
    const { container, rerender } = render(<GameHud {...baseProps} />);

    rerender(<GameHud {...baseProps} destinationName="小田原" />);
    expect(nameSpan(container).className).not.toContain("animate-highlight-slam");
  });

  it("既存の表示内容(プレイヤー名・目的地・年月)は変更されていない(回帰確認)", () => {
    const { getByText } = render(<GameHud {...baseProps} />);
    expect(getByText("たろうさんの番")).not.toBeNull();
    expect(getByText("🎯 鎌倉")).not.toBeNull();
    expect(getByText("1年目 4月")).not.toBeNull();
  });
});

describe("GameHud: 現在所持金の表示(Polish Phase 3e)", () => {
  it("currentPlayerMoneyが既存のformatMoney表記(万円)で表示される", () => {
    const { getByText } = render(<GameHud {...baseProps} currentPlayerMoney={12000} />);
    expect(getByText("12,000万円")).not.toBeNull();
  });

  it("手番交代でcurrentPlayerがcurrentPlayerMoneyごと切り替わると、新しいプレイヤーの金額が表示される", () => {
    const { getByText, rerender } = render(<GameHud {...baseProps} currentPlayerMoney={10000} />);
    expect(getByText("10,000万円")).not.toBeNull();

    rerender(
      <GameHud {...baseProps} currentPlayerId="p2" currentPlayerName="じろう" currentPlayerMoney={5000} />,
    );
    expect(getByText("5,000万円")).not.toBeNull();
  });
});

describe("GameHud: 所持金flash(Polish Phase 3e)", () => {
  it("初回mountではmoney flashが付かない(誤発火防止)", () => {
    const { container } = render(<GameHud {...baseProps} />);
    expect(moneySpan(container).className).not.toContain("animate-money-flash");
  });

  it("同じplayerIdのままmoneyだけ変化した場合、money flashが発火し時間経過で自然に外れる", async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<GameHud {...baseProps} currentPlayerMoney={10000} />);
    expect(moneySpan(container).className).not.toContain("animate-money-flash");

    rerender(<GameHud {...baseProps} currentPlayerMoney={13000} />);
    expect(moneySpan(container).className).toContain("animate-money-flash");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(moneySpan(container).className).not.toContain("animate-money-flash");
  });

  it("手番交代でcurrentPlayerIdが変わり、moneyの数値も別プレイヤーの値へ変わっただけの場合はmoney flashが発火しない(justChangedとは別責務)", () => {
    const { container, rerender } = render(
      <GameHud {...baseProps} currentPlayerId="p1" currentPlayerMoney={10000} />,
    );

    rerender(
      <GameHud {...baseProps} currentPlayerId="p2" currentPlayerName="じろう" currentPlayerMoney={5000} />,
    );
    // 手番交代の強調(justChanged)は付くが、money flashは付かないこと
    expect(nameSpan(container).className).toContain("animate-highlight-slam");
    expect(moneySpan(container).className).not.toContain("animate-money-flash");
  });

  it("同じプレイヤーのままmoneyが変化しない再レンダーではmoney flashが発火しない", () => {
    const { container, rerender } = render(<GameHud {...baseProps} currentPlayerMoney={10000} />);

    rerender(<GameHud {...baseProps} currentPlayerMoney={10000} destinationName="小田原" />);
    expect(moneySpan(container).className).not.toContain("animate-money-flash");
  });

  it("unmountしてもタイマーが残らない(その後の操作でエラーにならない)", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(<GameHud {...baseProps} currentPlayerMoney={10000} />);
    rerender(<GameHud {...baseProps} currentPlayerMoney={13000} />);
    unmount();
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});
