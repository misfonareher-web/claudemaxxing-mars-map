import React from "react";

export interface AresIconProps {
  className?: string;
  size?: number | string;
  color?: string;
}

interface PathSegment {
  d: string;
  strokeWidth: number;
  roundCaps?: boolean;
  lineCap?: "round" | "square";
}

interface FigmaIconSpec {
  viewBox: string;
  paths: readonly PathSegment[];
}

function createFigmaIcon(spec: FigmaIconSpec, displayName: string) {
  function FigmaIcon({ className, size, color }: AresIconProps) {
    return (
      <svg
        viewBox={spec.viewBox}
        width={size}
        height={size}
        fill="none"
        stroke={color ?? "currentColor"}
        aria-hidden="true"
        className={className}
      >
        {spec.paths.map((seg, idx) => (
          <path
            key={idx}
            d={seg.d}
            strokeWidth={seg.strokeWidth}
            strokeLinecap={seg.lineCap ?? (seg.roundCaps ? "round" : undefined)}
            strokeLinejoin={seg.roundCaps ? "round" : undefined}
          />
        ))}
      </svg>
    );
  }
  FigmaIcon.displayName = displayName;
  return FigmaIcon;
}

// Specs extracted verbatim from the Figma 24x24 icon sheet (spaced at 87px X intervals).
export const AresLayersIcon = createFigmaIcon(
  {
    viewBox: "0 0 24 24",
    paths: [
      {
        d: "M2 12L12 17.5556L22 12M2 16.4444L12 22L22 16.4444M2 7.55556L12 2L22 7.55556L12 13.1111L2 7.55556Z",
        strokeWidth: 2,
        roundCaps: true,
      },
    ],
  },
  "AresLayersIcon"
);

export const AresWaterIcon = createFigmaIcon(
  {
    viewBox: "87 0 24 24",
    paths: [
      {
        d: "M99 2C96.8947 5.68421 91.6316 10.9474 91.6316 14.6316C91.6316 16.5858 92.4079 18.46 93.7898 19.8418C95.1716 21.2237 97.0458 22 99 22C100.954 22 102.828 21.2237 104.21 19.8418C105.592 18.46 106.368 16.5858 106.368 14.6316C106.368 10.9474 101.105 5.68421 99 2Z",
        strokeWidth: 1.89474,
        roundCaps: true,
      },
    ],
  },
  "AresWaterIcon"
);

export const AresWarningIcon = createFigmaIcon(
  {
    viewBox: "174 0 24 24",
    paths: [
      {
        d: "M186 9.50078V13.8005M186 17.5627V17.7777M184.603 3.91121C185.534 2.263 186.466 2.263 187.397 3.91121L195.674 19.175C196.391 20.6083 195.925 21.3249 194.277 21.3249H177.723C176.075 21.3249 175.609 20.6083 176.326 19.175L184.603 3.91121Z",
        strokeWidth: 1.93485,
        roundCaps: true,
      },
    ],
  },
  "AresWarningIcon"
);

export const AresFlaskIcon = createFigmaIcon(
  {
    viewBox: "261 0 24 24",
    paths: [
      {
        d: "M268.556 2H269.667M269.667 2H276.333M269.667 2V8.66667L267.155 13.1111M276.333 2H277.444M276.333 2V8.66667L278.845 13.1111M267.155 13.1111L263.889 18.8889C262.926 20.963 263.556 22 265.778 22H280.222C282.444 22 283.074 20.963 282.111 18.8889L278.845 13.1111M267.155 13.1111H267.111M267.155 13.1111H278.845M278.845 13.1111H278.889",
        strokeWidth: 2,
        roundCaps: true,
      },
    ],
  },
  "AresFlaskIcon"
);

export const AresFlagIcon = createFigmaIcon(
  {
    viewBox: "348 0 24 24",
    paths: [
      {
        d: "M354.445 22V10.8889M354.445 22H351.111M354.445 22H358.889M354.445 10.8889V2L368.889 4.22222L365.556 8.66667L368.889 13.1111L354.445 10.8889Z",
        strokeWidth: 2,
        roundCaps: true,
      },
    ],
  },
  "AresFlagIcon"
);

