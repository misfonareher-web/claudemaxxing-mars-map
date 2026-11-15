# Séítah approximate dune mobility hazard

Produced 2026-11-14 for a hackathon overview map at approximately 460 m/pixel. This is a derived regional caution zone, not a NASA operational hazard product or an authoritative boundary of the named Séítah region.

## Result and interpretation

- Output: `seitah.geojson`, one Feature with a Polygon and one exterior ring.
- Bounds, [west, south, east, north]: **[77.3827642951, 18.4168126640, 77.4621191528, 18.4657187720]** degrees.
- **33 distinct vertices; 34 coordinate positions including closure**, counterclockwise.
- Severity **2 (avoid if possible)**. Sand dunes present an entrapment and mobility concern, but the rover visited selected Séítah outcrops. A uniform prohibition would overstate the cited evidence.
- Confidence **medium**: strong published vector provenance for dune locations, but the regional aggregation and its identification with the Séítah complex are interpretive.
- Includes adjoining connected dune tongues west and south of the principal Séítah outcrop, and internal bedrock islands. It is deliberately named “Séítah dune complex (approximate)”. It must not be described as an exact geological Séítah boundary or as continuous sand coverage.

## Method: approach 1 succeeded

1. Downloaded Stack et al.'s original GIS supplement (Online Resource 3). Extracted its shapefile and read its attributes and `.prj`. The source contains 4,700 records; its fields include `quadname`, `SurfUName`, and `BedrkUName`.
2. Selected records whose `BedrkUName` is exactly `Crater floor fractured 1` and whose `SurfUName` is exactly `Aeolian bedforms, large`: 159 records. The later Barnes et al. paper explicitly associates Cf-f-1 with the Séítah formation. The surficial filter is essential: the entire Cf-f-1 bedrock unit extends much farther south and is unsuitable as a dune hazard footprint.
3. Applied Shapely `make_valid` to selected geometries, dissolved them, and obtained 29 connected components. Selected the unique component covering [77.441 E, 18.439 N], a point in the mapped dune field west/southwest of the landing site. This point selects existing geometry; it supplies no outline vertices. The component has contributions from 38 source records, individually listed with zero-based indices and attributes in `raw/validation.json`.
4. Took that component's exterior, filling 100 internal holes to obtain a regional zone suitable for shading. Native-map areas: original dunes 3.020943 km²; exterior including islands 3.697280 km². No convex hull, invented connector, or manually drawn vertex was used. The connected component also contains narrow adjoining dune tongues: retaining those avoids an arbitrary geographic cutoff.
5. Simplified the exterior with Shapely's topology-preserving simplification at 150 native map meters, reducing it to 33 distinct vertices. Simplification retains source vertices. Measured exterior-to-exterior Hausdorff displacement: **149.456 native map meters**. The result is not an everywhere-outward buffer and can exclude small source-edge slivers. Final native-map area: 3.501296 km² (about 3.32 km² on the sphere after local east-west scale adjustment).
6. Converted the supplied Mars spherical equirectangular projection analytically to longitude/latitude, intersected with the requested preset box, and enforced counterclockwise winding. Clipping made no change. Kept floating-point coordinates to avoid damaging very narrow source-derived geometry; their decimal precision is not an accuracy claim.

### Coordinate conversion

Source `.prj`: `Mars2000 Equidistant Cylindrical clon0`, sphere radius **R = 3,396,190 m**, central meridian 0°, standard parallel 0°, zero false easting/northing. Inverse:

```text
longitude_deg = x_m * 180 / (pi * 3396190)
latitude_deg  = y_m * 180 / (pi * 3396190)
```

The spherical latitude is planetocentric; no Earth/WGS84 datum transformation is applied. Longitudes already lie within -180..180. Output coordinates are [east-positive longitude, planetocentric latitude], degrees, in the requested Mars 2000 convention. No GeoJSON `crs` member is added; the map consumer must interpret these as Mars coordinates.

This is vector reprojection, **not image digitization**. Pixel control points and an image affine transform are consequently not applicable. The coordinate scaling above is fully specified in `scripts/build.py`.

## Accuracy and sanity checks

