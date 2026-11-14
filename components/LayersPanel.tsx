"use client";

import React, { useState } from "react";
import type { IconWeight } from "@phosphor-icons/react";
import {
  CaretDownIcon,
  CaretUpIcon,
  CrosshairIcon,
  DropIcon,
  FireIcon,
  FlagIcon,
  GlobeIcon,
  MoonIcon,
  MountainsIcon,
  PulseIcon,
  StackIcon,
  SunIcon,
  WarningIcon,
  WindIcon,
} from "@phosphor-icons/react/ssr";
import { MarsFeatureKind, MissionPreset } from "@/types/mars";
import { MARS_BASEMAP_LAYERS, MarsBasemapLayer } from "@/lib/mars-layers";

export interface LayersPanelProps {
  presets: MissionPreset[];
  activePresetId: string | null;
  onSelectPreset: (presetId: string | null) => void;
  activeBasemapKey: string;
  onSelectBasemap: (key: string) => void;
  visibleKinds: Record<MarsFeatureKind, boolean>;
  onToggleKind: (kind: MarsFeatureKind) => void;
}

const SURVIVAL_ROWS: {
  key: MarsFeatureKind;
  label: string;
  Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  iconClass: string;
}[] = [
  {
    key: "ice",
    label: "Water & Ice Evidence",
    Icon: DropIcon,
    iconClass: "text-[#f2dfd3]",
  },
  {
    key: "hazard",
    label: "Hazard Zones",
    Icon: WarningIcon,
    iconClass: "text-[#ff3d1f]",
  },
  {
    key: "science_target",
    label: "Scientific Sites",
    Icon: CrosshairIcon,
    iconClass: "text-[#f2dfd3]",
  },
  {
    key: "landing_site",
    label: "Landing Sites",
    Icon: FlagIcon,
    iconClass: "text-[#f2dfd3]",
  },
];

function getBasemapIcon(layer: MarsBasemapLayer) {
  switch (layer.key) {
    case "viking":
      return GlobeIcon;
    case "mola":
      return MountainsIcon;
    case "hrsc":
      return StackIcon;
    case "themis-day":
      return SunIcon;
    case "themis-night":
      return MoonIcon;
    case "roughness":
      return PulseIcon;
    case "thermal":
      return FireIcon;
    case "dust":
      return WindIcon;
    default:
      return StackIcon;
  }
}

function HudToggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-[19px] w-[36px] shrink-0 items-center rounded-full border transition-all duration-150 ${
        checked
          ? "border-[#ff8a47]/80 bg-gradient-to-r from-[#872909] to-[#d94d16] shadow-[0_0_12px_rgba(240,100,35,0.45)]"
          : "border-[#4b2d20]/70 bg-[#1c110d]"
      }`}
    >
      <span
        className={`h-[13px] w-[13px] rounded-full transition-transform duration-150 ${
          checked
            ? "translate-x-[19px] border border-[#ffe1cc] bg-[#ff6924] shadow-[0_0_8px_rgba(255,140,74,0.9)]"
            : "translate-x-[2px] bg-[#6b5347]"
        }`}
      />
    </span>
  );
}

export default function LayersPanel({
  presets,
  activePresetId,
  onSelectPreset,
  activeBasemapKey,
  onSelectBasemap,
  visibleKinds,
  onToggleKind,
}: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      aria-label="Map Layers"
      className="pointer-events-auto fixed left-3 top-[86px] z-30 flex max-h-[calc(100vh-196px)] w-[256px] flex-col overflow-hidden rounded-2xl border border-[#f06423]/55 bg-[#100806]/92 shadow-[0_20px_54px_rgba(0,0,0,0.85),-3px_0_20px_rgba(240,100,35,0.16)] backdrop-blur-xl sm:left-4"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-[#1a0d08]/70 focus:outline-none"
      >
        <span className="flex items-center gap-2.5">
          <StackIcon weight="duotone" className="h-4 w-4 text-[#ff571a]" />
          <span className="text-[15px] font-semibold text-[#ff6824]">
            Layers
          </span>
        </span>
        {collapsed ? (
          <CaretUpIcon weight="bold" className="h-4 w-4 text-[#c2a89c]" />
        ) : (
          <CaretDownIcon weight="bold" className="h-4 w-4 text-[#c2a89c]" />
        )}
      </button>

      {!collapsed && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1">
          {/* Mission Presets (MOLA Grids for Scoring & Routing) */}
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-[#f7efe8]">
                Mission Presets
              </h3>
              <span className="font-mono text-[10px] text-[#9b847a]">
                MOLA Grid
              </span>
            </div>
            <div className="space-y-1.5">
              {presets.map((preset) => {
                const isActive = activePresetId === preset.id;
                const shortLabel = preset.name.split(" — ")[0];
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
                      isActive
                        ? "border-[#ff6924] bg-[#ff6924]/18 text-white"
                        : "border-[#542613]/70 bg-[#180c07]/80 text-[#d8c4b8] hover:border-[#f06423]/60 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{shortLabel}</span>
                    <span className="font-mono text-[9.5px] text-[#ff9b66] uppercase">
                      {preset.id}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onSelectPreset(null)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
                  activePresetId === null
                    ? "border-[#ff6924] bg-[#ff6924]/18 text-white"
                    : "border-[#542613]/70 bg-[#180c07]/80 text-[#d8c4b8] hover:border-[#f06423]/60 hover:text-white"
                }`}
              >
                <span className="truncate">Global Map</span>
                <span className="font-mono text-[9.5px] text-[#9b847a] uppercase">
                  overview
                </span>
              </button>
            </div>
          </div>

          <div className="h-px bg-[#542613]/65" />

          {/* Survival Essentials (Overlay toggles) */}
          <div>
            <h3 className="mb-2.5 text-[13px] font-semibold text-[#f7efe8]">
              Survival Essentials
            </h3>
            <div className="space-y-2.5">
              {SURVIVAL_ROWS.map(({ key, label, Icon, iconClass }) => {
                const enabled = visibleKinds[key];
                return (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => onToggleKind(key)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 text-left transition-opacity hover:opacity-95 focus:outline-none"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        weight="duotone"
                        className={`h-4 w-4 shrink-0 ${iconClass}`}
                      />
                      <span className="truncate text-[12.5px] font-medium text-[#e7d4c8]">
                        {label}
                      </span>
                    </span>
                    <HudToggle checked={enabled} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-[#542613]/65" />

          {/* NASA Mars Trek Basemap (EPSG:4326) moved from Settings */}
          <div>
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-[#f7efe8]">
                NASA Mars Trek
              </h3>
              <span className="font-mono text-[10px] text-[#9b847a]">
                EPSG:4326
              </span>
            </div>
            <div className="space-y-2.5">
              {MARS_BASEMAP_LAYERS.map((layer) => {
                const selected = layer.key === activeBasemapKey;
                const Icon = getBasemapIcon(layer);
                return (
                  <button
                    key={layer.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelectBasemap(layer.key)}
                    title={layer.subtitle}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 text-left transition-opacity hover:opacity-95 focus:outline-none"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        weight="duotone"
                        className={`h-4 w-4 shrink-0 ${
                          selected ? "text-[#ff6a2b]" : "text-[#c2a89c]"
                        }`}
                      />
                      <span
                        className={`truncate text-[12.5px] font-medium ${
                          selected ? "text-white" : "text-[#cfc0b6]"
                        }`}
                      >
                        {layer.name}
                      </span>
                    </span>
                    <HudToggle checked={selected} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

