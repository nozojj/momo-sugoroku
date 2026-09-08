// @vitest-environment jsdom
//
// RouteChoiceOverlay.tsx(Polish Phase 3g「分岐選択の手触り改善」)の自動テスト。
// このPhaseで変更したのはCSSクラスの付与のみ(レイアウト構造・onClick処理は無変更)なので、
// 大規模なテストは作らず、以下の3点だけを固定する:
// - 表示された瞬間から方向ボタン/戻るボタンがクリック可能であること(disabled等が付いていない)
// - クリック時に対応するコールバックがちょうど1回だけ呼ばれること(既存の分岐選択ロジックの回帰確認)
// - 新規追加した出現演出クラス(animate-route-panel-in)とtransitionクラスが付いていること
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { RouteChoiceOverlay } from "./RouteChoiceOverlay";
import type { MapData } from "@/types/game";

afterEach(() => {
  cleanup();
});

const MAP: MapData = {
  id: "test-map",
  name: "テストマップ",
  startNodeId: "start",
  nodes: [
    {
      id: "start",
      name: "現在地",
      type: "normal",
      x: 0,
      y: 0,
      connections: [
        { to: "east", roadType: "main" },
        { to: "north", roadType: "main" },
      ],
    },
    { id: "east", name: "東の道", type: "normal", x: 10, y: 0, connections: [] },
    { id: "north", name: "北の道", type: "normal", x: 0, y: -10, connections: [] },
  ],
};

describe("RouteChoiceOverlay: 表示直後の操作性(Polish Phase 3g回帰)", () => {
  it("表示直後から方向ボタンがクリック可能で、クリックでonSelectRouteが1回だけ呼ばれる", () => {
    const onSelectRoute = vi.fn();
    render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[
          { nodeId: "east", nodeName: "東の道", roadType: "main", available: true },
          { nodeId: "north", nodeName: "北の道", roadType: "main", available: true },
        ]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct
        onSelectRoute={onSelectRoute}
        backNodeId={null}
        remainingMovesAfterBack={1}
        onStepBack={() => {}}
      />,
    );

    const button = screen.getByRole("button", { name: /東の道/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
    expect(onSelectRoute).toHaveBeenCalledWith("east");
  });

  it("戻るボタンが表示されている場合、クリック直後にonStepBackが1回だけ呼ばれる", () => {
    const onStepBack = vi.fn();
    render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[{ nodeId: "east", nodeName: "東の道", roadType: "main", available: true }]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct
        onSelectRoute={() => {}}
        backNodeId="north"
        remainingMovesAfterBack={2}
        onStepBack={onStepBack}
      />,
    );

    const backButton = screen.getByRole("button", { name: /戻る/ }) as HTMLButtonElement;
    expect(backButton.disabled).toBe(false);
    fireEvent.click(backButton);
    expect(onStepBack).toHaveBeenCalledTimes(1);
  });
});

describe("RouteChoiceOverlay: 出現演出/transitionクラス(Polish Phase 3g)", () => {
  it("パネルにanimate-route-panel-in(出現演出)クラスが付与されている", () => {
    const { container } = render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[{ nodeId: "east", nodeName: "東の道", roadType: "main", available: true }]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct
        onSelectRoute={() => {}}
        backNodeId={null}
        remainingMovesAfterBack={1}
        onStepBack={() => {}}
      />,
    );

    expect(container.querySelector(".animate-route-panel-in")).not.toBeNull();
  });

  it("方向ボタン/戻るボタンにtransitionクラスが付与されている", () => {
    render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[{ nodeId: "east", nodeName: "東の道", roadType: "main", available: true }]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct
        onSelectRoute={() => {}}
        backNodeId="north"
        remainingMovesAfterBack={2}
        onStepBack={() => {}}
      />,
    );

    const directionButton = screen.getByRole("button", { name: /東の道/ });
    const backButton = screen.getByRole("button", { name: /戻る/ });
    expect(directionButton.className).toContain("transition");
    expect(backButton.className).toContain("transition");
  });
});

describe("RouteChoiceOverlay: CPUターン中は操作不可(Polish Phase 3h)", () => {
  it("canCurrentPlayerAct:falseでは方向ボタン/戻るボタンがdisabledになり、クリックしてもコールバックが呼ばれない", () => {
    const onSelectRoute = vi.fn();
    const onStepBack = vi.fn();
    render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[{ nodeId: "east", nodeName: "東の道", roadType: "main", available: true }]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct={false}
        onSelectRoute={onSelectRoute}
        backNodeId="north"
        remainingMovesAfterBack={2}
        onStepBack={onStepBack}
      />,
    );

    const directionButton = screen.getByRole("button", { name: /東の道/ }) as HTMLButtonElement;
    const backButton = screen.getByRole("button", { name: /戻る/ }) as HTMLButtonElement;
    expect(directionButton.disabled).toBe(true);
    expect(backButton.disabled).toBe(true);

    fireEvent.click(directionButton);
    fireEvent.click(backButton);
    expect(onSelectRoute).not.toHaveBeenCalled();
    expect(onStepBack).not.toHaveBeenCalled();
  });

  it("canCurrentPlayerAct:falseでは「🤖 CPUが選んでいます…」の表示が出て、選択肢自体(行き先名)は読める", () => {
    render(
      <RouteChoiceOverlay
        map={MAP}
        currentNodeId="start"
        routeOptions={[{ nodeId: "east", nodeName: "東の道", roadType: "main", available: true }]}
        destinationNodeId="east"
        ownedCardIds={[]}
        canCurrentPlayerAct={false}
        onSelectRoute={() => {}}
        backNodeId={null}
        remainingMovesAfterBack={1}
        onStepBack={() => {}}
      />,
    );

    expect(screen.getByText("🤖 CPUが選んでいます…")).not.toBeNull();
    // 通常時の案内文(「地図をタップしてもOK」)は出ない: CPUターン中は地図タップも
    // 効かない(GameScreen.tsx側でBoardのonSelectRouteも同じisCurrentHumanでガードしている)ため。
    expect(screen.queryByText(/地図をタップしてもOK/)).toBeNull();
    expect(screen.getByText("東の道")).not.toBeNull();
  });
});
