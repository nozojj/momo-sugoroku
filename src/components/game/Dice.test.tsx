// @vitest-environment jsdom
//
// Dice.tsx(Polish Phase 3a「手番の合図+サイコロの気持ちよさ」)の自動テスト。重点:
// (1) クリックにつきonRollがちょうど1回だけ呼ばれ、canRollがfalseになった以降は
//     再クリックしても呼ばれないこと(二重rollDice()の防止はDice.tsx側の防御だけでなく
//     実際にはgameStore.ts側のガードでも保証されるが、ここではUI層の責務だけを検証する)、
// (2) revealPhase:"rolling"中は本当のdiceResult/diceFacesを表示せず、フェイクロールの
//     面(1〜6のいずれか)を表示すること、(3) revealPhase:"settling"/"idle"では本当の
//     出目が正しく表示されること、(4) diceCount>1(急行系カード使用中)でも同様であること。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dice } from "./Dice";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DICE_FACE_CHARS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

describe("Dice(単一ダイス、diceCount<=1)", () => {
  it("canRoll:trueのときクリックでonRollが1回だけ呼ばれる", () => {
    const onRoll = vi.fn();
    render(<Dice diceResult={null} canRoll doubleArmed={false} onRoll={onRoll} revealPhase="idle" />);

    fireEvent.click(screen.getByRole("button", { name: "サイコロを振る" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it("canRoll:falseのときクリックしてもonRollは呼ばれない(disabled)", () => {
    const onRoll = vi.fn();
    render(<Dice diceResult={null} canRoll={false} doubleArmed={false} onRoll={onRoll} revealPhase="idle" />);

    const button = screen.getByRole("button", { name: "サイコロを振る" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("rolling演出中(revealPhase:'rolling'、実際のGameScreen.tsxではcanRoll:falseになる)の再クリックでonRollが呼ばれない", () => {
    const onRoll = vi.fn();
    const { rerender } = render(
      <Dice diceResult={null} canRoll doubleArmed={false} onRoll={onRoll} revealPhase="idle" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "サイコロを振る" }));
    expect(onRoll).toHaveBeenCalledTimes(1);

    // GameScreen.tsx側の実際の挙動を模す: rollDice()実行直後はstatusが"moving"へ移るため
    // canRollは即座にfalseになり、revealPhaseは"rolling"になる。
    rerender(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={onRoll} revealPhase="rolling" />);
    fireEvent.click(screen.getByRole("button", { name: "サイコロを振る" }));
    expect(onRoll).toHaveBeenCalledTimes(1); // 増えない
  });

  it("revealPhase:'rolling'中は本当のdiceResultを表示せず、1〜6のいずれかのフェイク面を表示する", () => {
    render(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="rolling" />);

    const button = screen.getByRole("button", { name: "サイコロを振る" });
    expect(DICE_FACE_CHARS.slice(1)).toContain(button.textContent);
    // キャプションは「振っています」であり、本当の出目(4マス移動中)をまだ明かさない。
    expect(screen.getByText("サイコロを振っています…")).not.toBeNull();
  });

  it("revealPhase:'settling'では本当のdiceResultを表示する", () => {
    render(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="settling" />);

    const button = screen.getByRole("button", { name: "サイコロを振る" });
    expect(button.textContent).toBe(DICE_FACE_CHARS[4]);
    expect(screen.getByText("4マス移動中…")).not.toBeNull();
  });

  it("revealPhase:'idle'でも(rolling/settlingを経た後の)本当のdiceResultをそのまま表示し続ける", () => {
    render(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="idle" />);

    const button = screen.getByRole("button", { name: "サイコロを振る" });
    expect(button.textContent).toBe(DICE_FACE_CHARS[4]);
    expect(screen.getByText("4マス移動中…")).not.toBeNull();
  });

  it("revealPhase:'rolling'中はanimate-dice-roll、'settling'中はanimate-character-bounce(既存animationの再利用)が付き、同時には付かない", () => {
    const { rerender } = render(
      <Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="rolling" />,
    );
    let button = screen.getByRole("button", { name: "サイコロを振る" });
    expect(button.className).toContain("animate-dice-roll");
    expect(button.className).not.toContain("animate-character-bounce");

    rerender(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="settling" />);
    button = screen.getByRole("button", { name: "サイコロを振る" });
    expect(button.className).toContain("animate-character-bounce");
    expect(button.className).not.toContain("animate-dice-roll");
  });

  it("フェイクロール中の面は一定間隔で切り替わり、unmount後もタイマーが残らない", async () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="rolling" />,
    );
    const button = screen.getByRole("button", { name: "サイコロを振る" });
    const faces = new Set<string>([button.textContent ?? ""]);
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(80);
      });
      faces.add(button.textContent ?? "");
    }
    // 10回分切り替えれば、1〜6のどれかで最低2種類以上は出現するはず(稀に同じ目が連続する
    // 可能性はあるが、10回中ずっと1種類のままになる確率は無視できるほど低い)。
    expect(faces.size).toBeGreaterThan(1);

    expect(() => {
      unmount();
      vi.advanceTimersByTime(10000);
    }).not.toThrow();
  });

  it("doubleArmed:trueのとき通常のcanRollキャプションに「出目 x2 で移動!」が出る(既存挙動の回帰確認)", () => {
    render(<Dice diceResult={null} canRoll doubleArmed onRoll={() => {}} revealPhase="idle" />);
    expect(screen.getByText("出目 x2 で移動!")).not.toBeNull();
  });

  it("actualMoves未指定(既存呼び出し)ではdiceResultのみの表示のまま(回帰確認)", () => {
    render(<Dice diceResult={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="idle" />);
    expect(screen.getByText("4マス移動中…")).not.toBeNull();
  });

  it("actualMovesがdiceResultと同じ(修飾なしの通常ロール)なら従来通りの一段表示のまま(Polish Phase 3f)", () => {
    render(
      <Dice diceResult={4} actualMoves={4} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="idle" />,
    );
    expect(screen.getByText("4マス移動中…")).not.toBeNull();
  });

  it("actualMovesがdiceResultと異なる(halveDiceNextRoll発動)場合、出目→実際の移動マス数の両方を表示する(Polish Phase 3f)", () => {
    render(
      <Dice diceResult={6} actualMoves={3} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="idle" />,
    );
    expect(screen.getByText("6 → 3マス移動中…")).not.toBeNull();
    expect(screen.queryByText("6マス移動中…")).toBeNull();
  });

  it("revealPhase:'rolling'中はactualMovesが指定されていても本当の出目/実移動量を見せない(Polish Phase 3f回帰)", () => {
    render(
      <Dice diceResult={6} actualMoves={3} canRoll={false} doubleArmed={false} onRoll={() => {}} revealPhase="rolling" />,
    );
    expect(screen.getByText("サイコロを振っています…")).not.toBeNull();
    expect(screen.queryByText("6 → 3マス移動中…")).toBeNull();
  });
});

describe("Dice(複数ダイス、diceCount>1、急行系カード使用中)", () => {
  it("canRoll:trueのときクリックでonRollが1回だけ呼ばれる", () => {
    const onRoll = vi.fn();
    render(<Dice diceResult={null} diceCount={2} canRoll doubleArmed={false} onRoll={onRoll} revealPhase="idle" />);

    fireEvent.click(screen.getByRole("button", { name: "サイコロ2個を振る" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it("revealPhase:'rolling'中は本当のdiceFacesを見せず、diceCount個ぶんのフェイク面を表示する", () => {
    render(
      <Dice
        diceResult={7}
        diceFaces={[3, 4]}
        diceCount={2}
        canRoll={false}
        doubleArmed={false}
        onRoll={() => {}}
        revealPhase="rolling"
      />,
    );
    expect(screen.getByText("サイコロ2個を振っています…")).not.toBeNull();
    const button = screen.getByRole("button", { name: "サイコロ2個を振る" });
    const shown = Array.from(button.querySelectorAll("span")).map((el) => el.textContent);
    expect(shown).toHaveLength(2);
    for (const face of shown) expect(DICE_FACE_CHARS.slice(1)).toContain(face);
  });

  it("revealPhase:'settling'では本当のdiceFaces/diceResultを表示する(内訳+合計)", () => {
    render(
      <Dice
        diceResult={7}
        diceFaces={[3, 4]}
        diceCount={2}
        canRoll={false}
        doubleArmed={false}
        onRoll={() => {}}
        revealPhase="settling"
      />,
    );
    expect(screen.getByText("3+4=7 マス移動中…")).not.toBeNull();
    const button = screen.getByRole("button", { name: "サイコロ2個を振る" });
    const shown = Array.from(button.querySelectorAll("span")).map((el) => el.textContent);
    expect(shown).toEqual([DICE_FACE_CHARS[3], DICE_FACE_CHARS[4]]);
  });

  it("actualMovesがdiceResultと異なる場合、内訳+合計→実際の移動マス数を表示する(Polish Phase 3f)", () => {
    render(
      <Dice
        diceResult={7}
        diceFaces={[3, 4]}
        actualMoves={4}
        diceCount={2}
        canRoll={false}
        doubleArmed={false}
        onRoll={() => {}}
        revealPhase="settling"
      />,
    );
    expect(screen.getByText("3+4=7 → 4マス移動中…")).not.toBeNull();
  });
});
