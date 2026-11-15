"use client";

import React from "react";
import {
  ArrowCounterClockwiseIcon,
  BookmarkSimpleIcon,
  RulerIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { MarsGeoJSONFeature, SavedLocationItem } from "@/types/mars";
import { DistanceUnit } from "@/lib/geo";

const SAVED_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatSavedDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${SAVED_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface SettingsViewProps {
  distanceUnit: DistanceUnit;
  onChangeDistanceUnit: (unit: DistanceUnit) => void;
  savedLocations: SavedLocationItem[];
  onJumpToFeature: (feature: MarsGeoJSONFeature) => void;
  onRemoveSaved: (id: string) => void;
  onResetView: () => void;
}

const UNIT_OPTIONS: {
  unit: DistanceUnit;
  title: string;
  subtitle: string;
}[] = [
  {
    unit: "km",
    title: "Kilometers (km)",
    subtitle: "Metric surface distances & EVA range",
  },
  {
    unit: "mi",
    title: "Miles (mi)",
    subtitle: "Imperial surface route distances",
  },
];

export default function SettingsView({
  distanceUnit,
  onChangeDistanceUnit,
  savedLocations,
  onJumpToFeature,
  onRemoveSaved,
  onResetView,
}: SettingsViewProps) {
  return (
    <div className="fixed inset-0 z-35 overflow-y-auto bg-ares-bg/95 px-6 pt-[96px] pb-28 backdrop-blur-md">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ares-text">Settings</h1>
            <p className="mt-1 text-xs text-ares-mute">
              Configure measurement units (kilometers / miles) and saved sites.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetView}
            className="inline-flex cursor-pointer items-center gap-2 rounded-none border border-ares-accent/45 bg-ares-panel px-3.5 py-2 text-xs font-medium text-ares-text transition-colors hover:border-ares-accent"
          >
            <ArrowCounterClockwiseIcon
              weight="bold"
              className="h-3.5 w-3.5 text-ares-accent-soft"
            />
            <span>Reset Global View</span>
          </button>
        </div>

        {/* Distance Units (km / mi) */}
        <section className="rounded-none border border-ares-accent/30 bg-ares-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ares-text">
            <RulerIcon weight="duotone" className="h-4 w-4 text-ares-accent-soft" />
            <h2>Distance Units</h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {UNIT_OPTIONS.map((opt) => {
              const selected = distanceUnit === opt.unit;
              return (
                <button
                  key={opt.unit}
                  type="button"
                  onClick={() => onChangeDistanceUnit(opt.unit)}
                  className={`flex cursor-pointer flex-col rounded-none border p-3.5 text-left transition-colors ${
                    selected
                      ? "border-ares-accent bg-ares-accent/15 text-ares-text shadow-[0_0_16px_rgba(240,100,35,0.16)]"
                      : "border-ares-line bg-ares-raised/60 text-ares-mute hover:border-ares-accent/40 hover:text-ares-text"
                  }`}
                >
                  <span className="text-sm font-semibold">{opt.title}</span>
                  <span className="mt-0.5 text-xs text-ares-dim">
                    {opt.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Saved Locations */}
        <section className="rounded-none border border-ares-line/90 bg-ares-panel p-5">
          <div className="mb-1 flex items-center gap-2.5 border-b border-ares-line/70 pb-3.5 text-base font-semibold text-white">
            <BookmarkSimpleIcon
              weight="regular"
              className="h-5 w-5 text-ares-text/90"
            />
            <h2>Saved locations ({savedLocations.length})</h2>
          </div>
          {savedLocations.length === 0 ? (
            <p className="pt-3 text-xs text-ares-mute">
              No saved locations yet. Click any marker or point on the map and
              press{" "}
              <span className="font-semibold text-ares-text">
                Save location
              </span>
              .
            </p>
          ) : (
            <div className="divide-y divide-ares-line/65">
              {savedLocations.map(({ feature: feat, score, savedAt }) => {
                const displayName =
                  feat.properties.dataset_id === "ares_surface_probe"
                    ? "Surface Point"
                    : feat.properties.name;
                const dateLabel = formatSavedDate(savedAt);

                return (
                  <div
                    key={feat.properties.id}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        title={feat.properties.name}
                        className="truncate text-sm font-semibold text-white"
                      >
                        {displayName}
                      </p>
                      {dateLabel && (
                        <p className="mt-0.5 text-xs text-ares-mute">
                          Saved {dateLabel}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          typeof score === "number"
                            ? "text-[#ff6924]"
                            : "text-ares-mute"
                        }`}
                      >
                        {typeof score === "number"
                          ? `${Math.round(score)}/100`
                          : "—/100"}
                      </span>

                      <button
                        type="button"
                        onClick={() => onJumpToFeature(feat)}
                        className="cursor-pointer rounded-none border border-ares-line/90 bg-[#170b07]/85 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:border-ares-accent hover:text-ares-accent"
                      >
                        Open
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveSaved(feat.properties.id)}
                        aria-label={`Remove ${displayName}`}
                        title={`Remove ${displayName}`}
                        className="cursor-pointer p-1 text-ares-text/80 transition-colors hover:text-rose-400"
                      >
                        <XIcon weight="bold" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
