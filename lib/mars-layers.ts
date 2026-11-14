export interface MarsBasemapLayer {
  key: string;
  name: string;
  subtitle: string;
  category: "terrain" | "imagery" | "thermal" | "atmosphere";
  layerId: string;
  extension: "jpg" | "png";
  maxNativeZoom: number;
}

export const MARS_BASEMAP_LAYERS: MarsBasemapLayer[] = [
  {
    key: "viking",
    name: "Viking Global Mosaic",
    subtitle: "Visible-light orbital imagery (232m)",
    category: "imagery",
    layerId: "Mars_Viking_MDIM21_ClrMosaic_global_232m",
    extension: "jpg",
    maxNativeZoom: 7,
  },
  {
    key: "mola",
    name: "MOLA Color Hillshade",
    subtitle: "Global elevation & terrain (463m)",
    category: "terrain",
    layerId: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
    extension: "jpg",
    maxNativeZoom: 7,
  },
  {
    key: "hrsc",
    name: "MOLA + HRSC Blend",
    subtitle: "Combined color elevation shade (200m)",
    category: "terrain",
    layerId: "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw",
    extension: "jpg",
    maxNativeZoom: 8,
  },
  {
    key: "themis-day",
    name: "THEMIS Infrared Day",
    subtitle: "Daytime thermal IR mosaic (100m)",
    category: "thermal",
    layerId: "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018",
    extension: "png",
    maxNativeZoom: 9,
  },
  {
    key: "themis-night",
    name: "THEMIS Infrared Night",
    subtitle: "Nighttime thermal IR mosaic (100m)",
    category: "thermal",
    layerId: "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018",
    extension: "png",
    maxNativeZoom: 9,
  },
  {
    key: "roughness",
    name: "Surface Roughness",
    subtitle: "MOLA terrain roughness",
    category: "terrain",
    layerId: "mola_roughness",
    extension: "png",
    maxNativeZoom: 1,
  },
  {
    key: "thermal",
    name: "Thermal Inertia",
    subtitle: "TES surface thermal properties",
    category: "atmosphere",
    layerId: "TES_Thermal_Inertia",
    extension: "png",
    maxNativeZoom: 1,
  },
  {
    key: "dust",
    name: "TES Global Dust",
    subtitle: "Atmospheric dust distribution",
    category: "atmosphere",
    layerId: "TES_Dust",
    extension: "png",
    maxNativeZoom: 1,
  },
];

export function getMarsTrekTileUrl(layer: MarsBasemapLayer): string {
  return `https://trek.nasa.gov/tiles/Mars/EQ/${layer.layerId}/1.0.0/default/default028mm/{z}/{y}/{x}.${layer.extension}`;
}

export function getSafePresetZoom(
  presetDefaultZoom: number,
  basemapKey: string
): number {
  const layer = MARS_BASEMAP_LAYERS.find((l) => l.key === basemapKey);
  const nativeMax = layer?.maxNativeZoom ?? 7;
  // Keep upscaling minimal so Mars imagery stays crisp inside Jezero/Gale
  const sharpCap = nativeMax >= 9 ? 9 : Math.max(5.5, nativeMax + 0.75);
  return Math.min(presetDefaultZoom, sharpCap);
}

