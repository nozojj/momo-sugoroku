// @vitest-environment jsdom
//
// TargetSelectOverlay.tsx(Polish Phase 3h「CPUターン中の偽インタラクティブ性」)の自動テスト。
// これまでこのコンポーネントには専用テストが無かったため、今回追加したcanCurrentPlayerAct
// (GameDrawer.tsxのcanCurrentPlayerActと同じ名前・同じ意味)に絞って以下の3点だけを確認する:
// - 人間ターン(canCurrentPlayerAct:true)では従来通りクリック可能でコールバックが呼ばれる
// - CPUターン(canCurrentPlayerAct:false)では選択肢/やめるボタンがdisabledになり、
//   クリックしてもコールバックが呼ばれない
// - CPUターン中も選択肢自体(何を選ぼうとしているか)は表示され続け、CPU操作中の表示が出る
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TargetSelectOverlay } from "./TargetSelectOverlay";
import type { TargetSelectInfo } from "@/types/game";

afterEach(() => {
  cleanup();
});

const INFO: TargetSelectInfo = {
  playerId: "p1",
  playerName: "たろう",
  cardId: "card_warp_select_station",
  cardName: "駅指定ワープカード",
  selectKind: "station",
  options: [
    { optionId: "hub_fujisawa", label: "藤沢", icon: "🚉" },
    { optionId: "hub_kamakura", label: "鎌倉", icon: "🚉" },
  ],
};

describe("TargetSelectOverlay: 人間ターン(Polish Phase 3h回帰)", () => {
  it("選択肢クリックでonSelectが1回だけ呼ばれる", () => {
    const onSelect = vi.fn();
    render(<TargetSelectOverlay info={INFO} canCurrentPlayerAct onSelect={onSelect} onCancel={() => {}} />);

    const button = screen.getByRole("button", { name: /藤沢/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("hub_fujisawa");
  });

  it("「やめる」クリックでonCancelが1回だけ呼ばれる", () => {
    const onCancel = vi.fn();
    render(<TargetSelectOverlay info={INFO} canCurrentPlayerAct onSelect={() => {}} onCancel={onCancel} />);

    const cancelButton = screen.getByRole("button", { name: /やめる/ }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("TargetSelectOverlay: CPUターン中は操作不可(Polish Phase 3h)", () => {
  it("canCurrentPlayerAct:falseでは選択肢/やめるボタンがdisabledになり、クリックしてもコールバックが呼ばれない", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    render(<TargetSelectOverlay info={INFO} canCurrentPlayerAct={false} onSelect={onSelect} onCancel={onCancel} />);

    const optionButton = screen.getByRole("button", { name: /藤沢/ }) as HTMLButtonElement;
    const cancelButton = screen.getByRole("button", { name: /やめる/ }) as HTMLButtonElement;
    expect(optionButton.disabled).toBe(true);
    expect(cancelButton.disabled).toBe(true);

    fireEvent.click(optionButton);
    fireEvent.click(cancelButton);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("canCurrentPlayerAct:falseでは「🤖 CPUが選んでいます…」が表示され、選択肢自体(行き先名)は読める", () => {
    render(<TargetSelectOverlay info={INFO} canCurrentPlayerAct={false} onSelect={() => {}} onCancel={() => {}} />);

    expect(screen.getByText("🤖 CPUが選んでいます…")).not.toBeNull();
    expect(screen.getByText("藤沢")).not.toBeNull();
    expect(screen.getByText("鎌倉")).not.toBeNull();
  });
});
