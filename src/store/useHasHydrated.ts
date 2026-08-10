"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "./gameStore";

/** zustand persistのrehydration(localStorageからの復元)が完了したかどうか。
 *  GameState/GameStoreには一切フィールドを追加せず、persistが標準で持つ
 *  `persist.hasHydrated()`/`persist.onFinishHydration()`だけを使って判定する
 *  独立したフック。
 *
 *  初期値は(サーバーはもちろん、クライアントの最初のhydrateレンダーでも)必ず
 *  `false`固定にする。`useState`の初期化関数内で`persist.hasHydrated()`を
 *  同期的に読むと、クライアント側では既にrehydration自体が終わっている場合が
 *  あり、その値がサーバー側の出力(常にfalse相当)と食い違ってReactの
 *  hydrationミスマッチを起こす。実際の判定はuseEffect(クライアントの
 *  hydration完了後にしか走らない)側だけで行う。
 *
 *  `useGameStore.persist`はSSR中は存在しない: persistのデフォルトstorageは
 *  `window.localStorage`を即座に参照するため、windowが無いサーバー側では
 *  内部で例外を吸収してstorageがundefinedのまま初期化され、`api.persist`自体が
 *  一切アタッチされない(zustand本体の既知の挙動)。そのため`?.`必須。 */
export function useHasHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (useGameStore.persist?.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    return useGameStore.persist?.onFinishHydration(() => setHasHydrated(true));
  }, []);

  return hasHydrated;
}
