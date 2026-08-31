import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GameState, Player, PlayerController, RouteOption } from "@/types/game";
import { getMap, defaultMapId } from "@/data/maps";
import { getNode, getTraversableOptions } from "@/lib/game/mapGraph";
import { resolveDiceRoll } from "@/lib/game/diceRoll";
import { detectDestinationArrival } from "@/lib/game/destinationArrival";
import { movePlayerForward } from "@/lib/game/playerMovement";
import { getPropertyDef, propertyDefs } from "@/data/properties";
import { getPropertyGroupDef, propertyGroupDefs } from "@/data/propertyGroups";
import { detectMonopolyAchievement } from "@/lib/game/propertyMonopoly";
import { getCardDef } from "@/data/cards";
import { resolveLandingOutcome } from "@/lib/game/landingEffects";
import { CARD_EFFECT_HANDLERS, effectKind, isDiceModifierEffect } from "@/lib/game/cardEffects";
import { WARP_HANDLERS } from "@/lib/game/warpEffects";
import { TARGET_SELECT_HANDLERS } from "@/lib/game/targetSelectEffects";
import { DEBUFF_DEFS, listRivalPlayerOptions } from "@/lib/game/debuffEffects";
import type { WarpEffect, TargetSelectEffect, RivalDebuffEffect, ActiveDebuff } from "@/types/game";
import { calculateSettlement } from "@/lib/game/settlement";
import { drawYearEvent } from "@/lib/game/yearEvent";
import {
  pickInitialTroubleCharacterOwner,
  checkTroubleCharacterHandoff as detectTroubleCharacterHandoff,
  drawTroubleCharacterMischief,
  applyTroubleCharacterMischief,
} from "@/lib/game/troubleCharacter";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";
import { mergeGameState } from "@/store/persistMigration";
import { createSafeJSONStorage } from "@/store/persistStorage";
import {
  createInitialState,
  makeLogId,
  makeDebuffId,
  computeWinnerIds,
  getCalendar,
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
  landingResultInfo: null,
  arrivalInfo: null,
  cardWarpInfo: null,
  targetSelectInfo: null,
  moneyRouletteInfo: null,
  cardDrawInfo: null,
  cardOverflowInfo: null,
  settlementInfo: null,
  currentYearEventId: "",
  yearEventAnnounceInfo: null,
  troubleCharacterOwnerId: null,
  troubleCharacterFormId: null,
  troubleCharacterAnnounceInfo: null,
  netWorthHistory: [],
  log: [],
  winnerIds: null,
};

