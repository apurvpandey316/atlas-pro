"use client";

import { useEffect, useState } from "react";
import { nextResetMs } from "@/lib/puzzles";

/** Live "hh:mm:ss" until the next puzzle day. */
export default function Countdown({ prefix = "New puzzles in" }: { prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((nextResetMs(now) - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="countdown">
      {prefix}{" "}
      <strong>
        {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
      </strong>
    </span>
  );
}
