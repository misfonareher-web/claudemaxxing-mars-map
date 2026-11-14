"use client";

import {
  CaretDoubleRightIcon,
  ClockIcon,
  PaperPlaneTiltIcon,
  PathIcon,
  StopIcon,
} from "@phosphor-icons/react/ssr";
import type { BackendRouteProperties, MarsGeoJSONFeature } from "@/types/mars";
import {
  type DistanceUnit,
  formatDistance,
  formatDuration,
} from "@/lib/geo";

interface BottomNavBarProps {
  selectedFeature: MarsGeoJSONFeature | null;
  pointA: MarsGeoJSONFeature | null;
  pointB: MarsGeoJSONFeature | null;
  distanceUnit?: DistanceUnit;
  routeProperties?: BackendRouteProperties | null;
  isRouteLoading?: boolean;
  onStartNavigation: () => void;
  onEndNavigation: () => void;
}

export default function BottomNavBar({
  selectedFeature,
  pointA,
  pointB,
  distanceUnit = "km",
  routeProperties,
  isRouteLoading = false,
  onStartNavigation,
  onEndNavigation,
}: BottomNavBarProps) {
  const hasTwoPoints = Boolean(pointA && pointB);
  const isReachable =
    hasTwoPoints &&
    routeProperties?.reachable === true &&
    typeof routeProperties.distance_km === "number";
  const isUnreachable = hasTwoPoints && routeProperties?.reachable === false;

  const effectiveDistanceKm = isReachable ? routeProperties!.distance_km! : null;
  const effectiveHours =
    effectiveDistanceKm !== null ? effectiveDistanceKm / 10 : null;

  const destinationTitle = hasTwoPoints
    ? isUnreachable
      ? "Route unreachable"
      : `${pointA!.properties.name} → ${pointB!.properties.name}`
    : pointA
      ? `From ${pointA.properties.name} → Select Point B`
      : selectedFeature
        ? `To ${selectedFeature.properties.name}`
        : "Select Destination";

  return (
    <div className="pointer-events-none fixed right-6 bottom-4 z-[1000] flex items-end">
      <div className="pointer-events-auto relative flex items-center">
        {/* Top/bottom decorative HUD frame rule */}
        <div className="pointer-events-none absolute -top-[3px] right-4 left-6 h-[1.5px] bg-gradient-to-r from-ares-accent/40 via-ares-accent/90 to-ares-accent" />
        <div className="pointer-events-none absolute right-4 -bottom-[3px] left-6 h-[1.5px] bg-gradient-to-r from-ares-accent/40 via-ares-accent/90 to-ares-accent" />

        {/* Left Trajectory Info Box */}
        <div
          className="relative flex h-[66px] min-w-[290px] items-center gap-4 border border-r-0 border-ares-accent/65 bg-gradient-to-r from-[#130905]/95 via-[#1c0d07]/95 to-[#241008]/95 pr-9 pl-5 shadow-[0_14px_40px_rgba(0,0,0,0.9),inset_0_0_24px_rgba(255,95,30,0.08)] backdrop-blur-xl"
          style={{
            borderTopLeftRadius: "16px",
            borderBottomLeftRadius: "16px",
            clipPath:
              "polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%)",
          }}
        >
          {/* Route Icon */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ares-accent/35 bg-ares-accent/10">
            <PathIcon
              weight="duotone"
              className={`h-5 w-5 text-ares-accent drop-shadow-[0_0_8px_rgba(255,107,43,0.75)] ${
                isRouteLoading ? "animate-pulse" : ""
              }`}
            />
          </div>

          {/* Destination & Distance/Time */}
          <div className="min-w-[190px] max-w-[300px]">
            <div
              className={`truncate text-xs font-medium tracking-wide ${
                isUnreachable ? "text-rose-300" : "text-ares-mute"
              }`}
            >
              {destinationTitle}
            </div>

            <div className="mt-1 flex items-center gap-3">
              <span className="text-[19px] leading-none font-bold tracking-tight text-white">
                {effectiveDistanceKm !== null
                  ? formatDistance(effectiveDistanceKm, distanceUnit)
                  : "—"}
              </span>

              {effectiveHours !== null && effectiveHours > 0 && (
                <>
                  <span className="h-3.5 w-px bg-ares-line/70" />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[#d5b59c]">
                    <ClockIcon
                      weight="duotone"
                      className="h-3.5 w-3.5 text-ares-accent"
                    />
                    <span>~ {formatDuration(effectiveHours)}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Hexagonal Button: "Start Navigation" or "End Navigation" when 2 points are chosen */}
        <button
          type="button"
          onClick={hasTwoPoints ? onEndNavigation : onStartNavigation}
          className={`group relative -ml-3 flex h-[66px] cursor-pointer items-center gap-3.5 border-2 px-8 text-[15px] font-semibold text-white transition-all duration-200 hover:brightness-115 ${
            hasTwoPoints
              ? "border-rose-500/90 bg-gradient-to-r from-[#4b1111] via-[#7c1919] to-[#a32222] shadow-[0_0_32px_rgba(244,63,94,0.45),inset_0_1px_12px_rgba(255,160,160,0.28)]"
              : "border-[#ff7b3a] bg-gradient-to-r from-[#58210c] via-[#8b3413] to-[#b54418] shadow-[0_0_32px_rgba(255,107,43,0.45),inset_0_1px_12px_rgba(255,190,140,0.3)]"
          }`}
          style={{
            clipPath:
              "polygon(16px 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0 50%)",
          }}
        >
          {hasTwoPoints ? (
            <>
              <StopIcon
                weight="fill"
                className="h-4 w-4 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
              />
              <span className="tracking-wide whitespace-nowrap">
                End Navigation
              </span>
            </>
          ) : (
            <>
              <PaperPlaneTiltIcon
                weight="fill"
                className="h-4 w-4 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] transition-transform group-hover:translate-x-0.5"
              />
              <span className="tracking-wide whitespace-nowrap">
                Start Navigation
              </span>
              <CaretDoubleRightIcon
                weight="bold"
                className="h-5 w-5 text-[#ffae78] transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
