// @vitest-environment jsdom
//
// GameOverModal.tsx(Phase10/P10-2で効果音を追加、P11-3-Aでgame_over_fanfareの発火元を
// FinalRaceSequence.tsxへ移設)の自動テスト。
// マウント時にはもう何のSEも鳴らさないことを確認する(fanfareはFinalRaceSequence.test.tsx側で検証する)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { GameOverModal } from "./GameOverModal";
import type { Player } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

/** usePrefersReducedMotion()/useIsMobileViewport()のためだけの最小スタブ
 *  (FinalRaceSequence.test.tsxのstubMatchMediaと同じもの)。P11-3-B2c-4のfade-inテストで
 *  reduced-motion有無を切り替えるために関数化した。 */
function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
stubMatchMedia(false);

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
  stubMatchMedia(false); // reduced-motionテストが上書きした場合に備え、既定値へ戻す
});

describe("GameOverModal", () => {
  it("マウント時には何のSEも鳴らさない(game_over_fanfareはFinalRaceSequence側へ移設済み)", () => {
    const player = buildPlayer();
    render(
      <GameOverModal players={[player]} winnerIds={[player.id]} totalYears={3} netWorthHistory={[]} onRestart={() => {}} />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });
});

describe("GameOverModal(Phase B-2c-4: mount後のfade-in)", () => {
  it("mount後はfade-in用のtransitionクラスが付き、最終的にopacity-100になる(通常時)", () => {
    const player = buildPlayer();
    const { container } = render(
      <GameOverModal players={[player]} winnerIds={[player.id]} totalYears={3} netWorthHistory={[]} onRestart={() => {}} />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("transition-opacity");
    expect(root.className).toContain("duration-300");
    expect(root.className).toContain("opacity-100");
    expect(root.className).not.toContain("opacity-0");
  });

  it("reduced-motion時はtransitionクラスを付けず、即座にopacity-100で表示する", () => {
    stubMatchMedia(true);
    const player = buildPlayer();
    const { container } = render(
      <GameOverModal players={[player]} winnerIds={[player.id]} totalYears={3} netWorthHistory={[]} onRestart={() => {}} />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("opacity-100");
    expect(root.className).not.toContain("opacity-0");
    expect(root.className).not.toContain("transition-opacity");
    expect(root.className).not.toContain("duration-300");
  });

  it("fade-inを追加してもマウント時にSEは鳴らない(既存挙動から変化なし)", () => {
    const player = buildPlayer();
    render(
      <GameOverModal players={[player]} winnerIds={[player.id]} totalYears={3} netWorthHistory={[]} onRestart={() => {}} />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });
});
