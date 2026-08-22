// @vitest-environment jsdom
//
// AudioSettingsPanel.tsx(Phase10/P10-3)の自動テスト。useAudioSettingsStoreへ直接接続する
// 自己完結コンポーネントなので、GameDrawerの他のpropsを一切用意せず単体でrenderできる。
//
// このプロジェクトは@testing-library/jest-domを導入していないため、toBeInTheDocument()等の
// カスタムmatcherは使わず、素のDOMプロパティ(getAttribute/disabled等)をvitest標準のexpectで
// 直接検証する(他のテストファイルと同じ方針)。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";
import { AudioSettingsPanel } from "./AudioSettingsPanel";

function resetStore(): void {
  useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.5 });
}

describe("AudioSettingsPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    resetStore();
  });

  it("初期状態(store既定値)でON側が押下状態、音量が80%表示になっている", () => {
    render(<AudioSettingsPanel />);

    expect(screen.getByRole("button", { name: "ON" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "OFF" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("80%")).not.toBeNull();
  });

  it("OFFボタンを押すとstoreのseEnabledがfalseになる", () => {
    render(<AudioSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "OFF" }));

    expect(useAudioSettingsStore.getState().seEnabled).toBe(false);
    expect(screen.getByRole("button", { name: "OFF" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "ON" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("OFF→ONの順で押すとstoreのseEnabledがtrueに戻る", () => {
    render(<AudioSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "OFF" }));
    fireEvent.click(screen.getByRole("button", { name: "ON" }));

    expect(useAudioSettingsStore.getState().seEnabled).toBe(true);
  });

  it("スライダーを操作するとstoreのseVolumeが0-1へ変換されて反映される", () => {
    render(<AudioSettingsPanel />);
    const slider = screen.getByRole("slider", { name: "音量" });

    fireEvent.change(slider, { target: { value: "50" } });
    expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.5);
    expect(screen.getByText("50%")).not.toBeNull();
  });

  it("スライダーの境界値(0%・100%)も正しく反映される", () => {
    render(<AudioSettingsPanel />);
    const slider = screen.getByRole("slider", { name: "音量" });

    fireEvent.change(slider, { target: { value: "0" } });
    expect(useAudioSettingsStore.getState().seVolume).toBe(0);
    expect(screen.getByText("0%")).not.toBeNull();

    fireEvent.change(slider, { target: { value: "100" } });
    expect(useAudioSettingsStore.getState().seVolume).toBe(1);
    expect(screen.getByText("100%")).not.toBeNull();
  });

  it("seEnabled:falseのとき、スライダーはdisabledになる", () => {
    useAudioSettingsStore.setState({ seEnabled: false });
    render(<AudioSettingsPanel />);

    const slider = screen.getByRole("slider", { name: "音量" }) as HTMLInputElement;
    expect(slider.disabled).toBe(true);
  });

  it("0%とSE OFFは別状態: OFFにしてもseVolumeは0にならない", () => {
    render(<AudioSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "OFF" }));

    expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.8); // 変化しない
    expect(screen.getByText("80%")).not.toBeNull(); // 表示もそのまま(0%にならない)
  });

  it("OFF→ONと切り替えても、音量(seVolume)の値は保持される(ミュート前の音量を保持)", () => {
    render(<AudioSettingsPanel />);
    const slider = screen.getByRole("slider", { name: "音量" });
    fireEvent.change(slider, { target: { value: "35" } });

    fireEvent.click(screen.getByRole("button", { name: "OFF" }));
    fireEvent.click(screen.getByRole("button", { name: "ON" }));

    expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.35);
    expect(screen.getByText("35%")).not.toBeNull();
  });

  it("音量スライダーにアクセシブルネーム(ラベル関連付け)が存在する", () => {
    render(<AudioSettingsPanel />);

    // getByRole("slider", { name: ... })自体がアクセシブルネームでの照合であり、
    // 見つかること自体が「label要素と関連付けられている(htmlFor/id一致)」ことの証明になる
    // (アクセシブルネームが無ければこのクエリ自体が要素を見つけられず例外を投げる)。
    const slider = screen.getByRole("slider", { name: "音量" });
    expect(slider.tagName).toBe("INPUT");

    // getByLabelTextでも同じ要素が引けること(label[for]による関連付けを別角度からも確認)。
    expect(screen.getByLabelText("音量")).toBe(slider);
  });
});
