// テスト専用のヘルパー。本番コード(gameStore.ts等)からは一切importされない。
// useGameStoreの公開アクション(startGame/resetGame/rollDice/advanceStep/chooseRoute)
// と、既にexport済みの純粋なマップユーティリティ(getMap/shortestDistance)だけを使う。
// resolveLanding()/finishLandingAndEndTurn()/checkDestinationArrival()/endTurn()のような
// privateな内部関数には一切アクセスしない。
import { vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";

/** 各テストの直前に呼び、useGameStoreを確実にクリーンな1人プレイのゲームへ初期化する。 */
export function freshGame(): void {
  useGameStore.getState().resetGame();
  useGameStore.getState().startGame(["テストP1"], 1);
}

/**
 * 現在の(先頭)プレイヤーを指定ノードへ配置し、目的地・ロール前状態を設定する。
 * 公開の`setState`(zustand標準API)だけを使い、gameStore.ts側のロジックには触れない。
 */
export function placePlayerAt(nodeId: string, destinationNodeId: string): void {
  const state = useGameStore.getState();
  const player = state.players[0];
  useGameStore.setState({
    players: [{ ...player, currentNodeId: nodeId, moveHistory: [nodeId] }],
    destinationNodeId,
    status: "rolling",
    diceResult: null,
    diceFaces: null,
    remainingMoves: 0,
    pendingDoubleMove: false,
    pendingDiceCount: 1,
    routeOptions: [],
    arrivalInfo: null,
  });
}

/**
 * 次にrollDice()が呼ばれたときの出目(1〜6、ダイス1個の前提)を1回分だけ固定する。
 * rollDice()内部はresolveDiceRoll()経由でMath.random()を`1 + Math.floor(random()*6)`という
 * 式に通す(第3段階で実装済み)。区間の中点を使い、丸め誤差で境界を跨がないようにする。
 * ここで作るspyはテスト側のafterEach(vi.restoreAllMocks())で毎回確実に元へ戻す想定。
 */
export function mockSingleDiceFace(face: number): void {
  if (face < 1 || face > 6) throw new Error(`face must be 1-6, got ${face}`);
  vi.spyOn(Math, "random").mockReturnValue((face - 0.5) / 6);
}

/** routeOptionsの中から、目的地への最短距離が最小の選択肢を1つ選ぶ。
 *  「目的地に向かって進む」動きを経路データから逆算せず、実際のグラフに対して
 *  shortestDistance()(既存の純関数)で毎回計算することで、マップ改変にも追従する。 */
function pickOptionTowardDestination(mapId: string, destinationNodeId: string, options: { nodeId: string }[]): string {
  const map = getMap(mapId);
  let best = options[0];
  let bestDist = shortestDistance(map, best.nodeId, destinationNodeId, []) ?? Infinity;
  for (const opt of options.slice(1)) {
    const d = shortestDistance(map, opt.nodeId, destinationNodeId, []) ?? Infinity;
    if (d < bestDist) {
      best = opt;
      bestDist = d;
    }
  }
  return best.nodeId;
}

/**
 * 移動中(moving/selectingRoute)のあいだ、公開アクション(advanceStep/chooseRoute)だけを
 * 使って1歩だけ進める。分岐では常に目的地への最短距離が最小になる方を選ぶ(目的地到達後は
 * その時点からの最短近傍を選ぶだけで、それ以降どこへ向かうかはテストの関心事ではない)。
 * 呼び出し側(テスト)が1歩ごとにstateを確認できるよう、ループはテスト側に持たせる。
 * @returns 進行を続けられるか(status が "moving" か "selectingRoute" のままか)
 */
export function stepOnce(): boolean {
  const state = useGameStore.getState();
  if (state.status === "selectingRoute") {
    const nodeId = pickOptionTowardDestination(state.mapId, state.destinationNodeId, state.routeOptions);
    useGameStore.getState().chooseRoute(nodeId);
    return true;
  }
  if (state.status === "moving") {
    useGameStore.getState().advanceStep();
    return true;
  }
  return false;
}

/** 着地(またはそれ以外の停止状態)まで、目的地方向へ最短優先でstepOnce()を繰り返す。
 *  無限ループ防止のため上限ステップ数を設ける(理論上、実マップでは到達しない)。 */
export function driveToLanding(maxSteps = 200): void {
  for (let i = 0; i < maxSteps; i++) {
    if (!stepOnce()) return;
  }
  throw new Error(`driveToLanding: exceeded ${maxSteps} steps without landing`);
}

/**
 * マス効果(プラス/マイナス/カード/物件/イベント)テスト専用の、決め打ち経路ヘルパー。
 * stepOnce()/driveToLanding()(目的地バイアス)とは完全に独立した別関数で、
 * 既存の目的地到着テストの挙動には一切影響しない。
 *
 * 分岐(selectingRoute)になったら、routeOptionsの中に`preferredNodeId`があればそれを選び、
 * 無ければ(その分岐がテスト対象と無関係な場合)先頭の選択肢を選ぶ。今回のマス効果テストは
 * いずれも「最初の分岐で目的のマスへの方向を1回選べば、その先は単一経路になる」実マップの
 * 経路だけを使うので、この単純な戦略で十分(調査段階でgetTraversableOptions()により確認済み)。
 */
export function stepOnceToward(preferredNodeId: string): boolean {
  const state = useGameStore.getState();
  if (state.status === "selectingRoute") {
    const match = state.routeOptions.find((o) => o.nodeId === preferredNodeId);
    const nodeId = match ? match.nodeId : state.routeOptions[0].nodeId;
    useGameStore.getState().chooseRoute(nodeId);
    return true;
  }
  if (state.status === "moving") {
    useGameStore.getState().advanceStep();
    return true;
  }
  return false;
}

/** 着地まで、stepOnceToward(preferredNodeId)を繰り返す版のdriveToLanding()。 */
export function driveToLandingToward(preferredNodeId: string, maxSteps = 200): void {
  for (let i = 0; i < maxSteps; i++) {
    if (!stepOnceToward(preferredNodeId)) return;
  }
  throw new Error(`driveToLandingToward: exceeded ${maxSteps} steps without landing`);
}

/**
 * stepBack()テスト専用: 「呼び出し前後で何も変わっていないこと」「特定のマス効果用フィールドが
 * 変化していないこと」を比較しやすくするための、関連stateだけを抜き出したスナップショット。
 * 先頭プレイヤー(players[0])のみを対象にする(既存ヘルパーはすべて1人プレイのテスト前提のため)。
 */
export interface RelevantStateSnapshot {
  currentNodeId: string;
  moveHistory: string[];
  money: number;
  cardIds: string[];
  ownedPropertyIds: string[];
  destinationsReached: number;
  remainingMoves: number;
  status: string;
  routeOptions: string[];
  arrivalInfo: unknown;
  moneyRouletteInfo: unknown;
  cardDrawInfo: unknown;
  pendingPropertyGroupId: string | null;
  destinationNodeId: string;
  logLength: number;
}

export function snapshotRelevantState(): RelevantStateSnapshot {
  const s = useGameStore.getState();
  const p = s.players[0];
  return {
    currentNodeId: p.currentNodeId,
    moveHistory: [...p.moveHistory],
    money: p.money,
    cardIds: [...p.cardIds],
    ownedPropertyIds: [...p.ownedPropertyIds],
    destinationsReached: p.destinationsReached,
    remainingMoves: s.remainingMoves,
    status: s.status,
    routeOptions: s.routeOptions.map((o) => o.nodeId),
    arrivalInfo: s.arrivalInfo,
    moneyRouletteInfo: s.moneyRouletteInfo,
    cardDrawInfo: s.cardDrawInfo,
    pendingPropertyGroupId: s.pendingPropertyGroupId,
    destinationNodeId: s.destinationNodeId,
    logLength: s.log.length,
  };
}

/**
 * 「通過した瞬間」を検証するためのヘルパー。remainingMovesを使い切る前に、先頭プレイヤーが
 * targetNodeId上に乗った時点でstepOnceToward()を止める(そこで停止=着地処理はまだ行わない)。
 * 出発地点が分岐(prevId未確定で複数選択肢になる場合を含む)であっても、
 * stepOnceToward()を複数回に分けて呼ぶ必要があることをこの関数の中に閉じ込める。
 */
export function advanceUntilAt(targetNodeId: string, maxSteps = 20): void {
  for (let i = 0; i < maxSteps; i++) {
    if (useGameStore.getState().players[0].currentNodeId === targetNodeId) return;
    if (!stepOnceToward(targetNodeId)) {
      throw new Error(`advanceUntilAt: landed/停止してしまい ${targetNodeId} 到達前に移動が終わった`);
    }
  }
  throw new Error(`advanceUntilAt: exceeded ${maxSteps} steps without reaching ${targetNodeId}`);
}
