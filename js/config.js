
export const TILE_SIZE = 256;

export const TILE_BASE_HTTPS_URL =
    "https://trek.nasa.gov/tiles/Mars/EQ/";

export const TILE_BASE_HTTP_URL =
    "http://trek.nasa.gov/tiles/Mars/EQ/";

export const LAYERS = {
    mola: {
        name: "MOLA Color Hillshade",
        id: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
        extension: "jpg"
    },

    roughness: {
        name: "Surface Roughness",
        id: "mola_roughness",
        extension: "png"
    },

    hrsc: {
        name: "MOLA + HRSC Blend",
        id: "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw",
        extension: "jpg"
    },

    viking: {
        name: "Viking Global Mosaic",
        id: "Mars_Viking_MDIM21_ClrMosaic_global_232m",
        extension: "jpg"
    },

    atlas: {
        name: "MGS MOC Atlas",
        id: "msss_atlas_simp_clon",
        extension: "png"
    },

    "themis-day": {
        name: "THEMIS Infrared Day",
        id: "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018",
        extension: "png"
    },

    "themis-night": {
        name: "THEMIS Infrared Night",
        id: "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018",
        extension: "png"
    },

    dust: {
        name: "TES Global Dust",
        id: "TES_Dust",
        extension: "png"
    },

    "dust-index": {
        name: "TES Dust Index",
        id: "tes_ruffdust",
        extension: "png"
    },

    thermal: {
        name: "Thermal Inertia",
        id: "TES_Thermal_Inertia",
        extension: "png"
    },

    pyroxene: {
        name: "High-Ca Pyroxene",
        id: "TES_Clinopyroxene",
        extension: "png"
    }
};

