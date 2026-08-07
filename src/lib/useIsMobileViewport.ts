"use client";

import { useEffect, useState } from "react";

/** Tailwindのsmブレークポイント(既定640px)を基準に、スマホ幅かどうかを購読する。 */
export function useIsMobileViewport(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpointPx]);

  return isMobile;
}
