"use client";

import React from "react";
import { ArrowSquareOutIcon, CaretDownIcon } from "@phosphor-icons/react/ssr";
import type {
  BackendPointScoreResponse,
  MarsGeoJSONFeature,
  ScoringFactorKey,
} from "@/types/mars";
import scoringWeights from "@/config/scoring_weights.json";

export const CLASSROOM_WORKSHEET_URL =
  "https://github.com/misfonareher-web/claudemaxxing-mars-map/blob/main/docs/classroom/score_by_hand.md";

const FACTOR_ORDER: ScoringFactorKey[] = [
  "slope",
  "roughness",
  "science",
  "base_distance",
  "thermal",
  "ice",
];

const FACTOR_LABELS: Record<ScoringFactorKey, string> = {
  slope: "Slope",
  roughness: "Roughness",
  science: "Science target",
  base_distance: "Base distance",
  thermal: "Day-IR brightness",
  ice: "Ice proxy",
};

const UNIT_LABELS: Record<string, string> = {
  deg: "°",
  m: " m",
  km: " km",
  "unitless 0-1": "",
};

const PENALTY_PER_SEVERITY: number =
  scoringWeights.hazard_rules.penalty_per_severity;
// Display-only hazard kinds (steep_slope is already in the slope subscore).
const SCORE_EXEMPT_KINDS: string[] =
  scoringWeights.hazard_rules.score_exempt_kinds ?? [];

function fmt(v: number | null | undefined, digits: number): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

interface ScoreBreakdownProps {
  backendScore: BackendPointScoreResponse;
  allFeatures: MarsGeoJSONFeature[];
}

/**
 * Classroom-friendly breakdown: shows every factor exactly as the API
 * returned it so a student can redo pre = Σ(w × s × 100), then × M.
 */
export default function ScoreBreakdown({
  backendScore,
  allFeatures,
}: ScoreBreakdownProps) {
  const {
    factors,
    score,
    excluded,
    hazard_ids,
    pre_hazard_score,
    hazard_multiplier,
    hazard_penalties,
  } = backendScore.properties;
  if (!factors || typeof score !== "number") return null;

  const rows = FACTOR_ORDER.filter((k) => factors[k]).map((k) => ({
    key: k,
    ...factors[k],
  }));
  // Points already include the hazard multiplier, so Σ points = score.
  const summedPoints = rows.reduce((sum, r) => sum + (r.contribution ?? 0), 0);

  const hazardName = (id: string) => {
    const feat = allFeatures.find(
      (f) => f.properties.kind === "hazard" && f.properties.id === id
    );
    return (feat?.properties.name ?? id.replace(/^hz-/, "")).replace(
      /\s*\(.*\)\s*$/,
      ""
    );
  };

  // Prefer the backend's own penalty list; otherwise rebuild it from the
  // hazard layer (severity -> 1 - penalty_per_severity x severity).
  const hazards = hazard_penalties
    ? hazard_penalties.map((h) => ({
        id: h.id,
        name: hazardName(h.id),
        multiplier: h.factor,
      }))
    : (hazard_ids ?? []).map((id) => {
        const feat = allFeatures.find(
          (f) => f.properties.kind === "hazard" && f.properties.id === id
        );
        const severity = feat?.properties.severity ?? 1;
        const exempt = SCORE_EXEMPT_KINDS.includes(
          feat?.properties.hazard_kind ?? ""
        );
        return {
          id,
          name: hazardName(id),
          multiplier: exempt
            ? 1
            : Math.max(0, 1 - PENALTY_PER_SEVERITY * severity),
        };
      });
  const multiplier =
    typeof hazard_multiplier === "number"
      ? hazard_multiplier
      : hazards.reduce((m, h) => m * h.multiplier, 1);
  const preHazard =
    typeof pre_hazard_score === "number"
      ? pre_hazard_score
      : multiplier > 0
        ? summedPoints / multiplier
        : summedPoints;
  const penaltyNames = hazards
    .filter((h) => h.multiplier < 1)
    .map((h) => h.name)
    .join(", ");
  // Coarse display cells average several native cells; a hazard may cover
  // only part of the cell, so pre x M is then only an estimate of the score.
  const partial =
    !excluded && Math.abs(Math.round(preHazard * multiplier) - score) > 1;

  return (
    <details className="group border-b border-ares-line/70 pb-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10.5px] font-semibold tracking-wider text-ares-accent-soft uppercase [&::-webkit-details-marker]:hidden">
        <span>How is this score calculated?</span>
        <CaretDownIcon
          weight="bold"
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[300px] text-[11px] tabular-nums text-ares-text">
          <thead>
            <tr className="text-[9.5px] tracking-wider text-ares-mute uppercase">
              <th className="py-1 pr-2 text-left font-semibold">Factor</th>
              <th className="py-1 pr-2 text-right font-semibold">Value</th>
              <th className="py-1 pr-2 text-right font-semibold">Sub</th>
              <th className="py-1 pr-2 text-right font-semibold">Weight</th>
              <th className="py-1 text-right font-semibold">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className={`border-t border-ares-line/50 ${
                  r.context_only ? "text-ares-mute" : ""
                }`}
                title={r.note}
              >
                <td className="py-1 pr-2 text-left">
                  {FACTOR_LABELS[r.key]}
                  {r.context_only && (
                    <span className="ml-1 text-[9.5px]">(context)</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-right font-mono">
                  {r.available
                    ? `${fmt(r.value, 2)}${UNIT_LABELS[r.units] ?? ""}`
                    : "n/a"}
                </td>
                <td className="py-1 pr-2 text-right font-mono">
                  {fmt(r.subscore, 3)}
                </td>
                <td className="py-1 pr-2 text-right font-mono">
                  {r.context_only ? "0" : fmt(r.weight, 3)}
                </td>
                <td className="py-1 text-right font-mono">
                  {fmt(r.context_only ? 0 : r.contribution, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 font-mono text-[11px] leading-snug text-ares-text">
        {excluded ? (
          <>Excluded cell → score = 0</>
        ) : (
          <>
            {preHazard.toFixed(1)} × {multiplier.toFixed(2)}
            {penaltyNames ? ` (${penaltyNames})` : " (no hazard penalty)"}{" "}
            {partial ? "≈" : "="} {partial ? Math.round(preHazard * multiplier) : score}
            {partial && <> · API score {score}</>}
          </>
        )}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-ares-mute">
        Pre-hazard score = Σ (100 × weight × subscore); final = round(pre-hazard
        × hazard multiplier). Points shown already include the multiplier, so
        they add up to the score. Context factors are shown but weighted 0.
        {partial &&
          " This display cell averages several grid cells and a hazard covers only part of it, so the product is only an estimate; the API score is the cell average."}
      </p>
      <a
        href={CLASSROOM_WORKSHEET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-ares-accent-soft hover:underline"
      >
        <span>Try it by hand (classroom worksheet)</span>
        <ArrowSquareOutIcon weight="bold" className="h-2.5 w-2.5" />
      </a>
    </details>
  );
}
