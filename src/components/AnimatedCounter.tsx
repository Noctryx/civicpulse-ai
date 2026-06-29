import React, { useEffect, useState } from "react";

export function AnimatedCounter({ value, duration = 800 }: { value: number | string, duration?: number }) {
  const [count, setCount] = useState(0);
  const target = typeof value === "number" ? value : parseFloat(value as string);

  useEffect(() => {
    if (isNaN(target)) {
      setCount(target);
      return;
    }
    
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // easeOutQuart
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeProgress * target));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(target);
      }
    };
    window.requestAnimationFrame(step);
  }, [target, duration]);

  if (isNaN(target)) {
    return <>{value}</>;
  }

  // If original value had a string suffix like "hrs", add it back (e.g. if we want to handle that)
  // For now, since the actual values are just numbers or strings like "24h", we handle it specifically
  const isTimeString = typeof value === "string" && value.includes("h");
  if (isTimeString) {
    return <>{count}h</>;
  }

  return <>{count}</>;
}
