"use client";

import React, { useState } from "react";
import { CaretDownIcon, CaretUpIcon, XIcon } from "@phosphor-icons/react/ssr";
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
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  desktopCollapsed?: boolean;
  onDesktopCollapsedChange?: (collapsed: boolean) => void;
  hideMobileTrigger?: boolean;
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
    iconClass: "text-ares-accent",
  },
  {
    key: "hazard",
    label: "Hazard Zones",
    Icon: AresWarningIcon,
    iconClass: "text-ares-accent",
  },
  {
    key: "science_target",
    label: "Scientific Sites",
    Icon: AresFlaskIcon,
    iconClass: "text-ares-accent",
  },
  {
    key: "landing_site",
    label: "Landing Sites",
    Icon: AresFlagIcon,
    iconClass: "text-ares-accent",
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
          ? "border-ares-accent bg-ares-bg/35"
          : "border-[rgba(255,249,235,0.4)] bg-transparent"
      }`}
    >
      <span
        className={`h-[12px] w-[14px] rounded-none transition-transform duration-150 ${
          checked
            ? "translate-x-[17px] bg-ares-accent"
            : "translate-x-[2px] bg-[rgba(255,249,235,0.5)]"
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
          ? "border-ares-accent bg-ares-accent"
          : "border-[rgba(255,249,235,0.4)] bg-transparent"
      }`}
    />
  );
}

const LAYERS_CLIP_OUTER =
  "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)";
const LAYERS_CLIP_INNER =
  "polygon(13.5px 0, 100% 0, 100% calc(100% - 13.5px), calc(100% - 13.5px) 100%, 0 100%, 0 13.5px)";

export default function LayersPanel({
  presets,
  activePresetId,
  onSelectPreset,
  activeBasemapKey,
  onSelectBasemap,
  visibleKinds,
  onToggleKind,
  mobileOpen,
  onMobileOpenChange,
  desktopCollapsed,
  onDesktopCollapsedChange,
  hideMobileTrigger = false,
}: LayersPanelProps) {
  const [localMobileOpen, setLocalMobileOpen] = useState(false);
  const [localDesktopCollapsed, setLocalDesktopCollapsed] = useState(false);

  const isMobileOpen = mobileOpen ?? localMobileOpen;
  const setMobileOpen = onMobileOpenChange ?? setLocalMobileOpen;
  const isDesktopCollapsed = desktopCollapsed ?? localDesktopCollapsed;
  const setDesktopCollapsed = onDesktopCollapsedChange ?? setLocalDesktopCollapsed;

  const renderPanelContent = (isMobileContext: boolean) => (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-6">
      {/* Mission Presets (MOLA Grids for Scoring & Routing) */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ares-text">
            Mission Presets
          </h3>
          <span className="font-mono text-[10px] text-ares-mute">
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
                onClick={() => {
                  onSelectPreset(preset.id);
                  if (isMobileContext) setMobileOpen(false);
                }}
                className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-none border px-3 py-2 text-left text-[12.5px] font-medium transition-colors lg:min-h-0 lg:px-2.5 lg:py-1.5 lg:text-[12px] ${
                  isActive
                    ? "border-ares-accent bg-[rgba(254,127,45,0.13)] text-ares-text"
                    : "border-[rgba(255,249,235,0.16)] bg-ares-bg/45 text-ares-soft hover:border-ares-accent/60 hover:text-ares-text"
                }`}
              >
                <span className="truncate">{shortLabel}</span>
                <span
                  className={`font-mono text-[9.5px] uppercase ${
                    isActive ? "font-bold text-ares-accent" : "text-ares-mute"
                  }`}
                >
                  {preset.id}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onSelectPreset(null);
              if (isMobileContext) setMobileOpen(false);
            }}
            className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-none border px-3 py-2 text-left text-[12.5px] font-medium transition-colors lg:min-h-0 lg:px-2.5 lg:py-1.5 lg:text-[12px] ${
              activePresetId === null
                ? "border-ares-accent bg-[rgba(254,127,45,0.13)] text-ares-text"
                : "border-[rgba(255,249,235,0.16)] bg-ares-bg/45 text-ares-soft hover:border-ares-accent/60 hover:text-ares-text"
            }`}
          >
            <span className="truncate">Global Map</span>
            <span
              className={`font-mono text-[9.5px] uppercase ${
                activePresetId === null
                  ? "font-bold text-ares-accent"
                  : "text-ares-mute"
              }`}
            >
              overview
            </span>
          </button>
        </div>
      </div>

      <div className="h-px bg-[rgba(255,249,235,0.16)]" />

      {/* Survival Essentials (Overlay toggles) */}
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ares-text lg:mb-2.5">
          Survival Essentials
        </h3>
        <div className="space-y-1 lg:space-y-2.5">
          {SURVIVAL_ROWS.map(({ key, label, Icon, iconClass }) => {
            const enabled = visibleKinds[key];
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => onToggleKind(key)}
                className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 py-1 text-left transition-opacity hover:opacity-95 focus:outline-none lg:min-h-0 lg:py-0"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
                  <span className="truncate text-[13px] font-medium text-ares-soft lg:text-[12.5px]">
                    {label}
                  </span>
                </span>
                <HudToggle checked={enabled} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-[rgba(255,249,235,0.16)]" />

      {/* NASA Mars Trek Basemap (EPSG:4326) */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2 lg:mb-2.5">
          <h3 className="text-[13px] font-semibold text-ares-text">
            NASA Mars Trek
          </h3>
          <span className="font-mono text-[10px] text-ares-mute">
            EPSG:4326
          </span>
        </div>
        <div className="space-y-1 lg:space-y-2.5">
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
                className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 py-1 text-left transition-opacity hover:opacity-95 focus:outline-none lg:min-h-0 lg:py-0"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      selected ? "text-ares-accent" : "text-ares-mute"
                    }`}
                  />
                  <span
                    className={`truncate text-[13px] font-medium lg:text-[12.5px] ${
                      selected ? "text-ares-text" : "text-ares-soft"
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
  );

  return (
    <>
      {/* Mobile & Tablet (<1024px): compact pill trigger + backdrop-dismissible drawer */}
      {!hideMobileTrigger && !isMobileOpen && (
        <div
          className="pointer-events-auto fixed top-[78px] left-2.5 z-30 bg-[rgba(255,249,235,0.2)] p-[1px] shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:left-3 md:left-4 lg:hidden"
          style={{
            clipPath:
              "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-expanded={false}
            aria-label="Open map layers panel"
            className="flex min-h-[44px] cursor-pointer items-center gap-1.5 bg-ares-panel/95 px-2.5 py-2 text-left sm:gap-2 sm:px-3.5"
            style={{
              clipPath:
                "polygon(11.5px 0, 100% 0, 100% calc(100% - 11.5px), calc(100% - 11.5px) 100%, 0 100%, 0 11.5px)",
            }}
          >
            <AresLayersIcon className="h-4 w-4 shrink-0 text-ares-accent" />
            <span className="text-[12.5px] font-semibold text-ares-accent sm:text-[13px]">
              Layers
            </span>
            {activePresetId && (
              <span className="border border-ares-accent/55 bg-ares-accent/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-ares-text uppercase sm:px-1.5 sm:text-[9.5px]">
                {activePresetId}
              </span>
            )}
            <CaretDownIcon weight="bold" className="h-3.5 w-3.5 text-ares-mute" />
          </button>
        </div>
      )}

      {isMobileOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-[1005] bg-black/55 backdrop-blur-[2px] lg:hidden"
          />
          <aside
            aria-label="Map Layers"
            className="pointer-events-auto fixed inset-x-3 top-[78px] z-[1010] flex max-h-[calc(100dvh-160px)] flex-col bg-[rgba(255,249,235,0.22)] p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.65)] backdrop-blur-xl md:inset-x-auto md:left-4 md:w-[276px] md:max-h-[calc(100dvh-176px)] lg:hidden"
            style={{ clipPath: LAYERS_CLIP_OUTER }}
          >
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ares-panel/96"
              style={{ clipPath: LAYERS_CLIP_INNER }}
            >
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2.5">
                  <AresLayersIcon className="h-4 w-4 text-ares-accent" />
                  <span className="text-[15px] font-semibold text-ares-accent">
                    Layers
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close map layers panel"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center text-ares-mute hover:text-ares-text"
                >
                  <XIcon weight="bold" className="h-4 w-4" />
                </button>
              </div>
              {renderPanelContent(true)}
            </div>
          </aside>
        </>
      )}

      {/* Desktop (>=1024px): persistent left sidebar */}
      <aside
        aria-label="Map Layers"
        className="pointer-events-auto fixed left-4 top-[86px] z-30 hidden max-h-[calc(100vh-196px)] w-[256px] flex-col bg-[rgba(255,249,235,0.2)] p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:flex"
        style={{ clipPath: LAYERS_CLIP_OUTER }}
      >
        <div
          className="flex min-h-0 max-h-[calc(100vh-198px)] flex-1 flex-col overflow-hidden bg-ares-panel/95"
          style={{ clipPath: LAYERS_CLIP_INNER }}
        >
          <button
            type="button"
            onClick={() => setDesktopCollapsed(!isDesktopCollapsed)}
            aria-expanded={!isDesktopCollapsed}
            className="flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-ares-raised/70 focus:outline-none"
          >
            <span className="flex items-center gap-2.5">
              <AresLayersIcon className="h-4 w-4 text-ares-accent" />
              <span className="text-[15px] font-semibold text-ares-accent">
                Layers
              </span>
            </span>
            {isDesktopCollapsed ? (
              <CaretUpIcon weight="bold" className="h-4 w-4 text-ares-mute" />
            ) : (
              <CaretDownIcon weight="bold" className="h-4 w-4 text-ares-mute" />
            )}
          </button>

          {!isDesktopCollapsed && renderPanelContent(false)}
        </div>
      </aside>
    </>
  );
}

