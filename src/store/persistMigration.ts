import type { GameState } from "@/types/game";
import type { GameStore } from "@/store/gameStore";
import { maps } from "@/data/maps";
import { getYearEventDef } from "@/lib/game/yearEvent";

/**
 * persist(zustand)のmerge処理。gameStore.ts本体(ゲーム進行ロジック)から切り出した、
 * 「セーブ互換処理」専用のファイル。get/setには一切依存しない純関数。
 *
 * バージョン番号の上げ忘れに依存しないよう、読み込みのたびに毎回検証する。
 * `merge`は復元データがストアへ実際に反映される「前」に割り込めるので、
 * 不正なノードID(マップを作り直した後の残骸)を持つ保存は、1フレームも
 * ストアに反映させずにそのまま破棄できる(onRehydrateStorageは反映"後"の後始末なので、
 * 反映された瞬間に描画がクラッシュするケースに間に合わなかった)。
 */
export function mergeGameState(persisted: unknown, currentState: GameStore): GameStore {
  const state = persisted as Partial<GameState> | undefined;
  if (!state || typeof state.mapId !== "string" || !(state.mapId in maps)) {
    return currentState;
  }

  // 旧セーブが使っていたGameStatusの値"selectingWarpTarget"を新名"selectingCardTarget"へ
  // 読み替える。中身(targetSelectInfoの構造)は変えていない単純な改名なので、statusの
  // 文字列を読み替えるだけで旧セーブの選択中画面もそのまま復元できる。
  const migratedStatus: GameState["status"] =
    (state.status as string) === "selectingWarpTarget" ? "selectingCardTarget" : (state.status as GameState["status"]);

  const validNodeIds = new Set(maps[state.mapId].nodes.map((n) => n.id));
  const destOk = !state.destinationNodeId || validNodeIds.has(state.destinationNodeId);
  const playersOk =
    !state.players ||
    state.players.every(
      (p) =>
        validNodeIds.has(p.currentNodeId) &&
        (p.moveHistory ?? []).every((id) => validNodeIds.has(id)),
    );
  const cardWarpOk = !state.cardWarpInfo || validNodeIds.has(state.cardWarpInfo.targetNodeId);
  if (!destOk || !playersOk || !cardWarpOk) {
    return currentState;
  }
  // 旧セーブ(previousNodeIdのみ持ち、moveHistoryが無い / activeDebuffsが無い)を
  // 読み込んだ場合のフォールバック。
  const players = state.players?.map((p) => ({
    ...p,
    moveHistory: p.moveHistory && p.moveHistory.length > 0 ? p.moveHistory : [p.currentNodeId],
    activeDebuffs: p.activeDebuffs ?? [],
    // 旧セーブ(controlledBy追加前)は必ず人間として扱う。
    controlledBy: p.controlledBy ?? "human",
  }));

  // 旧セーブ(SettlementEntryにnetWorthAfterが無い形式)を決算演出/画面の表示中に
  // 保存していた場合の防御。お金は書き込み時点で既に反映済みなので実害はなく、
  // その年の決算表示だけを1回スキップしてrollingへ戻す。
  const staleEntry = state.settlementInfo?.entries?.[0];
  const hasStaleSettlementInfo =
    (migratedStatus === "settlementIntro" || migratedStatus === "settlement") &&
    !!state.settlementInfo &&
    (!staleEntry || !("netWorthAfter" in staleEntry));
  const settlementOverride = hasStaleSettlementInfo
    ? { status: "rolling" as const, settlementInfo: null }
    : {};

  // cardWarpAnnounce/cardWarpFocus表示中の情報(cardWarpInfo)が欠けたまま保存された場合の防御。
  // 演出モーダルを表示する術が無いまま操作不能になる(GameScreen側はstatus+cardWarpInfoの両方が
  // 揃って初めてモーダルを出す)ので、settlementIntro/settlementと同じ考え方でrollingへ戻す。
  const hasStaleCardWarpInfo =
    (migratedStatus === "cardWarpAnnounce" || migratedStatus === "cardWarpFocus") && !state.cardWarpInfo;
  const cardWarpOverride = hasStaleCardWarpInfo ? { status: "rolling" as const } : {};

  // destinationArrived表示中の到着演出情報(arrivalInfo)が欠けたまま保存された場合の防御。
  // cardWarpInfoと同じ考え方(GameScreen側はstatus+arrivalInfoの両方が揃って初めて到着演出画面を
  // 出すため、arrivalInfoが無いと演出を表示する術が無いまま操作不能になる)なのでrollingへ戻す。
  const hasStaleArrivalInfo = migratedStatus === "destinationArrived" && !state.arrivalInfo;
  const arrivalOverride = hasStaleArrivalInfo ? { status: "rolling" as const, arrivalInfo: null } : {};

  // selectingCardTarget表示中の選択肢情報(targetSelectInfo)が欠けている/空のまま保存された
  // 場合の防御。cardWarpInfoと同じ考え方(選択画面を出す術が無いまま操作不能になるのを防ぐ)。
  // optionIdの意味はselectKindごとに異なる(ノードID/グループID/プレイヤーIDのいずれか)ため、
  // ここでは中身までは検証せず、「情報が揃っているか」だけを見る浅いチェックに留める。
  const hasStaleTargetSelectInfo =
    migratedStatus === "selectingCardTarget" &&
    (!state.targetSelectInfo || state.targetSelectInfo.options.length === 0);
  const targetSelectOverride = hasStaleTargetSelectInfo ? { status: "rolling" as const, targetSelectInfo: null } : {};

  return {
    ...currentState,
    ...state,
    status: migratedStatus,
    ...(players ? { players } : {}),
    // 旧セーブにキー自体が無ければcurrentState(IDLE_STATE由来)の既定値がそのまま使われる。
    // currentYearEventIdは単純な??ではなくgetYearEventDef()で存在確認までする: 将来
    // yearEventDefsのidをリネーム/削除した場合でも、旧セーブが指す消えたidをそのまま
    // 復元してクラッシュさせず、currentStateの値へ安全にフォールバックする(存在しない
    // idのままでもyearEventGenreMultiplier()は全ジャンル×1として扱うため実害は無いが、
    // 表示側のgetYearEventDef()呼び出しが毎回undefinedになるのを避けるための保険)。
    currentYearEventId: getYearEventDef(state.currentYearEventId) ? state.currentYearEventId! : currentState.currentYearEventId,
    // 演出中(yearEventAnnounceInfo非null)のまま保存されたセーブを読み込んでも、statusには
    // 依存しない一時通知なので演出が再度出るだけで操作不能にはならない(cardWarpInfo等と違い
    // stale-status防御は不要)。念のためundefined(旧セーブにキー自体が無い場合)だけ吸収する。
    yearEventAnnounceInfo: state.yearEventAnnounceInfo ?? currentState.yearEventAnnounceInfo,
    // 妨害キャラ(仮称)の所有者IDが、実在するプレイヤーIDを指しているかを検証する。旧セーブ
    // (このフィールド追加前、キー自体が無い)・不正なID(プレイヤー人数が変わった等)のどちらも
    // null(未登場)へ安全にフォールバックする。currentYearEventIdと同じ「値そのものを検証して
    // フォールバックする」方針で、destOk/playersOk(検証失敗でセーブ全体を破棄する)とは異なる。
    troubleCharacterOwnerId:
      state.troubleCharacterOwnerId && state.players?.some((p) => p.id === state.troubleCharacterOwnerId)
        ? state.troubleCharacterOwnerId
        : null,
    // troubleCharacterAnnounceInfoはstatusとは独立した一時通知(yearEventAnnounceInfoと同じ設計)
    // なので、destinationArrived等のようなstatus連動のstale-guardは不要。欠落していても
    // 単に通知が出ないだけで操作不能にはならない。
    troubleCharacterAnnounceInfo: state.troubleCharacterAnnounceInfo ?? currentState.troubleCharacterAnnounceInfo,
    netWorthHistory: state.netWorthHistory ?? currentState.netWorthHistory,
    pendingDiceCount: state.pendingDiceCount ?? currentState.pendingDiceCount,
    activeVehicleMode: state.activeVehicleMode ?? currentState.activeVehicleMode,
    diceFaces: state.diceFaces ?? currentState.diceFaces,
    cardWarpInfo: state.cardWarpInfo ?? currentState.cardWarpInfo,
    targetSelectInfo: state.targetSelectInfo ?? currentState.targetSelectInfo,
    ...settlementOverride,
    ...cardWarpOverride,
    ...targetSelectOverride,
    ...arrivalOverride,
  };
}
