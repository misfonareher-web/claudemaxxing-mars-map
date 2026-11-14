# Bagnold Dunes overview mobility-hazard envelope

Prepared 2026-11-14 for a NASA Space Apps overview map, approximately 460 m/pixel. This is an analyst-created approximation, not a NASA hazard product or an operational navigation boundary.

## Result and interpretation

`bagnold.geojson` is a single Feature / Polygon: one exterior ring, 52 distinct vertices (53 coordinate positions including closure), no holes. Bounding box [west, south, east, north] = **[137.2000000, -4.8371415, 137.5762939, -4.5154951]** degrees. The western end is a clipping edge at the preset boundary, not a natural end of the dune field. No geometry lies outside [137.2, -4.9, 137.6, -4.5].

Severity **2 = avoid if possible** is an editorial classification for the hackathon map. Loose sand creates wheel slip and sinkage risk, but Curiosity made selected, controlled entries and mobility tests in Bagnold sand; the evidence does not justify declaring every part impassable (severity 3). Hidden Valley is a separate example of sand-related mobility difficulty; it was not used to place any boundary vertices and is not represented by this feature.

Confidence **medium** applies to the approximate location and overview envelope of this conspicuous, independently identified dune belt. It does not assert medium confidence in the safety of an individual pixel. The polygon includes intervening bedrock, interdune gaps and sand aprons. Smaller isolated patches and narrow offshoots may be omitted. A large bedrock interval around the Murray Buttes/Phase 2 approach is intentionally retained within this generalized field envelope; shading does not mean continuous sand coverage.

Absence of a mapped hazard does not mean the terrain is safe.

## Method: approach 2 succeeded

1. Retrieved NASA's public MMGIS mission configuration (`raw/api_1.json`). Its complete layer list contains current position, waypoints, surface-view points, rover path, label raster, HiRISE raster, and CTX raster. It contains no vector dune-unit or hazard boundary. The CTX layer is named `Gale Crater Map`, is TMS, and is available through native zoom 13. The HiRISE coverage is only longitude 137.3267..137.4786, so CTX was chosen for complete preset coverage.
2. Downloaded 30 small, specific CTX tiles at zoom 12, x = 3608..3613 and XYZ y = 2099..2103 (TMS y = 1996..1992). All succeeded. Their exact individual source URLs and statuses are in `raw/tile_manifest.json`. Composited without resampling into `raw/ctx_mosaic.png` (1536 x 1280 pixels); grid/waypoint copy: `raw/ctx_grid.png`.
3. Visually identified the dark barchan/linear dune belt and manually traced its generalized outer envelope, using the NASA context map and published High/Namib positions to establish identification. The 56 pre-clipping pixel vertices, in perimeter order, are retained in `raw/digitization.json` and `scripts/build_outline.py`. Every non-clipping vertex is a visual pick on this image; there is no invented positional buffer, arbitrary waypoint hull, machine sand classifier, or extrapolation beyond imagery coverage. Lines between picks deliberately bridge small indentations and gaps at overview scale.
4. Computed the explicit three-point affine transform below, converted the pixel ring, intersected it with the requested box, rounded to seven decimals and oriented counterclockwise. Clipping removes outside vertices and introduces the western boundary intersections, leaving 52 distinct vertices. No additional simplification was necessary.
5. Ran assertions for valid geometry, closed ring, CCW winding, vertex count, preset containment, required caveat sentence, inclusion of the selected official rover stops, and exclusion of Bradbury Landing. Visually inspected `raw/outline_check.png` against the source mosaic. The geometry was not adjusted just to force waypoint inclusion; the original image trace already passed these checks.

## Coordinate convention, control points and affine transform

Coordinates are [east-positive longitude, planetocentric latitude] degrees, Mars 2000 sphere (radius 3,396,190 m), longitude -180..180. This feature is for a Mars-aware viewer: ordinary Earth GIS defaults must not be used to interpret its distances. No Earth EPSG:4326 CRS claim is attached to the GeoJSON.

