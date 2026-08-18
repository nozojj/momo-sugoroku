"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { defaultCpuStrategy } from "@/lib/game/cpuDecision";

/**
 * CPU(自動操作プレイヤー)の「実行層」。cpuDecision.tsの判断結果を、既存の人間向けアクション
 * (rollDice/useCard/chooseRoute/buyProperty/finishPropertyShopping/confirmTargetSelection/
 * cancelTargetSelection/resolveCardOverflow)へそのまま渡すだけの薄いフック。CPU専用のゲーム
 * ルールは一切持たない(判断ロジックはcpuDecision.ts、ここでは「いつ・どのアクションを呼ぶか」だけ)。
 *
 * 各useEffectは、既存のGameScreen.tsxの「moving」自動進行(setTimeout→advanceStep→依存値の
 * 変化で次のtickが再度effectを起こす)と同じ考え方: 1回のeffectでは1手だけ決めて実行し、
 * その結果stateが変われば依存値が変わって次のeffectが自動的に発火する。
 */

/** CPUの手が早すぎて演出が読めなくならないようにする調整用の間(ミリ秒)。 */
const CPU_ACTION_DELAY_MS = 650;

export function useCpuAutoplay(): void {
  const status = useGameStore((s) => s.status);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const currentPlayer = useGameStore((s) => s.players[s.currentPlayerIndex]);
  const diceResult = useGameStore((s) => s.diceResult);
  const pendingDoubleMove = useGameStore((s) => s.pendingDoubleMove);
  const pendingDiceCount = useGameStore((s) => s.pendingDiceCount);
  const cardIdsKey = currentPlayer?.cardIds.join(",") ?? "";
  const routeOptions = useGameStore((s) => s.routeOptions);
  const pendingPropertyGroupId = useGameStore((s) => s.pendingPropertyGroupId);
  const targetSelectInfo = useGameStore((s) => s.targetSelectInfo);
  const cardOverflowInfo = useGameStore((s) => s.cardOverflowInfo);

  const rollDice = useGameStore((s) => s.rollDice);
  // "useCard"という名前のままローカル変数に束縛すると、React Hooksの命名規則(use接頭辞)に
  // 引っかかってeslint-plugin-react-hooksの誤検知(コールバック内でのフック呼び出し扱い)を招くため、
  // ここだけ別名にする(gameStore.ts側のアクション名自体は変更しない)。
  const playCard = useGameStore((s) => s.useCard);
  const chooseRoute = useGameStore((s) => s.chooseRoute);
  const buyProperty = useGameStore((s) => s.buyProperty);
  const finishPropertyShopping = useGameStore((s) => s.finishPropertyShopping);
  const confirmTargetSelection = useGameStore((s) => s.confirmTargetSelection);
  const cancelTargetSelection = useGameStore((s) => s.cancelTargetSelection);
  const resolveCardOverflow = useGameStore((s) => s.resolveCardOverflow);

  // rolling: カードを使うか、そのままサイコロを振るかを1手ずつ決める。
  useEffect(() => {
    if (status !== "rolling" || diceResult !== null) return;
    if (!currentPlayer || currentPlayer.controlledBy !== "cpu") return;

    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.status !== "rolling" || state.diceResult !== null) return;
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.controlledBy !== "cpu") return;

      const decision = defaultCpuStrategy.decidePreRoll({ state, map: getMap(state.mapId), player });
      if (decision.type === "useCard") {
        playCard(decision.cardId);
      } else {
        rollDice();
      }
    }, CPU_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, diceResult, currentPlayerIndex, cardIdsKey, pendingDoubleMove, pendingDiceCount]);

  // selectingRoute: 分岐先を1つ選ぶ。
  useEffect(() => {
    if (status !== "selectingRoute") return;
    if (!currentPlayer || currentPlayer.controlledBy !== "cpu") return;

    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.status !== "selectingRoute" || state.routeOptions.length === 0) return;
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.controlledBy !== "cpu") return;

      const nodeId = defaultCpuStrategy.decideRoute({
        map: getMap(state.mapId),
        destinationNodeId: state.destinationNodeId,
        routeOptions: state.routeOptions,
        ownedCardIds: player.cardIds,
      });
      chooseRoute(nodeId);
    }, CPU_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentPlayerIndex, routeOptions]);

  // purchaseOffer: 買う物件を全て決めてから購入を終える。
  useEffect(() => {
    if (status !== "purchaseOffer" || !pendingPropertyGroupId) return;
    if (!currentPlayer || currentPlayer.controlledBy !== "cpu") return;

    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.status !== "purchaseOffer" || !state.pendingPropertyGroupId) return;
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.controlledBy !== "cpu") return;

      const picks = defaultCpuStrategy.decidePurchases({
        player,
        players: state.players,
        groupId: state.pendingPropertyGroupId,
      });
      for (const propertyId of picks) buyProperty(propertyId);

      window.setTimeout(() => {
        if (useGameStore.getState().status === "purchaseOffer") finishPropertyShopping();
      }, CPU_ACTION_DELAY_MS);
    }, CPU_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentPlayerIndex, pendingPropertyGroupId]);

  // selectingCardTarget: 対象(駅/地域/物件グループ/相手プレイヤー)を1つ選ぶ、または見送る。
  useEffect(() => {
    if (status !== "selectingCardTarget" || !targetSelectInfo) return;
    const owner = useGameStore.getState().players.find((p) => p.id === targetSelectInfo.playerId);
    if (!owner || owner.controlledBy !== "cpu") return;

    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.status !== "selectingCardTarget" || !state.targetSelectInfo) return;
      const player = state.players.find((p) => p.id === state.targetSelectInfo!.playerId);
      if (!player || player.controlledBy !== "cpu") return;

      const decision = defaultCpuStrategy.decideTargetSelect({
        map: getMap(state.mapId),
        player,
        players: state.players,
        destinationNodeId: state.destinationNodeId,
        info: state.targetSelectInfo,
      });
      if (decision.type === "select") {
        confirmTargetSelection(decision.optionId);
      } else {
        cancelTargetSelection();
      }
    }, CPU_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, targetSelectInfo]);

  // cardOverflow: 新カードを見送るか、既存の1枚と入れ替えるかを決める。
  useEffect(() => {
    if (status !== "cardOverflow" || !cardOverflowInfo) return;
    const owner = useGameStore.getState().players.find((p) => p.id === cardOverflowInfo.playerId);
    if (!owner || owner.controlledBy !== "cpu") return;

    const timer = window.setTimeout(() => {
      const state = useGameStore.getState();
      if (state.status !== "cardOverflow" || !state.cardOverflowInfo) return;
      const player = state.players.find((p) => p.id === state.cardOverflowInfo!.playerId);
      if (!player || player.controlledBy !== "cpu") return;

      const decision = defaultCpuStrategy.decideCardOverflow({
        currentCardIds: state.cardOverflowInfo.currentCardIds,
        newCardId: state.cardOverflowInfo.newCardId,
      });
      resolveCardOverflow(decision);
    }, CPU_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cardOverflowInfo]);
}
