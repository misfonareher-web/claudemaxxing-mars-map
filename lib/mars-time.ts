/**
 * Mars Coordinated Time (MTC) and Mars Sol Date (MSD) calculation
 * based on Allison & McEwen (2000) / NASA GISS Mars24 algorithm.
 */
export function getMarsClock(date: Date = new Date()): {
  msd: number;
  mtcTime: string;
} {
  const millis = date.getTime();
  const jdUt = 2440587.5 + millis / 86_400_000;
  // Approximate TT offset (69.184 s + leap seconds)
  const jdTt = jdUt + 69.184 / 86_400;
  const deltaJ2000 = jdTt - 2451545.0;
  const msd = (deltaJ2000 - 4.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const mtcHours = (((msd % 1) + 1) % 1) * 24;

  const h = Math.floor(mtcHours);
  const mFloat = (mtcHours - h) * 60;
  const m = Math.floor(mFloat);
  const s = Math.floor((mFloat - m) * 60);

  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    msd: Math.floor(msd),
    mtcTime: `${pad(h)}:${pad(m)}:${pad(s)}`,
  };
}

export function formatCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${latDir}, ${Math.abs(lon).toFixed(2)}° ${lonDir}`;
}

/**
 * NASA Mars Trek Viking mosaic tile covering [lon, lat] (EQ 2:1 grid)
 * plus fractional focal position inside the tile for thumbnail framing.
 */
export function getVikingTilePreview(lon: number, lat: number, z = 6) {
  const cols = 2 ** (z + 1);
  const rows = 2 ** z;
  const fx = ((lon + 180) / 360) * cols;
  const fy = ((90 - lat) / 180) * rows;
  const x = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const y = Math.max(0, Math.min(rows - 1, Math.floor(fy)));

  return {
    url: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
    fx: Math.max(0, Math.min(1, fx - x)),
    fy: Math.max(0, Math.min(1, fy - y)),
  };
}

