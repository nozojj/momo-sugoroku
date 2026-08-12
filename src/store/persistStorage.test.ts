import { describe, expect, it } from "vitest";
import { createSafeJSONStorage } from "@/store/persistStorage";

/** zustandのStateStorage互換の最小フェイク。実際のlocalStorageと同じく、キーが無ければnullを返す。 */
function createFakeStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (name: string) => (name in data ? data[name] : null),
    setItem: (name: string, value: string) => {
      data[name] = value;
    },
    removeItem: (name: string) => {
      delete data[name];
    },
  };
}

describe("createSafeJSONStorage", () => {
  it("正常なJSONは今まで通り読み込める", () => {
    const saved = { state: { mapId: "shonan-full" }, version: 0 };
    const fake = createFakeStorage({ "save-key": JSON.stringify(saved) });
    const storage = createSafeJSONStorage(() => fake)!;

    expect(storage.getItem("save-key")).toEqual(saved);
  });

  it('"undefined"という文字列でも例外を投げずnullを返す', () => {
    const fake = createFakeStorage({ "save-key": "undefined" });
    const storage = createSafeJSONStorage(() => fake)!;

    expect(() => storage.getItem("save-key")).not.toThrow();
    expect(storage.getItem("save-key")).toBeNull();
  });

  it("不正なJSONでも例外を投げずnullを返す", () => {
    const fake = createFakeStorage({ "save-key": "{not valid json" });
    const storage = createSafeJSONStorage(() => fake)!;

    expect(() => storage.getItem("save-key")).not.toThrow();
    expect(storage.getItem("save-key")).toBeNull();
  });

  it("空文字でも例外を投げずnullを返す", () => {
    const fake = createFakeStorage({ "save-key": "" });
    const storage = createSafeJSONStorage(() => fake)!;

    expect(() => storage.getItem("save-key")).not.toThrow();
    expect(storage.getItem("save-key")).toBeNull();
  });

  it("storage.getItem自体が例外を投げてもクラッシュさせない", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const storage = createSafeJSONStorage(() => throwingStorage)!;

    expect(() => storage.getItem("save-key")).not.toThrow();
    expect(storage.getItem("save-key")).toBeNull();
  });

  it("正常なデータを誤ってcorrupted扱いしない(退避キーを作らず本キーも消さない)", () => {
    const saved = { state: { mapId: "shonan-full" }, version: 0 };
    const fake = createFakeStorage({ "save-key": JSON.stringify(saved) });
    const storage = createSafeJSONStorage(() => fake)!;

    storage.getItem("save-key");

    expect(fake.data["save-key"]).toBe(JSON.stringify(saved));
    expect(Object.keys(fake.data).some((k) => k.startsWith("save-key__corrupted_"))).toBe(false);
  });

  it("壊れたデータは__corrupted_へ退避してから本キーを削除する", () => {
    const fake = createFakeStorage({ "save-key": "undefined" });
    const storage = createSafeJSONStorage(() => fake)!;

    storage.getItem("save-key");

    expect(fake.data["save-key"]).toBeUndefined();
    const backupKeys = Object.keys(fake.data).filter((k) => k.startsWith("save-key__corrupted_"));
    expect(backupKeys).toHaveLength(1);
    expect(fake.data[backupKeys[0]]).toBe("undefined");
  });

  it("windowが無い(getStorageが例外を投げる)場合はundefinedを返す(SSR/テスト環境の既存フォールバックを維持)", () => {
    const storage = createSafeJSONStorage(() => {
      throw new ReferenceError("window is not defined");
    });

    expect(storage).toBeUndefined();
  });
});
