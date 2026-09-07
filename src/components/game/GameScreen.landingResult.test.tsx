// @vitest-environment jsdom
//
// GameScreen.tsx(Polish Phase 3e「マス効果の結果表示→次の手番への繋がり」)の統合テスト。
// gameStore.ts自体(endTurn timing)は変更していないため、money着地時に即座に次プレイヤーへ
// 手番が進む既存挙動そのものは変えていないことを前提に、GameScreen側だけで追加した
// 「settlementIntro/settlementへ入ったら居残っているlandingResultInfoを片付ける」効果に絞って
// 検証する(gameStore.tsへ演出用ロジックを追加していないため、既存の公開action
// dismissLandingResult()を呼ぶだけであることをテストでも裏付ける)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { GameScreen } from "./GameScreen";
import type { LandingResultInfo } from "@/types/game";

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

async function waitForHydration(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const SAMPLE_LANDING_RESULT: LandingResultInfo = {
  playerId: "p1",
  playerName: "たろう",
  playerColor: "#e6483e",
  kind: "moneyGain",
  amount: 100,
  message: "テスト+100万円",
};

describe("GameScreen: settlementIntro/settlementとlandingResultInfoの重なり対策(Polish Phase 3e)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    Element.prototype.scrollIntoView = vi.fn();
    useGameStore.getState().resetGame();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("status:'settlementIntro'に入った時点でlandingResultInfoが残っていれば、片付けられてnullになる", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    render(<GameScreen />);
    await waitForHydration();

    act(() => {
      useGameStore.setState({
        status: "settlementIntro",
        landingResultInfo: SAMPLE_LANDING_RESULT,
        settlementInfo: { year: 1, isFinalSettlement: false, yearEventId: undefined, entries: [] },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(useGameStore.getState().landingResultInfo).toBeNull();
  });

  it("status:'settlement'に入った時点でlandingResultInfoが残っていれば、片付けられてnullになる", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    render(<GameScreen />);
    await waitForHydration();

    act(() => {
      useGameStore.setState({
        status: "settlement",
        landingResultInfo: SAMPLE_LANDING_RESULT,
        settlementInfo: { year: 1, isFinalSettlement: false, yearEventId: undefined, entries: [] },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(useGameStore.getState().landingResultInfo).toBeNull();
  });

  it("通常のmoving/rollingではlandingResultInfoを勝手に片付けない(通常のトースト表示寿命を邪魔しない回帰確認)", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    render(<GameScreen />);
    await waitForHydration();

    act(() => {
      useGameStore.setState({ status: "rolling", landingResultInfo: SAMPLE_LANDING_RESULT });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(useGameStore.getState().landingResultInfo).toEqual(SAMPLE_LANDING_RESULT);
  });

  it("landingResultInfoが既にnullの状態でsettlementIntroに入っても、余計なsetを起こさずエラーにならない", async () => {
    useGameStore.getState().startGame(["たろう", "じろう"], 1, ["human", "human"]);
    render(<GameScreen />);
    await waitForHydration();

    expect(() => {
      act(() => {
        useGameStore.setState({
          status: "settlementIntro",
          landingResultInfo: null,
          settlementInfo: { year: 1, isFinalSettlement: false, yearEventId: undefined, entries: [] },
        });
      });
    }).not.toThrow();

    expect(useGameStore.getState().landingResultInfo).toBeNull();
  });
});
