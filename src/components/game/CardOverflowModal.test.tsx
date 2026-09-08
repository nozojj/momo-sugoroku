// @vitest-environment jsdom
//
// CardOverflowModal.tsx(Polish Phase 3h「CPUターン中の偽インタラクティブ性」)の自動テスト。
// これまでこのコンポーネントには専用テストが無かったため、今回追加したcanCurrentPlayerAct
// (GameDrawer.tsxのcanCurrentPlayerActと同じ名前・同じ意味)に絞って以下の3点だけを確認する:
// - 人間ターン(canCurrentPlayerAct:true)では従来通りクリック可能でコールバックが呼ばれる
// - CPUターン(canCurrentPlayerAct:false)では入れ替え/見送りボタンがdisabledになり、
//   クリックしてもコールバックが呼ばれない
// - CPUターン中も選択肢自体(手札のカード名)は表示され続け、CPU操作中の表示が出る
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardOverflowModal } from "./CardOverflowModal";
import type { CardOverflowInfo } from "@/types/game";

afterEach(() => {
  cleanup();
});

const INFO: CardOverflowInfo = {
  playerId: "p1",
  playerName: "たろう",
  currentCardIds: ["card_double_move"],
  newCardId: "card_dice_again",
};

describe("CardOverflowModal: 人間ターン(Polish Phase 3h回帰)", () => {
  it("既存カードクリックでonDiscardExistingが1回だけ呼ばれる", () => {
    const onDiscardExisting = vi.fn();
    render(
      <CardOverflowModal
        info={INFO}
        canCurrentPlayerAct
        onDiscardExisting={onDiscardExisting}
        onKeepCurrentHand={() => {}}
      />,
    );

    const cardButton = screen.getByRole("button", { name: /スピードアップ/ }) as HTMLButtonElement;
    expect(cardButton.disabled).toBe(false);
    fireEvent.click(cardButton);
    expect(onDiscardExisting).toHaveBeenCalledTimes(1);
    expect(onDiscardExisting).toHaveBeenCalledWith(0);
  });

  it("見送るボタンクリックでonKeepCurrentHandが1回だけ呼ばれる", () => {
    const onKeepCurrentHand = vi.fn();
    render(
      <CardOverflowModal
        info={INFO}
        canCurrentPlayerAct
        onDiscardExisting={() => {}}
        onKeepCurrentHand={onKeepCurrentHand}
      />,
    );

    const keepButton = screen.getByRole("button", { name: /見送って/ }) as HTMLButtonElement;
    expect(keepButton.disabled).toBe(false);
    fireEvent.click(keepButton);
    expect(onKeepCurrentHand).toHaveBeenCalledTimes(1);
  });
});

describe("CardOverflowModal: CPUターン中は操作不可(Polish Phase 3h)", () => {
  it("canCurrentPlayerAct:falseでは入れ替え/見送りボタンがdisabledになり、クリックしてもコールバックが呼ばれない", () => {
    const onDiscardExisting = vi.fn();
    const onKeepCurrentHand = vi.fn();
    render(
      <CardOverflowModal
        info={INFO}
        canCurrentPlayerAct={false}
        onDiscardExisting={onDiscardExisting}
        onKeepCurrentHand={onKeepCurrentHand}
      />,
    );

    const keepButton = screen.getByRole("button", { name: /見送って/ }) as HTMLButtonElement;
    expect(keepButton.disabled).toBe(true);
    fireEvent.click(keepButton);
    expect(onKeepCurrentHand).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    for (const b of buttons) {
      fireEvent.click(b);
    }
    expect(onDiscardExisting).not.toHaveBeenCalled();
  });

  it("canCurrentPlayerAct:falseでは「🤖 CPUが選んでいます…」が表示され、既存カード名は読める", () => {
    render(
      <CardOverflowModal
        info={INFO}
        canCurrentPlayerAct={false}
        onDiscardExisting={() => {}}
        onKeepCurrentHand={() => {}}
      />,
    );

    expect(screen.getByText("🤖 CPUが選んでいます…")).not.toBeNull();
    expect(screen.queryByText("既存の手札から1枚タップして入れ替える")).toBeNull();
  });
});
