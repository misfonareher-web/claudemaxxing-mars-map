"use client";

import React, { useEffect, useRef, useState } from "react";
import { getScoreAccent } from "@/lib/mars-scoring";

interface ScoreRingProps {
  score: number | null;
  size?: number;
}

export default function ScoreRing({ score, size = 84 }: ScoreRingProps) {
  const isAvailable = typeof score === "number" && Number.isFinite(score);
  const target = isAvailable
    ? Math.max(0, Math.min(100, Math.round(score)))
    : null;

  const [progress, setProgress] = useState<number>(0);
  const progressRef = useRef<number>(0);

  useEffect(() => {
    if (target === null) {
      progressRef.current = 0;
      return;
    }

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

  const effectiveProgress = target === null ? 0 : progress;
  const displayScore = Math.round(effectiveProgress);
  const color = target === null ? "#bbb0a5" : getScoreAccent(target);

  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - effectiveProgress / 100);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        filter:
          target === null || target === 0
            ? undefined
            : `drop-shadow(0 0 10px ${color}40)`,
      }}
      role="meter"
      aria-valuenow={target ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={
        target !== null
          ? `Relative suitability index ${target} out of 100`
          : "Score unavailable"
      }
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
          fill="rgba(36, 23, 20, 0.88)"
          stroke="rgba(255, 249, 235, 0.16)"
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

      {/* Center value */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {target === null ? (
          <span className="font-mono text-base font-semibold tracking-wider text-ares-mute">
            N/A
          </span>
        ) : (
          <div className="flex flex-col items-center leading-none">
            <span className="font-sans text-[26px] font-bold tracking-tight text-ares-text tabular-nums">
              {displayScore}
            </span>
            <span className="mt-1 font-mono text-[11px] font-medium text-ares-mute">
              /100
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
