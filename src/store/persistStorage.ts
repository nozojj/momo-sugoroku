import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

/**
 * zustand標準のcreateJSONStorage()と同じ配線(window.localStorage/JSON.parse・JSON.stringify)を
 * 保ちつつ、getItem()だけを防御的にする。
 *
 * "undefined"という文字列・空文字・壊れたJSON・getItem自体が投げる例外など、rehydration中に
 * 起こり得る読み込み失敗をここで吸収し、例外を外へ一切投げない(persist側の.catch()はhasHydrated
 * を立てないため、ここで止めないと画面が永久に「読み込み中…」のままになる)。失敗時はnullを返し、
 * 「セーブなし」として扱う(以降はmergeGameStateの既存フォールバックがIDLE_STATEへ安全に導く)。
 *
 * 壊れていた生データは`${name}__corrupted_<timestamp>`へ退避してから本キーを削除する。以後の
 * 読み込みでは同じ壊れたデータを何度もパースし直さずに済む(通常の「セーブなし」経路と同じになる)。
 *
 * getStorage()自体が例外を投げる場合(window自体が無いSSR/Node環境)は、zustand標準の
 * createJSONStorage()と同じくundefinedを返す。persist側はこの戻り値を見て永続化の配線自体を
 * スキップする(既存のSSR/テストのフォールバック挙動には一切手を入れない)。
 */
export function createSafeJSONStorage<S>(getStorage: () => StateStorage): PersistStorage<S> | undefined {
  let storage: StateStorage;
  try {
    storage = getStorage();
  } catch {
    return undefined;
  }

  return {
    getItem: (name) => {
      let rawResult: string | null | Promise<string | null>;
      try {
        rawResult = storage.getItem(name);
      } catch {
        return null;
      }
      // 非同期storage(Promiseを返す実装)は非対応。window.localStorageは常に同期なので実運用では
      // 起こらないが、型上あり得る値なので「セーブなし」と同じ安全側へ倒す。
      if (typeof rawResult !== "string") return null;
      const raw = rawResult;

      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        try {
          storage.setItem(`${name}__corrupted_${Date.now()}`, raw);
          storage.removeItem(name);
        } catch {
          // 退避・削除に失敗しても(例: quota超過)、rehydrationを止めないことを優先する
        }
        return null;
      }
    },
    setItem: (name, value) => storage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => storage.removeItem(name),
  };
}
