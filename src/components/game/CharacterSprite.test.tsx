// @vitest-environment jsdom
//
// CharacterSprite.tsx(Polish Phase P1 S-3f-1)の自動テスト。重点: characterId→
// CHARACTER_ASSET_URLSの解決が本番アセット追加後も期待通りであること、および未登録
// characterIdでは従来通り絵文字プレースホルダーへフォールバックすること(回帰確認)。
//
// このプロジェクトは@testing-library/jest-domを導入していないため、toBeInTheDocument()等の
// カスタムmatcherは使わず、素のDOMプロパティで直接検証する(AudioSettingsPanel.test.tsx等と
// 同じ方針)。CharacterSpriteの<img>はalt=""(装飾目的)のためaccessible role "img"を持たない
// (ブラウザ/testing-libraryはalt=""を提示用として扱う)ので、getByRoleではなく
// container.querySelector("img")で取得する。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CharacterSprite } from "./CharacterSprite";

afterEach(() => {
  cleanup();
});

describe("CharacterSprite: 本番アセット登録済みcharacterIdは<img>を描画する", () => {
  it("navi(既存登録、S-3f-1で変更していない)は従来通りhappy.webpを描画する", () => {
    const { container } = render(<CharacterSprite characterId="navi" expression="happy" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/characters/navi/happy.webp");
  });

  it("troubleChar(normal形態)はnormal.webpを描画する", () => {
    const { container } = render(<CharacterSprite characterId="troubleChar" expression="troubled" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/characters/troubleChar/normal.webp");
  });

  it("troubleChar_sake(sake形態)はsake.webpを描画する", () => {
    const { container } = render(<CharacterSprite characterId="troubleChar_sake" expression="troubled" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/characters/troubleChar/sake.webp");
  });

  it("troubleChar_seagullKing(seagullKing形態)はseagullKing.webpを描画する", () => {
    const { container } = render(<CharacterSprite characterId="troubleChar_seagullKing" expression="troubled" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/characters/troubleChar/seagullKing.webp");
  });

  it("troubleChar系は表情差分が無いため、どのexpressionで呼んでもdefault(同じ画像)へ解決される", () => {
    const { container } = render(<CharacterSprite characterId="troubleChar_seagullKing" expression="surprised" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/characters/troubleChar/seagullKing.webp");
  });
});

describe("CharacterSprite: 未登録characterIdは従来通り絵文字プレースホルダーへフォールバックする(回帰確認)", () => {
  it("CHARACTER_ASSET_URLSに存在しないcharacterIdは<img>を描画せず、expression別の絵文字を表示する", () => {
    const { container } = render(<CharacterSprite characterId="未登録キャラ" expression="troubled" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("😟")).not.toBeNull();
  });
});
