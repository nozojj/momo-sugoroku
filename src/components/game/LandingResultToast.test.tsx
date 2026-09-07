// @vitest-environment jsdom
//
// LandingResultToast.tsx(Phase10/P10-1で効果音を追加、Polish Phase 3e「マス効果の結果表示」で
// 表示内容を強化)の自動テスト。
// 重点:
// - マウント時にkind別のSE(money_gain/money_loss)がちょうど1回だけ呼ばれること(既存)。
// - 「誰の結果か」(playerName/playerColor)、「±金額」(amount単体、message文字列の符号に
//   依存しない)、「収入/支出」ラベルという色以外の識別手がかりが表示されること。
// - AUTO_DISMISS_MS経過での自動消滅、infoが変わったときの旧timerのcleanup。
// - 次プレイヤーへcurrentPlayerIndexが変わっても(=このコンポーネントの外の話)、
//   info自体のplayerNameは不変であること(propsのスナップショットが保持されることの確認)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
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
  vi.useRealTimers();
});

const GAIN_INFO: LandingResultInfo = {
  playerId: "p1",
  playerName: "たろう",
  playerColor: "#2e86de",
  kind: "moneyGain",
  amount: 3000,
  message: "たろうさん「藤沢」: 臨時収入(+3000万円)",
};

const LOSS_INFO: LandingResultInfo = {
  ...GAIN_INFO,
  kind: "moneyLoss",
  amount: -3000,
  message: "たろうさん「藤沢」: 出費(-3000万円)",
};

describe("LandingResultToast: 効果音(既存回帰)", () => {
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

  it("infoが変わっても同じ結果に対してSEが二重再生されない(info変更ごとに1回だけ)", () => {
    const { rerender } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(playSEMock).toHaveBeenCalledTimes(1);

    rerender(<LandingResultToast info={LOSS_INFO} onDismiss={() => {}} />);
    expect(playSEMock).toHaveBeenCalledTimes(2);
    expect(playSEMock).toHaveBeenLastCalledWith("money_loss");
  });
});

describe("LandingResultToast: 誰の結果か(Polish Phase 3e)", () => {
  it("playerNameが表示される", () => {
    const { getByText } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("たろうさんの結果")).not.toBeNull();
  });

  it("playerColorのドットが表示される", () => {
    const { container } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    const dot = container.querySelector('span[style*="background-color"]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("style")).toContain("rgb(46, 134, 222)"); // #2e86de
  });

  it("GameHudの「さんの番」ではなく「さんの結果」という文言で、前プレイヤー結果であることを区別する", () => {
    const { getByText, queryByText } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("たろうさんの結果")).not.toBeNull();
    expect(queryByText("たろうさんの番")).toBeNull();
  });
});

describe("LandingResultToast: 金額表示(Polish Phase 3e)", () => {
  it("moneyGainはamountから+記号付きの金額を表示する(message文字列の符号に依存しない)", () => {
    const { getByText } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("+3,000万円")).not.toBeNull();
  });

  it("moneyLossはamountから-記号付きの金額を表示する", () => {
    const { getByText } = render(<LandingResultToast info={LOSS_INFO} onDismiss={() => {}} />);
    expect(getByText("-3,000万円")).not.toBeNull();
  });

  it("message文字列の符号表記が金額と食い違っていても、amount単体から正しい符号を表示する", () => {
    const weirdInfo: LandingResultInfo = { ...GAIN_INFO, amount: 500, message: "符号を含まない補足メッセージ" };
    const { getByText } = render(<LandingResultToast info={weirdInfo} onDismiss={() => {}} />);
    expect(getByText("+500万円")).not.toBeNull();
  });
});

describe("LandingResultToast: 収入/支出ラベルと色以外の視覚手がかり(Polish Phase 3e)", () => {
  it("moneyGainは「収入」ラベルを表示する", () => {
    const { getByText } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("収入")).not.toBeNull();
  });

  it("moneyLossは「支出」ラベルを表示する", () => {
    const { getByText } = render(<LandingResultToast info={LOSS_INFO} onDismiss={() => {}} />);
    expect(getByText("支出")).not.toBeNull();
  });

  it("moneyGain/moneyLossで矢印アイコン(svg path)の向きが異なる(色以外の識別手段)", () => {
    const { container: gainContainer } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    const gainPath = gainContainer.querySelector("svg path")?.getAttribute("d");
    cleanup();
    const { container: lossContainer } = render(<LandingResultToast info={LOSS_INFO} onDismiss={() => {}} />);
    const lossPath = lossContainer.querySelector("svg path")?.getAttribute("d");

    expect(gainPath).not.toBeNull();
    expect(lossPath).not.toBeNull();
    expect(gainPath).not.toBe(lossPath);
  });
});

describe("LandingResultToast: 自動消滅とcleanup", () => {
  it("AUTO_DISMISS_MS(1200〜1500msの範囲)経過後にonDismissが呼ばれる", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<LandingResultToast info={GAIN_INFO} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1199);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("1700msより長く待たされない(既存より短縮されていることの回帰確認)", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<LandingResultToast info={GAIN_INFO} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("infoが変わると旧timerがcleanupされ、新しいinfoのtimerだけが発火する(二重発火しない)", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<LandingResultToast info={GAIN_INFO} onDismiss={onDismiss} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender(<LandingResultToast info={LOSS_INFO} onDismiss={onDismiss} />);

    // 旧timer(GAIN_INFOの残り分)が生きていれば、切り替えから900ms後(合計1400ms相当)に
    // 誤発火する可能性があるが、cleanupされていれば発火しない。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // 新timer(LOSS_INFO基準、切り替え後1400ms)で1回だけ発火する。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("unmountしてもタイマーが残らない(その後の操作でエラーにならない)", () => {
    vi.useFakeTimers();
    const { unmount } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    unmount();
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});

describe("LandingResultToast: 前プレイヤーの結果としての不変性", () => {
  it("同じinfoオブジェクトを保持し続ける限り、playerNameは変わらない(次プレイヤーへcurrentPlayerIndexが進んでも、渡されたinfoスナップショット自体は不変)", () => {
    const { getByText, rerender } = render(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("たろうさんの結果")).not.toBeNull();

    // 呼び出し側(GameScreen.tsx)が同じinfoを渡し続ける限り(=次プレイヤーへ手番が進んでも
    // landingResultInfo自体は新しい結果が来るまで変わらない)、表示内容は前プレイヤーのまま。
    rerender(<LandingResultToast info={GAIN_INFO} onDismiss={() => {}} />);
    expect(getByText("たろうさんの結果")).not.toBeNull();
  });
});