export const AresGlobeIcon = createFigmaIcon(
  {
    viewBox: "435 0 24 24",
    paths: [
      {
        d: "M457 12C457 17.5228 452.523 22 447 22C441.477 22 437 17.5228 437 12C437 6.47715 441.477 2 447 2C452.523 2 457 6.47715 457 12Z",
        strokeWidth: 2,
      },
      {
        d: "M451.445 12C451.445 17.5228 449.455 22 447 22C444.546 22 442.556 17.5228 442.556 12C442.556 6.47715 444.546 2 447 2C449.455 2 451.445 6.47715 451.445 12Z",
        strokeWidth: 2,
      },
      {
        d: "M437 12H457",
        strokeWidth: 2,
        roundCaps: true,
      },
    ],
  },
  "AresGlobeIcon"
);

export const AresMountainsIcon = createFigmaIcon(
  {
    viewBox: "522 0 24 24",
    paths: [
      {
        d: "M536 12L532 4.5L524 19.5H540M536 12L540 19.5M536 12L539 7.5L544 19.5H540M529.5 9.2L532 11.5L534.5 9.2",
        strokeWidth: 1.8,
        roundCaps: true,
      },
    ],
  },
  "AresMountainsIcon"
);

export const AresSunIcon = createFigmaIcon(
  {
    viewBox: "609 0 24 24",
    paths: [
      {
        d: "M625 12C625 14.2091 623.209 16 621 16C618.791 16 617 14.2091 617 12C617 9.79086 618.791 8 621 8C623.209 8 625 9.79086 625 12Z",
        strokeWidth: 1.8,
      },
      {
        d: "M621 2V4M621 20V22M611 12H613M629 12H631M614 5L615.5 6.5M626.5 17.5L628 19M614 19L615.5 17.5M626.5 6.5L628 5",
        strokeWidth: 1.8,
        roundCaps: true,
      },
    ],
  },
  "AresSunIcon"
);

export const AresMoonIcon = createFigmaIcon(
  {
    viewBox: "696 0 24 24",
    paths: [
      {
        d: "M718 14.7105C717.494 16.4046 716.556 17.9383 715.28 19.1615C714.003 20.3847 712.43 21.2555 710.716 21.6887C709.002 22.1219 707.204 22.1027 705.5 21.6328C703.795 21.163 702.242 20.2587 700.992 19.0085C699.741 17.7582 698.837 16.2047 698.367 14.5001C697.897 12.7955 697.878 10.9982 698.311 9.28389C698.744 7.56962 699.615 5.99716 700.838 4.72038C702.062 3.4436 703.595 2.50624 705.29 2C703.604 3.68552 702.657 5.97157 702.657 8.35524C702.657 10.7389 703.604 13.025 705.29 14.7105C706.975 16.396 709.261 17.3429 711.645 17.3429C714.028 17.3429 716.314 16.396 718 14.7105Z",
        strokeWidth: 2.04276,
        roundCaps: true,
      },
    ],
  },
  "AresMoonIcon"
);

export const AresRoughnessIcon = createFigmaIcon(
  {
    viewBox: "783 0 24 24",
    paths: [
      {
        d: "M785 12.5H788L791 6.5L794 19.5L798 4.5L801 14.5L803 12.5H805",
        strokeWidth: 1.8,
        roundCaps: true,
      },
    ],
  },
  "AresRoughnessIcon"
);

