"use client";

import { useEffect, useState } from "react";
import {
  BroadcastIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react/ssr";
import { AresSunIcon } from "@/components/AresIcons";
import { CommsStatus, EnvironmentSummary } from "@/types/mars";
import { getMarsClock } from "@/lib/mars-time";

interface CommsStatusBarProps {
  commsStatus: CommsStatus;
  environment?: EnvironmentSummary | null;
  hideCompactPill?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

const FRAME_CLIP =
  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)";
const INNER_CLIP =
  "polygon(0 0, calc(100% - 11.5px) 0, 100% 11.5px, 100% 100%, 0 100%)";

export default function CommsStatusBar({
  commsStatus,
  environment = null,
  hideCompactPill = false,
  onExpandChange,
}: CommsStatusBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [mtcTime, setMtcTime] = useState<string>("--:--:--");

  useEffect(() => {
    const sync = () => setMtcTime(getMarsClock().mtcTime);
    sync();
    if (!expanded) return;
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [expanded]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
  };

  const { ui_strings: s } = commsStatus;
  const temps = environment?.summary?.air_temp_c;
  const compactTemp =
    temps && Number.isFinite(temps.min) && Number.isFinite(temps.max)
      ? `${Math.round(temps.min)}°/${Math.round(temps.max)}°C`
      : null;
  const delayMatch = s.delay.match(/([\d.]+)\s*min/i);
  const delayNum = delayMatch ? delayMatch[1] : null;
  const weatherLabel =
    environment?.preset_id === "gale"
      ? "Gale · Curiosity REMS · historical"
      : "Jezero · Perseverance MEDA · historical";

  const detailsList = [
    s.delay,
    s.round_trip,
    s.relays,
    s.next_pass,
    s.duration,
    s.conjunction,
    s.link_state,
  ];

  const detailsPanel = (
    <div
      className="bg-[#f06423]/55 p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.88)] backdrop-blur-xl"
      style={{ clipPath: FRAME_CLIP }}
    >
      <div className="bg-[#100806]/95 p-3.5" style={{ clipPath: INNER_CLIP }}>
        {/* Compact telemetry block surfaced cleanly on <1024px devices */}
        <div className="mb-3 space-y-1.5 border-b border-ares-line/70 pb-2.5 lg:hidden">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold tracking-wider text-ares-mute uppercase">
              Martian Time (MTC)
            </span>
            <span className="font-mono font-bold text-white tabular-nums">
              {mtcTime}
            </span>
          </div>
          {environment ? (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 text-ares-mute">
                <AresSunIcon className="h-3.5 w-3.5 shrink-0 text-[#ff5514]" />
                <span className="truncate">{weatherLabel}</span>
              </span>
              <span className="shrink-0 font-mono font-semibold text-white tabular-nums">
                Sol {environment.sol_range[1]}
                {compactTemp ? ` · ${compactTemp}` : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10.5px] text-ares-mute">
              <AresSunIcon className="h-3.5 w-3.5 shrink-0 text-[#ff5514]/80" />
              <span>Select Jezero or Gale for Sol &amp; historical weather</span>
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-ares-accent uppercase">
            Comms &amp; Relay Model (Illustrative)
          </span>
          <span className="shrink-0 font-mono text-[10px] whitespace-nowrap text-ares-mute">
            {commsStatus.epoch_utc}
          </span>
        </div>
        <ul className="space-y-1 text-[11px] leading-snug text-ares-text">
          {detailsList.map((line, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 bg-ares-accent-soft" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 border-t border-ares-line/70 pt-2 text-[10px] text-ares-mute">
          Source: {commsStatus.source}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile & Tablet (<1024px): compact top-right HUD telemetry pill + dropdown */}
      {!hideCompactPill && (
        <aside
          aria-label="Mars Telemetry and Communications Status"
          className="pointer-events-auto fixed top-[78px] right-2.5 z-[1015] flex flex-col items-end sm:right-3 md:right-4 lg:hidden"
        >
          <div
            className="bg-[#f06423]/55 p-[1px] shadow-[0_12px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl"
            style={{ clipPath: FRAME_CLIP }}
          >
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              className="flex min-h-[44px] cursor-pointer items-center gap-1.5 bg-[#100806]/92 px-2.5 py-2 text-left sm:gap-2 sm:px-3"
              style={{ clipPath: INNER_CLIP }}
            >
              <BroadcastIcon
                weight="duotone"
                className="h-4 w-4 shrink-0 text-ares-accent"
              />
              <span className="font-mono text-[10.5px] font-semibold whitespace-nowrap text-ares-text tabular-nums sm:text-[11px]">
                {delayNum ? (
                  <>
                    {delayNum}
                    <span className="hidden min-[400px]:inline"> min</span>
                    <span className="min-[400px]:hidden">m</span>
                  </>
                ) : (
                  "Comms"
                )}
                {compactTemp ? ` · ${compactTemp}` : ""}
              </span>
              {expanded ? (
                <CaretUpIcon
                  weight="bold"
                  className="h-3.5 w-3.5 shrink-0 text-ares-mute"
                />
              ) : (
                <CaretDownIcon
                  weight="bold"
                  className="h-3.5 w-3.5 shrink-0 text-ares-mute"
                />
              )}
            </button>
          </div>

          {expanded && (
            <div className="mt-2 w-[calc(100vw-24px)] max-w-[360px]">
              {detailsPanel}
            </div>
          )}
        </aside>
      )}

      {/* Desktop (>=1024px): persistent bottom-left Comms capsule */}
      <aside
        aria-label="Earth-Mars Communications Status"
        className="pointer-events-auto fixed bottom-4 left-4 z-[990] hidden max-w-[calc(100vw-600px)] lg:block"
      >
        {expanded && <div className="mb-2">{detailsPanel}</div>}

        <div
          className="bg-[#f06423]/50 p-[1px] shadow-[0_14px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-colors hover:bg-ares-accent"
          style={{ clipPath: FRAME_CLIP }}
        >
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[#100806]/92 px-3.5 py-2 text-left"
            style={{ clipPath: INNER_CLIP }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-ares-accent/35 bg-ares-accent/10">
                <BroadcastIcon
                  weight="duotone"
                  className="h-4 w-4 text-ares-accent"
                />
              </div>
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] font-medium text-ares-text">
                  {s.delay}
                </div>
                <div className="truncate text-[10.5px] text-ares-mute">
                  {s.relays}
                </div>
              </div>
            </div>

            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-ares-line/80 bg-ares-raised/60 text-ares-mute">
              {expanded ? (
                <CaretDownIcon weight="bold" className="h-3.5 w-3.5" />
              ) : (
                <CaretUpIcon weight="bold" className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}

