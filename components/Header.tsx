"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowSquareOutIcon, ClockIcon } from "@phosphor-icons/react/ssr";
import {
  AresGearIcon,
  AresLogoIcon,
  AresPinIcon,
  AresSunIcon,
} from "@/components/AresIcons";
import { AppTab, EnvironmentSummary } from "@/types/mars";
import {
  MARS_TIME_SOURCE,
  getEnvironmentWeatherSource,
  getMarsClock,
} from "@/lib/mars-time";

export interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  environment?: EnvironmentSummary | null;
}

const HEADER_H = 74;
const BRIDGE_Y = 38;

export default function Header({
  activeTab,
  onTabChange,
  environment,
}: HeaderProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState<number>(1440);
  const [mtcTime, setMtcTime] = useState<string>("--:--:--");

  useEffect(() => {
    const sync = () => {
      setMtcTime(getMarsClock().mtcTime);
    };
    sync();
    const timer = setInterval(sync, 1000);
    return () => clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const temps = environment?.summary.air_temp_c;
  const displayTemp = [
    Number.isFinite(temps?.min) ? `Min ${Math.round(temps!.min)} °C` : null,
    Number.isFinite(temps?.max) ? `Max ${Math.round(temps!.max)} °C` : null,
  ].filter(Boolean).join(" / ");
  const weatherSource = getEnvironmentWeatherSource(environment?.preset_id);
  const telemetryItems = [
    ...(environment ? [
      {
        label: "MARS SOL",
        value: String(environment.sol_range[1]),
        icon: null,
        sourceUrl: weatherSource.url,
        sourceTitle: `${weatherSource.sourceName} — latest sampled sol (${weatherSource.solsNote})`,
      },
      {
        label: weatherSource.label,
        value: displayTemp,
        icon: <AresSunIcon className="h-4 w-4 shrink-0 text-ares-accent xl:h-[18px] xl:w-[18px]" />,
        sourceUrl: weatherSource.url,
        sourceTitle: `${weatherSource.sourceName} — historical daily min/max air temperatures`,
      },
    ] : []),
    {
      label: "MARTIAN TIME",
      value: mtcTime,
      icon: <ClockIcon weight="duotone" className="h-4 w-4 shrink-0 text-ares-accent xl:h-[18px] xl:w-[18px]" />,
      sourceUrl: MARS_TIME_SOURCE.url,
      sourceTitle: `${MARS_TIME_SOURCE.label} — MTC / MSD calculation`,
    },
  ];

  // Responsive layout coordinates for the unified seamless HUD chassis
  const showTelemetry = width >= 1024;
  const showBrandSubtitle = width >= 640;
  const hasWeather = Boolean(environment);
  const isCompactMobile = width < 640;
  const tabBevel = isCompactMobile ? 12 : 20;
  const tabTopInset = isCompactMobile ? 4 : 8;
  const tabBottomInset = isCompactMobile ? 4 : 6;

  const leftEnd =
    width >= 1280
      ? 304
      : width >= 1024
        ? 258
        : width >= 640
          ? 274
          : Math.min(168, Math.round(width * 0.41));
  const leftBevelX = leftEnd - (isCompactMobile ? 16 : 28);
  const rightW = showTelemetry
    ? hasWeather
      ? width >= 1340
        ? 492
        : width >= 1200
          ? 464
          : 438
      : width >= 1340
        ? 192
        : 180
    : 0;
  const rightStart = showTelemetry ? width - rightW : width;

  const minTabsLeft = leftEnd + tabBevel + (isCompactMobile ? 6 : 2);
  const tabsW =
    width >= 1280
      ? 306
      : width >= 1024
        ? 236
        : width >= 640
          ? 290
          : Math.max(146, Math.min(188, width - minTabsLeft - tabBevel - 4));
  const maxTabsLeft = showTelemetry
    ? rightStart - tabsW - (hasWeather ? 34 : 44)
    : width - tabsW - tabBevel - (isCompactMobile ? 4 : 2);
  const idealTabsLeft = Math.round(width / 2 - tabsW / 2);
  const tabsLeft = Math.max(
    minTabsLeft,
    Math.min(Math.max(minTabsLeft, maxTabsLeft), idealTabsLeft)
  );
  const tabsRight = tabsLeft + tabsW;
  const tabsMid = Math.round((tabsLeft + tabsRight) / 2);

  // Unified bottom silhouette from x=0 to x=width (zero gaps or disconnected boxes)
  const bottomContourPath = showTelemetry
    ? [
        `M 0 68`,
        `L ${leftBevelX} 68`,
        `L ${leftEnd} ${BRIDGE_Y}`,
        `L ${tabsLeft - tabBevel} ${BRIDGE_Y}`,
        `L ${tabsLeft + tabBottomInset} 64`,
        `L ${tabsRight - tabBottomInset} 64`,
        `L ${tabsRight + tabBevel} ${BRIDGE_Y}`,
        `L ${rightStart - 22} ${BRIDGE_Y}`,
        `L ${rightStart + 8} 66`,
        `L ${width - 14} 66`,
        `L ${width} 54`,
      ].join(" ")
    : [
        `M 0 68`,
        `L ${leftBevelX} 68`,
        `L ${leftEnd} ${BRIDGE_Y}`,
        `L ${tabsLeft - tabBevel} ${BRIDGE_Y}`,
        `L ${tabsLeft + tabBottomInset} 64`,
        `L ${tabsRight - tabBottomInset} 64`,
        `L ${tabsRight + tabBevel} ${BRIDGE_Y}`,
        `L ${width} ${BRIDGE_Y}`,
      ].join(" ");

  const shellFillPath = `${bottomContourPath} L ${width} 0 L 0 0 Z`;

  // Raised upper bezel outlines for center tabs & right capsule
  const tabsTopOutline = `M ${tabsLeft - tabBevel} ${BRIDGE_Y} L ${tabsLeft + tabTopInset} 10 L ${tabsRight - tabTopInset} 10 L ${tabsRight + tabBevel} ${BRIDGE_Y}`;
  const tabsDividerLine = `M ${tabsMid + 11} 10 L ${tabsMid - 11} 64`;
  const rightTopOutline = showTelemetry
    ? `M ${rightStart - 22} ${BRIDGE_Y} L ${rightStart + 8} 10 L ${width - 16} 10 L ${width} 24`
    : "";

  const activeTabBgPath =
    activeTab === "map"
      ? `M ${tabsLeft - tabBevel} ${BRIDGE_Y} L ${tabsLeft + tabTopInset} 10 L ${tabsMid + 11} 10 L ${tabsMid - 11} 64 L ${tabsLeft + tabBottomInset} 64 Z`
      : `M ${tabsMid + 11} 10 L ${tabsRight - tabTopInset} 10 L ${tabsRight + tabBevel} ${BRIDGE_Y} L ${tabsRight - tabBottomInset} 64 L ${tabsMid - 11} 64 Z`;

  const activeTabEdgeLine =
    activeTab === "map"
      ? `M ${tabsLeft + tabBottomInset} 64 L ${tabsMid - 11} 64`
      : `M ${tabsMid - 11} 64 L ${tabsRight - tabBottomInset} 64`;

  return (
    <header
      ref={hostRef}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[74px] w-full select-none"
    >
      {/* Unified warm espresso cocoa backdrop clipped seamlessly to the single HUD contour */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-ares-panel/94 backdrop-blur-md"
        style={{ clipPath: `path('${shellFillPath}')` }}
      />

      {/* Continuous Figma signal-orange structural lines */}
      <svg
        aria-hidden="true"
        width={width}
        height={HEADER_H}
        viewBox={`0 0 ${width} ${HEADER_H}`}
        className="pointer-events-none absolute inset-0 block overflow-visible"
      >
        <defs>
          <radialGradient id="aresTabGlow" cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor="#fe7f2d" stopOpacity="0.24" />
            <stop offset="65%" stopColor="#fe7f2d" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#3e2723" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="aresHudStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fe7f2d" stopOpacity="0.92" />
            <stop offset="22%" stopColor="#d96b27" stopOpacity="0.78" />
            <stop offset="50%" stopColor="#fe7f2d" stopOpacity="0.95" />
            <stop offset="78%" stopColor="#d96b27" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#fe7f2d" stopOpacity="0.92" />
          </linearGradient>
          <filter id="aresLineGlow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Active tab warm interior tint */}
        <path d={activeTabBgPath} fill="url(#aresTabGlow)" />

        {/* Subtle dim upper hairline across left & right bridges (only when bridge gap exists) */}
        {tabsLeft - leftEnd >= 36 && (
          <line
            x1={leftEnd + 6}
            y1={14}
            x2={tabsLeft - 24}
            y2={14}
            stroke="#fff9eb"
            strokeOpacity="0.16"
            strokeWidth="1"
          />
        )}
        {showTelemetry && (
          <line
            x1={tabsRight + 24}
            y1={14}
            x2={rightStart - 26}
            y2={14}
            stroke="#fff9eb"
            strokeOpacity="0.16"
            strokeWidth="1"
          />
        )}

        {/* Main continuous bottom HUD edge + upper pod outlines */}
        <path
          d={bottomContourPath}
          fill="none"
          stroke="url(#aresHudStroke)"
          strokeWidth="1.5"
        />
        <path
          d={tabsTopOutline}
          fill="none"
          stroke="#fe7f2d"
          strokeOpacity="0.58"
          strokeWidth="1.25"
        />
        <path
          d={tabsDividerLine}
          fill="none"
          stroke="#fff9eb"
          strokeOpacity="0.18"
          strokeWidth="1.25"
        />
        {showTelemetry && (
          <path
            d={rightTopOutline}
            fill="none"
            stroke="#fe7f2d"
            strokeOpacity="0.55"
            strokeWidth="1.25"
          />
        )}

        {/* Bright active-tab bottom highlight */}
        <path
          d={activeTabEdgeLine}
          fill="none"
          stroke="#fe7f2d"
          strokeWidth="3"
          filter="url(#aresLineGlow)"
        />
      </svg>

      {/* LEFT BRAND ZONE */}
      <div
        className="pointer-events-auto absolute left-0 top-0 flex h-[68px] items-center gap-2 pl-3 pr-2 sm:gap-3 sm:pl-6 sm:pr-4"
        style={{ width: leftBevelX }}
      >
        <AresLogoIcon className="h-6 w-auto shrink-0 sm:h-8 drop-shadow-[0_0_8px_rgba(254,127,45,0.3)]" />
        <div className="h-6 w-px shrink-0 bg-ares-line sm:h-8" />
        <div className="flex min-w-0 flex-col justify-center">
          <span className="whitespace-nowrap text-[15px] font-bold leading-none tracking-[0.04em] text-ares-accent sm:text-[20px]">
            AreoPath
          </span>
          {showBrandSubtitle && (
            <span className="mt-1 truncate text-[11px] font-medium leading-none tracking-[0.01em] text-ares-mute xl:text-[12px]">
              Martian Survival Guide
            </span>
          )}
        </div>
      </div>

      {/* CENTER TABS (Map | Settings) */}
      <nav
        aria-label="Primary navigation"
        className="pointer-events-auto absolute top-[10px] flex h-[54px] items-center"
        style={{ left: tabsLeft, width: tabsW }}
      >
        <button
          type="button"
          onClick={() => onTabChange("map")}
          className="group flex h-full w-1/2 cursor-pointer items-center justify-center gap-1.5 sm:gap-2.5 focus:outline-none"
        >
          <AresPinIcon
            className={`h-4 w-4 shrink-0 transition-colors sm:h-6 sm:w-6 ${
              activeTab === "map"
                ? "text-ares-accent"
                : "text-ares-mute group-hover:text-ares-text"
            }`}
          />
          <span
            className={`text-[13px] font-semibold tracking-wide transition-colors sm:text-[15px] ${
              activeTab === "map"
                ? "text-ares-text"
                : "text-ares-mute group-hover:text-ares-text"
            }`}
          >
            Map
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("settings")}
          className="group flex h-full w-1/2 cursor-pointer items-center justify-center gap-1.5 sm:gap-2.5 focus:outline-none"
        >
          <AresGearIcon
            className={`h-4 w-4 shrink-0 transition-colors sm:h-6 sm:w-6 ${
              activeTab === "settings"
                ? "text-ares-accent"
                : "text-ares-mute group-hover:text-ares-text"
            }`}
          />
          <span
            className={`text-[13px] font-semibold tracking-wide transition-colors sm:text-[15px] ${
              activeTab === "settings"
                ? "text-ares-text"
                : "text-ares-mute group-hover:text-ares-text"
            }`}
          >
            Settings
          </span>
        </button>
      </nav>

      {/* RIGHT TELEMETRY CAPSULE */}
      {showTelemetry && (
          <div
          className={`pointer-events-auto absolute top-[11px] flex h-[54px] items-center gap-2.5 xl:gap-3.5 ${
            hasWeather ? "justify-between" : "justify-center"
          }`}
          style={{ left: rightStart + 16, width: Math.max(0, rightW - 34) }}
        >
          {telemetryItems.map((item) => {
            const isWeather = item.label === weatherSource.label;
            return (
              <div key={item.label} className="flex shrink-0 items-center gap-1.5 xl:gap-2">
                {item.icon}
                <div className="flex flex-col leading-none">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.sourceTitle}
                    aria-label={`${item.label} (${item.sourceTitle})`}
                    className={`group inline-flex items-center gap-1 whitespace-nowrap font-semibold text-ares-mute transition-colors hover:text-ares-accent ${
                      isWeather
                        ? "text-[8.5px] tracking-[0.02em] xl:text-[9.5px]"
                        : "text-[9.5px] uppercase tracking-[0.07em] xl:text-[10px]"
                    }`}
                  >
                    <span>{item.label}</span>
                    <ArrowSquareOutIcon
                      weight="bold"
                      className="h-2.5 w-2.5 shrink-0 text-ares-accent-soft opacity-75 transition-opacity group-hover:text-ares-accent group-hover:opacity-100"
                    />
                  </a>
                  <span
                    className={`mt-1.5 whitespace-nowrap font-mono font-bold tabular-nums text-ares-text ${
                      isWeather
                        ? "text-[11px] xl:text-[12px]"
                        : "text-[13.5px] xl:text-[15px]"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              </div>
            );
          })}

        </div>
      )}
    </header>
  );
}
