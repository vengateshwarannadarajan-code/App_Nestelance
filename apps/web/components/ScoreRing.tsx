"use client";

import { useEffect, useRef, useState } from "react";
import { SCORE_COLORS, SCORE_LABELS, SCORE_BAND_TEXT_COLORS } from "@/lib/constants";

type RingSize = "large" | "medium" | "small" | "micro";

interface ScoreRingProps {
  score: number;           // 0.0 – 5.0
  label?: string;
  animated?: boolean;
  size?: RingSize;
  showLabel?: boolean;
  locale?: "fr" | "en";
}

const SIZE_CONFIG: Record<RingSize, {
  px: number; stroke: number; fontSize: string; labelSize: string; r: number;
}> = {
  large:  { px: 200, stroke: 10, fontSize: "text-4xl", labelSize: "text-sm",  r: 80 },
  medium: { px: 80,  stroke: 6,  fontSize: "text-lg",  labelSize: "text-xs",  r: 32 },
  small:  { px: 32,  stroke: 4,  fontSize: "text-xs",  labelSize: "text-[9px]", r: 11 },
  micro:  { px: 20,  stroke: 3,  fontSize: "text-[8px]",labelSize: "hidden",  r: 7  },
};

function getBand(score: number): number {
  return Math.min(5, Math.max(0, Math.round(score)));
}

export function ScoreRing({
  score, label, animated = true, size = "medium", showLabel = true, locale = "fr",
}: ScoreRingProps) {
  const cfg = SIZE_CONFIG[size];
  const center = cfg.px / 2;
  const circumference = 2 * Math.PI * cfg.r;
  const band = getBand(score);
  const color = SCORE_COLORS[band] ?? "#757575";
  const textColor = SCORE_BAND_TEXT_COLORS[band] ?? "#FFFFFF";
  const bandLabel = SCORE_LABELS[band]?.[locale] ?? "";

  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);
  const [ringOffset, setRingOffset] = useState(circumference);
  const rafRef = useRef<number>();
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!animated || prefersReduced) {
      setDisplayScore(score);
      setRingOffset(circumference * (1 - score / 5));
      return;
    }

    const duration = 1200;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(parseFloat((eased * score).toFixed(1)));
      setRingOffset(circumference * (1 - (eased * score) / 5));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score, animated, prefersReduced, circumference]);

  const ariaLabel = `Score ESG ${score.toFixed(1)} sur 5, ${bandLabel}`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: cfg.px, height: cfg.px }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={cfg.px}
        height={cfg.px}
        viewBox={`0 0 ${cfg.px} ${cfg.px}`}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={center} cy={center} r={cfg.r}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={cfg.stroke}
        />
        {/* Score arc */}
        <circle
          cx={center} cy={center} r={cfg.r}
          fill="none"
          stroke={color}
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={ringOffset}
          style={{ transition: animated && !prefersReduced ? "none" : undefined }}
        />
      </svg>

      {/* Centre content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-bold leading-none tabular-nums ${cfg.fontSize}`}
          style={{ color }}
        >
          {size === "micro" ? Math.round(displayScore) : displayScore.toFixed(1)}
        </span>
        {showLabel && size !== "micro" && size !== "small" && (
          <span className={`mt-1 font-medium text-center ${cfg.labelSize}`} style={{ color }}>
            {label ?? bandLabel}
          </span>
        )}
      </div>
    </div>
  );
}