export const AresFlameIcon = createFigmaIcon(
  {
    viewBox: "870 0 24 24",
    paths: [
      {
        d: "M882.953 2C883.905 6.7619 877.238 7.71429 879.143 11.5238C880.572 11.0476 882 9.61905 882.476 8.19048C885.81 10.5714 888.667 12.4762 888.667 15.3333C888.667 17.1014 887.964 18.7971 886.714 20.0474C885.464 21.2976 883.768 22 882 22C880.232 22 878.536 21.2976 877.286 20.0474C876.036 18.7971 875.333 17.1014 875.333 15.3333C875.333 9.61905 879.143 4.85714 882.953 2Z",
        strokeWidth: 1.71429,
        roundCaps: true,
      },
    ],
  },
  "AresFlameIcon"
);

export const AresWindIcon = createFigmaIcon(
  {
    viewBox: "957 0 24 24",
    paths: [
      {
        d: "M960.012 6.94066H971.142C975.19 6.94066 975.19 2.38732 971.648 2.89324M959 11.9999H976.202C979.743 11.9999 979.743 7.44659 977.213 7.44659M963.047 17.0592H972.154C975.696 17.0592 975.696 21.6125 972.154 21.1066M959 17.0592H959.304",
        strokeWidth: 1.82134,
        roundCaps: true,
      },
    ],
  },
  "AresWindIcon"
);

export const AresPinIcon = createFigmaIcon(
  {
    viewBox: "1044 0 24 24",
    paths: [
      {
        d: "M1063.37 9.36842C1063.37 15.1579 1056 22 1056 22C1056 22 1048.63 15.1579 1048.63 9.36842C1048.63 7.41419 1049.41 5.54001 1050.79 4.15816C1052.17 2.77631 1054.05 2 1056 2C1057.95 2 1059.83 2.77631 1061.21 4.15816C1062.59 5.54001 1063.37 7.41419 1063.37 9.36842Z",
        strokeWidth: 1.89474,
        roundCaps: true,
      },
      {
        d: "M1058.63 9.3684C1058.63 10.8218 1057.45 12 1056 12C1054.55 12 1053.37 10.8218 1053.37 9.3684C1053.37 7.91501 1054.55 6.73682 1056 6.73682C1057.45 6.73682 1058.63 7.91501 1058.63 9.3684Z",
        strokeWidth: 1.89474,
        roundCaps: true,
      },
    ],
  },
  "AresPinIcon"
);

export const AresGearIcon = createFigmaIcon(
  {
    viewBox: "1131 0 24 24",
    paths: [
      {
        d: "M1141 2H1145L1145.7 5.1L1147.7 6.3L1150.7 5.4L1152.7 8.9L1150.4 11V13L1152.7 15.1L1150.7 18.6L1147.7 17.7L1145.7 18.9L1145 22H1141L1140.3 18.9L1138.3 17.7L1135.3 18.6L1133.3 15.1L1135.6 13V11L1133.3 8.9L1135.3 5.4L1138.3 6.3L1140.3 5.1L1141 2Z",
        strokeWidth: 1.8,
        roundCaps: true,
      },
      {
        d: "M1146.2 12C1146.2 13.7674 1144.77 15.2 1143 15.2C1141.23 15.2 1139.8 13.7674 1139.8 12C1139.8 10.2327 1141.23 8.80005 1143 8.80005C1144.77 8.80005 1146.2 10.2327 1146.2 12Z",
        strokeWidth: 1.8,
        roundCaps: true,
      },
    ],
  },
  "AresGearIcon"
);

