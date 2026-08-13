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