export interface GameStore extends GameState {
  /** ゲーム未開始 or 終了後の初期状態かどうか */
  hasActiveGame: () => boolean;
  startGame: (playerNames: string[], totalYears: number, playerControllers?: PlayerController[]) => void;
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
  /** LandingResultToastの表示が終わった(自動タイムアウト)ときに呼び、通知状態をクリアする。
   *  monopolyAchievementと同じく、statusの遷移やターン進行には一切関与しない。 */
  dismissLandingResult: () => void;
  /** YearEventAnnounceModal(「今年の湘南」演出)の表示が終わったときに呼び、通知状態をクリアする */
  dismissYearEventAnnounce: () => void;
  /** TroubleCharacterAnnounceModal(妨害キャラの登場/交代/悪さ通知)の表示が終わったときに呼び、
   *  通知状態をクリアする。yearEventAnnounceInfo等と同様statusとは独立しており、
   *  呼ばなくてもターン進行は止まらない。 */
  dismissTroubleCharacterAnnounce: () => void;
  /** 到着演出モーダルを閉じ、次の目的地へのカメラ演出(destinationFocus)へ進む */
  continueAfterArrival: () => void;
  /** ワープ発動アナウンス(CharacterAnnouncer)を終え、実際にcurrentNodeIdをワープ先へ書き換えて
   *  カメラ演出(cardWarpFocus)へ進む。ここまでプレイヤーの位置は一切変わっていない。 */
  continueAfterWarpAnnounce: () => void;
  /** ワープ先カメラ演出(自動完了 or タップスキップ)を終え、通常の着地処理(resolveLanding)へ進む。
   *  以降は通常移動と完全に同じ経路(resolveLanding→checkDestinationArrival→…→endTurn)をたどる。 */
  continueAfterCardWarpFocus: () => void;
  /** 選択が要るカードの選択画面で、選択肢(optionId)を1つ確定する。ここで初めてカードを消費する。
   *  カードの種類によって帰結が分岐する: targetSelect(warp系)ならTARGET_SELECT_HANDLERSで
   *  ワープ先を解決してcardWarpAnnounce以降(既存のワープ演出)へ、rivalDebuff(妨害系)なら
   *  対象プレイヤーのactiveDebuffsへ追加してそのままターンを終える。 */
  confirmTargetSelection: (optionId: string) => void;
  /** 選択が要るカードの選択画面をキャンセルする。カードは消費されず手札に残り、rollingへ戻る。 */
  cancelTargetSelection: () => void;
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

/** ダイスの出目・移動量そのものを修飾する予約系カード(doubleMove/multiDice)が既に予約されているか。
 *  即時アクション型カード(warp/targetSelect)はrollDice()を経由しないため、既に予約された効果が
 *  誰にも消費されず次のプレイヤーへ漏れてしまう。予約系どうしの重複ガードと合わせて3箇所で
 *  同じ判定を使うので、ここに1つだけ持つ。 */
function blockedByPendingDiceModifier(state: GameState): boolean {
  return state.pendingDoubleMove || state.pendingDiceCount > 1;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      // --- 着地処理・ターン終了(クロージャでset/getを直接使う) ---

      /** 目的地に到着していたら、ボーナス付与・次の目的地抽選・到着演出への遷移まで行う。到着していたらtrueを返す。
       *  判定・計算そのものはdestinationArrival.tsのdetectDestinationArrival()(純関数)へ委譲し、
       *  ここでは結果を受け取ってset()するだけ。呼び出しタイミング(finishLandingAndEndTurn()経由、
       *  remainingMoves<=0での最終停止時のみ)は変更していない。
       *
       *  妨害キャラ(仮称)の初回登場もここで扱う: detectDestinationArrival()本体(目的地抽選ロジック)
       *  には一切手を入れず、「ゲーム最初の目的地到着(troubleCharacterOwnerIdがまだnull)」のときだけ、
       *  新しく決定された次の目的地(result.destinationNodeId)から最も遠いプレイヤーを
       *  pickInitialTroubleCharacterOwner()で選び、同じset()にまとめて反映する。 */
      function checkDestinationArrival(): boolean {
        const state = get();
        const map = getMap(state.mapId);
        const player = currentPlayer(state);
        const result = detectDestinationArrival(map, player, state.players, state.destinationNodeId);
        if (!result.arrived) return false;

        const troubleCharacterUpdate =
          state.troubleCharacterOwnerId === null
            ? (() => {
                const ownerId = pickInitialTroubleCharacterOwner(map, result.players, result.destinationNodeId);
                const owner = result.players.find((p) => p.id === ownerId)!;
                return {
                  troubleCharacterOwnerId: ownerId,
                  // 初登場は必ず通常形態から(S-3a)。ownerId確定と同じset()にまとめることで
                  // 「owner有り・form無し」という中間状態を1フレームも作らない。
                  troubleCharacterFormId: "normal" as const,
                  troubleCharacterAnnounceInfo: {
                    kind: "appeared" as const,
                    ownerId,
                    ownerName: owner.name,
                  },
                };
              })()
            : {};

        set({
          players: result.players,
          destinationNodeId: result.destinationNodeId,
          status: "destinationArrived",
          arrivalInfo: result.arrivalInfo,
          log: pushLog(state, result.logMessage),
          ...troubleCharacterUpdate,
        });
        return true;
      }

      /** 着地(exact landing)が確定したプレイヤーの位置に、現在の妨害キャラ所有者が既にいれば
       *  moverへ所有者を移す。判定・計算そのものはtroubleCharacter.tsのcheckTroubleCharacterHandoff()
       *  (純関数)へ委譲し、ここでは結果を受け取ってset()するだけ。checkDestinationArrival()とは
       *  完全に独立して評価する(呼び出し側のfinishLandingAndEndTurn()で並列に呼ぶ)ため、同じ着地で
       *  目的地到着と所有者交代が同時に成立しても両方が正しく反映される。 */
      function checkTroubleCharacterHandoff() {
        const state = get();
        const mover = currentPlayer(state);
        const result = detectTroubleCharacterHandoff(state.troubleCharacterOwnerId, mover, state.players);
        if (!result.handedOff) return;

        const fromPlayer = state.players.find((p) => p.id === result.fromPlayerId)!;
        set({
          troubleCharacterOwnerId: result.newOwnerId,
          troubleCharacterAnnounceInfo: {
            kind: "handoff",
            fromPlayerId: result.fromPlayerId,
            fromPlayerName: fromPlayer.name,
            toPlayerId: result.toPlayerId,
            toPlayerName: mover.name,
          },
          log: pushLog(state, `妨害キャラが${fromPlayer.name}さんから${mover.name}さんへ移った!`),
        });
      }

      /**
       * 全員が1回ずつ行動して年度が変わる瞬間(3月終了→4月開始)なら決算を行い、
       * status: "settlementIntro" へ遷移してtrueを返す(この場合、手番送りは
       * continueAfterSettlement()が行う。settlementIntro→settlementの遷移は
       * continueAfterSettlementIntro()が担当する)。
       * 年度が変わらない、またはゲーム終了判定に入る場合はfalseを返し、呼び出し側の通常進行に任せる。
       *
       * 「次に実際に手番を得るプレイヤー」はskipNextRollを持つプレイヤーを飛ばして決まる
       * (advanceToNextTurn()側のロジック)。年境界をまたぐかどうかも、その飛ばし先まで
       * 辿って初めて確定する: 直後の1人だけがまだ年度内でも、その先が全員skipNextRollだと
       * 年度をまたいでさらに先のプレイヤーまで進むことがあるため、「1人先だけ見る」判定では
       * 年境界を見逃してしまう(=その年の決算がまるごと欠落するバグになる)。
       * ここではadvanceToNextTurn()の手番探索ループと全く同じ順序を、状態を一切書き換えずに
       * なぞり、年境界(nextIndexが0に戻り、かつisYearStartになる瞬間)に到達するかどうかだけを見る。
       * state(currentPlayerIndex/turn/activeDebuffs)はここでは一切書き換えないため、trueを
       * 返した後にadvanceToNextTurn()が同じstate.currentPlayerIndex/state.turnから改めて同じ
       * 道のりを辿り直しても、skip消費・妨害キャラいたずら・年度イベント抽選が二重に発生する
       * ことはない(continueAfterSettlement()側の呼び出し方は変更していない)。
       *
       * 計算そのものはcalculateSettlement()(純関数)に委譲し、ここではその結果をset()するだけ。
       */
      function applySettlementIfNeeded(): boolean {
        const state = get();
        let index = state.currentPlayerIndex;
        let turn = state.turn;

        for (let i = 0; i < state.players.length; i++) {
          const nextIndex = (index + 1) % state.players.length;
          const nextTurn = nextIndex === 0 ? turn + 1 : turn;

          if (nextIndex === 0 && getCalendar(nextTurn).isYearStart) {
            const settledYear = getCalendar(state.turn).year;
            // state.currentYearEventIdはこの時点ではまだ決算対象年度(settledYear)のもの
            // (新年度分の再抽選はこの後、実際にturnが繰り上がるadvanceToNextTurn()側で行う)。
            const { entries, updatedPlayers, historyEntry } = calculateSettlement(
              state.players,
              settledYear,
              state.netWorthHistory,
              state.currentYearEventId,
            );
            const isFinalSettlement = nextTurn > state.totalTurns;

            set({
              players: updatedPlayers,
              netWorthHistory: [...state.netWorthHistory, historyEntry],
              status: "settlementIntro",
              settlementInfo: { year: settledYear, isFinalSettlement, yearEventId: state.currentYearEventId, entries },
              log: pushLog(
                state,
                `${settledYear}年目の決算: ${entries.map((e) => `${e.playerName}さん+${e.propertyRevenue}万円`).join("、")}`,
              ),
            });
            return true;
          }

          index = nextIndex;
          turn = nextTurn;

          const candidate = state.players[index];
          const skip = candidate.activeDebuffs.some((d) => d.kind === "skipNextRoll");
          if (!skip) break; // このプレイヤーが実際に手番を得る。年境界を挟まなかったので決算は不要。
        }

        return false;
      }

      /**
       * 手番を次のプレイヤーへ送る(決算判定は済んでいる前提)。規定ターン終了ならゲーム終了へ。
       *
       * skipNextRollを持つプレイヤーは、実際に手番を得る前にその場で1回分だけ消費して読み飛ばす。
       * advanceToNextTurn()を再帰呼び出しする形にはしていない: set()を都度発火させると
       * 中間状態(実際にはプレイヤーには見えない一瞬)が積み重なるだけでなく、将来「複数ターン
       * 停止」のような効果を足したときに再帰の終了条件が増えて追いにくくなる。代わりに、
       * 「次に実際に行動するプレイヤー」をループで求めてから最後に1回だけset()する形にして、
       * 状態異常専用の仕組み(汎用エンジン)は作らずに済ませている。
       * 全員が同時にskipNextRollを持つ(理論上ほぼ発生しない)異常系でも、ループ回数を
       * プレイヤー数で打ち切ることで無限ループを防ぐ。
       */
      function advanceToNextTurn() {
        const state = get();
        let players = state.players;
        let index = state.currentPlayerIndex;
        let turn = state.turn;
        let log = state.log;
        // 新年度(4月)へ進む瞬間だけ設定する。turnが実際にisYearStartへ繰り上がるのは
        // このループ内でだけなので、抽選もここ1箇所に置く(createInitialState()が1年目分を
        // 別途担当する。詳細はそちらのコメント参照)。ゲーム終了(nextTurn > totalTurns)の
        // 分岐はturn=nextTurnへ到達する前にreturnするため、「次年度が存在しない」最終年度末には
        // ここは実行されない。
        let yearEventUpdate: { currentYearEventId: string; yearEventAnnounceInfo: GameState["yearEventAnnounceInfo"] } | null = null;
        // 妨害キャラ(仮称)の「悪さ」は、実際に今回行動するプレイヤーが確定した瞬間(下のif (!skip)の
        // 内側)にだけ判定する。advanceToNextTurn()は手番交代のたびに1回しか呼ばれないため、
        // ここで発生させれば二重発火しない。skipNextRollの消費(既存)より後に評価するので、
        // 既存の処理順序・挙動には影響しない。
        let troubleCharacterEventUpdate: { troubleCharacterAnnounceInfo: GameState["troubleCharacterAnnounceInfo"] } | null = null;

        for (let i = 0; i < players.length; i++) {
          const nextIndex = (index + 1) % players.length;
          const nextTurn = nextIndex === 0 ? turn + 1 : turn;

          if (nextTurn > state.totalTurns) {
            const winnerIds = computeWinnerIds(players);
            set({
              players,
              status: "finished",
              winnerIds,
              log: [...log, { id: makeLogId(), turn, message: `規定ターン終了! ${winnerIds.length > 1 ? "引き分け" : "勝者決定"}` }],
            });
            return;
          }

          index = nextIndex;
          turn = nextTurn;

          if (nextIndex === 0 && getCalendar(turn).isYearStart) {
            const yearEvent = drawYearEvent();
            const year = getCalendar(turn).year;
            yearEventUpdate = { currentYearEventId: yearEvent.id, yearEventAnnounceInfo: { year, eventId: yearEvent.id } };
            log = [...log, { id: makeLogId(), turn, message: `${year}年目が始まりました。今年の湘南は「${yearEvent.icon} ${yearEvent.label}」です。` }];
          }

          const candidate = players[index];
          const skip = candidate.activeDebuffs.find((d) => d.kind === "skipNextRoll");
          if (!skip) {
            // このプレイヤーが実際に手番を行う。妨害キャラ所有者ならここで悪さを1回だけ発生させる。
            if (candidate.id === state.troubleCharacterOwnerId) {
              const mischief = drawTroubleCharacterMischief(troubleCharacterMischiefDefs);
              const application = applyTroubleCharacterMischief(players, candidate.id, mischief);
              players = application.players;
              log = [...log, { id: makeLogId(), turn, message: application.logMessage }];
              troubleCharacterEventUpdate = {
                troubleCharacterAnnounceInfo: {
                  kind: "mischief",
                  playerId: candidate.id,
                  playerName: candidate.name,
                  mischiefKind: mischief.kind,
                  message: mischief.message,
                },
              };
            }
            break;
          }

          players = updatePlayer(players, candidate.id, (p) => ({
            ...p,
            activeDebuffs: p.activeDebuffs.filter((d) => d.id !== skip.id),
          }));
          log = [...log, { id: makeLogId(), turn, message: `${candidate.name}さんは「${skip.sourceCardName}」の効果でこの手番はお休みです。` }];
        }

        set({
          players,
          currentPlayerIndex: index,
          turn,
          status: "rolling",
          diceResult: null,
          remainingMoves: 0,
          pendingPropertyGroupId: null,
          log,
          ...yearEventUpdate,
          ...troubleCharacterEventUpdate,
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
        // 妨害キャラの所有者交代は、目的地到着判定とは独立に必ず1回評価する(通常移動・分岐移動・
        // カードワープのいずれも、着地が確定した経路はすべてここに収束するため個別実装は不要)。
        checkTroubleCharacterHandoff();
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
            // Phase9B/P9-3: ターン進行(この直後のfinishLandingAndEndTurn()による同期的な
            // endTurn())は一切変えず、非ブロッキングの結果通知(landingResultInfo)だけを
            // 追加で乗せる。MonopolyToastと同じ「statusに依存しない一時通知」パターンで、
            // LandingResultToast側の自動タイマーがdismissLandingResult()を呼ぶまで表示され続ける。
            set({
              players,
              status: "resolvingEvent",
              landingResultInfo: {
                playerId: player.id,
                playerName: player.name,
                playerColor: player.color,
                kind: outcome.amount >= 0 ? "moneyGain" : "moneyLoss",
                amount: outcome.amount,
                message: outcome.message,
              },
              log: pushLog(state, outcome.message),
            });
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

        startGame: (playerNames: string[], totalYears: number, playerControllers: PlayerController[] = []) => {
          const initial = createInitialState(defaultMapId, playerNames, totalYears, playerControllers);
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
          const kind = effectKind(def.effect);

          // ぶっとび系カード(即時アクション型): 次のロールに効くstatePatchを返す予約型とは違い、
          // サイコロを振らずにその場で移動先を確定し、着地処理まで進める。予約型カード
          // (doubleMove/multiDice)が既に予約されていると、ワープはrollDice()を経由しないため
          // その予約が誰にも消費されず次のプレイヤーへ漏れてしまう。予約系どうしの重複と同じ
          // ガードで、未消費のまま使用不可にする。
          if (kind === "warp") {
            if (blockedByPendingDiceModifier(state)) {
              set({
                log: pushLog(
                  state,
                  `${player.name}さんは「${def.name}」を使おうとしたが、すでに移動系カードの効果が予約されているため使えなかった。`,
                ),
              });
              return;
            }

            const map = getMap(state.mapId);
            const effect = def.effect as WarpEffect;
            const targetNodeId = WARP_HANDLERS[effect.scope]({ state, map, player });
            const targetNode = getNode(map, targetNodeId);
            const playersAfterUse = updatePlayer(state.players, player.id, (p) => ({
              ...p,
              cardIds: p.cardIds.filter((id) => id !== cardId),
            }));
            set({
              players: playersAfterUse,
              status: "cardWarpAnnounce",
              cardWarpInfo: {
                playerId: player.id,
                playerName: player.name,
                cardId: def.id,
                cardName: def.name,
                targetNodeId,
                targetNodeName: targetNode.name,
              },
              log: pushLog(state, `${player.name}さんが「${def.name}」を使った!`),
            });
            return;
          }

          // 場所指定系カード: warpと違い、使った時点ではまだ移動先を確定しない。選択肢一覧だけを
          // 作ってstatus:"selectingCardTarget"へ遷移する。カードの消費・移動先確定は
          // confirmTargetSelection()(選択確定時)まで遅延させる(キャンセルすればカードは手札に残る)。
          if (kind === "targetSelect") {
            if (blockedByPendingDiceModifier(state)) {
              set({
                log: pushLog(
                  state,
                  `${player.name}さんは「${def.name}」を使おうとしたが、すでに移動系カードの効果が予約されているため使えなかった。`,
                ),
              });
              return;
            }

            const map = getMap(state.mapId);
            const effect = def.effect as TargetSelectEffect;
            const options = TARGET_SELECT_HANDLERS[effect.selectKind].listOptions({ state, map, player });
            set({
              status: "selectingCardTarget",
              targetSelectInfo: {
                playerId: player.id,
                playerName: player.name,
                cardId: def.id,
                cardName: def.name,
                selectKind: effect.selectKind,
                options,
              },
            });
            return;
          }

          // 妨害系カード: targetSelectと同じ選択UI(TargetSelectOverlay)を再利用するが、選ぶのは
          // ノードではなく相手プレイヤー。使った時点ではまだ何も起きない(移動もしない)。カードの
          // 消費・デバフ付与はconfirmTargetSelection()(選択確定時)まで遅延させる。予約系カードが
          // 既に予約されている場合にrollDice()を経由せず手番を終えてしまう問題は warp/targetSelect と
          // 全く同じなので、同じガードを使う。
          if (kind === "rivalDebuff") {
            if (blockedByPendingDiceModifier(state)) {
              set({
                log: pushLog(
                  state,
                  `${player.name}さんは「${def.name}」を使おうとしたが、すでに移動系カードの効果が予約されているため使えなかった。`,
                ),
              });
              return;
            }

            const options = listRivalPlayerOptions({ state, player });
            set({
              status: "selectingCardTarget",
              targetSelectInfo: {
                playerId: player.id,
                playerName: player.name,
                cardId: def.id,
                cardName: def.name,
                selectKind: "rivalPlayer",
                options,
              },
            });
            return;
          }

          const handler = CARD_EFFECT_HANDLERS[kind];
          if (!handler) return;

          // ダイスの出目・移動量そのものを修飾する効果(doubleMove/multiDice)は同時に2つ以上
          // 予約できない。既に予約済みなら、このカードは消費せず状態も変えずに理由をログへ残す。
          if (isDiceModifierEffect(def.effect) && blockedByPendingDiceModifier(state)) {
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

        confirmTargetSelection: (optionId: string) => {
          const state = get();
          if (state.status !== "selectingCardTarget" || !state.targetSelectInfo) return;
          const info = state.targetSelectInfo;
          const option = info.options.find((o) => o.optionId === optionId);
          if (!option) return;
          const player = state.players.find((p) => p.id === info.playerId);
          if (!player) return;
          const def = getCardDef(info.cardId);
          if (!def || def.kind !== "usable" || !def.effect) return;
          const kind = effectKind(def.effect);

          // 妨害系カード: 選んだ相手のactiveDebuffsへ1件追加するだけで、移動もカメラ演出も一切
          // 発生しない(TargetSelectOverlay→カード消費→デバフ付与→ログ→手番終了、という
          // 最も単純な帰結)。デバフの消費(実際の効果発動)は対象プレイヤー自身の手番が来たときに
          // advanceToNextTurn()/rollDice()側が行う(下記参照)。
          if (kind === "rivalDebuff") {
            const effect = def.effect as RivalDebuffEffect;
            const target = state.players.find((p) => p.id === optionId);
            if (!target) return;

            const debuff: ActiveDebuff = {
              id: makeDebuffId(),
              kind: effect.debuffKind,
              sourcePlayerId: player.id,
              sourceCardName: info.cardName,
            };
            const playersAfter = state.players.map((p) => {
              if (p.id === player.id) return { ...p, cardIds: p.cardIds.filter((id) => id !== info.cardId) };
              if (p.id === target.id) return { ...p, activeDebuffs: [...p.activeDebuffs, debuff] };
              return p;
            });

            set({
              players: playersAfter,
              status: "resolvingEvent",
              targetSelectInfo: null,
              log: pushLog(state, DEBUFF_DEFS[effect.debuffKind].describeGrant(player.name, target.name, info.cardName)),
            });
            endTurn();
            return;
          }

          if (kind !== "targetSelect") return; // 防御(理論上到達しない)
          const effect = def.effect as TargetSelectEffect;

          const map = getMap(state.mapId);
          const targetNodeId = TARGET_SELECT_HANDLERS[effect.selectKind].resolveTarget({ state, map, player }, optionId);
          const targetNode = getNode(map, targetNodeId);

          const playersAfterUse = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            cardIds: p.cardIds.filter((id) => id !== info.cardId),
          }));

          set({
            players: playersAfterUse,
            status: "cardWarpAnnounce",
            targetSelectInfo: null,
            cardWarpInfo: {
              playerId: player.id,
              playerName: player.name,
              cardId: info.cardId,
              cardName: info.cardName,
              targetNodeId,
              targetNodeName: targetNode.name,
            },
            log: pushLog(state, `${player.name}さんが「${info.cardName}」で「${option.label}」を選んだ!`),
          });
        },

        cancelTargetSelection: () => {
          const state = get();
          if (state.status !== "selectingCardTarget") return;
          set({ status: "rolling", targetSelectInfo: null });
        },

        rollDice: () => {
          const state = get();
          if (state.status !== "rolling" || state.diceResult !== null) return;
          const diceCount = state.pendingDiceCount;
          const player = currentPlayer(state);

          // 妨害系カード(halveDiceNextRoll)の検知・消費はここ(store側)で行う。出目・合計・
          // 半減/倍化の計算そのものはdiceRoll.tsのresolveDiceRoll()(純関数)へ委譲する。
          const halveDebuff = player.activeDebuffs.find((d) => d.kind === "halveDiceNextRoll");
          const { faces, rawSum, result, rollDescription, modifierSuffix } = resolveDiceRoll({
            diceCount,
            halveDebuff: halveDebuff ? { sourceCardName: halveDebuff.sourceCardName } : null,
            pendingDoubleMove: state.pendingDoubleMove,
          });

          const players = updatePlayer(state.players, player.id, (p) => ({
            ...p,
            moveHistory: [p.currentNodeId],
            activeDebuffs: halveDebuff ? p.activeDebuffs.filter((d) => d.id !== halveDebuff.id) : p.activeDebuffs,
          }));
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
              `${player.name}さんがサイコロを${diceCount > 1 ? diceCount + "個" : ""}振った: ${rollDescription}${modifierSuffix}`,
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
            const players = updatePlayer(state.players, player.id, (p) => movePlayerForward(p, to));
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
          const players = updatePlayer(state.players, player.id, (p) => movePlayerForward(p, nodeId));
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

          // 独占達成の判定(購入前後の所有状況の差分)はpropertyMonopoly.tsへ切り出し済み。
          // ここでは結果を受け取ってset()するだけ。
          const group = getPropertyGroupDef(def.groupId);
          const { monopolyAchievement, logSuffix } = detectMonopolyAchievement(
            def,
            group,
            player.id,
            state.players,
            players,
            propertyDefs,
            propertyGroupDefs,
          );

          // statusはpurchaseOfferのまま維持する: 同じグループの別の物件を続けて購入できるようにするため。
          set({
            players,
            monopolyAchievement,
            log: pushLog(state, `${player.name}さんが「${def.name}」を購入した(${def.price}万円)${logSuffix}`),
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

        dismissLandingResult: () => set({ landingResultInfo: null }),

        dismissYearEventAnnounce: () => set({ yearEventAnnounceInfo: null }),

        dismissTroubleCharacterAnnounce: () => set({ troubleCharacterAnnounceInfo: null }),

        continueAfterArrival: () => {
          const state = get();
          if (state.status !== "destinationArrived") return;
          set({ arrivalInfo: null, status: "destinationFocus" });
        },

        continueAfterWarpAnnounce: () => {
          const state = get();
          if (state.status !== "cardWarpAnnounce" || !state.cardWarpInfo) return;
          const { playerId, playerName, targetNodeId, targetNodeName } = state.cardWarpInfo;
          const players = updatePlayer(state.players, playerId, (p) => ({
            ...p,
            currentNodeId: targetNodeId,
            moveHistory: [targetNodeId],
          }));
          set({
            players,
            status: "cardWarpFocus",
            log: pushLog(state, `${playerName}さんが「${targetNodeName}」へワープした!`),
          });
        },

        continueAfterCardWarpFocus: () => {
          const state = get();
          if (state.status !== "cardWarpFocus") return;
          set({ cardWarpInfo: null });
          resolveLanding();
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
      // 壊れたlocalStorageデータでrehydrationが止まらないようにするgetItemガードは
      // persistStorage.ts へ分離済み。ここでは呼び出すだけ。
      storage: createSafeJSONStorage(() => window.localStorage),
      // 旧セーブのバリデーション・マイグレーション本体は persistMigration.ts へ分離済み
      // (セーブ互換処理とゲーム進行処理の責務を分けるため)。ここでは呼び出すだけ。
      merge: mergeGameState,
    },
  ),
);
