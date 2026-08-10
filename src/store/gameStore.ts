import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GameState, Player, RouteOption } from "@/types/game";
import { getMap, defaultMapId, maps } from "@/data/maps";
import { getNode, getTraversableOptions, pickRandomDestination, rollDice as rollDiceValue } from "@/lib/game/mapGraph";
import { getPropertyDef, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { isGroupMonopolized, isRegionMonopolized } from "@/lib/game/propertyOwnership";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";
import { getCardDef } from "@/data/cards";
import { resolveLandingOutcome } from "@/lib/game/landingEffects";
import { CARD_EFFECT_HANDLERS, effectKind, isDiceModifierEffect } from "@/lib/game/cardEffects";
import { calculateSettlement } from "@/lib/game/settlement";
import {
  createInitialState,
  makeLogId,
  computeWinnerIds,
  getCalendar,
  DESTINATION_BONUS,
  DEFAULT_TOTAL_TURNS,
  MAX_CARDS_PER_PLAYER,
} from "@/lib/game/engine";

const IDLE_STATE: GameState = {
  mapId: defaultMapId,
  players: [],
  currentPlayerIndex: 0,
  turn: 0,
  totalTurns: DEFAULT_TOTAL_TURNS,
  destinationNodeId: "",
  diceResult: null,
  diceFaces: null,
  remainingMoves: 0,
  pendingDoubleMove: false,
  pendingDiceCount: 1,
  extraRollGranted: false,
  activeVehicleMode: null,
  status: "waiting",
  routeOptions: [],
  pendingPropertyGroupId: null,
  monopolyAchievement: null,
  arrivalInfo: null,
  moneyRouletteInfo: null,
  cardDrawInfo: null,
  cardOverflowInfo: null,
  settlementInfo: null,
  netWorthHistory: [],
  log: [],
  winnerIds: null,
};

interface GameStore extends GameState {
  /** ゲーム未開始 or 終了後の初期状態かどうか */
  hasActiveGame: () => boolean;
  startGame: (playerNames: string[], totalYears: number) => void;
  resetGame: () => void;
  useCard: (cardId: string) => void;
  rollDice: () => void;
  /** 1マス分の移動判定を進める(分岐なら停止してroute選択待ちにする)。アニメーション後にUI側から呼ぶ。 */
  advanceStep: () => void;
  chooseRoute: (nodeId: string) => void;
  /** 今回のサイコロ移動で直前に通ったマスへ1マス戻る(remainingMovesを1増やす)。移動開始地点より前へは戻れない。 */
  stepBack: () => void;
  /** 指定した物件を購入する。購入後もstatusはpurchaseOfferのままにし、同じグループの
   *  別の物件を続けて購入できるようにする(ターンは終えない)。 */
  buyProperty: (propertyId: string) => void;
  /** 物件購入画面を閉じ、着地処理を続行してターンを終える */
  finishPropertyShopping: () => void;
  /** MonopolyToastの表示が終わった(自動タイムアウト)ときに呼び、通知状態をクリアする */
  dismissMonopolyAchievement: () => void;
  /** 到着演出モーダルを閉じ、次の目的地へのカメラ演出(destinationFocus)へ進む */
  continueAfterArrival: () => void;
  /** 目的地カメラ演出(自動完了 or タップスキップ)を終え、次のプレイヤーへ手番を送る */
  continueAfterDestinationFocus: () => void;
  /** ルーレット演出モーダルを閉じて先の着地処理(到着判定・ターン送り)を続行する */
  continueAfterMoneyRoulette: () => void;
  /** カード抽選演出モーダルを閉じ、所持枠に空きがあれば手札に加えて先の着地処理を続行する。
   *  上限に達している場合はcardOverflow状態(整理画面)へ遷移し、ここでは停止する。 */
  continueAfterCardDraw: () => void;
  /** cardOverflow状態で、既存カードを1枚捨てて新カードを受け取るか、新カードを見送るかを確定する */
  resolveCardOverflow: (decision: { discard: "newCard" } | { discard: "existing"; index: number }) => void;
  /** 決算導入演出(CharacterAnnouncer)を終え、SettlementScreen表示(status: "settlement")へ進む */
  continueAfterSettlementIntro: () => void;
  /** SettlementScreenを閉じて次のプレイヤーへ手番を送る(必要なら年またぎ。最終決算ならゲーム終了へ) */
  continueAfterSettlement: () => void;
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

function updatePlayer(players: Player[], playerId: string, updater: (p: Player) => Player): Player[] {
  return players.map((p) => (p.id === playerId ? updater(p) : p));
}

function pushLog(state: GameState, message: string): GameState["log"] {
  return [...state.log, { id: makeLogId(), turn: state.turn, message }];
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      // --- 着地処理・ターン終了(クロージャでset/getを直接使う) ---

      /** 目的地に到着していたら、ボーナス付与・次の目的地抽選・到着演出への遷移まで行う。到着していたらtrueを返す。 */
      function checkDestinationArrival(): boolean {
        const state = get();
        const map = getMap(state.mapId);
        const player = currentPlayer(state);
        if (player.currentNodeId !== state.destinationNodeId) return false;

        const arrivedNode = getNode(map, state.destinationNodeId);
        const playersAfterBonus = updatePlayer(state.players, player.id, (p) => ({
          ...p,
          money: p.money + DESTINATION_BONUS,
          destinationsReached: p.destinationsReached + 1,
        }));
        const nextDestinationId = pickRandomDestination(map, state.destinationNodeId);
        const nextDestination = getNode(map, nextDestinationId);

        set({
          players: playersAfterBonus,
          destinationNodeId: nextDestinationId,
          status: "destinationArrived",
          arrivalInfo: {
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color,
            destinationName: arrivedNode.name,
            bonus: DESTINATION_BONUS,
            nextDestinationName: nextDestination.name,
          },
          log: pushLog(
            state,
            `${player.name}さんが目的地「${arrivedNode.name}」に到着! ボーナス+${DESTINATION_BONUS}万円。次の目的地は「${nextDestination.name}」`,
          ),
        });
        return true;
      }

      /**
       * 全員が1回ずつ行動して年度が変わる瞬間(3月終了→4月開始)なら決算を行い、
       * status: "settlementIntro" へ遷移してtrueを返す(この場合、手番送りは
       * continueAfterSettlement()が行う。settlementIntro→settlementの遷移は
       * continueAfterSettlementIntro()が担当する)。
       * 年度が変わらない、またはゲーム終了判定に入る場合はfalseを返し、呼び出し側の通常進行に任せる。
       *
       * 計算そのものはcalculateSettlement()(純関数)に委譲し、ここではその結果をset()するだけ。
       */
      function applySettlementIfNeeded(): boolean {
        const state = get();
        const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
        const nextTurn = nextIndex === 0 ? state.turn + 1 : state.turn;
        if (nextIndex !== 0 || !getCalendar(nextTurn).isYearStart) return false;

        const settledYear = getCalendar(state.turn).year;
        const { entries, updatedPlayers, historyEntry } = calculateSettlement(
          state.players,
          settledYear,
          state.netWorthHistory,
        );
        const isFinalSettlement = nextTurn > state.totalTurns;

        set({
          players: updatedPlayers,
          netWorthHistory: [...state.netWorthHistory, historyEntry],
          status: "settlementIntro",
          settlementInfo: { year: settledYear, isFinalSettlement, entries },
          log: pushLog(
            state,
            `${settledYear}年目の決算: ${entries.map((e) => `${e.playerName}さん+${e.propertyRevenue}万円`).join("、")}`,
          ),
        });
        return true;
      }

      /** 手番を次のプレイヤーへ送る(決算判定は済んでいる前提)。規定ターン終了ならゲーム終了へ。 */
      function advanceToNextTurn() {
        const state = get();
        const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
        const nextTurn = nextIndex === 0 ? state.turn + 1 : state.turn;

        if (nextTurn > state.totalTurns) {
          const winnerIds = computeWinnerIds(state.players);
          set({
            status: "finished",
            winnerIds,
            log: pushLog(state, `規定ターン終了! ${winnerIds.length > 1 ? "引き分け" : "勝者決定"}`),
          });
          return;
        }

        set({
          currentPlayerIndex: nextIndex,
          turn: nextTurn,
          status: "rolling",
          diceResult: null,
          remainingMoves: 0,
          pendingPropertyGroupId: null,
        });
      }

      function endTurn() {
        const state = get();

        // 変身(activeVehicleMode)は「ロール〜着地処理」の間だけ有効。この関数が呼ばれる時点で
        // 着地効果・到着演出(destinationArrived/destinationFocus)は必ず完了しているため、
        // ここで必ず通常車へ戻す。diceFacesも同じタイミングで表示用の内訳をクリアする。
        set({ activeVehicleMode: null, diceFaces: null });

        if (state.extraRollGranted) {
          set({
            extraRollGranted: false,
            status: "rolling",
            diceResult: null,
            remainingMoves: 0,
            pendingPropertyGroupId: null,
          });
          return;
        }

        if (applySettlementIfNeeded()) return; // continueAfterSettlement()待ち
        advanceToNextTurn();
      }

      function finishLandingAndEndTurn() {
        // 到着していれば演出モーダルを表示して停止する。手番送りは continueAfterArrival() が行う。
        if (checkDestinationArrival()) return;
        endTurn();
      }

      function resolveLanding() {
        const state = get();
        const map = getMap(state.mapId);
        const player = currentPlayer(state);
        const node = getNode(map, player.currentNodeId);
        const outcome = resolveLandingOutcome({ state, map, node, player });

        switch (outcome.kind) {
          case "money": {
            const players = updatePlayer(state.players, player.id, (p) => ({ ...p, money: p.money + outcome.amount }));
            set({ players, status: "resolvingEvent", log: pushLog(state, outcome.message) });
            finishLandingAndEndTurn();
            return;
          }
          case "moneyRoulette": {
            // 金額は既に確定済み(ゲームロジック)。ここでは即座に反映し、演出(モーダル)を
            // 挟んでから finishLandingAndEndTurn() を呼ぶ(到着演出と同じ「確認待ち」の位置づけ)。
            const players = updatePlayer(state.players, player.id, (p) => ({ ...p, money: p.money + outcome.amount }));
            set({
              players,
              status: "moneyRoulette",
              moneyRouletteInfo: { playerId: player.id, playerName: player.name, ...outcome.rouletteInfo },
              log: pushLog(state, outcome.message),
            });
            return; // continueAfterMoneyRoulette()待ち
          }
          case "card": {
            // ここではまだcardIdsへ反映しない。所持上限を超えているかどうかで分岐する必要があるため、
            // 確定処理はcontinueAfterCardDraw()(演出モーダルを閉じた後)にまとめて行う。
            set({
              status: "cardDraw",
              cardDrawInfo: { playerId: player.id, playerName: player.name, cardId: outcome.cardId },
              log: pushLog(state, outcome.message),
            });
            return; // continueAfterCardDraw()待ち
          }
          case "propertyOffer": {
            set({ status: "purchaseOffer", pendingPropertyGroupId: outcome.groupId });
            return; // buyProperty/finishPropertyShoppingの操作待ち
          }
          case "info": {
            set({ status: "resolvingEvent", log: pushLog(state, outcome.message) });
            finishLandingAndEndTurn();
            return;
          }
        }
      }

      return {
        ...IDLE_STATE,

        hasActiveGame: () => {
          const s = get();
          return s.status !== "waiting" && s.players.length > 0;
        },

        startGame: (playerNames: string[], totalYears: number) => {
          const initial = createInitialState(defaultMapId, playerNames, totalYears);
          set(initial);
        },

        resetGame: () => set({ ...IDLE_STATE, log: [] }),

        useCard: (cardId: string) => {
          const state = get();
          if (state.status !== "rolling" || state.diceResult !== null) return;
          const player = currentPlayer(state);
          if (!player.cardIds.includes(cardId)) return;
          const def = getCardDef(cardId);
          if (!def || def.kind !== "usable" || !def.effect) return;
          const handler = CARD_EFFECT_HANDLERS[effectKind(def.effect)];
          if (!handler) return;

          // ダイスの出目・移動量そのものを修飾する効果(doubleMove/multiDice)は同時に2つ以上
          // 予約できない。既に予約済みなら、このカードは消費せず状態も変えずに理由をログへ残す。
          if (isDiceModifierEffect(def.effect) && (state.pendingDoubleMove || state.pendingDiceCount > 1)) {
            set({
              log: pushLog(
                state,
                `${player.name}さんは「${def.name}」を使おうとしたが、すでに移動系カードの効果が予約されているため使えなかった。`,
              ),
            });
            return;
          }

          const playersAfterUse = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            cardIds: p.cardIds.filter((id) => id !== cardId),
          }));
          const result = handler({ state, player, def });
          set({ players: playersAfterUse, ...result.statePatch, log: pushLog(state, result.logMessage) });
        },

        rollDice: () => {
          const state = get();
          if (state.status !== "rolling" || state.diceResult !== null) return;
          const diceCount = state.pendingDiceCount;
          const faces = Array.from({ length: diceCount }, () => rollDiceValue());
          const rawSum = faces.reduce((sum, face) => sum + face, 0);
          const result = state.pendingDoubleMove ? rawSum * 2 : rawSum;
          const player = currentPlayer(state);
          const wasDoubled = state.pendingDoubleMove;
          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            moveHistory: [p.currentNodeId],
          }));
          const rollDescription = diceCount > 1 ? `${faces.join("+")}=${rawSum}` : `${rawSum}`;
          set({
            players,
            diceFaces: faces,
            diceResult: rawSum,
            remainingMoves: result,
            pendingDoubleMove: false,
            pendingDiceCount: 1,
            status: "moving",
            log: pushLog(
              state,
              `${player.name}さんがサイコロを${diceCount > 1 ? diceCount + "個" : ""}振った: ${rollDescription}${wasDoubled ? " (2倍で" + result + "マス)" : ""}`,
            ),
          });
        },

        advanceStep: () => {
          const state = get();
          if (state.status !== "moving") return;
          const map = getMap(state.mapId);
          const player = currentPlayer(state);

          if (state.remainingMoves <= 0) {
            resolveLanding();
            return;
          }

          const node = getNode(map, player.currentNodeId);
          const prevId =
            player.moveHistory.length >= 2 ? player.moveHistory[player.moveHistory.length - 2] : null;
          const options = getTraversableOptions(node, prevId, player.cardIds);

          if (options.length === 0) {
            // 理論上発生しない(孤立ノードは無い)が、保険として着地処理へ。
            resolveLanding();
            return;
          }

          if (options.length === 1) {
            const to = options[0].to;
            const players = updatePlayer(state.players, player.id, (p) => ({
              ...p,
              moveHistory: [...p.moveHistory, to],
              currentNodeId: to,
            }));
            set({ players, remainingMoves: state.remainingMoves - 1 });
            return;
          }

          // 分岐: プレイヤーの選択待ち
          const routeOptions: RouteOption[] = options.map((edge) => ({
            nodeId: edge.to,
            nodeName: getNode(map, edge.to).name,
            roadType: edge.roadType,
            available: true,
          }));
          set({ status: "selectingRoute", routeOptions });
        },

        chooseRoute: (nodeId: string) => {
          const state = get();
          if (state.status !== "selectingRoute") return;
          if (!state.routeOptions.some((o) => o.nodeId === nodeId)) return;
          const player = currentPlayer(state);
          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            moveHistory: [...p.moveHistory, nodeId],
            currentNodeId: nodeId,
          }));
          set({
            players,
            remainingMoves: state.remainingMoves - 1,
            status: "moving",
            routeOptions: [],
          });
        },

        stepBack: () => {
          const state = get();
          if (state.status !== "moving" && state.status !== "selectingRoute") return;
          const player = currentPlayer(state);
          if (player.moveHistory.length < 2) return;

          const newHistory = player.moveHistory.slice(0, -1);
          const backTo = newHistory[newHistory.length - 1];
          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            moveHistory: newHistory,
            currentNodeId: backTo,
          }));

          // 戻った先で改めて前進候補を計算し、必ず選択待ち状態で停止する。
          // ここでstatusを"moving"のままにすると、次の自動移動タイマーが即座に発火して
          // 今しがた戻ったばかりの道をまた自動で進んでしまい、戻る操作が無意味になる。
          const map = getMap(state.mapId);
          const node = getNode(map, backTo);
          const prevId = newHistory.length >= 2 ? newHistory[newHistory.length - 2] : null;
          const options = getTraversableOptions(node, prevId, player.cardIds);
          const routeOptions: RouteOption[] = options.map((edge) => ({
            nodeId: edge.to,
            nodeName: getNode(map, edge.to).name,
            roadType: edge.roadType,
            available: true,
          }));

          set({
            players,
            remainingMoves: state.remainingMoves + 1,
            status: "selectingRoute",
            routeOptions,
          });
        },

        buyProperty: (propertyId: string) => {
          const state = get();
          if (state.status !== "purchaseOffer" || !state.pendingPropertyGroupId) return;
          const def = getPropertyDef(propertyId);
          if (!def || def.groupId !== state.pendingPropertyGroupId) return;
          const player = currentPlayer(state);
          if (player.money < def.price) return;
          const alreadyOwned = state.players.some((p) => p.ownedPropertyIds.includes(def.id));
          if (alreadyOwned) return;

          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            money: p.money - def.price,
            ownedPropertyIds: [...p.ownedPropertyIds, def.id],
          }));

          // 独占達成の検知: 購入「前」の所有状況(state.players)では未達成、購入「後」の所有状況
          // (players)では達成、という差分だけを見る。そのグループは既に全物件が埋まるため、
          // 同じ購入で再度この分岐に入ることはない(=通知は達成した瞬間の1回だけ)。
          // 判定・倍率はどちらもpropertyOwnership.ts/propertyBalance.tsの既存値をそのまま使う。
          const group = getPropertyGroupDef(def.groupId);
          const wasGroupMonopoly = isGroupMonopolized(def.groupId, player.id, state.players, propertyDefs);
          const isGroupMonopolyNow = isGroupMonopolized(def.groupId, player.id, players, propertyDefs);
          const isRegionMonopolyNow =
            !!group && isRegionMonopolized(group.region, player.id, players, propertyDefs, propertyGroupDefs);

          let logMessage = `${player.name}さんが「${def.name}」を購入した(${def.price}万円)`;
          let monopolyAchievement: GameState["monopolyAchievement"] = null;
          if (!wasGroupMonopoly && isRegionMonopolyNow && group) {
            logMessage += ` 🎉 ${group.region}エリアを完全独占!物件収益が${PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier}倍になります!`;
            monopolyAchievement = { kind: "region", name: group.region, multiplier: PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier };
          } else if (!wasGroupMonopoly && isGroupMonopolyNow && group) {
            logMessage += ` 🎉 ${group.name}を独占!物件収益が${PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier}倍になります!`;
            monopolyAchievement = { kind: "group", name: group.name, multiplier: PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier };
          }

          // statusはpurchaseOfferのまま維持する: 同じグループの別の物件を続けて購入できるようにするため。
          set({
            players,
            monopolyAchievement,
            log: pushLog(state, logMessage),
          });
        },

        finishPropertyShopping: () => {
          const state = get();
          if (state.status !== "purchaseOffer") return;
          const player = currentPlayer(state);
          set({
            pendingPropertyGroupId: null,
            status: "resolvingEvent",
            log: pushLog(state, `${player.name}さんは物件購入を終えた`),
          });
          finishLandingAndEndTurn();
        },

        dismissMonopolyAchievement: () => set({ monopolyAchievement: null }),

        continueAfterArrival: () => {
          const state = get();
          if (state.status !== "destinationArrived") return;
          set({ arrivalInfo: null, status: "destinationFocus" });
        },

        continueAfterDestinationFocus: () => {
          const state = get();
          if (state.status !== "destinationFocus") return;
          endTurn();
        },

        continueAfterMoneyRoulette: () => {
          const state = get();
          if (state.status !== "moneyRoulette") return;
          set({ moneyRouletteInfo: null });
          finishLandingAndEndTurn();
        },

        continueAfterCardDraw: () => {
          const state = get();
          if (state.status !== "cardDraw" || !state.cardDrawInfo) return;
          const { playerId, playerName, cardId } = state.cardDrawInfo;
          const player = state.players.find((p) => p.id === playerId);
          if (!player) return;
          const def = getCardDef(cardId);

          if (player.cardIds.length < MAX_CARDS_PER_PLAYER) {
            const players = updatePlayer(state.players, playerId, (p) => ({
              ...p,
              cardIds: [...p.cardIds, cardId],
            }));
            set({
              players,
              cardDrawInfo: null,
              status: "resolvingEvent",
              log: pushLog(state, `${playerName}さんがカード「${def?.name}」を手に入れた!`),
            });
            finishLandingAndEndTurn();
            return;
          }

          // 所持上限に達している: 自動で捨てず、整理画面(cardOverflow)で選んでもらう。
          set({
            cardDrawInfo: null,
            status: "cardOverflow",
            cardOverflowInfo: { playerId, playerName, currentCardIds: player.cardIds, newCardId: cardId },
          });
        },

        resolveCardOverflow: (decision) => {
          const state = get();
          if (state.status !== "cardOverflow" || !state.cardOverflowInfo) return;
          const { playerId, playerName, currentCardIds, newCardId } = state.cardOverflowInfo;

          let finalCardIds: string[];
          let logMessage: string;

          if (decision.discard === "newCard") {
            finalCardIds = currentCardIds;
            logMessage = `${playerName}さんは「${getCardDef(newCardId)?.name}」を見送り、手札を維持した`;
          } else {
            const discardedId = currentCardIds[decision.index];
            if (discardedId === undefined) return;
            finalCardIds = currentCardIds.map((id, i) => (i === decision.index ? newCardId : id));
            logMessage = `${playerName}さんは「${getCardDef(discardedId)?.name}」を手放し、「${getCardDef(newCardId)?.name}」を手に入れた`;
          }

          const players = updatePlayer(state.players, playerId, (p) => ({ ...p, cardIds: finalCardIds }));
          set({
            players,
            cardOverflowInfo: null,
            status: "resolvingEvent",
            log: pushLog(state, logMessage),
          });
          finishLandingAndEndTurn();
        },

        continueAfterSettlementIntro: () => {
          const state = get();
          if (state.status !== "settlementIntro") return;
          set({ status: "settlement" });
        },

        continueAfterSettlement: () => {
          const state = get();
          if (state.status !== "settlement") return;
          set({ settlementInfo: null });
          advanceToNextTurn(); // 決算判定は済んでいるので、再判定せず手番だけ送る
        },
      };
    },
    {
      name: "shonan-sugoroku-save",
      // バージョン番号の上げ忘れに依存しないよう、読み込みのたびに毎回検証する。
      // `merge`は復元データがストアへ実際に反映される「前」に割り込めるので、
      // 不正なノードID(マップを作り直した後の残骸)を持つ保存は、1フレームも
      // ストアに反映させずにそのまま破棄できる(onRehydrateStorageは反映"後"の後始末なので、
      // 反映された瞬間に描画がクラッシュするケースに間に合わなかった)。
      merge: (persisted, currentState) => {
        const state = persisted as Partial<GameState> | undefined;
        if (!state || typeof state.mapId !== "string" || !(state.mapId in maps)) {
          return currentState;
        }
        const validNodeIds = new Set(maps[state.mapId].nodes.map((n) => n.id));
        const destOk = !state.destinationNodeId || validNodeIds.has(state.destinationNodeId);
        const playersOk =
          !state.players ||
          state.players.every(
            (p) =>
              validNodeIds.has(p.currentNodeId) &&
              (p.moveHistory ?? []).every((id) => validNodeIds.has(id)),
          );
        if (!destOk || !playersOk) {
          return currentState;
        }
        // 旧セーブ(previousNodeIdのみ持ち、moveHistoryが無い)を読み込んだ場合のフォールバック。
        const players = state.players?.map((p) =>
          p.moveHistory && p.moveHistory.length > 0 ? p : { ...p, moveHistory: [p.currentNodeId] },
        );

        // 旧セーブ(SettlementEntryにnetWorthAfterが無い形式)を決算演出/画面の表示中に
        // 保存していた場合の防御。お金は書き込み時点で既に反映済みなので実害はなく、
        // その年の決算表示だけを1回スキップしてrollingへ戻す。
        const staleEntry = state.settlementInfo?.entries?.[0];
        const hasStaleSettlementInfo =
          (state.status === "settlementIntro" || state.status === "settlement") &&
          !!state.settlementInfo &&
          (!staleEntry || !("netWorthAfter" in staleEntry));
        const settlementOverride = hasStaleSettlementInfo
          ? { status: "rolling" as const, settlementInfo: null }
          : {};

        return {
          ...currentState,
          ...state,
          ...(players ? { players } : {}),
          // 旧セーブにキー自体が無ければcurrentState(IDLE_STATE由来)の既定値がそのまま使われる。
          netWorthHistory: state.netWorthHistory ?? currentState.netWorthHistory,
          pendingDiceCount: state.pendingDiceCount ?? currentState.pendingDiceCount,
          activeVehicleMode: state.activeVehicleMode ?? currentState.activeVehicleMode,
          diceFaces: state.diceFaces ?? currentState.diceFaces,
          ...settlementOverride,
        };
      },
    },
  ),
);