The MMGIS configuration declares equal major and minor radii of 3,396,190 m and `projection.custom=false`. Used standard Web-Mercator/TMS tile indexing as supported by the public map. The tile lattice supplies three non-collinear coordinate controls; these are **grid controls**, not three surveyed surface landmarks. Longitude/latitude at mosaic pixel coordinate (x,y) before affine approximation are:

```
N = 4096; tile size = 256
X = 3608*256 + x
Y = 2099*256 + y                 # XYZ orientation, y down
longitude = 360*X/(N*256) - 180
latitude = atan(sinh(pi*(1 - 2*Y/(N*256)))) * 180/pi
TMS_y = N - 1 - XYZ_y
```

Pixel origin is the upper-left outer raster corner; x increases rightward and y downward. A half-pixel convention difference is about 10 m and is immaterial here.

| Control | x (px) | y (px) | Longitude E | Planetocentric latitude N |
|---|---:|---:|---:|---:|
| Upper left | 0 | 0 | 137.109375000000 | -4.477856485571 |
| Upper right | 1536 | 0 | 137.636718750000 | -4.477856485571 |
| Lower left | 0 | 1280 | 137.109375000000 | -4.915832801313 |

Solving `[x y 1] * coefficients = [longitude latitude]` gives:

```
longitude = 137.109375000000 + 0.00034332275390625*x + 0*y
latitude  = -4.477856485570588 + 0*x - 0.00034216899667388894*y
```

The fourth raster corner matches the affine exactly because both coordinate axes separate. The maximum interior latitude departure from the exact inverse Mercator formula, sampled on every raster row, is **2.04 m**. This checks the affine approximation, not the absolute geolocation of CTX imagery. Mars 2000 planetocentric interpretation is consistent with the map's spherical radius and the published/official rover positions; no separate survey-quality datum audit or orbital bundle adjustment was performed. In particular, no planetographic-to-planetocentric conversion was silently applied.

## Accuracy and limits

Raster sampling at the field is approximately **20 m/pixel** on Mars. Visual picking and envelope generalization dominate: estimated boundary uncertainty **200-500 m** (roughly half to one overview pixel), locally **about 1 km** across diffuse margins, scattered dunes or broad bedrock gaps. This is a judgement estimate, not a statistical confidence interval or measured registration RMSE. Affine error (<3 m), rounding (<1 cm), and normal dune migration over recent years are small by comparison. No original acquisition date was recovered for the composite CTX layer, and no claim of a current, complete sand inventory is made.

The boundary intentionally follows the overview dune belt instead of resolving individual dunes or safe corridors. Other hazardous terrain can occur inside or outside it. It must not be used to plan a real traverse, infer bearing strength or choose a safe route.

## Sanity checks

Official waypoints come from the NASA JSON below (altitude ignored). The local Newman et al. figure and tables independently place High and Namib at the same northern field margin.

| Stop | Official [lon, lat] | Result |
|---|---|---|
| Bradbury, sol 3 | [137.441633, -4.589467] | Outside |
| User-supplied Bradbury reference | [137.4417, -4.5895] | Outside |
| High Dune, sol 1181 | [137.3657563, -4.67932348] | Inside |
| High Dune, sol 1183 | [137.3656255, -4.6793632] | Inside |
| Namib approach, sol 1192 | [137.3671676, -4.67958815] | Inside |
| Namib sols 1194, 1196, 1216, 1221, 1243 | See machine-readable `raw/digitization.json` | All inside |
| Ogunquit vicinity, sols 1646 and 1648 | See machine-readable `raw/digitization.json` | Both inside |

NASA identifies Ogunquit observations on sol 1647 and the position reached on sol 1646. Sol 1648 is an additional nearby check, not a claimed exact location for the sol-1647 panorama. No requirement that every point of Curiosity's traverse be inside was imposed. Valid Polygon, CCW exterior, closure, 52 vertices, and clipping assertions all pass.