- Estimated **250–500 m (0.25–0.5 km)** uncertainty for use as a regional mobility caution zone. This is an analyst estimate, not measured ground-truth accuracy or a statistical confidence interval. It allows for source/generalization and especially the mismatch between a connected mapped dune complex and the informal Séítah name. Individual internal bedrock islands are intentionally included, so this number must not be interpreted as a wheel-scale sand classification error bound. Adjoining tongues are disclosed scope, not claimed positioning error.
- The simplification contribution alone is measured at <150 native map meters, less than one 460 m overview pixel. Equirectangular native east-west distances at 18.44° latitude exceed ground east-west distances by about 5%; the reported native distance is conservative here.
- Landing [77.4508, 18.4447] is **outside**, approximately **109 native map meters** (roughly 100–110 m on the ground) from the final exterior.
- The landing is near the **eastern edge** of the overall dune complex and northeast of its principal southern lobe. The published connected dunes extend north of landing as well. Thus “landing near the NE edge” is a useful southern-lobe check, not literally the overall complex's NE corner. The source geometry was not cut or shifted to force that expectation.
- Bounds fall wholly inside lon 77.2..77.75, lat 18.25..18.7. No clip required.
- Assertions passed for valid/nonempty geometry, vertex limit, ring closure, counterclockwise winding, longitude/latitude ranges, preset containment, unique component selection, and landing exclusion.
- NASA's overview image PIA24596 and closer Séítah image PIA25024 were downloaded and visually inspected for contextual consistency. They were not georegistered, and visual inspection is not an independent numerical registration test.
- Public waypoint JSON has 708 point Features in this snapshot. Sol 13 is [77.45088572, 18.44462715], consistent with the user-supplied landing location within a few meters. The JSON was used for this position check, not as an invented region boundary.

## Approaches attempted, failures, and stopping point

1. **Published GIS: successful.** Found the Stack et al. GIS-ready supplement directly on the publisher's page. It uses descriptive unit attributes, not a literal `Seitah` field. Later published terminology plus the spatial match supports the regional interpretation. Source selection and geometry derivation are recorded above.
   - Explored the Sun & Stack USGS regional map (SIM 3464); publication endpoint returned **HTTP 403** to both web fetching and direct download. Its ArcGIS service was discoverable, but further regional GIS retrieval was unnecessary after obtaining the more detailed original science-team vector supplement.
   - **Public MMGIS:** map shell, JavaScript bundle and official waypoint JSON downloaded successfully. The bundle refers to mission `config.json`; the tested URL below returned **HTTP 404**. No named-region polygon was recovered from that tested path. This is not a claim that no such public layer exists. Broad endpoint guessing stopped once the published source succeeded.
2. **NASA map imagery: downloaded and inspected as a fallback/context check.** PIA24596 and PIA25024 show Séítah and the route relation. No affine calibration or image-derived polygon was needed because approach 1 supplied vector geometry. The flight-12 resource was checked as context; its oblique aerial photograph alone would not supply a complete registered regional boundary.
3. **Text/positional construction: not used.** The published GIS approach succeeded; no text-only guessed vertices were added.

Technical issues: the default isolated Python had no GIS packages. Dependencies were installed locally into `scripts/vendor`. PyShp encountered empty polygons during an exploratory full-file scan (records 1044, 1045, 1051, 1090, 1091); none meets the final filter, so the builder does not silently skip selected geometries. An exploratory six-decimal rounding invalidated a narrow feature; the final output retains unrounded coordinates and passes validity checks. Pypdf emitted object-offset warnings while extracting the supplementary README; the shapefile, attributes and projection were independently readable. Direct downloads of Wiley and JPL's video page returned 403, while their relevant text was readable through web retrieval. These access failures are in `raw/download_log.json`.

## Sources and exactly what was used

