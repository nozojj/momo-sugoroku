// @vitest-environment jsdom
//
// DestinationCelebrationScreen.tsx(Phase10/P10-2で効果音を追加)の自動テスト。
// - マウント時にdestination_arriveが1回
// - スピン中の通常tickはroulette_tick、確定(reveal)時はdestination_revealで、両者が
//   同時に重ならないこと
// - タップでスピンをスキップした経路でも、destination_revealだけは確実に1回鳴ること
//   (スキップされた分のroulette_tickは鳴らないこと)
// を検証する。抽選ロジック自体・onContinueの発火保証はこのコンポーネントの既存仕様であり、
// ここでは対象にしない。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { DestinationCelebrationScreen } from "./DestinationCelebrationScreen";
import type { ArrivalInfo } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

const POLL_STEP_MS = 50;

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

const ARRIVAL_INFO: ArrivalInfo = {
  playerId: "p1",
  playerName: "テストP1",
  playerColor: "#000",
  destinationName: "鎌倉",
  bonus: 500,
  nextDestinationName: "江の島",
};

const CANDIDATES = ["藤沢", "茅ヶ崎", "平塚", "寒川"];

function clickScreen(): void {
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
}

/** "lines"フェーズ(4行)をタップでスキップし、"spin"フェーズの先頭まで進める。 */
function skipLines(): void {
  for (let i = 0; i < 4; i++) clickScreen();
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("DestinationCelebrationScreen", () => {
  beforeEach(() => {
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("マウント時にdestination_arriveが1回だけ再生される", () => {
    render(
      <DestinationCelebrationScreen arrivalInfo={ARRIVAL_INFO} candidateDestinationNames={CANDIDATES} onContinue={() => {}} />,
    );

    expect(playSEMock.mock.calls.filter((c) => c[0] === "destination_arrive")).toHaveLength(1);
  });

  it("自動進行: スピン中はroulette_tickが複数回、確定時はdestination_revealが1回だけ、かつ重複しない", async () => {
    render(
      <DestinationCelebrationScreen arrivalInfo={ARRIVAL_INFO} candidateDestinationNames={CANDIDATES} onContinue={() => {}} />,
    );
    playSEMock.mockClear(); // destination_arrive分を除外し、スピン以降だけを見る

    skipLines(); // "spin"フェーズの先頭へ

    // スピン確定(destination_reveal)まで小刻みに進める。
    let elapsed = 0;
    while (elapsed < 3000 && !playSEMock.mock.calls.some((c) => c[0] === "destination_reveal")) {
      await advance(POLL_STEP_MS);
      elapsed += POLL_STEP_MS;
    }

    const calls = playSEMock.mock.calls.map((c) => c[0]);
    expect(calls.filter((id) => id === "destination_reveal")).toHaveLength(1);
    expect(calls.filter((id) => id === "roulette_tick").length).toBeGreaterThan(0);
    // destination_revealが鳴った時点でroulette_tickと重複していない(最後の1件が確定音)。
    expect(calls[calls.length - 1]).toBe("destination_reveal");
  });

  it("タップでスピンをスキップした経路でも、destination_revealは1回鳴り、スキップした分のroulette_tickは鳴らない", () => {
    render(
      <DestinationCelebrationScreen arrivalInfo={ARRIVAL_INFO} candidateDestinationNames={CANDIDATES} onContinue={() => {}} />,
    );
    playSEMock.mockClear();

    skipLines(); // "spin"フェーズの先頭へ
    clickScreen(); // spin中の1タップでreveal直行(スキップ)

    const calls = playSEMock.mock.calls.map((c) => c[0]);
    expect(calls.filter((id) => id === "destination_reveal")).toHaveLength(1);
    expect(calls.filter((id) => id === "roulette_tick")).toHaveLength(0); // スキップしたのでtickは1つも鳴らない
  });

  it("reveal確定後、タイマーが進んでもdestination_revealは増えない", async () => {
    render(
      <DestinationCelebrationScreen arrivalInfo={ARRIVAL_INFO} candidateDestinationNames={CANDIDATES} onContinue={() => {}} />,
    );
    playSEMock.mockClear();

    skipLines();
    clickScreen(); // reveal直行
    const countAfterReveal = playSEMock.mock.calls.filter((c) => c[0] === "destination_reveal").length;

    await advance(3000); // reveal保持時間+speakフェーズ分を進める

    expect(playSEMock.mock.calls.filter((c) => c[0] === "destination_reveal").length).toBe(countAfterReveal);
  });
});