## Sources and approach audit

### Sources actually used for geometry and validation

- https://science.nasa.gov/mission/msl-curiosity/location-map/ — NASA identifies the public map, orbital imagery origins and end-of-drive dots. Entry point to the map; its explanation is corroborating context.
- https://mars.nasa.gov/maps/location/?mission=MSL&site=NOW — public MMGIS shell, saved as `raw/msl_map.html`. JavaScript from https://mars.nasa.gov/build/static/js/main.8434bd16.chunk.js is retained in `raw/msl_main.js`; inspection exposed the configuration API. No browser automation or private service was used.
- **https://mars.nasa.gov/maps/location/api/configure/get?mission=MSL** — main `source_ref`; full public layer inventory, radii, CTX/HiRISE coverage and actual raster/vector URLs. Saved as `raw/api_1.json`.
- https://mars.nasa.gov/mmgis-maps/MSL/Layers/MSL_CTX_ortho_mosaic_6m/{z}/{x}/{y}.png — exact template provided by NASA configuration; x/y/z here use TMS indexing. Primary boundary image. Concrete example: https://mars.nasa.gov/mmgis-maps/MSL/Layers/MSL_CTX_ortho_mosaic_6m/12/3610/1994.png . The complete list of 30 concrete URLs is in `raw/tile_manifest.json`; downloaded PNGs retain these indices in their filenames.
- https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json — official end-of-drive positions used for sanity checks, saved verbatim in `raw/MSL_waypoints.json`. Waypoints provide validation, not a dune polygon.
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6208171/ — Newman et al., *Winds measured by REMS during the MSL rover's Bagnold Dunes Campaign and comparison with MarsWRF*. Figure 1 and Tables 1-3 identify High/Namib and give independent local rover coordinates; discussion describes controlled dune entry. Saved as `raw/newman.html`. Direct figure https://cdn.ncbi.nlm.nih.gov/pmc/blobs/46a8/6208171/93211a667141/nihms-992046-f0001.jpg is saved as `raw/newman_fig1.jpg`. The isolated local figure was too small in geographic coverage to define the full preset outline.
- https://ntrs.nasa.gov/api/citations/20250006917/downloads/GuzewichComparingSTI.pdf — Mason et al., *Comparing Navcam Dust Devil Detections to transient daytime convective vortex signatures in REMS Pressure and Ultraviolet Data*. Figure 1, PDF page 5, labels the Bagnold belt on a JMARS coordinate-axis basemap. Downloaded and rendered as `raw/context_page5.png`; used to corroborate the regional identification. This figure alone cuts off part of the northern field, so it was not the final tracing source. The file's download name is not its first author's name.

### Context for hazard and extent

- https://science.nasa.gov/blog/recap-of-the-bagnold-dune-investigation/ — NASA summary: field extends about 35 km, with a width of 1-2 km, on northwestern Mount Sharp; establishes identity and campaign context. Saved as `raw/nasa_recap.html`; no vertices were generated from these textual dimensions.
- https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2017JE005401 — Bridges & Ehlmann, Phase I campaign overview; accessible search-indexed excerpt describes mobility testing on sand near High Dune. Supports severity 2 as an interpretation, not a published categorical hazard score.
- https://www.jpl.nasa.gov/news/curiosity-mars-rover-prepares-for-fourth-rock-drilling/ — JPL's August 2014 Hidden Valley retreat / slippery sand account. Web-indexed text was accessible, direct archival download returned 403. Context only; Hidden Valley is geographically separate.
- https://science.nasa.gov/resource/textures-where-curiosity-rover-studied-a-martian-dune/ and https://www.nasa.gov/image-article/panorama-with-active-linear-dune-gale-crater-mars/ — NASA descriptions identify Ogunquit Beach observations at sol 1647 and the position reached on sol 1646. Supports the additional southern sanity check.

### Approach 1: published vector search attempted; no usable polygon retrieved

