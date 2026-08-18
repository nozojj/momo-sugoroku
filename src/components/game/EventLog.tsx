"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/types/game";

interface EventLogProps {
  log: LogEntry[];
}

export function EventLog({ log }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length]);

  const recent = log.slice(-30);

  return (
    <div className="h-32 overflow-y-auto rounded-xl border border-amber-900/10 bg-linear-to-b from-white/90 to-amber-50/50 p-2.5 text-xs leading-relaxed shadow-sm dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50">
      {recent.map((entry) => (
        <p key={entry.id} className="text-slate-600 dark:text-slate-300">
          <span className="mr-1 text-slate-400">T{entry.turn}</span>
          {entry.message}
        </p>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
