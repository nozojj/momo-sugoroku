// @vitest-environment jsdom
//
// CarToken.tsx(Polish Phase P1「normal車コマ本番アセット導入」)の自動テスト。重点:
// colorIndexからnormalモードの本番webp画像(prod asset)が正しく解決されること、
// express系は今回本番画像化しないため常にSVGプレースホルダーへ安全にフォールバックすること、
// 既存の位置transform/current turn ring/変身flash/labelの挙動を壊していないこと(回帰確認)。
// CharacterSprite.test.tsxと同じ方針で、jest-dom未導入のため素のDOMプロパティで検証する。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CarToken } from "./CarToken";

afterEach(() => {
  cleanup();
});

describe("CarToken: normalモードはcolorIndexに応じた本番webp画像を描画する", () => {
  it("colorIndex 0(赤)はnormal-red.webpの<image>を描画する", () => {
    const { container } = render(
      <svg>
        <CarToken x={10} y={20} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const image = container.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/vehicles/normal-red.webp");
  });

  it("colorIndex 1(青)はnormal-blue.webpの<image>を描画する", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#2e86de" label="🚙" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={1} />
      </svg>,
    );
    const image = container.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/vehicles/normal-blue.webp");
  });

  it("colorIndex 2(緑)はnormal-green.webpの<image>を描画する", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#2fa84f" label="🚕" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={2} />
      </svg>,
    );
    const image = container.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/vehicles/normal-green.webp");
  });

  it("colorIndex 3(紫)はnormal-purple.webpの<image>を描画する", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#8b5cf6" label="🚓" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={3} />
      </svg>,
    );
    const image = container.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/vehicles/normal-purple.webp");
  });

  it("本番画像を描画する場合、手続き的SVGプレースホルダー(車体rect)は描画されない", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    // 車体本体のプレースホルダーはwidth=22のrect(CarToken.tsx参照)。手番リング(strokeのみの
    // circle)等は別要素なので、幅22のボディ矩形が存在しないことだけを確認する。
    const bodyRect = container.querySelector('rect[width="22"]');
    expect(bodyRect).toBeNull();
  });

  it("画像は26x26で描画され、縦横比を歪ませない(元画像512x512=1:1の正方形をそのまま維持)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const image = container.querySelector("image");
    expect(image?.getAttribute("width")).toBe("26");
    expect(image?.getAttribute("height")).toBe("26");
  });
});

describe("CarToken: express系(vehicleMode!=='normal')は今回本番画像化しないため、常にSVGプレースホルダーへ安全にフォールバックする", () => {
  it("expressLv1〜4は本番normal画像を誤って使わず、<image>を描画しない", () => {
    const modes = ["expressLv1", "expressLv2", "expressLv3", "expressLv4"] as const;
    for (const mode of modes) {
      const { container, unmount } = render(
        <svg>
          <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode={mode} />
        </svg>,
      );
      expect(container.querySelector("image"), `${mode}で<image>が描画されてしまっている`).toBeNull();
      unmount();
    }
  });

  it("expressLv2(scale=1.12、spoiler=true)は従来通りスポイラー付きプレースホルダーを描画する(回帰確認)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode="expressLv2" />
      </svg>,
    );
    const bodyRect = container.querySelector('rect[width="22"]');
    expect(bodyRect).not.toBeNull();
    expect(bodyRect?.getAttribute("stroke")).toBe("#f59e0b");
    // スポイラー(幅2.5のrect)が存在すること
    const spoiler = container.querySelector('rect[width="2.5"]');
    expect(spoiler).not.toBeNull();
  });
});

describe("CarToken: 既存の位置transform/current turn ring/変身flash/labelを壊していない(回帰確認)", () => {
  it("親<g>のtransformにx/y/offsetX/offsetYが反映される", () => {
    const { container } = render(
      <svg>
        <CarToken x={100} y={50} color="#e6483e" label="🚗" offsetX={5} offsetY={-5} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("translate(105px, 23px)");
  });

  it("instant=trueのときtransitionがnoneになる(瞬間移動用、回帰確認)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} instant />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: none");
  });

  it("isCurrentTurn=trueのとき手番リング(animate-ping-slow)が描画される", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector("circle.animate-ping-slow")).not.toBeNull();
  });

  it("vehicleModeがnormal以外のとき変身flashリング(animate-vehicle-transform-flash)が描画される(画像描画時も維持)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode="expressLv1" />
      </svg>,
    );
    expect(container.querySelector("circle.animate-vehicle-transform-flash")).not.toBeNull();
  });

  it("normalモード(本番画像描画時)は変身flashリングを描画しない(従来通り)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector("circle.animate-vehicle-transform-flash")).toBeNull();
  });

  it("carIcon(label)は本番画像描画時も従来通りtextとして表示される", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector("text")?.textContent).toBe("🚗");
  });

  it("車体を包む<g>のdrop-shadow filterは本番画像描画時も従来通り適用される", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const shadowedG = Array.from(container.querySelectorAll("g")).find((g) =>
      g.getAttribute("style")?.includes("drop-shadow"),
    );
    expect(shadowedG).not.toBeUndefined();
    expect(shadowedG?.querySelector("image")).not.toBeNull();
  });
});
