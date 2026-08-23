// @vitest-environment jsdom
//
// StartScreen.tsx(名前欄は毎回未入力始まり・未入力時のみ既定名を使う仕様)の自動テスト。
// 重点: (1) 入力欄自体はプロフィール等から持ち越さず常に空文字で始まる、(2) 未入力のまま
// ゲーム開始した場合、人間は「プレイヤーN」・CPUは「CPU N」という既定名がonStart()へ渡る、
// (3) 何か入力すればその値がそのまま使われる、(4) placeholderが人間/CPU切り替えに追随する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StartScreen } from "./StartScreen";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function nameInputs(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

describe("StartScreen", () => {
  it("名前欄は毎回未入力(空文字)で始まる(前回入力・他プロフィール等からの持ち越しは無い)", () => {
    render(<StartScreen onStart={() => {}} />);

    for (const input of nameInputs()) {
      expect(input.value).toBe("");
    }
  });

  it("未入力のままゲーム開始すると、人間プレイヤーには「プレイヤーN」の既定名が使われる", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));

    expect(onStart).toHaveBeenCalledWith(["プレイヤー1", "プレイヤー2"], expect.any(Number), ["human", "human"]);
  });

  it("未入力のままCPUに切り替えてゲーム開始すると「CPU N」の既定名が使われる", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    // 2人目(index=1)をCPUへ切り替える。CPUボタンは各行に1つずつあるため2番目([1])が対象。
    fireEvent.click(screen.getAllByRole("button", { name: "CPU" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));

    expect(onStart).toHaveBeenCalledWith(["プレイヤー1", "CPU 2"], expect.any(Number), ["human", "cpu"]);
  });

  it("名前を入力すればその値がそのまま使われ、既定名にフォールバックしない", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    const [firstInput] = nameInputs();
    fireEvent.change(firstInput, { target: { value: "たろう" } });
    fireEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));

    expect(onStart).toHaveBeenCalledWith(["たろう", "プレイヤー2"], expect.any(Number), ["human", "human"]);
  });

  it("空白のみの入力は未入力扱いになり、既定名が使われる", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    const [firstInput] = nameInputs();
    fireEvent.change(firstInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "ゲーム開始" }));

    expect(onStart).toHaveBeenCalledWith(["プレイヤー1", "プレイヤー2"], expect.any(Number), ["human", "human"]);
  });

  it("placeholderは人間/CPU切り替えに追随する(人間=「プレイヤーN」、CPU=「CPU N」)", () => {
    render(<StartScreen onStart={() => {}} />);

    const [firstInput] = nameInputs();
    expect(firstInput.placeholder).toBe("プレイヤー1");

    fireEvent.click(screen.getAllByRole("button", { name: "CPU" })[0]);
    expect(firstInput.placeholder).toBe("CPU 1");

    fireEvent.click(screen.getAllByRole("button", { name: "人間" })[0]);
    expect(firstInput.placeholder).toBe("プレイヤー1");
  });
});
