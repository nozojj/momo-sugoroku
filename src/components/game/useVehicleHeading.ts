"use client";

import { useState } from "react";
import { getCurveLeanDeg, getHeadingDeg, getSignedTurnDelta } from "@/lib/game/vehicleHeading";

export interface VehicleHeading {
  /** このstepで適用するcurve leanの開始角度(deg)。0のときは演出不要(初回mount、または直進)。 */
  leanDeg: number;
  /** x/yが実際に変化するたびに1つずつ増える値。CarToken側でこれをkeyに使うことで、
   *  同じleanDegが連続しても(同じ角度のカーブが続く道等)アニメーションを毎step必ず
   *  再生させる(CarToken.tsx既存のkey={vehicleMode}による変身flash再生と同じ考え方)。 */
  stepKey: number;
}

interface TrackedPosition {
  x: number;
  y: number;
  /** 直近の進行方向(度)。previous positionがまだ無い(初回mount直後)場合はnull。 */
  heading: number | null;
}

/**
 * Polish Phase 3d: 「進行方向が変化したstepだけ、車体をカーブ方向へ軽く傾ける」ための
 * curve lean値を計算する薄いhook(調査結果の推奨C案)。gameStore/GameStatusを一切読まず、
 * 渡されたx/y(cluster offset適用前のノード座標。CarToken.tsxのx,yプロップそのもの)の
 * 変化だけを見る。これにより:
 *   - 同一マスに他プレイヤーが増減してcluster offsetだけが変わっても反応しない
 *     (offsetX/offsetYはこのhookに一切渡さない設計)。
 *   - CarTokenはplayer.id単位でマウントされるため、複数プレイヤー間でheadingが
 *     混ざることは構造的に起こらない。
 *   - 分岐選択(chooseRoute)・通常前進・戻る(stepBack)のいずれも「x/yが変わった」という
 *     事実だけを見るため、経路の種類によって遅延・特別扱いが発生しない。
 *
 * useEffectではなく「レンダー中に前回値と比較し、変化があればsetStateする」という
 * Reactが公式に推奨する「propsの変化に応じてstateを補正する」パターンを使う。
 * これにより位置(親gのtranslate、propsから直接算出)とcurve lean(このhookのstate)が
 * 同一コミット内で揃い、1フレームの遅延やちらつきが発生しない。
 */
export function useVehicleHeading(x: number, y: number): VehicleHeading {
  const [tracked, setTracked] = useState<TrackedPosition>({ x, y, heading: null });
  const [result, setResult] = useState<VehicleHeading>({ leanDeg: 0, stepKey: 0 });

  if (tracked.x !== x || tracked.y !== y) {
    const dx = x - tracked.x;
    const dy = y - tracked.y;
    const heading = getHeadingDeg(dx, dy);
    // 初回の実移動(前回headingがまだ無い)はturn deltaを計算しようがないため、安全にlean 0とする。
    const leanDeg = tracked.heading === null ? 0 : getCurveLeanDeg(getSignedTurnDelta(tracked.heading, heading));

    setTracked({ x, y, heading });
    setResult((prev) => ({ leanDeg, stepKey: prev.stepKey + 1 }));
  }

  return result;
}
