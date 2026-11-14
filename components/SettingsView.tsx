"use client";

import React from "react";
import {
  ArrowCounterClockwiseIcon,
  BookmarkSimpleIcon,
  MapPinIcon,
  RulerIcon,
} from "@phosphor-icons/react/ssr";
import { MarsGeoJSONFeature } from "@/types/mars";
import { DistanceUnit } from "@/lib/geo";

interface SettingsViewProps {
  distanceUnit: DistanceUnit;
  onChangeDistanceUnit: (unit: DistanceUnit) => void;
  savedFeatures: MarsGeoJSONFeature[];
  onJumpToFeature: (feature: MarsGeoJSONFeature) => void;
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
  savedFeatures,
  onJumpToFeature,
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
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ares-accent/45 bg-ares-panel px-3.5 py-2 text-xs font-medium text-ares-text transition-colors hover:border-ares-accent"
          >
            <ArrowCounterClockwiseIcon
              weight="bold"
              className="h-3.5 w-3.5 text-ares-accent-soft"
            />
            <span>Reset Global View</span>
          </button>
        </div>

        {/* Distance Units (km / mi) */}
        <section className="rounded-2xl border border-ares-accent/30 bg-ares-panel p-5">
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
                  className={`flex cursor-pointer flex-col rounded-xl border p-3.5 text-left transition-colors ${
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
        <section className="rounded-2xl border border-ares-accent/30 bg-ares-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ares-text">
            <BookmarkSimpleIcon
              weight="duotone"
              className="h-4 w-4 text-ares-accent-soft"
            />
            <h2>Saved Locations ({savedFeatures.length})</h2>
          </div>
          {savedFeatures.length === 0 ? (
            <p className="text-xs text-ares-mute">
              No saved locations yet. Click any marker or point on the map and
              press{" "}
              <span className="font-semibold text-ares-text">
                Save Location
              </span>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {savedFeatures.map((feat) => (
                <button
                  key={feat.properties.id}
                  type="button"
                  onClick={() => onJumpToFeature(feat)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-ares-line bg-ares-raised/60 px-3.5 py-2.5 text-left text-xs transition-colors hover:border-ares-accent/50"
                >
                  <span className="flex items-center gap-2 font-medium text-ares-text">
                    <MapPinIcon
                      weight="duotone"
                      className="h-3.5 w-3.5 text-ares-accent-soft"
                    />
                    {feat.properties.name}
                  </span>
                  <span className="text-[11px] text-ares-accent-soft">
                    View on Map
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
