"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getPropertyDef } from "@/data/properties";
import { getNode } from "@/lib/game/mapGraph";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { PlayerHud } from "./PlayerHud";
import { PurchaseModal } from "./PurchaseModal";
import { GameOverModal } from "./GameOverModal";
import { EventLog } from "./EventLog";
import { StartScreen } from "./StartScreen";
import { formatMoney } from "@/lib/format";

const STEP_ANIMATION_MS = 460;

export function GameScreen() {
  const status = useGameStore((s) => s.status);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const mapId = useGameStore((s) => s.mapId);
  const turn = useGameStore((s) => s.turn);
  const totalTurns = useGameStore((s) => s.totalTurns);
  const destinationNodeId = useGameStore((s) => s.destinationNodeId);
  const diceResult = useGameStore((s) => s.diceResult);
  const remainingMoves = useGameStore((s) => s.remainingMoves);
  const pendingDoubleMove = useGameStore((s) => s.pendingDoubleMove);
  const routeOptions = useGameStore((s) => s.routeOptions);
  const pendingPropertyId = useGameStore((s) => s.pendingPropertyId);
  const log = useGameStore((s) => s.log);
  const winnerIds = useGameStore((s) => s.winnerIds);

  const startGame = useGameStore((s) => s.startGame);
  const resetGame = useGameStore((s) => s.resetGame);
  const rollDice = useGameStore((s) => s.rollDice);
  const advanceStep = useGameStore((s) => s.advanceStep);
  const chooseRoute = useGameStore((s) => s.chooseRoute);
  const buyProperty = useGameStore((s) => s.buyProperty);
  const skipProperty = useGameStore((s) => s.skipProperty);
  const useCard = useGameStore((s) => s.useCard);

  const currentPlayer = players[currentPlayerIndex];

  // マス移動を1歩ずつアニメーションしながら自動で進める
  useEffect(() => {
    if (status !== "moving") return;
    const timer = window.setTimeout(() => {
      advanceStep();
    }, STEP_ANIMATION_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remainingMoves, currentPlayer?.currentNodeId]);

  if (status === "waiting") {
    return <StartScreen onStart={(names) => startGame(names)} />;
  }

  const map = getMap(mapId);
  const destinationNode = getNode(map, destinationNodeId);
  const pendingProperty = pendingPropertyId ? getPropertyDef(pendingPropertyId) : undefined;

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-white">湘南すごろく</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {turn}/{totalTurns}ターン ・ 目的地: 🎯 {destinationNode.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("ゲームを終了して最初からやり直しますか?")) resetGame();
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-600 dark:text-slate-300"
        >
          リセット
        </button>
      </header>

      <Board
        map={map}
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        destinationNodeId={destinationNodeId}
        routeOptions={routeOptions}
        onSelectRoute={chooseRoute}
      />

      {status === "selectingRoute" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
          <p className="mb-2 text-sm font-bold text-amber-700 dark:text-amber-300">
            分岐点です。進む道を選んでください(地図をタップしてもOK)
          </p>
          <div className="flex flex-wrap gap-2">
            {routeOptions.map((opt) => (
              <button
                key={opt.nodeId}
                type="button"
                onClick={() => chooseRoute(opt.nodeId)}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-white shadow-sm active:scale-95"
              >
                {opt.nodeName} へ
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {players.map((player, i) => (
          <PlayerHud
            key={player.id}
            player={player}
            isActive={i === currentPlayerIndex}
            canUseCard={i === currentPlayerIndex && status === "rolling" && diceResult === null}
            onUseCard={useCard}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 rounded-xl border border-black/10 bg-white/60 p-3 dark:bg-slate-800/50">
        <Dice
          diceResult={status === "moving" ? diceResult : null}
          canRoll={status === "rolling" && diceResult === null}
          doubleArmed={pendingDoubleMove}
          onRoll={rollDice}
        />
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="font-bold">{currentPlayer?.name}さんの番</p>
          {status === "moving" && remainingMoves > 0 && <p>残り {remainingMoves} マス</p>}
          <p className="mt-1 text-xs text-slate-400">目的地ボーナス +{formatMoney(300)}</p>
        </div>
      </div>

      <EventLog log={log} />

      {status === "purchaseOffer" && pendingProperty && currentPlayer && (
        <PurchaseModal property={pendingProperty} player={currentPlayer} onBuy={buyProperty} onSkip={skipProperty} />
      )}

      {status === "finished" && winnerIds && (
        <GameOverModal players={players} winnerIds={winnerIds} onRestart={resetGame} />
      )}
    </div>
  );
}
