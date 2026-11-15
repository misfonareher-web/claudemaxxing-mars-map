"use client";

import React, { useState } from "react";
import {
  ArrowSquareOutIcon,
  InfoIcon,
  RadioactiveIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react/ssr";
import type { HazardCoverage, RadiationContext } from "@/types/mars";

const HAZARD_LABELS: Record<string, string> = {
  steep_slope: "Steep slope",
  sand_dunes: "Sand dunes",
  crater_rims: "Crater rims",
  boulders_rocks: "Boulders & rocks",
  scarps_cliffs: "Scarps & cliffs",
  loose_regolith: "Loose regolith",
  dust_storms: "Dust storms",
  radiation_dose: "Radiation dose",
};

function formatHazardName(raw: string): string {
  if (HAZARD_LABELS[raw]) return HAZARD_LABELS[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

/**
 * Neutral historical surface radiation context card.
 * Intentionally avoids safety thresholds, pass/fail colors, or score coupling.
 */
export function RadiationContextCard({
  radiation,
}: {
  radiation: RadiationContext;
}) {
  return (
    <section
      aria-label={radiation.title}
      className="border border-[rgba(255,249,235,0.16)] bg-ares-bg/55 p-3"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <RadioactiveIcon
            weight="duotone"
            className="h-3.5 w-3.5 shrink-0 text-ares-mute"
          />
          <h4 className="text-[10px] font-semibold tracking-wider text-ares-accent uppercase">
            {radiation.title}
          </h4>
        </div>
        <span className="border border-[rgba(255,249,235,0.16)] bg-ares-panel/80 px-1.5 py-0.5 font-mono text-[9px] text-ares-mute uppercase">
          Not in score
        </span>
      </div>

      {!radiation.measured_here && radiation.site_note && (
        <p className="mb-2 border-l-2 border-ares-line pl-2 text-[11px] leading-snug text-ares-soft">
          {radiation.site_note}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[20px] leading-tight font-bold text-ares-text tabular-nums">
          {radiation.value.toFixed(2)} ± {radiation.uncertainty.toFixed(2)}{" "}
          <span className="text-[12px] font-semibold text-ares-soft">
            {radiation.unit}
          </span>
        </span>
      </div>

      <p className="mt-0.5 text-[10.5px] leading-snug text-ares-mute">
        {radiation.quantity}
      </p>

      <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-ares-text">
        <div>{radiation.site}</div>
        <div className="text-ares-mute">{radiation.period}</div>
      </div>

      {radiation.comparison && (
        <div className="mt-2 border-t border-[rgba(255,249,235,0.16)] pt-1.5 text-[10.5px] leading-snug text-ares-mute">
          Cruise flight:{" "}
          <span className="font-mono font-semibold text-ares-text tabular-nums">
            {radiation.comparison.value} {radiation.comparison.unit}
          </span>{" "}
          — {radiation.comparison.label}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ares-mute">
        {radiation.caveat}
      </p>

      <div className="mt-1.5 flex justify-end text-[10px]">
        <a
          href={radiation.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-ares-accent-soft hover:underline"
        >
          <span>{radiation.source.label}</span>
          <ArrowSquareOutIcon weight="bold" className="h-2.5 w-2.5 shrink-0" />
        </a>
      </div>
    </section>
  );
}

/**
 * Transparent checklist of hazards assessed by the ~460 m scoring/routing grid
 * versus unassessed hazards. Hover tooltips and click-to-expand reveal limits.
 */
export function HazardCoverageCard({ coverage }: { coverage: HazardCoverage }) {
  const [expandedHazard, setExpandedHazard] = useState<string | null>(null);
  const assessedCount = coverage.rows.filter(
    (r) => r.status === "assessed"
  ).length;

  return (
    <section
      aria-label={coverage.title}
      className="border border-[rgba(255,249,235,0.16)] bg-ares-bg/55 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldWarningIcon
            weight="duotone"
            className="h-3.5 w-3.5 shrink-0 text-ares-accent"
          />
          <h4 className="text-[10px] font-semibold tracking-wider text-ares-mute uppercase">
            {coverage.title}
          </h4>
        </div>
        <span className="font-mono text-[10px] text-ares-mute tabular-nums">
          {assessedCount}/{coverage.rows.length} assessed
        </span>
      </div>

      <ul className="space-y-1">
        {coverage.rows.map((row) => {
          const isAssessed = row.status === "assessed";
          const tooltipText = isAssessed
            ? [row.how, row.limits].filter(Boolean).join(" ")
            : row.limits;
          const isExpanded = expandedHazard === row.hazard;

          return (
            <li
              key={row.hazard}
              className="border border-[rgba(255,249,235,0.12)] bg-ares-panel/65"
            >
              <button
                type="button"
                title={tooltipText}
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedHazard((prev) =>
                    prev === row.hazard ? null : row.hazard
                  )
                }
                className="flex min-h-[42px] w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-ares-raised/65 focus:outline-none sm:min-h-0 sm:px-2 sm:py-1"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-ares-text">
                  <span className="truncate">{formatHazardName(row.hazard)}</span>
                  <InfoIcon
                    weight="regular"
                    className="h-3 w-3 shrink-0 text-ares-mute/80"
                  />
                </span>
                <span
                  title={tooltipText}
                  className={`shrink-0 border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase ${
                    isAssessed
                      ? "border-ares-accent/60 bg-[rgba(254,127,45,0.13)] text-ares-accent-soft"
                      : "border-[rgba(255,249,235,0.16)] bg-ares-bg/75 text-ares-mute"
                  }`}
                >
                  {isAssessed ? "Assessed" : "Not assessed"}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[rgba(255,249,235,0.12)] bg-ares-bg/75 px-2 py-1.5 text-[10.5px] leading-snug text-ares-mute">
                  {row.how && <p className="text-ares-soft">{row.how}</p>}
                  <p className={row.how ? "mt-1" : ""}>
                    <span className="font-semibold text-ares-text/85">
                      Limits:{" "}
                    </span>
                    {row.limits}
                  </p>
                  {row.source && (
                    <p className="mt-1 text-[10px] text-ares-mute">
                      Source: {row.source}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[10px] leading-relaxed text-ares-mute">
        {coverage.note}
      </p>
    </section>
  );
}

