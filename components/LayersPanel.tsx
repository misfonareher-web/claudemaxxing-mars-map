"use client";

import React, { useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/ssr";
import {
  type AresIconProps,
  AresFlameIcon,
  AresFlagIcon,
  AresFlaskIcon,
  AresGlobeIcon,
  AresLayersIcon,
  AresMoonIcon,
  AresMountainsIcon,
  AresRoughnessIcon,
  AresSunIcon,
  AresWarningIcon,
  AresWaterIcon,
  AresWindIcon,
} from "@/components/AresIcons";
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
  Icon: React.ComponentType<AresIconProps>;
  iconClass: string;
}[] = [
  {
    key: "ice",
    label: "Water & Ice Evidence",
    Icon: AresWaterIcon,
    iconClass: "text-[#f2dfd3]",
  },
  {
    key: "hazard",
    label: "Hazard Zones",
    Icon: AresWarningIcon,
    iconClass: "text-[#ff3d1f]",
  },
  {
    key: "science_target",
    label: "Scientific Sites",
    Icon: AresFlaskIcon,
    iconClass: "text-[#f2dfd3]",
  },
  {
    key: "landing_site",
    label: "Landing Sites",
    Icon: AresFlagIcon,
    iconClass: "text-[#f2dfd3]",
  },
];

function getBasemapIcon(layer: MarsBasemapLayer) {
  switch (layer.key) {
    case "viking":
      return AresGlobeIcon;
    case "mola":
      return AresMountainsIcon;
    case "hrsc":
      return AresLayersIcon;
    case "themis-day":
      return AresSunIcon;
    case "themis-night":
      return AresMoonIcon;
    case "roughness":
      return AresRoughnessIcon;
    case "thermal":
      return AresFlameIcon;
    case "dust":
      return AresWindIcon;
    default:
      return AresLayersIcon;
  }
}

function HudToggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-[18px] w-[34px] shrink-0 items-center rounded-none border transition-all duration-150 ${
        checked
          ? "border-[#ff8a47]/85 bg-gradient-to-r from-[#872909] to-[#d94d16] shadow-[0_0_10px_rgba(240,100,35,0.4)]"
          : "border-[#5a3525]/80 bg-[#1c110d]"
      }`}
    >
      <span
        className={`h-[12px] w-[14px] rounded-none transition-transform duration-150 ${
          checked
            ? "translate-x-[17px] border border-[#ffe1cc] bg-[#ff6924] shadow-[0_0_6px_rgba(255,140,74,0.85)]"
            : "translate-x-[2px] bg-[#785e51]"
        }`}
      />
    </span>
  );
}

function HudRadio({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
        checked
          ? "border-[#ff6a2b] bg-[#ff5d1f] shadow-[0_0_10px_rgba(255,93,31,0.7)]"
          : "border-[#8d7468]/75 bg-transparent"
      }`}
    />
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
      className="pointer-events-auto fixed left-3 top-[86px] z-30 flex max-h-[calc(100vh-196px)] w-[256px] flex-col bg-[#f06423]/55 p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.85),-3px_0_20px_rgba(240,100,35,0.16)] backdrop-blur-xl sm:left-4"
      style={{
        clipPath:
          "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)",
      }}
    >
      <div
        className="flex min-h-0 max-h-[calc(100vh-198px)] flex-1 flex-col overflow-hidden bg-[#100806]/92"
        style={{
          clipPath:
            "polygon(13.5px 0, 100% 0, 100% calc(100% - 13.5px), calc(100% - 13.5px) 100%, 0 100%, 0 13.5px)",
        }}
      >
        {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-[#1a0d08]/70 focus:outline-none"
      >
        <span className="flex items-center gap-2.5">
          <AresLayersIcon className="h-4 w-4 text-[#ff571a]" />
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
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-none border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
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
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-none border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
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
                      <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
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
                    <HudRadio checked={selected} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </div>
    </aside>
  );
}

