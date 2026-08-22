// @vitest-environment jsdom
//
// useBgmController.ts(Phase11/P11-1)の自動テスト。
// useGameplaySoundEffects.test.tsと同じ設計: bgmManager.tsの実際の再生ロジック
// (idempotency・fade・autoplay対応等)はbgmManager.test.tsで既に検証済みのため、
// ここでは「どのGameStatusのときにどのsceneでbgmManager.setScene()を呼ぶか/呼ばないか」
// だけを@/lib/audio/bgmManagerをモックして検証する。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { bgmManager } from "@/lib/audio/bgmManager";
import { sceneForStatus, useBgmController } from "./useBgmController";
import type { GameStatus } from "@/types/game";

vi.mock("@/lib/audio/bgmManager", () => ({
  bgmManager: { setScene: vi.fn() },
}));

const setSceneMock = vi.mocked(bgmManager.setScene);

function setState(patch: Partial<ReturnType<typeof useGameStore.getState>>): void {
  act(() => {
    useGameStore.setState(patch);
  });
}

// GameStatus(src/types/game.ts)の実際のunion全17種類。sceneForStatus()の網羅性を
// 型レベル(switch+neverのexhaustive check)だけでなくテストでも回帰検知できるよう、
// ここに実際のunionをそのまま書き下す。
const ALL_STATUS_SCENE_PAIRS: [GameStatus, string][] = [
  ["waiting", "title"],
  ["rolling", "gameplay"],
  ["selectingRoute", "gameplay"],
  ["moving", "gameplay"],
  ["resolvingEvent", "gameplay"],
  ["purchaseOffer", "gameplay"],
  ["destinationArrived", "destinationCelebration"],
  ["destinationFocus", "gameplay"],
  ["cardWarpAnnounce", "gameplay"],
  ["cardWarpFocus", "gameplay"],
  ["selectingCardTarget", "gameplay"],
  ["moneyRoulette", "gameplay"],
  ["cardDraw", "gameplay"],
  ["cardOverflow", "gameplay"],
  ["settlementIntro", "gameplay"],
  ["settlement", "settlement"],
  ["finished", "gameOver"],
];

describe("sceneForStatus", () => {
  it("GameStatusの全17種類を網羅し、期待したBgmSceneIdへ対応している", () => {
    expect(ALL_STATUS_SCENE_PAIRS).toHaveLength(17);
    for (const [status, expected] of ALL_STATUS_SCENE_PAIRS) {
      expect(sceneForStatus(status)).toBe(expected);
    }
  });

  it("gameplayに属するstatusは13種類(destinationFocus/cardWarpFocus等を含む)", () => {
    const gameplayStatuses = ALL_STATUS_SCENE_PAIRS.filter(([, scene]) => scene === "gameplay");
    expect(gameplayStatuses).toHaveLength(13);
  });
});

describe("useBgmController", () => {
  beforeEach(() => {
    setSceneMock.mockClear();
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["P1"], 1);
  });

  afterEach(() => {
    // useGameStoreはモジュール単位のシングルトンでテスト間をまたいで生き続けるため、
    // renderHook()のunmountを明示的に行わないと前のテストのフックが購読したままになる
    // (useGameplaySoundEffects.test.tsと同じ注意点)。
    cleanup();
    vi.restoreAllMocks();
  });

  it("マウント時、現在のstatusに対応するsceneでsetSceneが呼ばれる", () => {
    setState({ status: "waiting" });
    renderHook(() => useBgmController());

    expect(setSceneMock).toHaveBeenCalledWith("title");
  });

  it("同じsceneに属する複数のstatus遷移では、setSceneが再度呼ばれない", () => {
    setState({ status: "rolling" });
    renderHook(() => useBgmController());
    setSceneMock.mockClear();

    setState({ status: "moving" }); // 同じ"gameplay"
    expect(setSceneMock).not.toHaveBeenCalled();

    setState({ status: "purchaseOffer" }); // 同じく"gameplay"
    expect(setSceneMock).not.toHaveBeenCalled();

    setState({ status: "destinationFocus" }); // 同じく"gameplay"
    expect(setSceneMock).not.toHaveBeenCalled();
  });

  it("シーンが変わるstatus遷移でだけsetSceneが呼ばれる", () => {
    setState({ status: "rolling" });
    renderHook(() => useBgmController());
    setSceneMock.mockClear();

    setState({ status: "destinationArrived" });
    expect(setSceneMock).toHaveBeenCalledTimes(1);
    expect(setSceneMock).toHaveBeenCalledWith("destinationCelebration");

    setSceneMock.mockClear();
    setState({ status: "settlement" });
    expect(setSceneMock).toHaveBeenCalledTimes(1);
    expect(setSceneMock).toHaveBeenCalledWith("settlement");

    setSceneMock.mockClear();
    setState({ status: "finished" });
    expect(setSceneMock).toHaveBeenCalledTimes(1);
    expect(setSceneMock).toHaveBeenCalledWith("gameOver");
  });
});
