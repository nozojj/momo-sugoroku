"use client";

import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { useHasHydrated } from "@/store/useHasHydrated";
import { getMap } from "@/data/maps";
import { getNode, shortestDistance, destinationCandidateNodes } from "@/lib/game/mapGraph";
import { getCalendar, MONTHS_PER_YEAR, rankPlayers } from "@/lib/game/engine";
import { getYearEventDef } from "@/lib/game/yearEvent";
import { Board } from "./Board";
import { Dice } from "./Dice";
import { GameHud } from "./GameHud";
import { GameDrawer } from "./GameDrawer";
import { RouteChoiceOverlay } from "./RouteChoiceOverlay";
import { PurchaseModal } from "./PurchaseModal";
import { DestinationCelebrationScreen } from "./DestinationCelebrationScreen";
import { WarpAnnounceModal } from "./WarpAnnounceModal";
import { TargetSelectOverlay } from "./TargetSelectOverlay";
import { MoneyRouletteModal } from "./MoneyRouletteModal";
import { CardDrawModal } from "./CardDrawModal";
import { CardOverflowModal } from "./CardOverflowModal";
import { SettlementIntroAnnouncer } from "./SettlementIntroAnnouncer";
import { SettlementScreen } from "./SettlementScreen";
import { MonopolyToast } from "./MonopolyToast";
import { LandingResultToast } from "./LandingResultToast";
import { SkipTurnToast } from "./SkipTurnToast";
import { MonopolyAnnounceModal } from "./MonopolyAnnounceModal";
import { YearEventAnnounceModal } from "./YearEventAnnounceModal";
import { TroubleCharacterAnnounceModal } from "./TroubleCharacterAnnounceModal";
import { GameOverModal } from "./GameOverModal";
import { FinalRaceSequence } from "./FinalRaceSequence";
import { StartScreen } from "./StartScreen";
import { useCpuAutoplay } from "./useCpuAutoplay";
import { useGameplaySoundEffects } from "./useGameplaySoundEffects";
import { useBgmController } from "./useBgmController";
import { useDiceRevealPhase } from "./useDiceRevealPhase";
import { useMoveTotalSteps } from "./useMoveTotalSteps";
import { useLandingSettlePhase, LANDING_SETTLE_MS } from "./useLandingSettlePhase";
import { ARRIVAL_LAST_MS, getStepAnimationMs, getStepTransitionMs } from "@/lib/game/moveTempo";

