// @vitest-environment jsdom
//
// MonopolyAnnounceModal.tsx(Phase10/P10-1で効果音を追加)の自動テスト。
// CharacterAnnouncer自体の演出フロー(entering/line/exiting)はここでは検証せず、
// マウント時にplaySE("monopoly_region")がちょうど1回だけ呼ばれることだけを確認する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { MonopolyAnnounceModal } from "./MonopolyAnnounceModal";
import type { MonopolyAchievement } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

afterEach(() => {
  cleanup();
});

// jsdomはwindow.matchMediaを実装していない(既知の既定動作)。CharacterAnnouncerが使う
// usePrefersReducedMotion()/useIsMobileViewport()のためだけの最小スタブ(CardDrawModal.test.tsxと同じもの)。
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

const ACHIEVEMENT: MonopolyAchievement = { kind: "region", name: "鎌倉", multiplier: 2 };

describe("MonopolyAnnounceModal", () => {
  it("マウント時にmonopoly_regionが1回だけ再生される", () => {
    render(<MonopolyAnnounceModal achievement={ACHIEVEMENT} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("monopoly_region");
  });
});
