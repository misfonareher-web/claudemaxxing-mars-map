"use client";

import React, { useState } from "react";
import {
  BroadcastIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react/ssr";
import { CommsStatus } from "@/types/mars";

interface CommsStatusBarProps {
  commsStatus: CommsStatus;
}

export default function CommsStatusBar({ commsStatus }: CommsStatusBarProps) {
  const [expanded, setExpanded] = useState(false);
  const { ui_strings: s } = commsStatus;

  const detailsList = [
    s.delay,
    s.round_trip,
    s.relays,
    s.next_pass,
    s.duration,
    s.conjunction,
    s.link_state,
  ];

  return (
    <aside
      aria-label="Earth-Mars Communications Status"
      className="pointer-events-auto fixed bottom-4 left-3 z-[990] max-w-[calc(100vw-24px)] sm:left-4 lg:max-w-[calc(100vw-600px)]"
    >
      {expanded && (
        <div
          className="mb-2 bg-[#f06423]/55 p-[1px] shadow-[0_20px_54px_rgba(0,0,0,0.88)] backdrop-blur-xl"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
          }}
        >
          <div
            className="bg-[#100806]/95 p-3.5"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 11.5px) 0, 100% 11.5px, 100% 100%, 0 100%)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wider text-ares-accent uppercase">
                Comms &amp; Relay Model (Illustrative)
              </span>
              <span className="font-mono text-[10px] text-ares-mute">
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
      )}

      <div
        className="bg-[#f06423]/50 p-[1px] shadow-[0_14px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-colors hover:bg-ares-accent"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[#100806]/92 px-3.5 py-2 text-left"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 11.5px) 0, 100% 11.5px, 100% 100%, 0 100%)",
          }}
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
  );
}

