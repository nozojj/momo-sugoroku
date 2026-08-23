// @vitest-environment jsdom
//
// AudioSettingsPanel.tsx(Phase10/P10-3でSE、P11-3-1でBGMを追加)の自動テスト。
// useAudioSettingsStoreへ直接接続する自己完結コンポーネントなので、GameDrawerの他のprops
// を一切用意せず単体でrenderできる。
//
// このプロジェクトは@testing-library/jest-domを導入していないため、toBeInTheDocument()等の
// カスタムmatcherは使わず、素のDOMプロパティ(getAttribute/disabled等)をvitest標準のexpectで
// 直接検証する(他のテストファイルと同じ方針)。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAudioSettingsStore } from "@/store/audioSettingsStore";
import { AudioSettingsPanel } from "./AudioSettingsPanel";

// bgmVolumeはaudioSettingsStore.tsの正式採用デフォルト値(0.2)に合わせる。seVolumeの
// デフォルト(0.8)はP11-3-1では変更しない。
function resetStore(): void {
  useAudioSettingsStore.setState({ seEnabled: true, seVolume: 0.8, bgmEnabled: true, bgmVolume: 0.2 });
}

describe("AudioSettingsPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    resetStore();
  });

  describe("効果音(SE)", () => {
    it("初期状態(store既定値)でON側が押下状態、音量が80%表示になっている", () => {
      render(<AudioSettingsPanel />);

      const seOnButtons = screen.getAllByRole("button", { name: "ON" });
      const seOffButtons = screen.getAllByRole("button", { name: "OFF" });
      // SE/BGMそれぞれにON/OFFボタンがあるため、getAllByRoleで両方取得したうえで
      // 効果音側(先頭=SE)を対象にする。並び順はAudioSettingsPanel.tsxのJSX順(効果音→BGM)と一致。
      expect(seOnButtons[0].getAttribute("aria-pressed")).toBe("true");
      expect(seOffButtons[0].getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByText("80%")).not.toBeNull();
    });

    it("OFFボタンを押すとstoreのseEnabledがfalseになる", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[0]);

      expect(useAudioSettingsStore.getState().seEnabled).toBe(false);
      expect(screen.getAllByRole("button", { name: "OFF" })[0].getAttribute("aria-pressed")).toBe("true");
      expect(screen.getAllByRole("button", { name: "ON" })[0].getAttribute("aria-pressed")).toBe("false");
    });

    it("OFF→ONの順で押すとstoreのseEnabledがtrueに戻る", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[0]);
      fireEvent.click(screen.getAllByRole("button", { name: "ON" })[0]);

      expect(useAudioSettingsStore.getState().seEnabled).toBe(true);
    });

    it("スライダーを操作するとstoreのseVolumeが0-1へ変換されて反映される", () => {
      render(<AudioSettingsPanel />);
      const slider = screen.getByLabelText("音量", { selector: "#se-volume-range" });

      fireEvent.change(slider, { target: { value: "50" } });
      expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.5);
      expect(screen.getByText("50%")).not.toBeNull();
    });

    it("スライダーの境界値(0%・100%)も正しく反映される", () => {
      render(<AudioSettingsPanel />);
      const slider = screen.getByLabelText("音量", { selector: "#se-volume-range" });

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

      const slider = screen.getByLabelText("音量", { selector: "#se-volume-range" }) as HTMLInputElement;
      expect(slider.disabled).toBe(true);
    });

    it("0%とSE OFFは別状態: OFFにしてもseVolumeは0にならない", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[0]);

      expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.8); // 変化しない
      expect(screen.getByText("80%")).not.toBeNull(); // 表示もそのまま(0%にならない)
    });

    it("OFF→ONと切り替えても、音量(seVolume)の値は保持される(ミュート前の音量を保持)", () => {
      render(<AudioSettingsPanel />);
      const slider = screen.getByLabelText("音量", { selector: "#se-volume-range" });
      fireEvent.change(slider, { target: { value: "35" } });

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[0]);
      fireEvent.click(screen.getAllByRole("button", { name: "ON" })[0]);

      expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.35);
      expect(screen.getByText("35%")).not.toBeNull();
    });

    it("音量スライダーにアクセシブルネーム(ラベル関連付け)が存在する", () => {
      render(<AudioSettingsPanel />);

      const slider = screen.getByLabelText("音量", { selector: "#se-volume-range" });
      expect(slider.tagName).toBe("INPUT");
    });
  });

  describe("BGM(P11-3-1)", () => {
    it("初期状態(store既定値bgmVolume=0.2)でON側が押下状態、音量が20%表示・slider value=20になっている", () => {
      render(<AudioSettingsPanel />);

      const bgmOnButtons = screen.getAllByRole("button", { name: "ON" });
      const bgmOffButtons = screen.getAllByRole("button", { name: "OFF" });
      // 並び順はAudioSettingsPanel.tsxのJSX順(効果音→BGM)と一致するため、BGM側は2番目([1])。
      expect(bgmOnButtons[1].getAttribute("aria-pressed")).toBe("true");
      expect(bgmOffButtons[1].getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByText("20%")).not.toBeNull();

      const slider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" }) as HTMLInputElement;
      expect(slider.value).toBe("20");
    });

    it("BGM OFFボタンを押すとstoreのbgmEnabledがfalseになり、sliderがdisabledになる。bgmVolumeは変化しない", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[1]);

      expect(useAudioSettingsStore.getState().bgmEnabled).toBe(false);
      expect(useAudioSettingsStore.getState().bgmVolume).toBeCloseTo(0.2); // 変化しない
      const slider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" }) as HTMLInputElement;
      expect(slider.disabled).toBe(true);
    });

    it("BGM OFF→ONでbgmEnabledがtrueに戻り、sliderがenabledへ復帰する", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[1]);
      fireEvent.click(screen.getAllByRole("button", { name: "ON" })[1]);

      expect(useAudioSettingsStore.getState().bgmEnabled).toBe(true);
      const slider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" }) as HTMLInputElement;
      expect(slider.disabled).toBe(false);
    });

    it("BGMスライダーを操作するとstoreのbgmVolumeが0-1へ変換されて反映され、%表示も更新される", () => {
      render(<AudioSettingsPanel />);
      const slider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" });

      fireEvent.change(slider, { target: { value: "45" } });
      expect(useAudioSettingsStore.getState().bgmVolume).toBeCloseTo(0.45);
      expect(screen.getByText("45%")).not.toBeNull();
    });

    it("BGM OFF中もvolumeの値は保持され、再度ONにすると以前の値のまま復帰する", () => {
      render(<AudioSettingsPanel />);
      const slider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" });
      fireEvent.change(slider, { target: { value: "60" } });

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[1]);
      fireEvent.click(screen.getAllByRole("button", { name: "ON" })[1]);

      expect(useAudioSettingsStore.getState().bgmVolume).toBeCloseTo(0.6);
      expect(screen.getByText("60%")).not.toBeNull();
    });

    it("BGM用スライダーにアクセシブルネーム(ラベル関連付け)が存在し、SE側と個別に取得できる", () => {
      render(<AudioSettingsPanel />);

      const bgmSlider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" });
      const seSlider = screen.getByLabelText("音量", { selector: "#se-volume-range" });
      expect(bgmSlider.tagName).toBe("INPUT");
      expect(bgmSlider).not.toBe(seSlider);
    });
  });

  describe("SE/BGMの独立性", () => {
    it("BGM OFFにしてもseEnabledは変化しない", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[1]); // BGM側

      expect(useAudioSettingsStore.getState().seEnabled).toBe(true);
    });

    it("SE OFFにしてもbgmEnabledは変化しない", () => {
      render(<AudioSettingsPanel />);

      fireEvent.click(screen.getAllByRole("button", { name: "OFF" })[0]); // SE側

      expect(useAudioSettingsStore.getState().bgmEnabled).toBe(true);
    });

    it("BGMスライダーを変更してもseVolumeは変化しない", () => {
      render(<AudioSettingsPanel />);
      const bgmSlider = screen.getByLabelText("音量", { selector: "#bgm-volume-range" });

      fireEvent.change(bgmSlider, { target: { value: "70" } });

      expect(useAudioSettingsStore.getState().seVolume).toBeCloseTo(0.8);
    });

    it("SEスライダーを変更してもbgmVolumeは変化しない", () => {
      render(<AudioSettingsPanel />);
      const seSlider = screen.getByLabelText("音量", { selector: "#se-volume-range" });

      fireEvent.change(seSlider, { target: { value: "10" } });

      expect(useAudioSettingsStore.getState().bgmVolume).toBeCloseTo(0.2);
    });
  });
});
