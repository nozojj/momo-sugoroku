/**
 * Polish Phase 3d: 「車がカーブでごく軽く傾く」演出(curve lean)のための計算だけを行う
 * 純関数群。GameState/gameStore/DOM/Reactのいずれにも依存しない。
 *
 * 調査結果(Phase 3d詳細調査)により、normal車両の本番画像(public/vehicles/normal-*.webp)は
 * top-down素材ではなく右下方向を向いた3/4パースのイラストであることが確認されている。
 * そのため「進行方向そのものへ車体を360°rotateして正確に向ける」方式は採用しない
 * (90°/180°回転させると3/4パース素材が横倒し・逆さに見えて破綻するため)。
 * 代わりに、進行方向が変化したstepだけ、ごく小さいrotate(lean)を一時的に加える
 * ことで「画像が完全に同じ姿勢でスライドしているように見える」違和感だけを軽減する。
 */

/**
 * 画面座標(SVG/CSS座標系: xは右+、yは下+)でのdx,dyから進行方向(heading、度)を求める。
 * 右=0°、下=90°、左=180°(または-180°)、上=-90°になる。
 */
export function getHeadingDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * previousHeadingからnextHeadingへの最短方向のsigned turn delta(度)を返す。
 * 結果は常に(-180, 180]に正規化される(例: 0°→90°=+90°、90°→0°=-90°、
 * 350°→10°=+20°、10°→350°=-20°)。
 *
 * ちょうど180°(Uターン)は数学上どちらの回転方向でも同距離のため、浮動小数点誤差や
 * headingの算出タイミングによって+180になったり-180になったりして毎回向きが
 * 不安定にならないよう、この関数では常に+180に決定的に統一する。
 */
export function getSignedTurnDelta(previousHeading: number, nextHeading: number): number {
  const raw = nextHeading - previousHeading;
  const wrapped = (((raw + 180) % 360) + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** curve leanの最大角度(度)。「回転」ではなく「カーブ時の軽い反動」に留めるための上限。
 *  実ブラウザ確認で6〜10°程度の範囲なら調整してよいが、大きな角度にはしない。 */
export const MAX_CURVE_LEAN_DEG = 8;

/** turnDeltaの絶対値がこの角度(度)に達した時点でMAX_CURVE_LEAN_DEGへ到達する。
 *  これ以上(鋭角カーブ〜180°Uターン)は頭打ちにし、それ以上大きく傾けない。 */
const FULL_LEAN_TURN_DEG = 90;

/**
 * signed turn delta(度)から、実際に車体へ適用するcurve lean角度(度)を求める。
 * 0°(直進)からFULL_LEAN_TURN_DEG(90°)まで線形にスケールし、それ以上
 * (Uターン含む)はMAX_CURVE_LEAN_DEGで頭打ちにする。符号(左右)はturnDeltaに従う
 * (turnDelta>0=右カーブ→+lean、turnDelta<0=左カーブ→-lean)。
 */
export function getCurveLeanDeg(turnDelta: number): number {
  const magnitude = Math.min(Math.abs(turnDelta), FULL_LEAN_TURN_DEG);
  const scaled = (magnitude / FULL_LEAN_TURN_DEG) * MAX_CURVE_LEAN_DEG;
  return turnDelta < 0 ? -scaled : scaled;
}
