"use client";

import {
  CaretDoubleRightIcon,
  ClockIcon,
  PaperPlaneTiltIcon,
  StopIcon,
} from "@phosphor-icons/react/ssr";
import { AresRouteIcon } from "@/components/AresIcons";
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
    <div className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[1000] flex items-end justify-end sm:inset-x-auto sm:right-5 sm:bottom-3 sm:max-w-none">
      <div className="pointer-events-auto relative flex w-full items-center drop-shadow-[0_14px_34px_rgba(0,0,0,0.88)] sm:w-auto">
        {/* Left Trajectory Info Box (top-left chamfer + nested right notch) */}
        <div
          className="h-[56px] min-w-0 flex-1 bg-[#f06423]/60 p-[1px] backdrop-blur-xl sm:h-[64px] sm:flex-none sm:min-w-[286px]"
          style={{
            clipPath:
              "polygon(14px 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 0 14px)",
          }}
        >
          <div
            className="flex h-full w-full items-center gap-2 bg-gradient-to-r from-[#130905]/95 via-[#1c0d07]/95 to-[#241008]/95 pr-5 pl-2.5 shadow-[inset_0_0_24px_rgba(255,95,30,0.08)] sm:gap-3.5 sm:pr-8 sm:pl-4"
            style={{
              clipPath:
                "polygon(13.5px 0, calc(100% - 1px) 0, calc(100% - 16px) 50%, calc(100% - 1px) 100%, 0 100%, 0 13.5px)",
            }}
          >
            {/* Route Icon */}
            <div className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-none border border-ares-accent/35 bg-ares-accent/10 min-[390px]:flex sm:h-10 sm:w-10">
              <AresRouteIcon
                className={`h-4 w-4 text-ares-accent drop-shadow-[0_0_8px_rgba(255,107,43,0.75)] sm:h-5 sm:w-5 ${
                  isRouteLoading ? "animate-pulse" : ""
                }`}
              />
            </div>

            {/* Destination & Distance/Time */}
            <div className="min-w-0 flex-1 sm:min-w-[184px] sm:max-w-[290px]">
              <div
                className={`truncate text-[11px] font-medium tracking-wide sm:text-xs ${
                  isUnreachable ? "text-rose-300" : "text-ares-mute"
                }`}
              >
                {destinationTitle}
              </div>

              <div className="mt-0.5 flex items-center gap-2 sm:mt-1 sm:gap-3">
                <span className="whitespace-nowrap text-[16px] leading-none font-bold tracking-tight text-white tabular-nums sm:text-[19px]">
                  {effectiveDistanceKm !== null
                    ? formatDistance(effectiveDistanceKm, distanceUnit)
                    : isRouteLoading && hasTwoPoints
                      ? "Computing…"
                      : "—"}
                </span>

                {effectiveHours !== null && effectiveHours > 0 && (
                  <>
                    <span className="h-3.5 w-px shrink-0 bg-ares-line/70" />
                    <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-[#d5b59c] tabular-nums sm:gap-1.5 sm:text-xs">
                      <ClockIcon
                        weight="duotone"
                        className="h-3.5 w-3.5 shrink-0 text-ares-accent"
                      />
                      <span>~ {formatDuration(effectiveHours)}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Chevron CTA Button: nested cleanly alongside the left notch with a uniform seam */}
        <button
          type="button"
          onClick={hasTwoPoints ? onEndNavigation : onStartNavigation}
          className={`group relative -ml-[11px] h-[56px] shrink-0 cursor-pointer p-[1px] transition-all duration-200 hover:brightness-115 focus:outline-none focus-visible:brightness-125 sm:h-[64px] ${
            hasTwoPoints
              ? "bg-gradient-to-r from-rose-400/95 via-rose-500 to-rose-400/90"
              : "bg-gradient-to-r from-[#ff7b3a] via-[#ff8f52] to-[#ff6b2b]"
          }`}
          style={{
            clipPath:
              "polygon(16px 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0 50%)",
          }}
        >
          <span
            className={`flex h-full w-full items-center gap-1.5 px-5 text-[13px] font-semibold text-white sm:gap-3 sm:px-8 sm:text-[15px] ${
              hasTwoPoints
                ? "bg-gradient-to-r from-[#4b1111] via-[#7c1919] to-[#a32222] shadow-[inset_0_1px_12px_rgba(255,160,160,0.24)]"
                : "bg-gradient-to-r from-[#58210c] via-[#8b3413] to-[#b54418] shadow-[inset_0_1px_12px_rgba(255,190,140,0.26)]"
            }`}
            style={{
              clipPath:
                "polygon(16px 0, calc(100% - 16px) 0, calc(100% - 0.5px) 50%, calc(100% - 16px) 100%, 16px 100%, 0.5px 50%)",
            }}
          >
            {hasTwoPoints ? (
              <>
                <StopIcon
                  weight="fill"
                  className="h-4 w-4 shrink-0 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                />
                <span className="tracking-wide whitespace-nowrap sm:hidden">
                  End Route
                </span>
                <span className="hidden tracking-wide whitespace-nowrap sm:inline">
                  End Navigation
                </span>
              </>
            ) : (
              <>
                <PaperPlaneTiltIcon
                  weight="fill"
                  className="h-4 w-4 shrink-0 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] transition-transform group-hover:translate-x-0.5"
                />
                <span className="tracking-wide whitespace-nowrap sm:hidden">
                  Navigate
                </span>
                <span className="hidden tracking-wide whitespace-nowrap sm:inline">
                  Start Navigation
                </span>
                <CaretDoubleRightIcon
                  weight="bold"
                  className="hidden h-5 w-5 shrink-0 text-[#ffae78] transition-transform group-hover:translate-x-1 sm:block"
                />
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
