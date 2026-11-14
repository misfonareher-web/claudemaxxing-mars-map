"use client";

import React, { useEffect, useRef, useState } from "react";
import { getScoreAccent } from "@/lib/mars-scoring";

interface ScoreRingProps {
  score: number;
  size?: number;
}

export default function ScoreRing({ score, size = 84 }: ScoreRingProps) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [progress, setProgress] = useState<number>(0);
  const progressRef = useRef<number>(0);

  useEffect(() => {
    let rafId = 0;
    const durationMs = 720;
    const startVal = progressRef.current;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startVal + (target - startVal) * eased;
      progressRef.current = next;
      setProgress(next);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target]);

  const displayScore = Math.round(progress);
  const color = getScoreAccent(target);

  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 10px ${color}40)`,
      }}
      role="meter"
      aria-valuenow={target}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Survival score ${target} out of 100`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgba(16, 8, 6, 0.9)"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Animated progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>

      {/* Counting number in center */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex items-baseline leading-none">
          <span className="font-mono text-2xl font-bold tracking-tight text-ares-text tabular-nums">
            {displayScore}
          </span>
          <span className="ml-0.5 font-mono text-[10px] text-ares-mute">
            /100
          </span>
        </div>
      </div>
    </div>
  );
}
