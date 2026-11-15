"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { ClockIcon } from "@phosphor-icons/react/ssr";
import {
  AresGearIcon,
  AresPinIcon,
  AresSunIcon,
  AresUserIcon,
} from "@/components/AresIcons";
import { AppTab, EnvironmentSummary } from "@/types/mars";
import { getMarsClock } from "@/lib/mars-time";

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
  const weatherLabel = environment?.preset_id === "gale"
    ? "Gale · Curiosity REMS · historical"
    : "Jezero · Perseverance MEDA · historical";
  const telemetryItems = [
    ...(environment ? [
      { label: "MARS SOL", value: String(environment.sol_range[1]), icon: null },
      { label: weatherLabel, value: displayTemp,
        icon: <AresSunIcon className="h-[19px] w-[19px] shrink-0 text-[#ff5514]" /> },
    ] : []),
    { label: "MARTIAN TIME", value: mtcTime,
      icon: <ClockIcon weight="duotone" className="h-[19px] w-[19px] shrink-0 text-[#ff5514]" /> },
  ];

  // Responsive layout coordinates for the unified seamless HUD chassis
  const showTelemetry = width >= 1024;
  const showBrandSubtitle = width >= 640;

  const leftEnd = width >= 1200 ? 314 : width >= 640 ? 294 : 186;
  const leftBevelX = leftEnd - 28;
  const rightW = showTelemetry ? (width >= 1320 ? 420 : 396) : 0;
  const rightStart = showTelemetry ? width - rightW : width;

  const tabsW =
    width >= 1200 ? 316 : width >= 1024 ? 268 : width >= 640 ? 300 : 210;
  const minTabsLeft = leftEnd + 22;
  const maxTabsLeft = showTelemetry
    ? rightStart - tabsW - 44
    : width - tabsW - 12;
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
        `L ${tabsLeft - 20} ${BRIDGE_Y}`,
        `L ${tabsLeft + 6} 64`,
        `L ${tabsRight - 6} 64`,
        `L ${tabsRight + 20} ${BRIDGE_Y}`,
        `L ${rightStart - 22} ${BRIDGE_Y}`,
        `L ${rightStart + 8} 66`,
        `L ${width - 14} 66`,
        `L ${width} 54`,
      ].join(" ")
    : [
        `M 0 68`,
        `L ${leftBevelX} 68`,
        `L ${leftEnd} ${BRIDGE_Y}`,
        `L ${tabsLeft - 20} ${BRIDGE_Y}`,
        `L ${tabsLeft + 6} 64`,
        `L ${tabsRight - 6} 64`,
        `L ${tabsRight + 20} ${BRIDGE_Y}`,
        `L ${width} ${BRIDGE_Y}`,
      ].join(" ");

  const shellFillPath = `${bottomContourPath} L ${width} 0 L 0 0 Z`;

  // Raised upper bezel outlines for center tabs & right capsule
  const tabsTopOutline = `M ${tabsLeft - 20} ${BRIDGE_Y} L ${tabsLeft + 8} 10 L ${tabsRight - 8} 10 L ${tabsRight + 20} ${BRIDGE_Y}`;
  const tabsDividerLine = `M ${tabsMid + 11} 10 L ${tabsMid - 11} 64`;
  const rightTopOutline = showTelemetry
    ? `M ${rightStart - 22} ${BRIDGE_Y} L ${rightStart + 8} 10 L ${width - 16} 10 L ${width} 24`
    : "";

  const activeTabBgPath =
    activeTab === "map"
      ? `M ${tabsLeft - 20} ${BRIDGE_Y} L ${tabsLeft + 8} 10 L ${tabsMid + 11} 10 L ${tabsMid - 11} 64 L ${tabsLeft + 6} 64 Z`
      : `M ${tabsMid + 11} 10 L ${tabsRight - 8} 10 L ${tabsRight + 20} ${BRIDGE_Y} L ${tabsRight - 6} 64 L ${tabsMid - 11} 64 Z`;

  const activeTabEdgeLine =
    activeTab === "map"
      ? `M ${tabsLeft + 6} 64 L ${tabsMid - 11} 64`
      : `M ${tabsMid - 11} 64 L ${tabsRight - 6} 64`;

  return (
    <header
      ref={hostRef}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[74px] w-full select-none"
    >
      {/* Unified frosted obsidian backdrop clipped seamlessly to the single HUD contour */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#0b0604]/90 backdrop-blur-md"
        style={{ clipPath: `path('${shellFillPath}')` }}
      />

      {/* Continuous glowing burnt-orange structural lines */}
      <svg
        aria-hidden="true"
        width={width}
        height={HEADER_H}
        viewBox={`0 0 ${width} ${HEADER_H}`}
        className="pointer-events-none absolute inset-0 block overflow-visible"
      >
        <defs>
          <radialGradient id="aresTabGlow" cx="50%" cy="100%" r="75%">
            <stop offset="0%" stopColor="#ff6524" stopOpacity="0.48" />
            <stop offset="65%" stopColor="#a8320c" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#140906" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="aresHudStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e85c22" stopOpacity="0.88" />
            <stop offset="22%" stopColor="#8c3615" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#f06423" stopOpacity="0.92" />
            <stop offset="78%" stopColor="#8c3615" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#e85c22" stopOpacity="0.88" />
          </linearGradient>
          <filter id="aresLineGlow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Active tab warm interior glow */}
        <path d={activeTabBgPath} fill="url(#aresTabGlow)" />

        {/* Subtle dim upper hairline across left & right bridges */}
        <line
          x1={leftEnd + 6}
          y1={14}
          x2={tabsLeft - 24}
          y2={14}
          stroke="#6b2b12"
          strokeOpacity="0.38"
          strokeWidth="1"
        />
        {showTelemetry && (
          <line
            x1={tabsRight + 24}
            y1={14}
            x2={rightStart - 26}
            y2={14}
            stroke="#6b2b12"
            strokeOpacity="0.38"
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
          stroke="#b8471a"
          strokeOpacity="0.72"
          strokeWidth="1.25"
        />
        <path
          d={tabsDividerLine}
          fill="none"
          stroke="#913816"
          strokeOpacity="0.75"
          strokeWidth="1.25"
        />
        {showTelemetry && (
          <path
            d={rightTopOutline}
            fill="none"
            stroke="#a84017"
            strokeOpacity="0.65"
            strokeWidth="1.25"
          />
        )}

        {/* Bright active-tab bottom highlight */}
        <path
          d={activeTabEdgeLine}
          fill="none"
          stroke="#ff9f5a"
          strokeWidth="2.5"
          filter="url(#aresLineGlow)"
        />
      </svg>

      {/* LEFT BRAND ZONE */}
      <div
        className="pointer-events-auto absolute left-0 top-0 flex h-[68px] items-center gap-2.5 pl-4 pr-3 sm:gap-3 sm:pl-6 sm:pr-4"
        style={{ width: leftBevelX }}
      >
        <Image
          src="/ares-logo.webp"
          alt="AREOPATH Logo"
          width={44}
          height={32}
          priority
          className="h-7 w-auto shrink-0 object-contain sm:h-8 drop-shadow-[0_0_12px_rgba(255,82,24,0.75)]"
        />
        <div className="h-8 w-px shrink-0 bg-[#6e2f16]/65" />
        <div className="flex min-w-0 flex-col justify-center">
          <span className="whitespace-nowrap text-[17px] font-bold leading-none tracking-[0.06em] text-[#ff561a] drop-shadow-[0_0_10px_rgba(255,86,26,0.4)] sm:text-[20px]">
            AREOPATH
          </span>
          {showBrandSubtitle && (
            <span className="mt-1 truncate text-[12px] font-medium leading-none tracking-[0.01em] text-[#c2a89c]">
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
          className="group flex h-full w-1/2 cursor-pointer items-center justify-center gap-2 sm:gap-2.5 focus:outline-none"
        >
          <AresPinIcon
            className={`h-5 w-5 shrink-0 transition-colors sm:h-6 sm:w-6 ${
              activeTab === "map"
                ? "text-[#ff5d1f] drop-shadow-[0_0_10px_rgba(255,93,31,0.85)]"
                : "text-[#9c8176] group-hover:text-[#d9bfb2]"
            }`}
          />
          <span
            className={`text-[15px] font-semibold tracking-wide transition-colors ${
              activeTab === "map"
                ? "text-white"
                : "text-[#9c8176] group-hover:text-[#e6d1c6]"
            }`}
          >
            Map
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("settings")}
          className="group flex h-full w-1/2 cursor-pointer items-center justify-center gap-2 sm:gap-2.5 focus:outline-none"
        >
          <AresGearIcon
            className={`h-5 w-5 shrink-0 transition-colors sm:h-6 sm:w-6 ${
              activeTab === "settings"
                ? "text-[#ff5d1f] drop-shadow-[0_0_10px_rgba(255,93,31,0.85)]"
                : "text-[#9c8176] group-hover:text-[#d9bfb2]"
            }`}
          />
          <span
            className={`text-[15px] font-semibold tracking-wide transition-colors ${
              activeTab === "settings"
                ? "text-white"
                : "text-[#9c8176] group-hover:text-[#e6d1c6]"
            }`}
          >
            Settings
          </span>
        </button>
      </nav>

      {/* RIGHT TELEMETRY CAPSULE (Mars planet removed per request) */}
      {showTelemetry && (
        <div
          className="pointer-events-auto absolute right-0 top-[10px] flex h-[56px] items-center justify-between gap-3 pl-6 pr-4 xl:gap-4 xl:pl-7 xl:pr-5"
          style={{ width: rightW - 8 }}
        >
          {telemetryItems.map((item) => (
            <div key={item.label} className="flex min-w-0 items-center gap-2">
              {item.icon}
              <div className="flex flex-col leading-none">
                <span className={item.label === weatherLabel
                    ? "text-[9px] font-semibold tracking-[0.03em] text-[#a38b7f]"
                    : "whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.07em] text-[#a38b7f]"}>
                  {item.label}
                </span>
                <span className={`mt-1 whitespace-nowrap font-mono font-bold tabular-nums text-[#f7efe8] ${item.label === weatherLabel ? "text-[11px]" : "text-[15px]"}`}>
                  {item.value}
                </span>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onTabChange("settings")}
            title="Open Mission Settings"
            aria-label="Open Mission Settings"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-none border border-[#943a18]/80 bg-[#1a0d08]/95 text-[#c7a394] transition-colors hover:border-[#ff5d1f] hover:text-white"
          >
            <AresUserIcon className="h-5 w-5" />
          </button>
        </div>
      )}
    </header>
  );
}
