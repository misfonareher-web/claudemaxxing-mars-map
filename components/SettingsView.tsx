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
    <div className="fixed inset-0 z-35 overflow-y-auto bg-ares-bg/96 px-4 pt-[88px] pb-[max(7rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:px-6 sm:pt-[96px]">
      <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-ares-text">Settings</h1>
            <p className="mt-1 text-xs text-ares-mute">
              Configure measurement units (kilometers / miles) and saved sites.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetView}
            className="inline-flex min-h-[44px] w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-none border border-[rgba(255,249,235,0.2)] bg-ares-panel px-4 py-2 text-xs font-medium whitespace-nowrap text-ares-text transition-colors hover:border-ares-accent sm:min-h-0 sm:w-auto sm:px-3.5"
          >
            <ArrowCounterClockwiseIcon
              weight="bold"
              className="h-3.5 w-3.5 shrink-0 text-ares-accent"
            />
            <span>Reset Global View</span>
          </button>
        </div>

        {/* Distance Units (km / mi) */}
        <section className="rounded-none border border-[rgba(255,249,235,0.16)] bg-ares-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ares-text">
            <RulerIcon weight="duotone" className="h-4 w-4 text-ares-accent" />
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
                      ? "border-ares-accent bg-[rgba(254,127,45,0.08)] text-ares-text"
                      : "border-[rgba(255,249,235,0.16)] bg-ares-bg/35 text-ares-mute hover:border-ares-accent/55 hover:text-ares-text"
                  }`}
                >
                  <span className="text-sm font-semibold">{opt.title}</span>
                  <span className="mt-0.5 text-xs text-ares-mute">
                    {opt.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Saved Locations */}
        <section className="rounded-none border border-[rgba(255,249,235,0.16)] bg-ares-panel p-5">
          <div className="mb-1 flex items-center gap-2.5 border-b border-[rgba(255,249,235,0.16)] pb-3.5 text-base font-semibold text-ares-text">
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
            <div className="divide-y divide-[rgba(255,249,235,0.16)]">
              {savedLocations.map(({ feature: feat, score, savedAt }) => {
                const displayName =
                  feat.properties.dataset_id === "ares_surface_probe"
                    ? "Surface Point"
                    : feat.properties.name;
                const dateLabel = formatSavedDate(savedAt);

                return (
                  <div
                    key={feat.properties.id}
                    className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        title={feat.properties.name}
                        className="text-sm leading-snug font-semibold text-ares-text sm:truncate"
                      >
                        {displayName}
                      </p>
                      {dateLabel && (
                        <p className="mt-0.5 text-xs text-ares-mute">
                          Saved {dateLabel}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end sm:gap-4">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          typeof score === "number"
                            ? "text-ares-accent"
                            : "text-ares-mute"
                        }`}
                      >
                        {typeof score === "number"
                          ? `${Math.round(score)}/100`
                          : "—/100"}
                      </span>

                      <div className="flex items-center gap-2 sm:gap-4">
                        <button
                          type="button"
                          onClick={() => onJumpToFeature(feat)}
                          className="min-h-[40px] cursor-pointer rounded-none border border-[rgba(255,249,235,0.2)] bg-ares-bg/75 px-4 py-1.5 text-xs font-semibold text-ares-text transition-colors hover:border-ares-accent hover:text-ares-accent sm:min-h-0"
                        >
                          Open
                        </button>

                        <button
                          type="button"
                          onClick={() => onRemoveSaved(feat.properties.id)}
                          aria-label={`Remove ${displayName}`}
                          title={`Remove ${displayName}`}
                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-none border border-[rgba(255,249,235,0.16)] text-ares-text/80 transition-colors hover:border-rose-400/50 hover:text-rose-300 sm:h-auto sm:w-auto sm:border-0 sm:p-1"
                        >
                          <XIcon weight="bold" className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
