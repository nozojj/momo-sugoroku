// @vitest-environment jsdom
//
// GameOverModal.tsx(Phase10/P10-2で効果音を追加)の自動テスト。
// マウント時にgame_over_fanfareがちょうど1回だけ再生されることを確認する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { GameOverModal } from "./GameOverModal";
import type { Player } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

// jsdomはwindow.matchMediaを実装していない(既知の既定動作)。usePrefersReducedMotion()/
// useIsMobileViewport()のためだけの最小スタブ(CardDrawModal.test.tsxと同じもの)。
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

function buildPlayer(): Player {
  return {
    id: "p1",
    name: "テストP1",
    color: "#000",
    controlledBy: "human",
    carIcon: "🚗",
    currentNodeId: "hub_fujisawa",
    moveHistory: ["hub_fujisawa"],
    money: 5000,
    ownedPropertyIds: [],
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
  };
}

afterEach(() => {
  cleanup();
  playSEMock.mockClear();
});

describe("GameOverModal", () => {
  it("マウント時にgame_over_fanfareが1回だけ再生される", () => {
    const player = buildPlayer();
    render(
      <GameOverModal players={[player]} winnerIds={[player.id]} totalYears={3} netWorthHistory={[]} onRestart={() => {}} />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("game_over_fanfare");
  });
});