- Anderson & Bell 2010, https://doi.org/10.1555/mars.2010.0004 ; attempted publisher page https://marsjournal.org/contents/2010/0004/ — connection actively refused. Found the publication and geomorphic-map references, but did not retrieve a GIS release. This does not establish that no release exists.
- Calef & Parker merged orthophoto: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm — direct download/page request returned HTTP 403. https://murray-lab.caltech.edu/Mars2020/index.html describes its imagery distribution (28 GB HiRISE mosaic; 731 MB CTX archive). These are rasters, not an identified Bagnold vector boundary; avoided large mosaic downloads because small official tiles became available.
- Ewing et al., https://doi.org/10.1002/2017JE005324 ; attempted author PDF https://lamb.caltech.edu/documents/19681/Ewing_etal_JGR_2017.pdf — HTTP 403. Search-indexed material describes the field and image-based methods, but no retrievable vector boundary was identified. Searches also covered Bridges/Lapotre dune papers, journal supplements and Zenodo; no relevant vector package was retrieved. Unrelated river-bedload datasets named after Bagnold were discarded.
- USGS Mars Global Digital Dune Database, https://pubs.usgs.gov/of/2007/1158/ and https://www.usgs.gov/centers/astrogeology-science-center/science/mars-global-digital-dune-database — search results identify a real global polygon database and a 57.8 MB shapefile package. The actual release landing page returned HTTP 403 both in web access and direct Python retrieval, preventing inspection of the package link and Gale units in this run. It was not used; its existence must not be mistaken for a verified local polygon.
- Public MMGIS vectors: the successfully retrieved complete configuration offers rover points and a traverse, but no dune boundary. Labels are raster tiles, not region polygons. Earlier guessed `Missions/{MSL,MSL_Surface,msl}/config.json` paths under the site root and `/maps/location/` all returned 404; `https://mars.nasa.gov/mmgis-maps/MSL/config.json` returned 403; `https://mars.nasa.gov/api/configure/get?mission=MSL` returned 404. The successful API is under `/maps/location/api/`. The `/mmgis-maps/MSL/Layers/json/` directory listing returned an empty body. Raw attempts are reproducible from the fetch scripts.

### Approaches 2 and 3

Approach 2 succeeded with the official georeferenced CTX tile lattice. The smaller Newman figure and regional Mason figure were inspected first; their geographic coverage was insufficient individually. Approach 3 (text-only construction) was unnecessary and was not used. The outline is not a hull around the visited dunes.

## Reproduction and files

All files and installed Python helper packages are confined to this output folder. These notes describe the original research run. Run Python scripts in isolated mode:

```
python -I scripts/build_outline.py
```

Dependencies used by the final builder are NumPy, Shapely and Pillow under `scripts/_deps`; PyMuPDF was used only to render the downloaded context PDF. Scripts explicitly add this local dependency directory in isolated mode. Preserve the raw imagery, configuration, waypoint snapshot and digitization JSON for stable reproduction because live NASA services may change. `raw/outline_check.png` is a QA overlay, not an additional deliverable requirement. `raw/supplementary_download_log.json` records the final contextual-source download results.

## Repository integration

The production input is `../../../etl/sources/hazard_outlines.geojson`; the ETL reads it without GIS dependencies. The copied builder is an archival derivation script, run from this directory only after restoring the documented research inputs. Raw downloads, imagery, extracted GIS files, QA products, fetch scripts and local dependency directories are intentionally omitted from the repository. References above to those files describe the original research workspace; the builder is not part of the offline ETL rebuild. The hand-picked pixel vertices and affine controls are retained in `raw/digitization.json`. Restore `raw/tile_manifest.json`, `raw/MSL_waypoints.json`, `raw/ctx_mosaic.png` and NumPy/Shapely/Pillow to reproduce the archival build.

## Scoring use

ARES uses this outline as an approximate scoring penalty, not a navigation boundary. Severity 2 receives the configured hazard penalty (currently a multiplier of 0.70). The uncertainty and included bedrock gaps described above still apply.
