import { getCalendar } from "@/lib/game/engine";

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}万円`;
}

export function formatMoneyDelta(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("ja-JP")}万円`;
}

/** Renders a 1-indexed round number as a Momotetsu-style calendar date, starting 1年4月. */
export function formatGameMonth(turnNumber: number): string {
  const { year, month } = getCalendar(turnNumber);
  return `${year}年${month}月`;
}