1. **Main source:** Stack et al. (2020), *Photogeologic Map of the Perseverance Rover Field Site in Jezero Crater Constructed by the Mars 2020 Science Team*, SSR 216:127. https://doi.org/10.1007/s11214-020-00739-x ; publisher page https://link.springer.com/article/10.1007/s11214-020-00739-x . Used the published unit map and supplementary vector data, not its pre-landing genetic interpretations.
2. **Actual vector archive:** https://static-content.springer.com/esm/art%3A10.1007%2Fs11214-020-00739-x/MediaObjects/11214_2020_739_MOESM3_ESM.zip . Local `raw/stack_gis.zip`, 3,476,604 bytes. SHA-256: `970e4c78ae6dc689c99e46eddb4be184704a56952008d0558f643e816e29b118`. Contains the original shapefile, auxiliary files, `.prj`, and `EMS_3_README.pdf`.
3. **Terminology correlation:** Barnes et al. (2026), *Intrusion-Induced Forced Folding Model for the Origin of Séítah Formation Domes on the Jezero Crater Floor, Mars*, section 2.2, https://doi.org/10.1029/2025JE009463 ; https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009463 . Used the identification of Séítah with Cf-f-1 and its ridges surrounded by dunes. DOI year-string is 2025; published article is 2026. No polygon taken from its figures.
4. **Hazard rationale:** https://www.jpl.nasa.gov/videos/explore-mars-jezero-crater-with-nasas-perseverance-rover/ (2021-12-21). The transcript explains that Perseverance takes a longer route to avoid sand dunes. Used for the mobility warning, not geometry.
5. **Severity qualification:** https://science.nasa.gov/blog/to-seitah-and-back/ (2021-12-16). Documents actual investigation and sampling in Séítah. Supports severity 2 rather than asserting the entire area is forbidden.
6. **Regional context image:** https://science.nasa.gov/photojournal/perseverances-first-road-trip/ ; JPEG https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia24/pia24596/PIA24596.jpg . Contextual visual check of route, landing and Séítah-N/S; not used for coordinates.
7. **Closer context image:** https://science.nasa.gov/photojournal/diversity-of-seitah-minerals/ ; JPEG https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia25/pia25024/PIA25024.jpg . Visual confirmation of dunes and ridges; caption identifies Artuby as part of the southern Séítah boundary. Not used for coordinates.
8. **Flight-12 context:** https://science.nasa.gov/resource/flight-12-view-of-south-seitah/ . Confirms scouting imagery in South Séítah on 2021-08-16; no image coordinates or geometry extracted.
9. **Official waypoint snapshot:** https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json . Landing vicinity check described above. Snapshot content may lag the present mission; no claim of current rover position is made.
10. **Public map discovery:** https://mars.nasa.gov/maps/location/?mission=M20 ; JavaScript https://mars.nasa.gov/build/static/js/main.8434bd16.chunk.js . Used to inspect configuration loading. Tested https://mars.nasa.gov/maps/location/Missions/M20/config.json returned 404.
11. **Alternative regional map:** https://doi.org/10.3133/sim3464 ; https://pubs.usgs.gov/publication/sim3464 . Publication page retrieval failed (403); no geometry used. Discovered service https://tiles.arcgis.com/tiles/v01gqwM5QqNysAAi/arcgis/rest/services/JezeroFiguresAnno_WebTile/MapServer documents the regional product; not a source of the delivered polygon.

## Reproduction and files

All downloaded files and extracted source files are under `raw/`; scripts and local dependencies are under `scripts/`. These notes describe the original research run.

```powershell
# From this output directory; all downloaded-file reads use isolated Python.
python -I scripts/build.py
```

Dependencies already present in `scripts/vendor`: pyshp 3.1.8, shapely 2.2.0, numpy 2.5.4; pillow 13.0.0 and pypdf 7.1.0 were used for inspection. `raw/validation.json` records contributing source IDs, geometry metrics and the original archive digest. `raw/download_log.json` records requested/final URLs, hashes and access failures. `raw/candidate_dunes.geojson` and `raw/candidate_bedrock.geojson` are exploratory intermediates **in source projected meters**, not map-ready longitude/latitude; only the top-level `seitah.geojson` is the deliverable.

Absence of a mapped hazard does not mean the terrain is safe.

## Repository integration

The production input is `../../../etl/sources/hazard_outlines.geojson`; the ETL reads it without GIS dependencies. The copied builder is an archival derivation script, run from this directory only after restoring the documented research inputs. Raw downloads, imagery, extracted GIS files, QA products, fetch scripts and local dependency directories are intentionally omitted from the repository. References above to those files describe the original research workspace; the builder is not part of the offline ETL rebuild. Restore the cited archive as `raw/stack_gis.zip`, extract its shapefile files into `raw/stack_gis/`, and provide PyShp/Shapely to reproduce the archival build.

## Scoring use

AreoPath uses this outline as an approximate scoring penalty, not a navigation boundary. Severity 2 receives the configured hazard penalty (currently a multiplier of 0.70). The uncertainty and included bedrock gaps described above still apply.
