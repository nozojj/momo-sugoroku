// Node環境ではzustandのpersistミドルウェアがwindow.localStorageを取得できず、
// (本番コードには影響のない)非永続のメモリストアへ自動的にフォールバックする。
// その際、set()のたびに「storageが使えない」旨のconsole.warnが大量に出るため、
// そのメッセージだけをテスト出力から間引く(他の警告は隠さない)。
// gameStore.ts等の本番コードは一切変更していない。
//
// vi.spyOnではなく直接差し替える: 各テストファイルがMath.random用のvi.spyOnを
// afterEachでvi.restoreAllMocks()する運用なので、ここをvi.spyOnにすると
// 最初のテスト後にこの抑制自体が巻き込まれて解除されてしまう。
import { afterAll, beforeAll } from "vitest";

const ZUSTAND_PERSIST_STORAGE_WARNING = "[zustand persist middleware]";

let originalWarn: typeof console.warn;

beforeAll(() => {
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes(ZUSTAND_PERSIST_STORAGE_WARNING)) return;
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
