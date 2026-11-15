"use client";

import { useEffect, useState } from "react";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react/ssr";
import { AresSignalIcon, AresSunIcon } from "@/components/AresIcons";
import { CommsStatus, EnvironmentSummary, RelaySchedule } from "@/types/mars";
import {
  MARS_TIME_SOURCE,
  getEnvironmentWeatherSource,
  getMarsClock,
} from "@/lib/mars-time";

interface CommsStatusBarProps {
  commsStatus: CommsStatus;
  relaySchedule: RelaySchedule;
  activePresetId: string | null;
  environment?: EnvironmentSummary | null;
  hideCompactPill?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

const FRAME_CLIP =
  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)";
const INNER_CLIP =
  "polygon(0 0, calc(100% - 11.5px) 0, 100% 11.5px, 100% 100%, 0 100%)";
const DESKTOP_FRAME_CLIP =
  "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)";
const DESKTOP_INNER_CLIP =
  "polygon(13.5px 0, 100% 0, 100% calc(100% - 13.5px), calc(100% - 13.5px) 100%, 0 100%, 0 13.5px)";

export default function CommsStatusBar({
  commsStatus,
  relaySchedule,
  activePresetId,
  environment = null,
  hideCompactPill = false,
  onExpandChange,
}: CommsStatusBarProps) {
  const [now, setNow] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mtcTime, setMtcTime] = useState<string>("--:--:--");

  useEffect(() => {
    const sync = () => setMtcTime(getMarsClock().mtcTime);
    sync();
    if (!expanded) return;
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [expanded]);

  useEffect(() => {
    const sync = () => setNow(Date.now());
    sync();
    const timer = window.setInterval(sync, 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const today = now === null ? null : new Date(now).toISOString().slice(0, 10);
  const lightTime = relaySchedule.daily_light_time.find((entry) => entry.date === today);
  const delay = lightTime
    ? `Signal delay to Earth: ${lightTime.one_way_min.toFixed(2)} min one way (${lightTime.date}, 00:00 UTC)`
    : `${s.delay} · snapshot fallback`;
  const delayNum = (lightTime?.one_way_min ?? commsStatus.one_way_light_time_min).toFixed(2);
  const site = relaySchedule.sites[activePresetId ?? "jezero"] ?? relaySchedule.sites.jezero;
  const upcoming = now === null ? [] : site.passes.filter((pass) => Date.parse(pass.end) >= now);
  const timeRange = (pass: (typeof site.passes)[number]) =>
    `${pass.start.slice(11, 16)}–${pass.end.slice(11, 16)} UTC`;
  const describePass = (pass: (typeof site.passes)[number]) => {
    const minutes = Math.max(0, Math.ceil((Date.parse(pass.start) - (now ?? 0)) / 60_000));
    const relative = minutes === 0 ? "now" : `in ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`}`;
    return `${pass.orbiter} ${relative} (${timeRange(pass)}, max ${Math.round(pass.max_elevation_deg)}°)`;
  };
  const nextPass = now === null
    ? `Next orbiter pass over ${site.name}: checking UTC clock…`
    : upcoming.length
      ? `Next orbiter pass over ${site.name}: ${describePass(upcoming[0])}`
      : `No predicted passes after ${relaySchedule.window.end}`;
  const sols = (Date.parse(relaySchedule.window.end) - Date.parse(relaySchedule.window.start)) / 88_775_244;
  const durations = site.passes.map((pass) => pass.duration_min).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2 : 0;
  const relaySummary = `${site.name}: ${(site.passes.length / sols).toFixed(1)} predicted passes per sol via MRO/TGO/ODY`;
  const weatherSource = getEnvironmentWeatherSource(environment?.preset_id);

  const detailsList = [
    delay,
    lightTime
      ? `Earth reply: ~${(lightTime.one_way_min * 2).toFixed(2)} min propagation round trip, plus relay and processing wait`
      : s.round_trip,
    relaySummary,
    nextPass,
    ...upcoming.slice(1, 4).map((pass) => `${pass.start.slice(0, 10)} · ${describePass(pass)}`),
    `Median sampled pass duration: ${median.toFixed(1)} min (${relaySchedule.window.start.slice(0, 10)}–${relaySchedule.window.end.slice(0, 10)} UTC)`,
    s.conjunction,
    s.link_state,
  ];

  const detailsPanel = (
    <div
      className="bg-[rgba(255,249,235,0.2)] p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.58)] backdrop-blur-xl"
      style={{ clipPath: FRAME_CLIP }}
    >
      <div className="bg-ares-panel/96 p-3.5" style={{ clipPath: INNER_CLIP }}>
        {/* Compact telemetry block surfaced cleanly on <1024px devices */}
        <div className="mb-3 space-y-1.5 border-b border-[rgba(255,249,235,0.16)] pb-2.5 lg:hidden">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <a
              href={MARS_TIME_SOURCE.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${MARS_TIME_SOURCE.label} — MTC / MSD calculation`}
              className="group inline-flex items-center gap-1 font-semibold tracking-wider text-ares-mute uppercase transition-colors hover:text-ares-accent"
            >
              <span>Martian Time (MTC)</span>
              <ArrowSquareOutIcon
                weight="bold"
                className="h-2.5 w-2.5 shrink-0 text-ares-accent-soft opacity-75 group-hover:text-ares-accent group-hover:opacity-100"
              />
            </a>
            <span className="font-mono font-bold text-ares-text tabular-nums">
              {mtcTime}
            </span>
          </div>
          {environment ? (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <a
                href={weatherSource.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${weatherSource.sourceName} — sampled sols & historical air temp`}
                className="group flex min-w-0 items-center gap-1.5 text-ares-mute transition-colors hover:text-ares-accent"
              >
                <AresSunIcon className="h-3.5 w-3.5 shrink-0 text-ares-accent" />
                <span className="truncate">{weatherSource.label}</span>
                <ArrowSquareOutIcon
                  weight="bold"
                  className="h-2.5 w-2.5 shrink-0 text-ares-accent-soft opacity-75 group-hover:text-ares-accent group-hover:opacity-100"
                />
              </a>
              <span className="shrink-0 font-mono font-semibold text-ares-text tabular-nums">
                Sol {environment.sol_range[1]}
                {compactTemp ? ` · ${compactTemp}` : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10.5px] text-ares-mute">
              <AresSunIcon className="h-3.5 w-3.5 shrink-0 text-ares-accent/80" />
              <span>Select Jezero or Gale for Sol &amp; historical weather</span>
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-ares-accent uppercase">
            PREDICTED · JPL HORIZONS
          </span>
          <span className="shrink-0 font-mono text-[10px] whitespace-nowrap text-ares-mute">
            {lightTime?.date ?? commsStatus.date}
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
        <p className="mt-2.5 border-t border-[rgba(255,249,235,0.16)] pt-2 text-[10px] text-ares-mute">
          {relaySchedule.caveat}
          <br />
          Source: {commsStatus.source}; JPL Horizons orbiter ephemerides
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
            className="bg-[rgba(255,249,235,0.2)] p-[1px] shadow-[0_12px_32px_rgba(0,0,0,0.58)] backdrop-blur-xl"
            style={{ clipPath: FRAME_CLIP }}
          >
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              className="flex min-h-[44px] cursor-pointer items-center gap-1.5 bg-ares-panel/95 px-2.5 py-2 text-left sm:gap-2 sm:px-3"
              style={{ clipPath: INNER_CLIP }}
            >
              <AresSignalIcon className="h-4 w-4 shrink-0 text-ares-text" />
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

      {/* Desktop (>=1024px): persistent bottom-left Signal Bar */}
      <aside
        aria-label="Earth-Mars Communications Status"
        className="pointer-events-auto fixed bottom-3 left-4 z-[990] hidden max-w-[min(560px,calc(100vw-600px))] lg:block"
      >
        {expanded && <div className="mb-2">{detailsPanel}</div>}

        <div
          className="bg-[rgba(255,249,235,0.2)] p-[1px] shadow-[0_14px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-colors hover:bg-ares-accent/70"
          style={{ clipPath: DESKTOP_FRAME_CLIP }}
        >
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            title="Click to toggle Earth-Mars relay details"
            className="flex min-h-[60px] w-full cursor-pointer items-center gap-3.5 bg-ares-panel/95 px-4 py-2.5 text-left lg:h-[64px] lg:px-5"
            style={{ clipPath: DESKTOP_INNER_CLIP }}
          >
            <AresSignalIcon className="h-[22px] w-[22px] shrink-0 text-ares-text xl:h-6 xl:w-6" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-sans text-[13px] leading-snug font-bold text-ares-text xl:text-[14px]">
                {delay}
              </div>
              <div className="mt-0.5 line-clamp-2 font-sans text-[11.5px] leading-snug font-normal text-ares-mute xl:text-[12px]">
                {nextPass}
              </div>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}

