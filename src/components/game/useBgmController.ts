"use client";

import { useEffect } from "react";
import type { GameStatus } from "@/types/game";
import { useGameStore } from "@/store/gameStore";
import { bgmManager } from "@/lib/audio/bgmManager";
import type { BgmSceneId } from "@/lib/audio/bgmTracks";

/**
 * GameStatus → BgmSceneIdの変換をここに一元化する。switch文はGameStatusの全17値を
 * 明示的に列挙し(ワイルドカードのdefaultへ委ねない)、末尾のdefault節でnever型へ代入する
 * ことで、GameStatusへ新しい値が将来追加された場合にコンパイルエラーとして検知できる
 * ようにしている(暗黙的に"gameplay"へフォールバックして型漏れを隠さない)。
 *
 * destinationFocus(次の目的地マスへカメラが移動する演出中)は、Board上のカメラ演出の
 * 一種でGameScreen.tsx側の早期return(Board自体のアンマウント)を一切伴わない点で
 * cardWarpFocusと同じ性質を持つため、cardWarpFocusと同じ"gameplay"に分類している。
 */
export function sceneForStatus(status: GameStatus): BgmSceneId {
  switch (status) {
    case "waiting":
      return "title";
    case "rolling":
    case "moving":
    case "selectingRoute":
    case "resolvingEvent":
    case "purchaseOffer":
    case "destinationFocus":
    case "cardWarpAnnounce":
    case "cardWarpFocus":
    case "selectingCardTarget":
    case "moneyRoulette":
    case "cardDraw":
    case "cardOverflow":
    case "settlementIntro":
      return "gameplay";
    case "destinationArrived":
      return "destinationCelebration";
    case "settlement":
      return "settlement";
    case "finished":
      return "gameOver";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

/**
 * GameStatusの変化を監視し、bgmManagerへシーン切り替えだけを指示する薄いフック
 * (useGameplaySoundEffects.tsと同じ設計思想: gameStore.ts・各Modal/Toastには一切BGM
 * 再生の責務を持たせず、この1箇所だけがstatusを読んでbgmManagerを操作する)。
 *
 * useEffectの依存配列はstatusそのものではなくsceneにしている。これによりgameplayに
 * 属する12種類のstatus同士の遷移(rolling→moving→resolvingEvent→...)ではsceneの値が
 * 変化しないため、effect自体が再発火せずbgmManager.setScene()も呼ばれない
 * (CPUターンの高速なstatus遷移でBGMが不必要に再スタートすることを構造的に防ぐ)。
 *
 * GameScreen.tsxの早期return(waiting/settlement/destinationArrived)より前で呼び出す
 * ことで、画面差し替えをまたいでもこのフック自体は生存し続ける(GameScreen関数自体は
 * page.tsxから一度きりマウントされる単一コンポーネントで、内部の早期returnはGameScreen
 * 自身のマウント/アンマウントには影響しないため)。
 */
export function useBgmController(): void {
  const status = useGameStore((s) => s.status);
  const scene = sceneForStatus(status);

  useEffect(() => {
    bgmManager.setScene(scene);
  }, [scene]);
}
