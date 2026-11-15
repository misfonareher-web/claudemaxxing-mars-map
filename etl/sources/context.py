"""Curated context cards attached to each preset's environment JSON.

Nothing here enters the 0-100 score. Context blocks are added to data/environment/<preset>.json
(served unchanged by GET /api/environment?preset=<id>):

- radiation_context: one historical MSL RAD surface dose figure from Gale crater, with its
  place, period and caveats. It is not a Jezero measurement and not a safety limit.
- hazard_coverage: which hazard classes the model actually assesses and which it does not.
- dust_season_context: seasonal literature context, without opacity data or forecasts.
- ice_isru_context: regional ice evidence, without local water or extractability claims.
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


DUST_SOURCES = [
    dict(label='NASA Ames: regional dust storm season', url='https://ntrs.nasa.gov/citations/20230015679'),
    dict(label='NASA: The 2001 Great Dust Storms', url='https://science.nasa.gov/photojournal/the-2001-great-dust-storms-tharsis/'),
    dict(label='NASA: Dusty Differences Between Mars and Earth', url='https://science.nasa.gov/earth/earth-observatory/dusty-differences-between-mars-and-earth-149926/'),
]
ICE_SOURCES = [
    dict(label='Morgan et al. 2021, Nature Astronomy (SWIM)', url='https://doi.org/10.1038/s41550-020-01290-z',
         manuscript_url='https://ntrs.nasa.gov/api/citations/20205008958/downloads/Morgan_etal_NA_Perspective_NATASTRON_19122833C%20.pdf'),
    dict(label='NASA/JPL SWIM map, PIA26045', url='https://science.nasa.gov/photojournal/swim-map-shows-subsurface-water-ice-on-mars/'),
    dict(label='Mellon et al. 2009: Phoenix ground ice', url='https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2009JE003417'),
    dict(label='Dundas et al. 2018, Science', url='https://doi.org/10.1126/science.aao1619',
         abstract_url='https://www.usgs.gov/publications/exposed-subsurface-ice-sheets-martian-mid-latitudes'),
    dict(label='Stuurman et al. 2016, GRL (SHARAD)', url='https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2016GL070138'),
]

PROVENANCE_DUST = dict(
    dataset_id='dust_season_literature', title='Mars dust storm seasonal context',
    mission='NASA Mars observations', instrument='Literature synthesis', data_type='context',
    source_url='; '.join(s['url'] for s in DUST_SOURCES),
    temporal_coverage='Seasonal climatology; historical global events in 2001, 2007 and 2018',
    spatial_coverage='Mars, global and regional storms', resolution='Seasonal context only',
    units='degrees solar longitude (Ls)', format='Cited literature summary; no opacity data ingested',
    processing='Summarize southern spring-summer storm season, roughly Ls 180-360, and intermittent planet-encircling events.',
    limitations=['No dust opacity (tau) data are ingested; this is seasonal context only, not a forecast and not part of the score.',
                 'Not a local storm probability, warning or route hazard assessment.'],
    license='Citation only (NASA publications)', synthetic=False, used_for=['dust season context card'])

PROVENANCE_ICE_ISRU = dict(
    dataset_id='ice_isru_literature', title='Mars regional water ice and ISRU context',
    mission='SWIM / Phoenix / Mars Reconnaissance Orbiter', instrument='Orbital synthesis / robotic arm / HiRISE / SHARAD',
    data_type='context', source_url='; '.join(url for s in ICE_SOURCES for key, url in s.items() if key.endswith('url')),
    temporal_coverage='Published evidence: Phoenix 2009; Stuurman 2016; Dundas 2018; Morgan 2021; SWIM map 2023',
    spatial_coverage='Mid/high latitudes: SWIM northern plains, Phoenix (~68 N), ice scarps and Utopia Planitia',
    resolution='Regional literature context, not a local ice map', units='degrees latitude',
    format='Cited literature summary; no SWIM raster or ice deposit geometry ingested',
    processing=('Summarize SWIM, Phoenix excavation, exposed ice scarps and SHARAD evidence. '
                'Compare rounded preset latitudes (Jezero ~18 N, Gale ~5 S) with Morgan et al. ice-bearing features near 35 N; '
                'latitude separation is not distance to a deposit or a universal ice boundary.'),
    limitations=['Project ice layer contains generalized latitude bands and a regional neutron proxy, not local ice.',
                 'Nothing here indicates extractable water at Jezero or Gale; no yield, purity, depth or engineering feasibility is inferred.',
                 'Context card is not part of the score; underlying ice proxy scoring is unchanged.'],
    license='Citation only (peer-reviewed articles and NASA map)', synthetic=False, used_for=['ice ISRU context card'])


def dust_season_context():
    return dict(
        dataset_id='dust_season_literature', title='Dust storm season (context)',
        summary=('Global and regional dust storms are most common in southern spring-summer, roughly Ls 180-360 degrees. '
                 'Planet-encircling storms occur in some Mars years, not every year (e.g. 2001, 2007, 2018).'),
        sources=[dict(s) for s in DUST_SOURCES],
        caveat='No dust opacity (tau) data are ingested; this is seasonal context only, not a forecast and not part of the score.',
        in_score=False,
    )


def ice_isru_context(preset_id):
    card = dict(
        dataset_id='ice_isru_literature', title='Water ice / ISRU (regional context)',
        summary=('SWIM maps likely buried ice in the northern mid-latitudes. Phoenix excavated near-surface ice at ~68 N; '
                 'Dundas et al. mapped exposed mid-latitude ice scarps; Stuurman et al. found SHARAD evidence for buried ice in Utopia Planitia.'),
        sources=[dict(s) for s in ICE_SOURCES],
        caveat=('The project ice layer is regional context only: latitude bands and a regional neutron proxy, not local ice. '
                'Nothing here indicates extractable water at Jezero or Gale. This card is not part of the score.'),
        in_score=False,
    )
    if preset_id in ('jezero', 'gale'):
        card['site_note'] = {
            'jezero': 'Jezero (~18 N) is about 17 degrees of latitude south of the ~35 N ice-bearing features reported by SWIM, far from these mid/high-latitude deposits.',
            'gale': 'Gale (~5 S) is about 40 degrees of latitude south of the ~35 N ice-bearing features reported by SWIM, far from these mid/high-latitude deposits.',
        }[preset_id]
    return card


def for_preset(preset_id):
    return dict(radiation_context=radiation_context(preset_id), hazard_coverage=hazard_coverage(preset_id),
                dust_season_context=dust_season_context(), ice_isru_context=ice_isru_context(preset_id))
