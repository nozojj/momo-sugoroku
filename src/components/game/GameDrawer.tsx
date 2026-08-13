"use client";

import { useState } from "react";
import type { GameStatus, LogEntry, Player } from "@/types/game";
import { getCardDef } from "@/data/cards";
import { getPropertyDef, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { ownershipTier } from "@/lib/game/propertyOwnership";
import { calculateAnnualRevenue } from "@/lib/game/propertyRevenue";
import { propertyGenreOf } from "@/lib/game/propertyDisplay";
import { getYearEventDef, yearEventGenreMultiplier } from "@/lib/game/yearEvent";
import { PlayerHud } from "./PlayerHud";
import { EventLog } from "./EventLog";
import { CardDetailSheet } from "./CardDetailSheet";
import { PropertyDetailSheet } from "./PropertyDetailSheet";

interface GameDrawerProps {
  open: boolean;
  onClose: () => void;
  players: Player[];
  currentPlayerIndex: number;
  status: GameStatus;
  diceResult: number | null;
  onUseCard: (cardId: string) => void;
  destinationName: string;
  year: number;
  month: number;
  totalYears: number;
  turn: number;
  totalTurns: number;
  /** 現在の年度イベント(「今年の湘南」)id。物件詳細の想定年間収益に反映する。 */
  currentYearEventId?: string;
  log: LogEntry[];
  onReset: () => void;
}

const labelCls = "text-xs font-bold text-slate-400 dark:text-slate-500";

function formatRemaining(turn: number, totalTurns: number): string {
  const remainingMonths = Math.max(0, totalTurns - turn + 1);
  const years = Math.floor(remainingMonths / 12);
  const months = remainingMonths % 12;
  if (years === 0) return `残り${months}ヶ月`;
  if (months === 0) return `残り${years}年`;
  return `残り${years}年${months}ヶ月`;
}

export function GameDrawer({
  open,
  onClose,
  players,
  currentPlayerIndex,
  status,
  diceResult,
  onUseCard,
  destinationName,
  year,
  month,
  totalYears,
  turn,
  totalTurns,
  currentYearEventId,
  log,
  onReset,
}: GameDrawerProps) {
  // カード/物件の詳細シートの開閉は、手番や所持状態を一切変えないローカルなUI状態なので、
  // GameStatusには乗せずここで管理する(見て閉じるだけならセーブ/ロードに影響させる必要が無い)。
  const [inspecting, setInspecting] = useState<{ playerId: string; cardId: string } | null>(null);
  const [inspectingProperty, setInspectingProperty] = useState<{ playerId: string; propertyId: string } | null>(null);

  function handleClose() {
    onClose();
    setInspecting(null);
    setInspectingProperty(null);
  }

  const inspectingDef = inspecting ? getCardDef(inspecting.cardId) : null;
  const inspectingPlayerIndex = inspecting ? players.findIndex((p) => p.id === inspecting.playerId) : -1;
  const inspectingUsable =
    inspectingDef?.kind === "usable" &&
    inspectingPlayerIndex === currentPlayerIndex &&
    status === "rolling" &&
    diceResult === null;

  // 物件詳細: 年間収益はここでも計算し直さず、既存のownershipTier()/calculateAnnualRevenue()
  // (決算で使っているものと同一の関数)を呼んで表示するだけ。所有権・収益は一切変更しない。
  const inspectingPropertyDef = inspectingProperty ? getPropertyDef(inspectingProperty.propertyId) : null;
  const inspectingPropertyGroup = inspectingPropertyDef ? getPropertyGroupDef(inspectingPropertyDef.groupId) : undefined;
  const inspectingPropertyTier =
    inspectingProperty && inspectingPropertyDef
      ? ownershipTier(inspectingPropertyDef, inspectingProperty.playerId, players, propertyDefs, propertyGroupDefs)
      : "normal";
  const currentYearEvent = getYearEventDef(currentYearEventId);
  const inspectingPropertyRevenue = inspectingPropertyDef
    ? calculateAnnualRevenue(
        inspectingPropertyDef,
        inspectingPropertyTier,
        yearEventGenreMultiplier(currentYearEvent, propertyGenreOf(inspectingPropertyDef)),
      )
    : 0;

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-y-0 right-0 z-40 flex w-[85vw] max-w-sm flex-col gap-4 overflow-y-auto bg-slate-50 p-4 shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="メニュー"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-800 dark:text-white">メニュー</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <section className="rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-slate-800/60">
          <p className={labelCls}>現在の目的地</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white">🎯 {destinationName}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {year}年目 {month}月(全{totalYears}年)
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{formatRemaining(turn, totalTurns)}</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className={labelCls}>プレイヤー</p>
          <div className="flex flex-col gap-2">
            {players.map((player, i) => (
              <PlayerHud
                key={player.id}
                player={player}
                isActive={i === currentPlayerIndex}
                canUseCard={i === currentPlayerIndex && status === "rolling" && diceResult === null}
                onInspectCard={(cardId) => setInspecting({ playerId: player.id, cardId })}
                onInspectProperty={(propertyId) => setInspectingProperty({ playerId: player.id, propertyId })}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-1 flex-col gap-2">
          <p className={labelCls}>ゲームログ</p>
          <EventLog log={log} />
        </section>

        <section className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          <p className={labelCls}>設定</p>
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 dark:border-slate-600 dark:text-slate-300"
          >
            ゲームをリセット
          </button>
        </section>
      </div>

      {inspecting && inspectingDef && (
        <CardDetailSheet
          def={inspectingDef}
          usable={inspectingUsable}
          onUse={() => {
            onUseCard(inspecting.cardId);
            setInspecting(null);
          }}
          onClose={() => setInspecting(null)}
        />
      )}

      {inspectingProperty && inspectingPropertyDef && (
        <PropertyDetailSheet
          def={inspectingPropertyDef}
          group={inspectingPropertyGroup}
          annualRevenue={inspectingPropertyRevenue}
          isMonopoly={inspectingPropertyTier !== "normal"}
          onClose={() => setInspectingProperty(null)}
        />
      )}
    </>
  );
}
