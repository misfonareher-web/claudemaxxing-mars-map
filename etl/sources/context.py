"""Curated context cards attached to each preset's environment JSON.

Nothing here enters the 0-100 score. Two blocks are added to data/environment/<preset>.json
(served unchanged by GET /api/environment?preset=<id>):

- radiation_context: one historical MSL RAD surface dose figure from Gale crater, with its
  place, period and caveats. It is not a Jezero measurement and not a safety limit.
- hazard_coverage: which hazard classes the model actually assesses and which it does not.
"""

RAD_PAPER = 'https://doi.org/10.1126/science.1244797'
RAD_PRESS = 'https://swri.org/node/9079'

PROVENANCE_RAD = dict(
    dataset_id='msl_rad_surface_dose', title='MSL RAD surface radiation dose, Gale (Hassler et al. 2014, Table 1)',
    mission='Mars Science Laboratory / Curiosity', instrument='RAD (Radiation Assessment Detector)',
    data_type='context', source_url=RAD_PAPER,
    temporal_coverage='7 August 2012 - 1 June 2013 (~300 sols, near the maximum of solar cycle 24)',
    spatial_coverage='Curiosity rover, Gale crater (single site, about -4.4 km MOLA)',
    resolution='One published mission-average value (GCR only)', units='mSv/day (dose equivalent); mGy/day (absorbed dose)',
    format='Published table values transcribed by hand (no instrument data ingested)',
    processing=('Hassler et al. (2014), Science 343(6169):1244797, Table 1 (Science Express version, 9 Dec 2013): '
                'surface dose equivalent rate 0.64 +/- 0.12 mSv/day, absorbed dose rate 0.21 +/- 0.04 mGy/day, <Q> 3.05 +/- 0.26; '
                'cruise 1.84 +/- 0.30 mSv/day. The SwRI press release (https://swri.org/node/9079) quotes 0.67 mSv/day for the same period; '
                'the card uses the paper value.'),
    limitations=['Historical average at Gale crater only; no RAD measurement exists for Jezero.',
                 'Galactic cosmic rays near solar maximum; dose varies with the solar cycle, atmospheric column (diurnal and seasonal pressure) and solar particle events.',
                 'Context only: not a dose limit, not a safety threshold, not used in the score or in routes.'],
    license='Citation only (peer-reviewed article)', synthetic=False, used_for=['radiation context card'])

RADIATION = dict(
    dataset_id='msl_rad_surface_dose',
    title='Surface radiation (historical context)',
    value=0.64, uncertainty=0.12, unit='mSv/day', quantity='dose equivalent rate, galactic cosmic rays, mission average',
    absorbed_dose=dict(value=0.21, uncertainty=0.04, unit='mGy/day'),
    site='Gale crater (Curiosity / MSL RAD)', site_lon=137.4417, site_lat=-4.5895,
    period='7 Aug 2012 - 1 Jun 2013 (~300 sols, near solar maximum)',
    comparison=dict(value=1.84, unit='mSv/day', label='Same instrument inside the spacecraft during the cruise to Mars'),
    source=dict(label='Hassler et al. 2014, Science 343:1244797, Table 1', url=RAD_PAPER, press_release=RAD_PRESS),
    caveat=('Historical average measured by Curiosity in Gale crater. Not a measurement at this site or for today, '
            'not a safety limit, and not part of the score or the route.'),
    in_score=False,
)

_ASSESSED = [
    dict(hazard='steep_slope', status='assessed', how='Coarse MOLA slope on ~460 m cells. Slope is a score factor; cells above 25 deg are excluded; cells in the severity-2 slope outline get score x0.70.',
         limits='Grid too coarse for EVA-scale slopes; local steps and short steep walls are not resolved.'),
    dict(hazard='sand_dunes', status='assessed', how='Mapped dune outline (severity 2): cells whose centre falls inside it get score x0.70.',
         limits='Outline uncertainty 200-500 m (locally ~1 km); sampled at cell centres only; smaller dune patches may be missing.'),
]
_NOT_ASSESSED = [
    dict(hazard='crater_rims', status='not_assessed', limits='No crater-rim layer; only partly reflected in coarse slope.'),
    dict(hazard='boulders_rocks', status='not_assessed', limits='Rock abundance is not ingested; MOLA roughness cannot resolve rocks.'),
    dict(hazard='scarps_cliffs', status='not_assessed', limits='No scarp mapping; short scarps are below grid resolution.'),
    dict(hazard='loose_regolith', status='not_assessed', limits='Soft or loose ground outside the mapped dunes is not mapped.'),
    dict(hazard='dust_storms', status='not_assessed', limits='No dust or opacity data; weather series are historical point context only.'),
    dict(hazard='radiation_dose', status='not_assessed', limits='No dose model per point or route; see radiation_context for one historical Gale value.'),
]
_DUNES = {
    'jezero': 'Seitah dune complex (simplified from Stack et al. 2020 GIS map)',
    'gale': 'Bagnold Dunes (team-digitized envelope from NASA CTX)',
}


def hazard_coverage(preset_id):
    assessed = [dict(row) for row in _ASSESSED]
    if preset_id in _DUNES:
        assessed[1]['source'] = _DUNES[preset_id]
    return dict(
        title='Hazard coverage',
        rows=assessed + [dict(row) for row in _NOT_ASSESSED],
        note='Only the assessed rows affect the score. Not assessed means unknown, not safe.',
    )


def radiation_context(preset_id):
    card = dict(RADIATION, source=dict(RADIATION['source']), comparison=dict(RADIATION['comparison']))
    card['measured_here'] = preset_id == 'gale'
    if preset_id != 'gale':
        card['site_note'] = 'No radiation measurement exists for this site; the value shown is from Gale crater.'
    return card


def for_preset(preset_id):
    return dict(radiation_context=radiation_context(preset_id), hazard_coverage=hazard_coverage(preset_id))