export const AresSignalIcon = createFigmaIcon(
  {
    viewBox: "0 0 25.6 26.238",
    paths: [
      {
        d: "M7.5599 5.61898C6.86276 6.59662 6.30893 7.76353 5.93083 9.05136C5.55274 10.3392 5.35799 11.7221 5.35799 13.119C5.35799 14.5159 5.55274 15.8988 5.93083 17.1866C6.30893 18.4744 6.86276 19.6413 7.5599 20.619M18.0401 5.61898C18.7372 6.59662 19.2911 7.76353 19.6692 9.05136C20.0473 10.3392 20.242 11.7221 20.242 13.119C20.242 14.5159 20.0473 15.8988 19.6692 17.1866C19.2911 18.4744 18.7372 19.6413 18.0401 20.619M4.41584 1.11898C3.27397 2.66135 2.36426 4.5213 1.74249 6.58478C1.12072 8.64826 0.8 10.8718 0.8 13.119C0.8 15.3662 1.12072 17.5897 1.74249 19.6532C2.36426 21.7167 3.27397 23.5766 4.41584 25.119M21.1842 1.11898C22.326 2.66135 23.2357 4.5213 23.8575 6.58478C24.4793 8.64826 24.8 10.8718 24.8 13.119C24.8 15.3662 24.4793 17.5897 23.8575 19.6532C23.2357 21.7167 22.326 23.5766 21.1842 25.119M12.8 10.119C13.3559 10.119 13.889 10.4351 14.2821 10.9977C14.6752 11.5603 14.896 12.3233 14.896 13.119C14.896 13.9146 14.6752 14.6777 14.2821 15.2403C13.889 15.8029 13.3559 16.119 12.8 16.119C12.2441 16.119 11.711 15.8029 11.3179 15.2403C10.9248 14.6777 10.704 13.9146 10.704 13.119C10.704 12.3233 10.9248 11.5603 11.3179 10.9977C11.711 10.4351 12.2441 10.119 12.8 10.119Z",
        strokeWidth: 1.6,
        lineCap: "square",
      },
    ],
  },
  "AresSignalIcon"
);

export const AresRouteIcon = createFigmaIcon(
  {
    viewBox: "1305 0 24 24",
    paths: [
      {
        d: "M1311.44 19.7779C1311.44 21.0052 1310.45 22.0001 1309.22 22.0001C1307.99 22.0001 1307 21.0052 1307 19.7779C1307 18.5506 1307.99 17.5557 1309.22 17.5557C1310.45 17.5557 1311.44 18.5506 1311.44 19.7779Z",
        strokeWidth: 2,
      },
      {
        d: "M1327 4.22222C1327 5.44952 1326.01 6.44444 1324.78 6.44444C1323.55 6.44444 1322.56 5.44952 1322.56 4.22222C1322.56 2.99492 1323.55 2 1324.78 2C1326.01 2 1327 2.99492 1327 4.22222Z",
        strokeWidth: 2,
      },
      {
        d: "M1311.44 19.7777H1320.33C1326.44 19.7777 1326.44 11.9999 1320.33 11.9999H1313.67C1307.56 11.9999 1307.56 4.22217 1313.67 4.22217H1322.56",
        strokeWidth: 2,
        roundCaps: true,
      },
    ],
  },
  "AresRouteIcon"
);

/** Brand emblem SVG for AreoPath (transparent cropped emblem for HUD headers). */
export function AresLogoIcon({
  className,
  ariaLabel = "AreoPath Logo",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      viewBox="116.5 187 860 706"
      fill="none"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <path
        d="M957.49 592.442 C957.49 606.91 954.828 621.049 949.749 634.727 C912.602 534.686 746.183 459.226 546.504 459.226 C346.825 459.226 180.405 534.686 143.259 634.727 C138.18 621.049 135.518 606.91 135.518 592.442 C135.518 472.162 319.522 374.656 546.504 374.656 C773.485 374.656 957.49 472.162 957.49 592.442 Z"
        fill="#241714"
      />
      <polygon
        points="150.966,876.913 540,203.087 929.034,876.913 646.875,876.913 540,691.8 433.125,876.913"
        fill="#fe7f2d"
      />
      <path
        d="M132.266 605.648 C132.266 591.18 134.95 577.042 140.069 563.363 C177.509 663.404 345.245 738.864 546.504 738.864 C747.763 738.864 915.499 663.404 952.939 563.363 C958.058 577.042 960.742 591.18 960.742 605.648 C960.742 725.928 775.281 823.434 546.504 823.434 C317.727 823.434 132.266 725.928 132.266 605.648 Z"
        fill="#97300c"
      />
    </svg>
  );
}


