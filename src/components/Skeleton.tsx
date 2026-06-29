import React from "react";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 rounded-md ${className || ""}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
    </div>
  );
}
