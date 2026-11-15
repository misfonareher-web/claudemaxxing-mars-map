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
      <div className="pointer-events-auto relative flex w-full items-center drop-shadow-[0_14px_34px_rgba(0,0,0,0.65)] sm:w-auto">
        {/* Left Trajectory Info Box (top-left chamfer + nested right notch) */}
        <div
          className="h-[56px] min-w-0 flex-1 bg-[rgba(255,249,235,0.2)] p-[1px] backdrop-blur-xl sm:h-[64px] sm:flex-none sm:min-w-[286px]"
          style={{
            clipPath:
              "polygon(14px 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 0 14px)",
          }}
        >
          <div
            className="flex h-full w-full items-center gap-2 bg-ares-panel/95 pr-5 pl-2.5 sm:gap-3.5 sm:pr-8 sm:pl-4"
            style={{
              clipPath:
                "polygon(13.5px 0, calc(100% - 1px) 0, calc(100% - 16px) 50%, calc(100% - 1px) 100%, 0 100%, 0 13.5px)",
            }}
          >
            {/* Route Icon */}
            <div className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[rgba(255,249,235,0.16)] bg-ares-bg/65 min-[390px]:flex sm:h-10 sm:w-10">
              <AresRouteIcon
                className={`h-4 w-4 text-ares-accent sm:h-5 sm:w-5 ${
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
                <span className="whitespace-nowrap text-[16px] leading-none font-bold tracking-tight text-ares-text tabular-nums sm:text-[19px]">
                  {effectiveDistanceKm !== null
                    ? formatDistance(effectiveDistanceKm, distanceUnit)
                    : isRouteLoading && hasTwoPoints
                      ? "Computing…"
                      : "—"}
                </span>

                {effectiveHours !== null && effectiveHours > 0 && (
                  <>
                    <span className="h-3.5 w-px shrink-0 bg-ares-line" />
                    <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-ares-soft tabular-nums sm:gap-1.5 sm:text-xs">
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
          className={`group relative -ml-[11px] h-[56px] shrink-0 cursor-pointer p-[1px] transition-all duration-200 hover:brightness-110 focus:outline-none focus-visible:brightness-115 sm:h-[64px] ${
            hasTwoPoints ? "bg-rose-400/85" : "bg-ares-accent"
          }`}
          style={{
            clipPath:
              "polygon(16px 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0 50%)",
          }}
        >
          <span
            className={`flex h-full w-full items-center gap-1.5 px-5 text-[13px] font-bold sm:gap-3 sm:px-8 sm:text-[15px] ${
              hasTwoPoints
                ? "bg-gradient-to-r from-[#5d1d19] via-[#752621] to-[#8b3029] text-ares-text"
                : "bg-ares-accent text-ares-bg"
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
                  className="h-4 w-4 shrink-0 text-ares-text"
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
                  className="h-4 w-4 shrink-0 text-ares-bg transition-transform group-hover:translate-x-0.5"
                />
                <span className="tracking-wide whitespace-nowrap sm:hidden">
                  Navigate
                </span>
                <span className="hidden tracking-wide whitespace-nowrap sm:inline">
                  Start Navigation
                </span>
                <CaretDoubleRightIcon
                  weight="bold"
                  className="hidden h-5 w-5 shrink-0 text-ares-bg/75 transition-transform group-hover:translate-x-1 sm:block"
                />
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
