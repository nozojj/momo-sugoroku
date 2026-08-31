// persistMigration.tsのmergeGameState()のうち、年度イベント(currentYearEventId)まわりの
// フォールバック挙動だけを対象にした自動テスト。マップ整合性チェック等の既存の防御ロジックは
// このファイルの対象外(壊れていない前提の最小構成のpersistedオブジェクトを使う)。
import { describe, expect, it } from "vitest";
import { mergeGameState } from "@/store/persistMigration";
import { useGameStore } from "@/store/gameStore";
import { defaultMapId } from "@/data/maps";

function currentStateWith(currentYearEventId: string) {
  return { ...useGameStore.getState(), currentYearEventId };
}

describe("mergeGameState(): currentYearEventId のフォールバック", () => {
  it("有効なidを持つ旧セーブはそのまま復元される", () => {
    const currentState = currentStateWith("normal");
    const persisted = { mapId: defaultMapId, currentYearEventId: "heatwave" };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.currentYearEventId).toBe("heatwave");
  });

  it("yearEventDefsに存在しないidを持つ旧セーブは、currentState側の値へ安全にフォールバックする", () => {
    const currentState = currentStateWith("typhoon");
    const persisted = { mapId: defaultMapId, currentYearEventId: "no_such_event_id_from_old_save" };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.currentYearEventId).toBe("typhoon");
  });

  it("キー自体が存在しない旧セーブ(この機能の実装前)も、currentState側の値へフォールバックする", () => {
    const currentState = currentStateWith("coolSummer");
    const persisted = { mapId: defaultMapId };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.currentYearEventId).toBe("coolSummer");
  });
});

describe("mergeGameState(): destinationArrivedのstale-guard", () => {
  it("arrivalInfoが揃ったdestinationArrivedはそのまま復元される", () => {
    const currentState = { ...useGameStore.getState(), status: "rolling" as const, arrivalInfo: null };
    const arrivalInfo = {
      playerId: "p1",
      playerName: "プレイヤー1",
      playerColor: "#e6483e",
      destinationName: "鎌倉",
      bonus: 300,
      nextDestinationName: "辻堂",
    };
    const persisted = { mapId: defaultMapId, status: "destinationArrived", arrivalInfo };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.status).toBe("destinationArrived");
    expect(merged.arrivalInfo).toEqual(arrivalInfo);
  });

  it("arrivalInfoが欠けたままのdestinationArrivedは操作不能にならず、rollingへ安全に復帰する", () => {
    const currentState = { ...useGameStore.getState(), status: "rolling" as const, arrivalInfo: null };
    const persisted = { mapId: defaultMapId, status: "destinationArrived" };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.status).toBe("rolling");
    expect(merged.arrivalInfo).toBeNull();
  });
});

describe("mergeGameState(): troubleCharacterOwnerId のフォールバック", () => {
  it("実在するプレイヤーIDを指す旧セーブはそのまま復元される", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBe("p1");
  });

  it("存在しないプレイヤーIDを指す不正なセーブはnullへフォールバックする", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p999_no_such_player",
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
  });

  it("キー自体が存在しない旧セーブ(この機能の実装前)もnullへフォールバックする", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
  });

  it("nullのまま保存されたセーブはnullのまま復元される(未登場状態を維持する)", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: null,
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
  });
});

describe("mergeGameState(): troubleCharacterFormId のフォールバック(S-3a)", () => {
  it("owner登場済み・既知の形態idを持つセーブはそのまま復元される", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null, troubleCharacterFormId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBe("p1");
    expect(merged.troubleCharacterFormId).toBe("normal");
  });

  it("owner登場済みだが未知の形態id(将来削除/リネームされたid)は\"normal\"へフォールバックする", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null, troubleCharacterFormId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "no_such_form_id",
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBe("p1");
    expect(merged.troubleCharacterFormId).toBe("normal");
  });

  it("旧セーブ(troubleCharacterFormId追加前、キー自体が無い)でも、owner登場済みなら\"normal\"へ安全に復元される", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null, troubleCharacterFormId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      // troubleCharacterFormId キー自体を持たない旧セーブを模擬(意図的に省略)
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBe("p1");
    expect(merged.troubleCharacterFormId).toBe("normal");
  });

  it("owner未登場(null)なら、形態にどんな値が残っていても強制的にnullへ揃える(owner/formの不整合を許さない)", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null, troubleCharacterFormId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p999_no_such_player", // ownerはnullへフォールバックする不正値
      troubleCharacterFormId: "normal",
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
    expect(merged.troubleCharacterFormId).toBeNull();
  });

  it("旧セーブ(owner/formどちらのキーも無い)は、双方ともnull(未登場)のまま復元される", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterOwnerId: null, troubleCharacterFormId: null };
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
    expect(merged.troubleCharacterFormId).toBeNull();
  });
});

