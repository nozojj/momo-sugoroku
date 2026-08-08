"use client";

import type { CharacterExpression } from "@/types/characterAnnouncer";
import { CHARACTER_PLACEHOLDER_STYLE, CHARACTER_ASSET_URLS } from "@/lib/game/characterStyle";

interface CharacterSpriteProps {
  characterId: string;
  expression: CharacterExpression;
  className?: string;
}

/**
 * キャラクターの見た目だけを描画する純粋コンポーネント(BuildingSprite.tsxと同じ役割分担)。
 * characterId+expressionに対応する画像URLがCHARACTER_ASSET_URLSに登録されれば、
 * プレースホルダー絵文字の代わりに自動的に<img>へ差し替わる。
 */
export function CharacterSprite({ characterId, expression, className }: CharacterSpriteProps) {
  const assetUrl = CHARACTER_ASSET_URLS[characterId]?.[expression];
  const placeholder = CHARACTER_PLACEHOLDER_STYLE[expression];

  if (assetUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={assetUrl} alt="" className={className} />;
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full border-4 border-white shadow-lg dark:border-slate-700 ${className ?? ""}`}
      style={{ backgroundColor: placeholder.bg }}
    >
      <span className="text-5xl sm:text-6xl">{placeholder.emoji}</span>
    </div>
  );
}
