// vehicleStyle.ts(Polish Phase P1「normal車コマ本番アセット導入」)の自動テスト。重点:
// resolveVehicleAssetUrl()がnormalモードでcolorIndex(PLAYER_COLORSと同じ順序=赤/青/緑/紫)
// から正しい画像URLを解決すること、express系は今回本番画像化しないため常にundefined
// (=CarToken側でSVGプレースホルダーへ安全にフォールバックする)ことを確認する。
import { describe, expect, it } from "vitest";
import { VEHICLE_ASSET_URLS, VEHICLE_PLACEHOLDER_STYLE, resolveVehicleAssetUrl } from "@/lib/game/vehicleStyle";

describe("resolveVehicleAssetUrl(): normalモードはcolorIndexからプレイヤーカラー別の本番画像を解決する", () => {
  it("colorIndex 0(赤)はnormal-red.webpを返す", () => {
    expect(resolveVehicleAssetUrl("normal", 0)).toBe("/vehicles/normal-red.webp");
  });

  it("colorIndex 1(青)はnormal-blue.webpを返す", () => {
    expect(resolveVehicleAssetUrl("normal", 1)).toBe("/vehicles/normal-blue.webp");
  });

  it("colorIndex 2(緑)はnormal-green.webpを返す", () => {
    expect(resolveVehicleAssetUrl("normal", 2)).toBe("/vehicles/normal-green.webp");
  });

  it("colorIndex 3(紫)はnormal-purple.webpを返す", () => {
    expect(resolveVehicleAssetUrl("normal", 3)).toBe("/vehicles/normal-purple.webp");
  });
});

describe("resolveVehicleAssetUrl(): express系は今回本番画像化しないため、常にプレースホルダーへ安全にフォールバックする", () => {
  it("expressLv1〜4はどのcolorIndexでもundefined(=normalの本番画像を誤って使わない)", () => {
    const modes = ["expressLv1", "expressLv2", "expressLv3", "expressLv4"] as const;
    for (const mode of modes) {
      for (const colorIndex of [0, 1, 2, 3]) {
        expect(resolveVehicleAssetUrl(mode, colorIndex)).toBeUndefined();
      }
    }
  });

  it("VEHICLE_ASSET_URLSは引き続き空のまま(express系の本番導入時に1行足すだけでよい設計を維持)", () => {
    expect(VEHICLE_ASSET_URLS).toEqual({});
  });
});

describe("resolveVehicleAssetUrl(): 想定外のcolorIndexでも例外にならず安全にフォールバックする", () => {
  it("範囲外のcolorIndex(4以上)はundefinedを返す(配列の範囲外アクセス)", () => {
    expect(resolveVehicleAssetUrl("normal", 4)).toBeUndefined();
  });
});

describe("VEHICLE_PLACEHOLDER_STYLE: 本番画像導入後もexpress系のscale/accent/spoiler定義は変更していない(回帰確認)", () => {
  it("normal/expressLv1〜4のプレースホルダー定義は既存の5モード分すべて残っている", () => {
    expect(Object.keys(VEHICLE_PLACEHOLDER_STYLE).sort()).toEqual(
      ["expressLv1", "expressLv2", "expressLv3", "expressLv4", "normal"].sort(),
    );
  });

  it("normalのプレースホルダー定義(scale/accent/spoiler)は変更していない", () => {
    expect(VEHICLE_PLACEHOLDER_STYLE.normal).toEqual({ scale: 1, accent: "#1f2937", spoiler: false });
  });
});
