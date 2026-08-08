"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getPropertyDef } from "@/data/properties";
import { getNode, shortestDistance } from "@/lib/game/mapGraph";
import { getCalendar, MONTHS_PER_YEAR } from "@/lib/game/engine";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { GameHud } from "./GameHud";
import { GameDrawer } from "./GameDrawer";
import { RouteChoiceOverlay } from "./RouteChoiceOverlay";
import { PurchaseModal } from "./PurchaseModal";
import { ArrivalModal } from "./ArrivalModal";
import { MoneyRouletteModal } from "./MoneyRouletteModal";
import { CardDrawModal } from "./CardDrawModal";
import { CardOverflowModal } from "./CardOverflowModal";
import { GameOverModal } from "./GameOverModal";
import { StartScreen } from "./StartScreen";

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
  const arrivalInfo = useGameStore((s) => s.arrivalInfo);
  const moneyRouletteInfo = useGameStore((s) => s.moneyRouletteInfo);
  const cardDrawInfo = useGameStore((s) => s.cardDrawInfo);
  const cardOverflowInfo = useGameStore((s) => s.cardOverflowInfo);
  const log = useGameStore((s) => s.log);
  const winnerIds = useGameStore((s) => s.winnerIds);

  const startGame = useGameStore((s) => s.startGame);
  const resetGame = useGameStore((s) => s.resetGame);
  const rollDice = useGameStore((s) => s.rollDice);
  const advanceStep = useGameStore((s) => s.advanceStep);
  const chooseRoute = useGameStore((s) => s.chooseRoute);
  const stepBack = useGameStore((s) => s.stepBack);
  const buyProperty = useGameStore((s) => s.buyProperty);
  const skipProperty = useGameStore((s) => s.skipProperty);
  const useCard = useGameStore((s) => s.useCard);
  const continueAfterArrival = useGameStore((s) => s.continueAfterArrival);
  const continueAfterMoneyRoulette = useGameStore((s) => s.continueAfterMoneyRoulette);
  const continueAfterCardDraw = useGameStore((s) => s.continueAfterCardDraw);
  const resolveCardOverflow = useGameStore((s) => s.resolveCardOverflow);

  const [drawerOpen, setDrawerOpen] = useState(false);

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
    return <StartScreen onStart={(names, totalYears) => startGame(names, totalYears)} />;
  }

  const map = getMap(mapId);
  const destinationNode = getNode(map, destinationNodeId);
  const pendingProperty = pendingPropertyId ? getPropertyDef(pendingPropertyId) : undefined;
  const calendar = getCalendar(turn);
  const totalYears = Math.round(totalTurns / MONTHS_PER_YEAR);
  const distanceToDestination =
    currentPlayer && (status === "moving" || status === "selectingRoute")
      ? shortestDistance(map, currentPlayer.currentNodeId, destinationNodeId, currentPlayer.cardIds)
      : null;
  const backNodeId =
    currentPlayer && currentPlayer.moveHistory.length >= 2
      ? currentPlayer.moveHistory[currentPlayer.moveHistory.length - 2]
      : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div className="absolute inset-0">
        <Board
          map={map}
          players={players}
          currentPlayerIndex={currentPlayerIndex}
          destinationNodeId={destinationNodeId}
          routeOptions={routeOptions}
          onSelectRoute={chooseRoute}
          status={status}
        />
      </div>

      <GameHud
        currentPlayerName={currentPlayer?.name ?? ""}
        currentPlayerColor={currentPlayer?.color ?? "#94a3b8"}
        destinationName={destinationNode.name}
        calendarText={`${calendar.year}年目 ${calendar.month}月`}
        onOpenDrawer={() => setDrawerOpen(true)}
        movementInfo={
          status === "moving" || status === "selectingRoute"
            ? { remainingMoves, distanceToDestination }
            : undefined
        }
      />

      {status === "selectingRoute" && currentPlayer && (
        <RouteChoiceOverlay
          map={map}
          currentNodeId={currentPlayer.currentNodeId}
          routeOptions={routeOptions}
          destinationNodeId={destinationNodeId}
          ownedCardIds={currentPlayer.cardIds}
          onSelectRoute={chooseRoute}
          backNodeId={backNodeId}
          remainingMovesAfterBack={remainingMoves + 1}
          onStepBack={stepBack}
        />
      )}

      <div className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 sm:bottom-6">
        <Dice
          diceResult={status === "moving" ? diceResult : null}
          canRoll={status === "rolling" && diceResult === null}
          doubleArmed={pendingDoubleMove}
          onRoll={rollDice}
        />
        {status === "moving" && remainingMoves > 0 && (
          <p className="mt-1 text-center text-xs font-bold text-slate-600 drop-shadow-sm dark:text-slate-300">
            残り {remainingMoves} マス
          </p>
        )}
        {status === "moving" && backNodeId && (
          <button
            type="button"
            onClick={stepBack}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-full border border-slate-400 bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm active:scale-95 dark:border-slate-500 dark:bg-slate-800/90 dark:text-slate-200"
          >
            ← 戻る(残り{remainingMoves + 1}マスに戻る)
          </button>
        )}
      </div>

      <GameDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        status={status}
        diceResult={diceResult}
        onUseCard={useCard}
        destinationName={destinationNode.name}
        year={calendar.year}
        month={calendar.month}
        totalYears={totalYears}
        turn={turn}
        totalTurns={totalTurns}
        log={log}
        onReset={() => {
          if (window.confirm("ゲームを終了して最初からやり直しますか?")) resetGame();
        }}
      />

      {status === "purchaseOffer" && pendingProperty && currentPlayer && (
        <PurchaseModal property={pendingProperty} player={currentPlayer} onBuy={buyProperty} onSkip={skipProperty} />
      )}

      {status === "destinationArrived" && arrivalInfo && (
        <ArrivalModal arrivalInfo={arrivalInfo} onContinue={continueAfterArrival} />
      )}

      {status === "moneyRoulette" && moneyRouletteInfo && (
        <MoneyRouletteModal info={moneyRouletteInfo} onContinue={continueAfterMoneyRoulette} />
      )}

      {status === "cardDraw" && cardDrawInfo && (
        <CardDrawModal info={cardDrawInfo} onContinue={continueAfterCardDraw} />
      )}

      {status === "cardOverflow" && cardOverflowInfo && (
        <CardOverflowModal
          info={cardOverflowInfo}
          onDiscardExisting={(index) => resolveCardOverflow({ discard: "existing", index })}
          onKeepCurrentHand={() => resolveCardOverflow({ discard: "newCard" })}
        />
      )}

      {status === "finished" && winnerIds && (
        <GameOverModal players={players} winnerIds={winnerIds} totalYears={totalYears} onRestart={resetGame} />
      )}
    </div>
  );
}
