import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GameState, Player, RouteOption } from "@/types/game";
import { getMap, defaultMapId, maps } from "@/data/maps";
import { getNode, getTraversableOptions, pickRandomDestination, rollDice as rollDiceValue } from "@/lib/game/mapGraph";
import { getPropertyDef } from "@/data/properties";
import { getCardDef } from "@/data/cards";
import { resolveLandingOutcome } from "@/lib/game/landingEffects";
import { createInitialState, makeLogId, computeWinnerIds, DESTINATION_BONUS, DEFAULT_TOTAL_TURNS } from "@/lib/game/engine";

const IDLE_STATE: GameState = {
  mapId: defaultMapId,
  players: [],
  currentPlayerIndex: 0,
  turn: 0,
  totalTurns: DEFAULT_TOTAL_TURNS,
  destinationNodeId: "",
  diceResult: null,
  remainingMoves: 0,
  pendingDoubleMove: false,
  extraRollGranted: false,
  status: "waiting",
  routeOptions: [],
  pendingPropertyId: null,
  arrivalInfo: null,
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
  buyProperty: () => void;
  skipProperty: () => void;
  /** 到着演出モーダルを閉じて次のプレイヤーへ手番を送る */
  continueAfterArrival: () => void;
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

      function endTurn() {
        const state = get();

        if (state.extraRollGranted) {
          set({
            extraRollGranted: false,
            status: "rolling",
            diceResult: null,
            remainingMoves: 0,
            pendingPropertyId: null,
          });
          return;
        }

        const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
        // nextIndex === 0 は「全員が1回ずつ行動した」= turn(月)が進む瞬間。
        // 将来ここに季節イベント抽選を、getCalendar(nextTurn).isYearStart が true の場合に
        // 決算(年次の物件収益計算など)を差し込める。
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
          pendingPropertyId: null,
        });
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
          case "card": {
            const players = updatePlayer(state.players, player.id, (p) => ({
              ...p,
              cardIds: [...p.cardIds, outcome.cardId],
            }));
            set({ players, status: "resolvingEvent", log: pushLog(state, outcome.message) });
            finishLandingAndEndTurn();
            return;
          }
          case "purchaseOffer": {
            set({ status: "purchaseOffer", pendingPropertyId: outcome.propertyId });
            return; // buyProperty/skipPropertyの操作待ち
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
          if (!def || def.kind !== "usable") return;

          const playersAfterUse = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            cardIds: p.cardIds.filter((id) => id !== cardId),
          }));

          if (def.effect === "doubleMove") {
            set({
              players: playersAfterUse,
              pendingDoubleMove: true,
              log: pushLog(state, `${player.name}さんが「${def.name}」を使った! 次の出目が2倍になる。`),
            });
          } else if (def.effect === "diceAgain") {
            set({
              players: playersAfterUse,
              extraRollGranted: true,
              log: pushLog(state, `${player.name}さんが「${def.name}」を使った! この手番の後、もう一度サイコロを振れる。`),
            });
          }
        },

        rollDice: () => {
          const state = get();
          if (state.status !== "rolling" || state.diceResult !== null) return;
          const raw = rollDiceValue();
          const result = state.pendingDoubleMove ? raw * 2 : raw;
          const player = currentPlayer(state);
          const wasDoubled = state.pendingDoubleMove;
          set({
            diceResult: raw,
            remainingMoves: result,
            pendingDoubleMove: false,
            status: "moving",
            log: pushLog(state, `${player.name}さんがサイコロを振った: ${raw}${wasDoubled ? " (2倍で" + result + "マス)" : ""}`),
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
          const options = getTraversableOptions(node, player.previousNodeId, player.cardIds);

          if (options.length === 0) {
            // 理論上発生しない(孤立ノードは無い)が、保険として着地処理へ。
            resolveLanding();
            return;
          }

          if (options.length === 1) {
            const to = options[0].to;
            const players = updatePlayer(state.players, player.id, (p) => ({
              ...p,
              previousNodeId: p.currentNodeId,
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
            previousNodeId: p.currentNodeId,
            currentNodeId: nodeId,
          }));
          set({
            players,
            remainingMoves: state.remainingMoves - 1,
            status: "moving",
            routeOptions: [],
          });
        },

        buyProperty: () => {
          const state = get();
          if (state.status !== "purchaseOffer" || !state.pendingPropertyId) return;
          const def = getPropertyDef(state.pendingPropertyId);
          const player = currentPlayer(state);
          if (!def || player.money < def.price) return;

          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            money: p.money - def.price,
            ownedPropertyIds: [...p.ownedPropertyIds, def.id],
          }));
          set({
            players,
            pendingPropertyId: null,
            status: "resolvingEvent",
            log: pushLog(state, `${player.name}さんが「${def.name}」を購入した(${def.price}万円)`),
          });
          finishLandingAndEndTurn();
        },

        skipProperty: () => {
          const state = get();
          if (state.status !== "purchaseOffer") return;
          const player = currentPlayer(state);
          set({
            pendingPropertyId: null,
            status: "resolvingEvent",
            log: pushLog(state, `${player.name}さんは購入を見送った`),
          });
          finishLandingAndEndTurn();
        },

        continueAfterArrival: () => {
          const state = get();
          if (state.status !== "destinationArrived") return;
          set({ arrivalInfo: null });
          endTurn();
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
            (p) => validNodeIds.has(p.currentNodeId) && (p.previousNodeId == null || validNodeIds.has(p.previousNodeId)),
          );
        if (!destOk || !playersOk) {
          return currentState;
        }
        return { ...currentState, ...state };
      },
    },
  ),
);