export function GameScreen() {
  const hasHydrated = useHasHydrated();
  const status = useGameStore((s) => s.status);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const mapId = useGameStore((s) => s.mapId);
  const turn = useGameStore((s) => s.turn);
  const totalTurns = useGameStore((s) => s.totalTurns);
  const destinationNodeId = useGameStore((s) => s.destinationNodeId);
  const diceResult = useGameStore((s) => s.diceResult);
  const diceFaces = useGameStore((s) => s.diceFaces);
  const remainingMoves = useGameStore((s) => s.remainingMoves);
  const pendingDoubleMove = useGameStore((s) => s.pendingDoubleMove);
  const pendingDiceCount = useGameStore((s) => s.pendingDiceCount);
  const activeVehicleMode = useGameStore((s) => s.activeVehicleMode);
  const routeOptions = useGameStore((s) => s.routeOptions);
  const pendingPropertyGroupId = useGameStore((s) => s.pendingPropertyGroupId);
  const monopolyAchievement = useGameStore((s) => s.monopolyAchievement);
  const landingResultInfo = useGameStore((s) => s.landingResultInfo);
  const skipTurnAnnounceInfo = useGameStore((s) => s.skipTurnAnnounceInfo);
  const arrivalInfo = useGameStore((s) => s.arrivalInfo);
  const cardWarpInfo = useGameStore((s) => s.cardWarpInfo);
  const targetSelectInfo = useGameStore((s) => s.targetSelectInfo);
  const moneyRouletteInfo = useGameStore((s) => s.moneyRouletteInfo);
  const cardDrawInfo = useGameStore((s) => s.cardDrawInfo);
  const cardOverflowInfo = useGameStore((s) => s.cardOverflowInfo);
  const settlementInfo = useGameStore((s) => s.settlementInfo);
  const currentYearEventId = useGameStore((s) => s.currentYearEventId);
  const yearEventAnnounceInfo = useGameStore((s) => s.yearEventAnnounceInfo);
  const troubleCharacterOwnerId = useGameStore((s) => s.troubleCharacterOwnerId);
  const troubleCharacterAnnounceInfo = useGameStore((s) => s.troubleCharacterAnnounceInfo);
  const netWorthHistory = useGameStore((s) => s.netWorthHistory);
  const log = useGameStore((s) => s.log);
  const winnerIds = useGameStore((s) => s.winnerIds);

  const startGame = useGameStore((s) => s.startGame);
  const resetGame = useGameStore((s) => s.resetGame);
  const rollDice = useGameStore((s) => s.rollDice);
  const advanceStep = useGameStore((s) => s.advanceStep);
  const chooseRoute = useGameStore((s) => s.chooseRoute);
  const stepBack = useGameStore((s) => s.stepBack);
  const buyProperty = useGameStore((s) => s.buyProperty);
  const finishPropertyShopping = useGameStore((s) => s.finishPropertyShopping);
  const dismissMonopolyAchievement = useGameStore((s) => s.dismissMonopolyAchievement);
  const dismissLandingResult = useGameStore((s) => s.dismissLandingResult);
  const dismissSkipTurnAnnounce = useGameStore((s) => s.dismissSkipTurnAnnounce);
  const dismissYearEventAnnounce = useGameStore((s) => s.dismissYearEventAnnounce);
  const dismissTroubleCharacterAnnounce = useGameStore((s) => s.dismissTroubleCharacterAnnounce);
  const useCard = useGameStore((s) => s.useCard);
  const continueAfterArrival = useGameStore((s) => s.continueAfterArrival);
  const continueAfterWarpAnnounce = useGameStore((s) => s.continueAfterWarpAnnounce);
  const continueAfterCardWarpFocus = useGameStore((s) => s.continueAfterCardWarpFocus);
  const confirmTargetSelection = useGameStore((s) => s.confirmTargetSelection);
  const cancelTargetSelection = useGameStore((s) => s.cancelTargetSelection);
  const continueAfterDestinationFocus = useGameStore((s) => s.continueAfterDestinationFocus);
  const continueAfterMoneyRoulette = useGameStore((s) => s.continueAfterMoneyRoulette);
  const continueAfterCardDraw = useGameStore((s) => s.continueAfterCardDraw);
  const resolveCardOverflow = useGameStore((s) => s.resolveCardOverflow);
  const continueAfterSettlementIntro = useGameStore((s) => s.continueAfterSettlementIntro);
  const continueAfterSettlement = useGameStore((s) => s.continueAfterSettlement);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // 最終順位発表演出(FinalRaceSequence)が完了したかどうか。GameScreen自体は一度きり
  // マウントされる単一コンポーネントなので、"もう一度遊ぶ"で新しいプレイが始まった後の
  // 次のゲーム終了でも演出をもう一度頭から見せられるよう、statusが"finished"を離れた
  // 瞬間(=リスタート後)にfalseへ戻す(下のuseEffect参照)。
  const [raceSequenceDone, setRaceSequenceDone] = useState(false);

  useEffect(() => {
    if (status !== "finished") setRaceSequenceDone(false);
  }, [status]);

  // finished突入時点の最終順位スナップショット。winnerIdsはgameStore.ts側でfinished確定の
  // 瞬間に1回だけ新しい配列としてセットされ、以後status:"finished"が続く間は同じ参照の
  // まま変化しない(次のゲームでまたfinishedになったときだけ新しい配列になる)ため、
  // これをuseMemoの依存に使うことで「finished突入時点のplayersでrankPlayers()した結果」を
  // レース演出が終わるまで固定できる(GameScreenの再レンダー理由がdrawerOpenの開閉など
  // finishedと無関係なものであっても再計算されない)。FinalRaceSequence自身はこの
  // 固定済み配列を受け取るだけで、一切再計算しない。
  const finishedRanked = useMemo(
    () => rankPlayers(players),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [winnerIds],
  );

  const currentPlayer = players[currentPlayerIndex];
  // CPUの手番中は、人間が誤ってサイコロ・分岐・購入・カード選択等を操作できないようにする
  // (演出自体はuseCpuAutoplay()が既存アクションを呼ぶことでそのまま表示される)。
  const isCurrentHuman = currentPlayer?.controlledBy !== "cpu";

  // CPUプレイヤーの意思決定・実行(rollDice等の既存アクションを呼ぶだけ)。
  useCpuAutoplay();

  // dice_roll/step_moveの効果音(Phase10/P10-1)。gameStore.tsからは呼ばず、状態の変化を
  // 監視して副作用だけ起こす薄いフックに分離している(詳細はuseGameplaySoundEffects.ts参照)。
  useGameplaySoundEffects();

  // BGMシーン切り替え(Phase11/P11-1)。useGameplaySoundEffects()と同じく、早期return
  // (waiting/settlement/destinationArrived)より前で呼ぶことで、画面差し替えをまたいでも
  // このフック自体は生存し続ける(詳細はuseBgmController.ts参照)。
  useBgmController();

  // Polish Phase 3a: サイコロ演出(フェイクロール→本当の出目)のフェーズ管理。
  // ロジック本体はuseDiceRevealPhase.tsへ分離済み(useGameplaySoundEffects.ts等と同じ
  // 「storeの値を読んで、副作用/ローカルstateだけを持つ薄いフック」設計に揃えるため)。
  const diceRevealPhase = useDiceRevealPhase(diceResult);

  // Polish Phase 3b: 今回のロールの合計移動マス数(moveTempo.tsのgetStepAnimationMs()が
  // 発進/巡航/減速のどの段階かを判定するために必要)。ロジック本体はuseMoveTotalSteps.tsへ
  // 分離済み(useDiceRevealPhaseと同じ設計)。diceResultではなくrollDice()直後の
  // remainingMovesをキャプチャするため、doubleMove等でdiceResultとズレていても正しい値になる。
  const totalSteps = useMoveTotalSteps(diceResult, remainingMoves);

  // Polish Phase 3b: 直近にスケジュールした「1マス移動」のstep interval(ms)。CarToken/Board
  // cameraのtransition durationをこの値から導出する(getStepTransitionMs())ことで、
  // 「stepのタイマー間隔」「車の移動」「カメラのパン」が同じテンポ値から一致して動く。
  // 着地tick(remainingMoves===0)ではこの値を更新しない(車もカメラも動かないtickのため、
  // 直前の実移動テンポの値=最後の1マスのtransition時間をそのまま保持しておけば十分。
  // Polish Phase3cはこの「保持された最後のtransition時間」を着地settleの起点として使う)。
  // 初期値(ARRIVAL_LAST_MS由来)は最初の移動が始まる前は一切参照されないため、値そのものに
  // 意味はない(既存の420ms相当の見た目にするための無難な初期シードにすぎない)。
  const [lastStepIntervalMs, setLastStepIntervalMs] = useState(ARRIVAL_LAST_MS);
  const movementTransitionMs = getStepTransitionMs(lastStepIntervalMs);

  // Polish Phase 3c: 車がこのまま目的地へ到着するかどうかの事前判定。checkDestinationArrival()
  // (gameStore.ts)が行う判定(player.currentNodeId === destinationNodeId)と全く同じ単純な
  // 等値比較を、どちらもGameScreen.tsxが既に読んでいるstore値だけを使って行うだけであり、
  // 目的地抽選・到着処理そのもの(ゲームロジック)を複製するものではない。DestinationCelebration
  // Screen側が既に十分強い専用演出を持つため、目的地到着時は通常マスの着地settleを追加せず
  // 抑制する(調査結果のB案)。
  const willArriveAtDestination = currentPlayer?.currentNodeId === destinationNodeId;

  // Polish Phase 3c: 「最後の1マスへの視覚transitionが完了してから、マス効果(resolveLanding())が
  // 発生するまで」の短い着地settleフェーズ。ロジック本体はuseLandingSettlePhase.tsへ分離済み
  // (useDiceRevealPhase/useMoveTotalStepsと同じ設計)。
  const landingSettlePhase = useLandingSettlePhase(status, remainingMoves, movementTransitionMs);
  // 目的地到着が事前に分かっている間は、通常マスの着地settleビジュアルを出さない(調査結果の
  // B案。DestinationCelebrationScreenへの遷移と重ねてくどくしないため)。
  const showLandingSettle = landingSettlePhase === "settling" && !willArriveAtDestination;

  // マス移動を1歩ずつアニメーションしながら自動で進める。Polish Phase 3a: サイコロの
  // フェイクロール演出("idle"以外)が終わるまでは最初の1歩を開始しない(diceRevealPhaseを
  // 依存配列に加えることで、"rolling"→"idle"に戻った瞬間にこのeffectが再評価される)。
  // Polish Phase 3b: remainingMoves>0(実際に1マス進む/分岐する)ときだけmoveTempo.tsの
  // getStepAnimationMs()で可変のstep intervalを使う。totalStepsが未確定(理論上到達しない
  // 防御的分岐)の場合はremainingMovesをtotalStepsとみなして安全側に倒す。
  // Polish Phase 3c: remainingMoves===0(resolveLanding()を呼ぶためだけの最終tick)は、
  // 「最後の1マスの視覚transition(movementTransitionMs)が完了してから、着地settle
  // (LANDING_SETTLE_MS)ぶんだけ待つ」合計時間にする(=調査結果どおり、旧LANDING_TICK_MS
  // 固定460msの「車のtransition完了より早くresolveLanding()が呼ばれてしまう」問題を解消する)。
  // 目的地到着が事前に分かっている場合は着地settleを足さず、transition完了時点で
  // resolveLanding()へ進む(DestinationCelebrationScreen側の演出を待たせないため)。
  useEffect(() => {
    if (status !== "moving" || diceRevealPhase !== "idle") return;
    const interval =
      remainingMoves > 0
        ? getStepAnimationMs({ totalSteps: totalSteps ?? remainingMoves, remainingMoves })
        : willArriveAtDestination
          ? movementTransitionMs
          : movementTransitionMs + LANDING_SETTLE_MS;
    if (remainingMoves > 0) setLastStepIntervalMs(interval);
    const timer = window.setTimeout(() => {
      advanceStep();
    }, interval);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remainingMoves, currentPlayer?.currentNodeId, diceRevealPhase, totalSteps, willArriveAtDestination]);

  // Polish Phase 3e: 年度またぎの最後のmoney着地でlandingResultInfoが設定されたまま
  // settlementIntro/settlementへ遷移すると、居残ったLandingResultToastがSettlementIntro
  // Announcer(「○年目の決算です」)やSettlementScreenと同時に見えてしまう(調査済み)。
  // gameStore.ts側にendTurn timing用の演出ロジックを追加するのではなく、GameScreen側から
  // 既存の公開action(dismissLandingResult)を呼ぶだけで解消する(GameStatus追加なし、
  // gameStore.ts無変更)。既に片付いていれば何もしない(不要なsetを避ける)。
  useEffect(() => {
    if (status !== "settlementIntro" && status !== "settlement") return;
    if (landingResultInfo) dismissLandingResult();
  }, [status, landingResultInfo, dismissLandingResult]);

  // persist(localStorage)のrehydrationが完了するまでは、StartScreenの「ゲーム開始」を
  // 誤って操作できてしまわないよう、StartScreenも本編も一切マウントしない。
  if (!hasHydrated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">読み込み中…</p>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <StartScreen
        onStart={(names, totalYears, controlledBy) => startGame(names, totalYears, controlledBy)}
      />
    );
  }

  // 決算画面表示中はBoard/HUD/Diceを一切マウントしない(StartScreenと同じ完全差し替え)。
  // これにより盤面・サイコロ操作は構造的に不可能になる(statusガードに頼らない)。
  if (status === "settlement" && settlementInfo) {
    return (
      <SettlementScreen
        info={settlementInfo}
        history={netWorthHistory}
        players={players}
        onContinue={continueAfterSettlement}
      />
    );
  }

  const map = getMap(mapId);

  // 目的地到着のお祝い画面も同じ考え方でBoardを完全に差し替える(小さいオーバーレイではなく
  // 専用イベント画面にする)。continueAfterArrival()を呼ぶだけで、destinationArrived→
  // destinationFocusという既存の遷移(Board側のカメラ演出含む)には一切手を入れていない。
  // candidateDestinationNamesはルーレット演出用の見せかけの候補地名(演出専用、ゲームロジックには
  // 一切影響しない)。destinationCandidateNodes()はpickRandomDestination()と同じ候補プールを返す
  // 既存の純関数で、ここでは名前を読み取るだけ。
  if (status === "destinationArrived" && arrivalInfo) {
    return (
      <DestinationCelebrationScreen
        arrivalInfo={arrivalInfo}
        candidateDestinationNames={destinationCandidateNodes(map).map((n) => n.name)}
        onContinue={continueAfterArrival}
      />
    );
  }

  const destinationNode = getNode(map, destinationNodeId);
  const calendar = getCalendar(turn);
  const currentYearEvent = getYearEventDef(currentYearEventId);
  const totalYears = Math.round(totalTurns / MONTHS_PER_YEAR);
  const distanceToDestination =
    currentPlayer && (status === "rolling" || status === "moving" || status === "selectingRoute")
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
          onDestinationFocusComplete={continueAfterDestinationFocus}
          cardWarpTargetNodeId={cardWarpInfo?.targetNodeId ?? null}
          onCardWarpFocusComplete={continueAfterCardWarpFocus}
          activeVehicleMode={activeVehicleMode}
          movementTransitionMs={movementTransitionMs}
          landingSettle={showLandingSettle}
        />
      </div>

      <GameHud
        currentPlayerId={currentPlayer?.id ?? ""}
        currentPlayerName={currentPlayer?.name ?? ""}
        currentPlayerColor={currentPlayer?.color ?? "#94a3b8"}
        currentPlayerMoney={currentPlayer?.money ?? 0}
        destinationName={destinationNode.name}
        calendarText={`${calendar.year}年目 ${calendar.month}月`}
        yearEvent={currentYearEvent}
        onOpenDrawer={() => setDrawerOpen(true)}
        movementInfo={
          status === "rolling" || status === "moving" || status === "selectingRoute"
            ? {
                remainingMoves: status === "moving" || status === "selectingRoute" ? remainingMoves : null,
                distanceToDestination,
              }
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
          onSelectRoute={isCurrentHuman ? chooseRoute : () => {}}
          backNodeId={backNodeId}
          remainingMovesAfterBack={remainingMoves + 1}
          onStepBack={isCurrentHuman ? stepBack : () => {}}
        />
      )}

      {/* ホームインジケーターに埋もれないよう、env(safe-area-inset-bottom)を基準位置へ加算する。
          PCではenv()が0なので従来のbottom-5/6と同じ位置になる。 */}
      <div className="fixed left-1/2 z-20 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <Dice
          diceResult={status === "moving" ? diceResult : null}
          diceFaces={status === "moving" ? diceFaces : null}
          diceCount={status === "moving" ? (diceFaces?.length ?? 1) : pendingDiceCount}
          canRoll={isCurrentHuman && status === "rolling" && diceResult === null}
          doubleArmed={pendingDoubleMove}
          onRoll={rollDice}
          revealPhase={diceRevealPhase}
          actualMoves={status === "moving" ? totalSteps : null}
        />
        {status === "moving" && remainingMoves > 0 && (
          <p className="mt-1 text-center text-xs font-bold text-slate-600 drop-shadow-sm dark:text-slate-300">
            残り {remainingMoves} マス
          </p>
        )}
        {status === "moving" && backNodeId && isCurrentHuman && (
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
        canCurrentPlayerAct={isCurrentHuman}
        destinationName={destinationNode.name}
        year={calendar.year}
        month={calendar.month}
        totalYears={totalYears}
        turn={turn}
        totalTurns={totalTurns}
        currentYearEventId={currentYearEventId}
        troubleCharacterOwnerId={troubleCharacterOwnerId}
        log={log}
        onReset={() => {
          if (window.confirm("ゲームを終了して最初からやり直しますか?")) resetGame();
        }}
      />

      {status === "purchaseOffer" && pendingPropertyGroupId && currentPlayer && (
        <PurchaseModal
          groupId={pendingPropertyGroupId}
          player={currentPlayer}
          players={players}
          currentYearEventId={currentYearEventId}
          monopolyAchievement={monopolyAchievement}
          onBuy={isCurrentHuman ? buyProperty : () => {}}
          onFinish={isCurrentHuman ? finishPropertyShopping : () => {}}
        />
      )}

      {status === "cardWarpAnnounce" && cardWarpInfo && (
        <WarpAnnounceModal info={cardWarpInfo} onContinue={continueAfterWarpAnnounce} />
      )}

      {status === "selectingCardTarget" && targetSelectInfo && (
        <TargetSelectOverlay
          info={targetSelectInfo}
          onSelect={isCurrentHuman ? confirmTargetSelection : () => {}}
          onCancel={isCurrentHuman ? cancelTargetSelection : () => {}}
        />
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
          onDiscardExisting={isCurrentHuman ? (index) => resolveCardOverflow({ discard: "existing", index }) : () => {}}
          onKeepCurrentHand={isCurrentHuman ? () => resolveCardOverflow({ discard: "newCard" }) : () => {}}
        />
      )}

      {status === "settlementIntro" && settlementInfo && (
        <SettlementIntroAnnouncer info={settlementInfo} onContinue={continueAfterSettlementIntro} />
      )}

      {/* 最終順位発表演出(P11-3-A/FinalRaceSequence)→静的な結果画面(GameOverModal)の2段階。
          順位はfinishedRanked(上のuseMemoでfinished突入時点のplayersから1回だけ計算し、
          winnerIdsが変わらない限り再計算されない固定スナップショット)をそのまま渡すだけで、
          演出側では一切再計算しない(SettlementIntroAnnouncer→SettlementScreenと同じ構成)。 */}
      {status === "finished" && winnerIds && !raceSequenceDone && (
        <FinalRaceSequence
          ranked={finishedRanked}
          winnerIds={winnerIds}
          onFinish={() => setRaceSequenceDone(true)}
        />
      )}

      {status === "finished" && winnerIds && raceSequenceDone && (
        <GameOverModal
          players={players}
          winnerIds={winnerIds}
          totalYears={totalYears}
          netWorthHistory={netWorthHistory}
          onRestart={resetGame}
        />
      )}

      {/* グループ独占は従来どおり非ブロッキングのトースト、地域独占(より稀少)だけnaviの
          CharacterAnnouncer演出にする(GameStore側のmonopolyAchievement/dismissMonopolyAchievement
          は共通のまま、表示コンポーネントをkindで出し分けるだけ)。他のstatus駆動モーダル
          (PurchaseModal等)より後ろにJSX上で置く: 同じz-50でもDOM順で後の要素が上に重なるため、
          「物件購入を続けている最中に独占を達成した」瞬間でも演出が確実に手前に出るようにする。 */}
      {monopolyAchievement && monopolyAchievement.kind === "group" && (
        <MonopolyToast achievement={monopolyAchievement} onDismiss={dismissMonopolyAchievement} />
      )}
      {monopolyAchievement && monopolyAchievement.kind === "region" && (
        <MonopolyAnnounceModal achievement={monopolyAchievement} onDismiss={dismissMonopolyAchievement} />
      )}

      {/* money/eventマス着地の非ブロッキング通知(Phase9B/P9-3)。monopolyAchievementと同じく
          statusには依存しない。LandingResultToast側でMonopolyToastとは別のtop位置に固定配置し、
          偶発的な同時表示でも重ならないようにしている。 */}
      {landingResultInfo && <LandingResultToast info={landingResultInfo} onDismiss={dismissLandingResult} />}

      {/* skipNextRoll発動でターンが飛ばされたことの非ブロッキング通知(Polish Phase 3f)。
          landingResultInfoと同じくstatusには依存しない。ゲーム進行(advanceToNextTurn())は
          この通知の表示/dismissタイミングとは無関係に既に完了している。 */}
      {skipTurnAnnounceInfo && <SkipTurnToast info={skipTurnAnnounceInfo} onDismiss={dismissSkipTurnAnnounce} />}

      {/* 年度イベント(「今年の湘南」)の告知。monopolyAchievementと同じくstatusには依存しない
          一時通知で、新しいGameStatusは増やさない。ゲーム開始時(1年目)・決算後に新年度へ
          進んだ瞬間のどちらもgameStore側が同じyearEventAnnounceInfoにセットするため、
          ここでの出し分けは不要。 */}
      {yearEventAnnounceInfo && (
        <YearEventAnnounceModal info={yearEventAnnounceInfo} onDismiss={dismissYearEventAnnounce} />
      )}

      {/* 妨害キャラ(仮称)の登場/所有者交代/悪さ発生の告知。yearEventAnnounceInfoと同じく
          statusには依存しない一時通知で、新しいGameStatusは増やさない。CPU手番中でもこの通知の
          有無によってターン進行が止まることはない(CharacterAnnouncerが自走してonDismissを呼ぶ)。 */}
      {troubleCharacterAnnounceInfo && (
        <TroubleCharacterAnnounceModal info={troubleCharacterAnnounceInfo} onDismiss={dismissTroubleCharacterAnnounce} />
      )}
    </div>
  );
}
