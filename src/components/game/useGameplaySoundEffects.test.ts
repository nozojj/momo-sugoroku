// @vitest-environment jsdom
//
// useGameplaySoundEffects.ts(Phase10/P10-1)の自動テスト。
// playSE()自体の再生ロジック(SE有効/無効・音量・同一tick内の重複防止)はsoundManager.test.tsで
// 既に検証済みのため、ここでは「どの状態変化のときにどのidでplaySE()を呼ぶか/呼ばないか」だけを
// @/lib/audio/soundManagerをモックして検証する。useGameStoreは実ストアをそのまま使い、
// setState()で直接状態を差し替えることでgameStore.ts側の実際のset()呼び出しパターン
// (advanceToNextTurn()がcurrentPlayerIndexとstatus:"rolling"を必ず同時に更新する、等)を模す。
//
// useGameStore.setState()はReactのイベントハンドラの外(テストコードの同期実行)から
// 呼ぶため、必ずact()で包む。act()無しだと、useSyncExternalStore経由の強制再レンダーと
// renderHookの内部レンダーが二重に走り、useEffectが余分に発火してしまう(実測で確認済み)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { playSE } from "@/lib/audio/soundManager";
import { useGameplaySoundEffects } from "./useGameplaySoundEffects";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

function setState(patch: Partial<ReturnType<typeof useGameStore.getState>>): void {
  act(() => {
    useGameStore.setState(patch);
  });
}

describe("useGameplaySoundEffects", () => {
  beforeEach(() => {
    playSEMock.mockClear();
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["P1"], 1);
  });

  afterEach(() => {
    // renderHook()はこのプロジェクトのvitest設定(globals:trueではない)ではRTLの自動cleanupが
    // 効かないため、明示的にunmountする。useGameStoreはモジュール単位のシングルトンで
    // テスト間をまたいで生き続けるため、これを怠ると前のテストのフックが購読したままになり、
    // 後続テストのsetState()で複数回playSE()が呼ばれてしまう(実測で確認済み)。
    cleanup();
    vi.restoreAllMocks();
  });

  describe("dice_roll", () => {
    it("diceResultがnull→非nullになった瞬間に1回だけ呼ばれる", () => {
      renderHook(() => useGameplaySoundEffects());

      setState({ diceResult: 4, status: "moving" });

      expect(playSEMock).toHaveBeenCalledTimes(1);
      expect(playSEMock).toHaveBeenCalledWith("dice_roll");
    });

    it("同じdiceResultのまま別の状態変化で再レンダーしても再度は呼ばれない", () => {
      renderHook(() => useGameplaySoundEffects());

      setState({ diceResult: 4, status: "moving" });
      playSEMock.mockClear();

      setState({ status: "selectingRoute" }); // diceResultは4のまま

      expect(playSEMock).not.toHaveBeenCalledWith("dice_roll");
    });

    it("null経由でリセットされた次のロールでは再度呼ばれる(1ターンごとに1回)", () => {
      renderHook(() => useGameplaySoundEffects());

      setState({ diceResult: 4, status: "moving" });
      setState({ diceResult: null, status: "rolling" }); // endTurn()相当のリセット
      playSEMock.mockClear();

      setState({ diceResult: 2, status: "moving" });

      expect(playSEMock).toHaveBeenCalledTimes(1);
      expect(playSEMock).toHaveBeenCalledWith("dice_roll");
    });
  });

  describe("step_move", () => {
    function currentPlayer() {
      return useGameStore.getState().players[useGameStore.getState().currentPlayerIndex];
    }

    it("status:movingでmoveHistoryが1つ伸びるたびに1回ずつ呼ばれる", () => {
      renderHook(() => useGameplaySoundEffects());
      const p = currentPlayer();
      setState({
        status: "moving",
        players: [{ ...p, moveHistory: [...p.moveHistory, "next_node_1"] }],
      });

      expect(playSEMock).toHaveBeenCalledTimes(1);
      expect(playSEMock).toHaveBeenCalledWith("step_move");

      playSEMock.mockClear();
      const p2 = currentPlayer();
      setState({
        status: "moving",
        players: [{ ...p2, moveHistory: [...p2.moveHistory, "next_node_2"] }],
      });

      expect(playSEMock).toHaveBeenCalledTimes(1);
      expect(playSEMock).toHaveBeenCalledWith("step_move");
    });

    it("着地専用tick(remainingMoves<=0でmoveHistoryが変わらない)では呼ばれない", () => {
      renderHook(() => useGameplaySoundEffects());
      setState({ status: "moving" }); // moveHistoryは変化させない

      expect(playSEMock).not.toHaveBeenCalledWith("step_move");
    });

    it("分岐選択待ちtick(status:selectingRouteでmoveHistoryが変わらない)では呼ばれない", () => {
      renderHook(() => useGameplaySoundEffects());
      setState({ status: "selectingRoute" });

      expect(playSEMock).not.toHaveBeenCalledWith("step_move");
    });

    it("stepBack相当(moveHistoryが縮む)では呼ばれない", () => {
      renderHook(() => useGameplaySoundEffects());
      const p = currentPlayer();
      setState({
        status: "moving",
        players: [{ ...p, moveHistory: [...p.moveHistory, "a", "b"] }],
      });
      playSEMock.mockClear();

      const p2 = currentPlayer();
      setState({
        status: "selectingRoute",
        players: [{ ...p2, moveHistory: p2.moveHistory.slice(0, -1) }], // stepBack()と同じ「1つ縮む」操作
      });

      expect(playSEMock).not.toHaveBeenCalledWith("step_move");
    });

    it("プレイヤー交代でmoveHistory.lengthが増えて見えても誤発火しない(status!==movingを経由するため)", () => {
      renderHook(() => useGameplaySoundEffects());
      const p1 = currentPlayer();

      // プレイヤー1が3手分移動した状態(moveHistory.length=4: 開始地点+3手)。
      setState({
        status: "moving",
        players: [{ ...p1, moveHistory: [...p1.moveHistory, "a", "b", "c"] }],
      });
      playSEMock.mockClear();

      // advanceToNextTurn()相当: currentPlayerIndexとstatus:"rolling"を同じ更新で同時に切り替える。
      // 交代先プレイヤー2の「前回ターンの残り」moveHistoryを、プレイヤー1の最終値より
      // あえて長く(length=6)設定し、最悪ケース(単純な長さ比較だと誤検知しうる状況)を再現する。
      const p2 = {
        ...p1,
        id: "p2",
        name: "P2",
        moveHistory: ["start", "x", "y", "z", "w", "v"],
      };
      setState({
        players: [useGameStore.getState().players[0], p2],
        currentPlayerIndex: 1,
        status: "rolling",
        diceResult: null,
      });

      expect(playSEMock).not.toHaveBeenCalledWith("step_move");

      // プレイヤー2がロールしてmoveHistoryが[currentNodeId]の1件へリセットされ、status:"moving"へ。
      setState({
        status: "moving",
        diceResult: 3,
        players: [
          useGameStore.getState().players[0],
          { ...useGameStore.getState().players[1], moveHistory: [p2.currentNodeId] },
        ],
      });
      playSEMock.mockClear();

      // プレイヤー2の実際の1歩目。
      const p2AfterRoll = useGameStore.getState().players[1];
      setState({
        status: "moving",
        players: [useGameStore.getState().players[0], { ...p2AfterRoll, moveHistory: [...p2AfterRoll.moveHistory, "next"] }],
      });

      expect(playSEMock).toHaveBeenCalledTimes(1);
      expect(playSEMock).toHaveBeenCalledWith("step_move");
    });
  });
});
