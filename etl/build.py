"""Build cited Mars terrain, proxy, vector and environment products."""
import argparse
import datetime
import json
from pathlib import Path
import numpy as np
from etl.grid import CRS_NOTE, definition, terrain
from etl.sources import mola, themis_trek, ice, environment, features, texture, catalog, rems, relay_passes

ROOT = Path(__file__).resolve().parents[1]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--all', action='store_true')
    choice.add_argument('--preset')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    presets = json.loads((ROOT/'config/mission_presets.json').read_text(encoding='utf-8'))['presets']
    if args.preset and args.preset not in {p['id'] for p in presets}:
        parser.error('Unknown preset')
    texture.build(ROOT/'data/raw', ROOT/'data/textures/mars_global_2k.jpg', args.offline, args.force)
    slopes = {}; ice_grids = {}
    for preset in presets:
        if args.preset and preset['id'] != args.preset:
            continue
        env_module = {'meda_derived_daily': environment, 'rems_derived_daily': rems}.get(preset.get('environment_dataset_id'))
        if env_module:
            write_json(ROOT/'data/environment'/(preset['id']+'.json'), env_module.build(preset, env_module.fetch(ROOT/'data/raw', args.offline, args.force)))
        elevation = mola.build(preset, mola.fetch(ROOT/'data/raw', preset, args.offline, args.force))
        slope, roughness = terrain(elevation, preset['bbox'])
        thermal = themis_trek.build(preset, themis_trek.fetch(ROOT/'data/raw', preset, args.offline, args.force))
        frozen = ice.build(preset, ice.fetch(ROOT/'data/raw', args.offline, args.force))
        slopes[preset['id']] = slope
        ice_grids[preset['id']] = frozen
        folder = ROOT/'data/grids'/preset['id']
        folder.mkdir(parents=True, exist_ok=True)
        layers = {}
        for name, array, units in [('elevation_m', elevation, 'm'), ('slope_deg', slope, 'deg'), ('roughness_m', roughness, 'm'), ('thermal_index', thermal, 'unitless 0-1'), ('ice_index', frozen, 'unitless 0-1')]:
            np.save(folder/(name+'.npy'), array.astype(np.float32), allow_pickle=False)
            layers[name] = dict(file=name+'.npy', units=units, dataset_id=('trek_themis_ir_day' if name == 'thermal_index' else 'ody_ns_epithermal' if name == 'ice_index' else 'mola_megdr'), synthetic=False, min=float(np.nanmin(array)), max=float(np.nanmax(array)))
        shape, size = definition(preset['bbox'])
        write_json(folder/'manifest.json', dict(version=1, preset_id=preset['id'], bbox=preset['bbox'], shape=shape, cell_size_deg=size, origin='north_west', crs_note=CRS_NOTE, layers=layers))
        base = preset['base_point']
        row = min(shape[0]-1, int((preset['bbox'][3]-base['lat'])/size[0]))
        col = min(shape[1]-1, int((base['lon']-preset['bbox'][0])/size[1]))
        print(preset['id'], shape, 'base elevation', float(elevation[row,col]), layers)
    for preset in presets:
        if preset['id'] not in slopes:
            folder=ROOT/'data/grids'/preset['id']
            if (folder/'slope_deg.npy').exists():
                slopes[preset['id']]=np.load(folder/'slope_deg.npy',allow_pickle=False)
                ice_grids[preset['id']]=np.load(folder/'ice_index.npy',allow_pickle=False)
    thresholds = json.loads((ROOT/'config/scoring_weights.json').read_text())['factor_params']['slope']
    for name, value in features.build([p for p in presets if p['id'] in slopes],slopes,thresholds,ice_grids).items():
        write_json(ROOT/'data'/(name+'.geojson'),value)
    write_json(ROOT/'data/missions.json', dict(version=1, missions=catalog.MISSIONS))
    # Preserve the original access date during cached rebuilds.
    path = ROOT/'data/provenance.json'
    existing = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
    now = datetime.datetime.now(datetime.timezone.utc)
    record = dict(mola.PROVENANCE, access_date=existing['datasets'][0]['access_date'] if existing else now.date().isoformat())
    relay_record = dict(relay_passes.PROVENANCE, access_date=next((r['access_date'] for r in (existing or {}).get('datasets', []) if r['dataset_id'] == relay_passes.PROVENANCE['dataset_id']), now.date().isoformat()))
    write_json(path, dict(version=1, generated_at=existing['generated_at'] if existing else now.isoformat(), datasets=[record]+[dict(module.PROVENANCE,access_date=record['access_date']) for module in [themis_trek,ice,environment,rems,features,texture]]+[dict(r,access_date=record['access_date']) for r in (texture.BASEMAP_PROVENANCE,catalog.PROVENANCE_HISTORY,catalog.PROVENANCE_CNSA,catalog.PROVENANCE_ICE,catalog.PROVENANCE_SEITAH,catalog.PROVENANCE_BAGNOLD)]+[relay_record]))
    provenance=json.loads(path.read_text(encoding='utf-8'))
    lines=['# Data provenance','', 'AreoPath uses NASA measurements and cartographic products plus cited literature and derived annotations. Zhurong information is from CNSA literature; the Seitah outline derives from the published GIS map by Stack et al. (2020); the Bagnold outline was digitized by the team from NASA CTX imagery.', '', 'Historical landing-site base points stand in for a hypothetical habitat. The 10 km radial EVA cutoff is a demo assumption, not a NASA requirement or a validated walking/return range. Jezero delta/lake sediments are separate from the Seitah olivine-rich igneous cumulate crater-floor unit (Liu et al., 2022; https://doi.org/10.1126/science.abo2756).', '', '| Dataset | Mission / instrument | Source | Access date | Coverage | Resolution | Units | Format | Processing | Limitations |', '|---|---|---|---|---|---|---|---|---|---|']
    for r in provenance['datasets']:
        lines.append('| '+' | '.join(str(v).replace('|','/') for v in [r['title'],r['mission']+' / '+r['instrument'],r['source_url'],r['access_date'],r['spatial_coverage']+'; '+r['temporal_coverage'],r['resolution'],r['units'],r['format'],r['processing'],'; '.join(r['limitations'])])+' |')
    lines += ['', 'Predicted orbiter visibility (`data/relay_passes.json`) uses JPL Horizons MRO, TGO and Mars Odyssey ephemerides over the Jezero and Gale preset base points, sampled every minute from 15 to 23 November 2026 UTC with a 10 degree elevation mask. Pass endpoints are the first and last above-mask samples (no interpolation; boundary passes may be clipped); rates use a 88775.244 second sol. Daily Earth-geocenter to Mars-center one-way light times cover 14 November to 31 December 2026; distance is light time multiplied by c. MAVEN is excluded because its prediction coverage ends in March 2026. These are predicted line-of-sight windows, not operational relay sessions or confirmed availability. Rebuild with `python -I etl/sources/relay_passes.py`; exact query templates and coverage notes are in the JSON.']
    lines += ['', '## How the 0вЂ“100 index uses each layer', '', 'Slope and roughness describe coarse terrain gradients and elevation variability. Thermal is relative rendered THEMIS brightness, not temperature. Ice is a relative neutron-suppression proxy, not an ice fraction. Science and base distance use approximate catalog points. MEDA (Jezero) and REMS (Gale) daily series are historical point context for charts and do not enter the score.', '', '## Known limitations', '', 'Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.', '', 'Absence of a mapped hazard does not mean the terrain is safe.', '', 'The 0вЂ“100 index is a conditional heuristic methodology for comparison, not a safety certification or a validated model.', '', 'MEDA and REMS series describe observed samples from selected sols (every 36th MEDA sol, every 96th REMS sol), not full-sol coverage. See docs/WEATHER_FIELDS.md and per-series field_caveats for legacy-cache limits, missing_sols and partial_coverage. No rover-heating correction; wind is omitted. Odyssey uses latitude bands -5.5 to -3.5 and 17.5 to 19.5 degrees, normalized against the maximum flux in those bands. Zero-valued neutron bins are missing observations, not ice evidence. Landing-site coordinates come from the PDS Geosciences ODE landing-site table or peer-reviewed publications (see source_ref per feature); science-target positions are approximate. Global ice bands are generalized from publications and are not ice maps. MOLA cannot resolve EVA-scale obstacles. No operational safety or extractability claims are made.', '', 'Rebuild: `python -m etl.build --all`, then `python -m etl.build --all --offline`. Raw source bytes remain in the ignored data/raw cache. TLS verification remains enabled using system curl.']
    (ROOT/'docs').mkdir(exist_ok=True)
    (ROOT/'docs/DATA_PROVENANCE.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')



if __name__ == '__main__':
    main()
