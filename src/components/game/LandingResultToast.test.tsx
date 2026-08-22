// @vitest-environment jsdom
//
// LandingResultToast.tsx(Phase10/P10-1で効果音を追加)の自動テスト。
// マウント時にkind別のSE(money_gain/money_loss)がちょうど1回だけ呼ばれることを確認する。
// 自動消滅タイマー自体(既存挙動)はここでは検証しない。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { LandingResultToast } from "./LandingResultToast";
import type { LandingResultInfo } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

beforeEach(() => {
  playSEMock.mockClear();
});

afterEach(() => {
  cleanup();
});

const GAIN_INFO: LandingResultInfo = {
  playerId: "p1",
  playerName: "P1",
  playerColor: "#000",
  kind: "moneyGain",
  amount: 100,
  message: "100万円もらった!",
};

const LOSS_INFO: LandingResultInfo = {
  ...GAIN_INFO,
  kind: "moneyLoss",
  amount: -100,
  message: "100万円失った…",
};

describe("LandingResultToast", () => {
  it("kind: moneyGainのときmoney_gainが1回だけ再生される", () => {
    render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("money_gain");
  });

  it("kind: moneyLossのときmoney_lossが1回だけ再生される", () => {
    render(<LandingResultToast info={LOSS_INFO} onDismiss={() => {}} />);

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("money_loss");
  });
});
