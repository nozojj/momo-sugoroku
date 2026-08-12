"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardDef, CardDrawInfo } from "@/types/game";
import type { CharacterAnnouncement } from "@/types/characterAnnouncer";
import { getCardDef, getDrawableCards } from "@/data/cards";
import { CARD_CATEGORY_BADGE_CLASS, CARD_CATEGORY_LABEL, RARITY_BADGE_CLASS, RARITY_LABEL, cardCategoryOf } from "@/lib/game/cardDisplay";
import { CharacterAnnouncer } from "./CharacterAnnouncer";

interface CardDrawModalProps {
  info: CardDrawInfo;
  onContinue: () => void;
}

/** rare/superRareのときだけ、ロレット確定後にnaviの一言コメントを挟む(ArrivalModal等と同じ
 *  CharacterAnnouncerアダプターパターン)。commonは現行どおりテンポ優先でこの演出を挟まない。 */
function buildDrawAnnouncement(def: CardDef): CharacterAnnouncement {
  const isSuperRare = def.rarity === "superRare";
  return {
    characterId: "navi",
    expression: isSuperRare ? "surprised" : "happy",
    enterDirection: "right",
    side: "right",
    animationType: "slide",
    theme: isSuperRare ? "celebratory" : "normal",
    lines: isSuperRare
      ? [
          { text: "おおっと、これは…!", expression: "surprised" },
          { text: `「${def.name}」だ! やったね!`, expression: "happy" },
        ]
      : [{ text: `「${def.name}」を手に入れた!`, expression: "happy" }],
  };
}

/** 演出タイミング(調整用定数)。MoneyRouletteModalと同じ考え方: 抽選ロジックには一切関与しない。
 *  カードマスも踏む頻度が高いため、タップ待ちにせず自動で進む。 */
const SPIN_DURATION_MS = 1000;
const SPIN_STEP_COUNT = 9;
const HOLD_DURATION_MS = 700;

function buildSpinIntervals(totalMs: number, steps: number): number[] {
  const weights = Array.from({ length: steps }, (_, i) => Math.pow((i + 1) / steps, 1.8));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(30, Math.round((w / weightSum) * totalMs)));
}

export function CardDrawModal({ info, onContinue }: CardDrawModalProps) {
  const resultDef = getCardDef(info.cardId);

  // 表示用の系列: 抽選対象カードをランダムな順で並べて数周させ、最後だけ確定カードにする。
  const sequence = useMemo(() => {
    const pool = getDrawableCards();
    const seq: CardDef[] = [];
    for (let i = 0; i < SPIN_STEP_COUNT; i++) {
      seq.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (resultDef) seq.push(resultDef);
    return seq;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const intervals = useMemo(() => buildSpinIntervals(SPIN_DURATION_MS, sequence.length - 1), [sequence.length]);

  const [step, setStep] = useState(0);
  const spinning = step < sequence.length - 1;
  const settled = !spinning;
  const shown = sequence[step];

  useEffect(() => {
    if (step >= sequence.length - 1) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), intervals[step]);
    return () => window.clearTimeout(timer);
  }, [step, sequence.length, intervals]);

  // rare/superRareのときだけ、確定表示のホールド後にnaviの一言(CharacterAnnouncer)を挟む。
  // commonは従来どおりHOLD_DURATION_MS後に即onContinue()する(頻繁に踏むマスなのでテンポ優先)。
  const [showAnnounce, setShowAnnounce] = useState(false);
  const firedRef = useRef(false);
  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      if (resultDef && resultDef.rarity !== "common") {
        setShowAnnounce(true);
      } else {
        onContinue();
      }
    }, HOLD_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [settled, onContinue, resultDef]);

  if (showAnnounce && resultDef) {
    return <CharacterAnnouncer announcement={buildDrawAnnouncement(resultDef)} onComplete={onContinue} />;
  }

  if (!shown) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-800">
        <p className="text-4xl">🃏</p>
        <h2 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">カードマス</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{info.playerName}さん</p>

        <div
          key={settled ? "settled" : "spinning"}
          className={`mt-5 rounded-xl border-2 px-4 py-5 ${settled ? "animate-arrival-pop" : ""} ${
            spinning
              ? "border-slate-200 dark:border-slate-600"
              : "border-fuchsia-400 dark:border-fuchsia-400"
          }`}
        >
          <p className={`text-4xl ${spinning ? "opacity-60" : ""}`}>{shown.icon}</p>
          <p
            className={`mt-2 text-xl font-black ${
              spinning ? "text-slate-400 dark:text-slate-500" : "text-fuchsia-600 dark:text-fuchsia-300"
            }`}
          >
            {shown.name}
          </p>

          {settled && (
            <>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${CARD_CATEGORY_BADGE_CLASS[cardCategoryOf(shown)]}`}
                >
                  {CARD_CATEGORY_LABEL[cardCategoryOf(shown)]}
                </span>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${RARITY_BADGE_CLASS[shown.rarity]}`}
                >
                  {RARITY_LABEL[shown.rarity]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{shown.description}</p>
            </>
          )}
        </div>

        {settled && (
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            「{shown.name}」を手に入れた!
          </p>
        )}
      </div>
    </div>
  );
}
