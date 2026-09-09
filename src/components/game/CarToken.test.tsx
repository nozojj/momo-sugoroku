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

/** usePrefersReducedMotion()のためだけの最小スタブ(GameOverModal.test.tsx/
 *  FinalRaceSequence.test.tsxと同じもの)。既定はfalse(通常設定)。 */
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
stubMatchMedia(false);

afterEach(() => {
  cleanup();
  stubMatchMedia(false); // reduced-motionテストが上書きした場合に備え、既定値へ戻す
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

describe("CarToken: movementDurationMs(Polish Phase 3b「車移動の気持ちよさ」)", () => {
  it("movementDurationMs省略時は既存どおり420msのtransitionになる(既存の見た目を維持)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: transform 420ms cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("movementDurationMsを指定するとtransition durationがその値になる(可変テンポ)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: transform 270ms cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("movementDurationMsを指定してもinstant=trueが優先され、transitionはnoneのまま(瞬間移動を壊さない)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} instant movementDurationMs={270} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: none");
  });
});

describe("CarToken: landingSettle(Polish Phase 3c「着地→マス効果発生の気持ちよさ」)", () => {
  it("landingSettle省略時(既定false)はanimate-landing-settleが付かない(既存の見た目を維持)", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-landing-settle")).toBeNull();
  });

  it("landingSettle=trueのとき車体(位置transitionを持つ親<g>とは別要素)にanimate-landing-settleが付く", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} landingSettle />
      </svg>,
    );
    const settleEl = container.querySelector(".animate-landing-settle");
    expect(settleEl).not.toBeNull();
    // 位置transitionを持つ親<g>そのものには付かない(同一要素で複数transform系animationを
    // 重ねない、というCarToken.tsx既存のwrapper/inner分離方針を壊していないことの確認)。
    const rootG = container.querySelector("g");
    expect(rootG?.classList.contains("animate-landing-settle")).toBe(false);
    expect(rootG?.getAttribute("style")).not.toContain("landing-settle");
  });

  it("landingSettle=falseを明示してもanimate-landing-settleは付かない", () => {
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} landingSettle={false} />
      </svg>,
    );
    expect(container.querySelector(".animate-landing-settle")).toBeNull();
  });

  it("landingSettleとmovementDurationMs/instantは独立して共存できる(互いに干渉しない)", () => {
    const { container } = render(
      <svg>
        <CarToken
          x={0}
          y={0}
          color="#e6483e"
          label="🚗"
          offsetX={0}
          offsetY={0}
          isCurrentTurn={false}
          colorIndex={0}
          movementDurationMs={270}
          landingSettle
        />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: transform 270ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(container.querySelector(".animate-landing-settle")).not.toBeNull();
  });
});

describe("CarToken: curve lean(Polish Phase 3d「カーブ時の車体リアクション」)", () => {
  it("初回mount時・最初の移動(previous headingが無い)ではcurve leanが適用されない", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).toBeNull();

    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).toBeNull();
  });

  it("直進が続く間はcurve leanが適用されない", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={20} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).toBeNull();
  });

  it("方向転換した場合、curve lean(--curve-lean-degカスタムプロパティ付き)が適用される", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    const leanEl = container.querySelector(".animate-curve-lean");
    expect(leanEl).not.toBeNull();
    expect(leanEl?.getAttribute("style")).toContain("--curve-lean-deg");
  });

  it("movementDurationMsを指定すると、curve leanのanimation-durationがその値に同期する", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    const leanEl = container.querySelector(".animate-curve-lean");
    expect(leanEl?.getAttribute("style")).toContain("270ms");
  });

  it("instant=trueのときはcurve leanのクラスが付与されない(瞬間移動中に不自然な回転を見せない)", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} instant />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).toBeNull();
  });

  it("landingSettleとcurve leanは別要素として共存し、互いに競合しない", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} landingSettle />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).not.toBeNull();
    expect(container.querySelector(".animate-landing-settle")).not.toBeNull();
    // 同一要素が両方のクラスを持たない(1要素1transform animation責務を維持)
    expect(container.querySelector(".animate-curve-lean.animate-landing-settle")).toBeNull();
  });

  it("vehicleModeが変わってもcurve leanの発生自体は壊れない(x/yベースの計算に無関係)", () => {
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode="normal" />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode="expressLv2" />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} vehicleMode="expressLv2" />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).not.toBeNull();
  });
});

describe("CarToken: prefers-reduced-motion(通常移動アニメーションのreduced-motion対応)", () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  it("reduced-motion時は位置transitionがnoneになる(スライドせず即座に位置更新、instant相当の見た目)", () => {
    stubMatchMedia(true);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: none");
    // 位置(transform)自体は通常どおり反映される(情報は失われない、動きだけを削る)。
    expect(rootG?.getAttribute("style")).toContain("translate(0px, -22px)");
  });

  it("通常設定(reduced-motionオフ)では位置transitionが従来どおり付く(回帰確認)", () => {
    stubMatchMedia(false);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} movementDurationMs={270} />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: transform 270ms cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("reduced-motion時は方向転換してもcurve lean(animate-curve-lean)が付かない", () => {
    stubMatchMedia(true);
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).toBeNull();
  });

  it("通常設定(reduced-motionオフ)では方向転換でcurve leanが従来どおり付く(回帰確認)", () => {
    stubMatchMedia(false);
    const { container, rerender } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    rerender(
      <svg>
        <CarToken x={10} y={10} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} />
      </svg>,
    );
    expect(container.querySelector(".animate-curve-lean")).not.toBeNull();
  });

  it("reduced-motion時はlandingSettle=trueでもanimate-landing-settleが付かない", () => {
    stubMatchMedia(true);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} landingSettle />
      </svg>,
    );
    expect(container.querySelector(".animate-landing-settle")).toBeNull();
  });

  it("通常設定(reduced-motionオフ)ではlandingSettle=trueでanimate-landing-settleが従来どおり付く(回帰確認)", () => {
    stubMatchMedia(false);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} landingSettle />
      </svg>,
    );
    expect(container.querySelector(".animate-landing-settle")).not.toBeNull();
  });

  it("reduced-motion時でも手番リング(animate-ping-slow)・車体・ラベル等、情報を伝える表示自体は消えない(モーションだけを削る)", () => {
    stubMatchMedia(true);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn colorIndex={0} landingSettle />
      </svg>,
    );
    expect(container.querySelector("circle.animate-ping-slow")).not.toBeNull();
    expect(container.querySelector("image")).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("🚗");
  });

  it("reduced-motion時でもinstant=trueとの組み合わせで挙動が壊れない(どちらもtransition:noneになる)", () => {
    stubMatchMedia(true);
    const { container } = render(
      <svg>
        <CarToken x={0} y={0} color="#e6483e" label="🚗" offsetX={0} offsetY={0} isCurrentTurn={false} colorIndex={0} instant />
      </svg>,
    );
    const rootG = container.querySelector("g");
    expect(rootG?.getAttribute("style")).toContain("transition: none");
  });
});