describe("mergeGameState(): troubleCharacterPossessionCount のフォールバック(S-3c)", () => {
  function baseCurrentState() {
    return {
      ...useGameStore.getState(),
      troubleCharacterOwnerId: null,
      troubleCharacterFormId: null,
      troubleCharacterPossessionCount: null,
    };
  }

  it("owner登場済み・0以上の整数のセーブはそのまま復元される", () => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: 5,
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBe("p1");
    expect(merged.troubleCharacterPossessionCount).toBe(5);
  });

  it("owner登場済みでもcount=0のセーブは、そのまま0として復元される(0はフォールバック対象ではない)", () => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: 0,
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterPossessionCount).toBe(0);
  });

  it("旧セーブ(troubleCharacterPossessionCount追加前、キー自体が無い)でも、owner登場済みなら0へ安全に復元される", () => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
      // troubleCharacterPossessionCount キー自体を持たない旧セーブを模擬(意図的に省略)
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterPossessionCount).toBe(0);
  });

  it.each([
    ["負数", -1],
    ["NaN", NaN],
    ["小数", 2.5],
  ])("owner登場済みだが不正な値(%s)は0へフォールバックする", (_label, badValue) => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: badValue,
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterPossessionCount).toBe(0);
  });

  it("owner未登場(null)なら、countにどんな値が残っていても強制的にnullへ揃える(owner/form/countの不整合を許さない)", () => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
      troubleCharacterOwnerId: "p999_no_such_player", // ownerはnullへフォールバックする不正値
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: 5,
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
    expect(merged.troubleCharacterFormId).toBeNull();
    expect(merged.troubleCharacterPossessionCount).toBeNull();
  });

  it("旧セーブ(owner/form/countいずれのキーも無い)は、すべてnull(未登場)のまま復元される", () => {
    const currentState = baseCurrentState();
    const persisted = {
      mapId: defaultMapId,
      players: [{ id: "p1", currentNodeId: currentState.players[0]?.currentNodeId ?? "hub_fujisawa", moveHistory: [] }],
    };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterOwnerId).toBeNull();
    expect(merged.troubleCharacterFormId).toBeNull();
    expect(merged.troubleCharacterPossessionCount).toBeNull();
  });
});

describe("mergeGameState(): troubleCharacterAnnounceInfo のフォールバック(非ブロッキング通知)", () => {
  it("通知表示中(非null)のまま保存されたセーブは、そのまま復元される(statusには依存しない一時通知のため)", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterAnnounceInfo: null };
    const info = { kind: "appeared" as const, ownerId: "p1", ownerName: "プレイヤー1" };
    const persisted = { mapId: defaultMapId, troubleCharacterAnnounceInfo: info };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterAnnounceInfo).toEqual(info);
  });

  it("キー自体が存在しない旧セーブは、currentState側の値(既定null)へフォールバックする(操作不能にならない)", () => {
    const currentState = { ...useGameStore.getState(), troubleCharacterAnnounceInfo: null };
    const persisted = { mapId: defaultMapId };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.troubleCharacterAnnounceInfo).toBeNull();
  });
});

describe("mergeGameState(): yearEventAnnounceInfo のフォールバック", () => {
  it("演出表示中(非null)のまま保存されたセーブは、そのまま復元される(statusには依存しない一時通知のため)", () => {
    const currentState = { ...useGameStore.getState(), yearEventAnnounceInfo: null };
    const persisted = { mapId: defaultMapId, yearEventAnnounceInfo: { year: 2, eventId: "heatwave" } };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.yearEventAnnounceInfo).toEqual({ year: 2, eventId: "heatwave" });
  });

  it("キー自体が存在しない旧セーブは、currentState側の値(既定null)へフォールバックする", () => {
    const currentState = { ...useGameStore.getState(), yearEventAnnounceInfo: null };
    const persisted = { mapId: defaultMapId };

    const merged = mergeGameState(persisted, currentState);

    expect(merged.yearEventAnnounceInfo).toBeNull();
  });
});
