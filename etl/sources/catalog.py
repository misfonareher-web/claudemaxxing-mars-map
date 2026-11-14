"""Curated, cited catalog: landing sites, mission history, science targets and ice context.

Every coordinate and fact here carries a source URL. Coordinates are planetocentric
latitude and east-positive longitude in [-180, 180]; sources that publish 0-360 E
longitudes are converted with lon = ((lon + 180) % 360) - 180.
"""

ODE_SITES = 'https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm'
ICE = 'Mapped water-ice evidence indicates presence or likelihood, not extractability or accessibility.'


def east180(lon):
    return round(((lon + 180.0) % 360.0) - 180.0, 6)


# (id, name, mission, agency, landing_date, status, lat, lon_0_360_E, source, confidence, note)
LANDING_SITES = [
    ('ls-viking1', 'Viking 1 Lander', 'Viking 1', 'NASA', '1976-07-20', 'ended', 22.269, 312.049, ODE_SITES, 'high', 'PDS Geosciences ODE landing-site table.'),
    ('ls-viking2', 'Viking 2 Lander', 'Viking 2', 'NASA', '1976-09-03', 'ended', 47.668, 134.280, ODE_SITES, 'high', 'PDS Geosciences ODE landing-site table.'),
    ('ls-pathfinder', 'Mars Pathfinder (Carl Sagan Memorial Station)', 'Mars Pathfinder', 'NASA', '1997-07-04', 'ended', 19.095, 326.747, ODE_SITES, 'high', 'PDS Geosciences ODE landing-site table.'),
    ('ls-spirit', 'Spirit (MER-A) landing site', 'Mars Exploration Rover Spirit', 'NASA', '2004-01-04', 'ended', -14.5692, 175.4729, ODE_SITES, 'high', 'ODE cartographic triangulation solution (Doppler solution: 14.571892 S, 175.47848 E).'),
    ('ls-opportunity', 'Opportunity (MER-B) landing site', 'Mars Exploration Rover Opportunity', 'NASA', '2004-01-25', 'ended', -1.9462, 354.4734, ODE_SITES, 'high', 'ODE cartographic triangulation solution (Doppler solution: 1.9483 S, 354.47417 E).'),
    ('ls-phoenix', 'Phoenix landing site', 'Phoenix', 'NASA', '2008-05-25', 'ended', 68.22, 234.25, ODE_SITES, 'high', 'PDS Geosciences ODE landing-site table (2-decimal precision).'),
    ('ls-insight', 'InSight lander', 'InSight', 'NASA', '2018-11-26', 'ended', 4.502384, 135.623447, 'https://doi.org/10.1029/2020EA001248', 'high', 'Golombek et al. (2020), Earth and Space Science, located on a georeferenced HiRISE image.'),
    ('ls-zhurong', 'Zhurong rover landing site (Tianwen-1)', 'Tianwen-1 / Zhurong', 'CNSA', '2021-05-14', 'ended', 25.066, 109.925, 'https://doi.org/10.1038/s41550-021-01519-5', 'medium', 'Published landing-site value (Nature Astronomy, 2021); landing date in UTC (15 May Beijing time). Non-NASA mission record.'),
]

# Preset base points come from config; these are their citations.
BASE_SOURCES = {
    'ls-mars2020': ('https://science.nasa.gov/mission/mars-2020-perseverance/', 'Mars 2020 / Perseverance', '2021-02-18'),
    'ls-msl': (ODE_SITES, 'Mars Science Laboratory / Curiosity', '2012-08-06'),
}

# id -> (name, lon, lat, confidence, source, caveat, goal)
SCIENCE_TARGETS = {
    'st-jezero-delta-front': ('Jezero western delta front', 77.401, 18.498, 'low', 'https://science.nasa.gov/mission/mars-2020-perseverance/',
                              'Approximate position of the western fan-delta front, digitized from NASA mission context maps; verify against the Perseverance traverse map before use.',
                              'Lake-deposited delta sediments with high biosignature-preservation potential'),
    'st-jezero-seitah': ('Seitah (crater floor, olivine-rich layered rocks)', 77.433, 18.43, 'low', 'https://science.nasa.gov/photojournal/flight-12-view-of-south-seitah/',
                         'Approximate position; NASA describes Seitah as a sandy, rocky crater-floor unit west of the landing site. Verify against the Perseverance traverse map.',
                         'Olivine-rich igneous layers, possibly the oldest exposed rocks in Jezero'),
    'st-gale-pahrump-hills': ('Pahrump Hills (base of Mount Sharp)', 137.379, -4.676, 'medium', 'https://www.uahirise.org/ESP_039280_1755',
                              'Center of HiRISE image ESP_039280_1755 acquired while Curiosity was at Pahrump Hills (13 Dec 2014); the outcrop lies within that frame, not exactly at its center.',
                              'Murray formation mudstones at the base of Mount Sharp (ancient lake deposits)'),
}

# Global ice context: broad, cited bands and points (preset_ids = []).
# (id, name, kind, geometry, metric, depth_m, source, confidence, extra caveat)
def _band(lat0, lat1):
    return dict(type='Polygon', coordinates=[[[-180, lat0], [180, lat0], [180, lat1], [-180, lat1], [-180, lat0]]])


ICE_CONTEXT = [
    ('ice-grs-north-60', 'High-latitude near-surface ground ice (north, >60 deg)', _band(60, 88), 'GRS/NS hydrogen-rich layer', None,
     'https://doi.org/10.1126/science.1073722', 'medium', 'Boynton et al. (2002), Mars Odyssey GRS: hydrogen-rich ice-bearing layer within decimeters of the surface poleward of about 60 deg. Band boundary is generalized.'),
    ('ice-grs-south-60', 'High-latitude near-surface ground ice (south, >60 deg)', _band(-88, -60), 'GRS/NS hydrogen-rich layer', None,
     'https://doi.org/10.1126/science.1073722', 'medium', 'Boynton et al. (2002), Mars Odyssey GRS: hydrogen-rich ice-bearing layer poleward of about 60 deg S. Band boundary is generalized.'),
    ('ice-scarps-north-55', 'Ice-exposing scarps latitude band (north, 55-58 deg)', _band(55, 58), 'exposed ice sheets at scarps', 1.0,
     'https://doi.org/10.1126/science.aao1619', 'low', 'Dundas et al. (2018): eight scarps expose ice sheets starting 1-2 m below the surface at about 55-58 deg latitude. The band marks where such sites occur, not continuous ice.'),
    ('ice-scarps-south-55', 'Ice-exposing scarps latitude band (south, 55-58 deg)', _band(-58, -55), 'exposed ice sheets at scarps', 1.0,
     'https://doi.org/10.1126/science.aao1619', 'low', 'Dundas et al. (2018): scarps in both hemispheres at about 55-58 deg latitude. The band marks where such sites occur, not continuous ice.'),
    ('ice-north-polar-cap', 'North polar layered deposits and residual ice cap', _band(80, 90), 'polar water-ice deposits', None,
     'https://science.nasa.gov/mission/mars-global-surveyor/', 'medium', 'Generalized as everything poleward of 80 deg N; the real cap boundary is irregular.'),
    ('ice-phoenix-context', 'Phoenix ground ice (excavated)', dict(type='Point', coordinates=[east180(234.25), 68.22]), 'ground ice observed', 0.05,
     'https://science.nasa.gov/mission/phoenix/', 'high', 'Phoenix exposed and observed water ice a few centimeters below the surface at its landing site.'),
]

MISSION_SOURCE = {
    'viking-1': 'https://science.nasa.gov/mission/viking-1/',
    'viking-2': 'https://science.nasa.gov/mission/viking-2/',
    'mars-pathfinder': 'https://science.nasa.gov/mission/mars-pathfinder/',
    'mer-spirit': 'https://science.nasa.gov/mission/mer-spirit/',
    'mer-opportunity': 'https://science.nasa.gov/mission/mer-opportunity/',
    'phoenix': 'https://science.nasa.gov/mission/phoenix/',
    'msl-curiosity': 'https://science.nasa.gov/mission/msl-curiosity/',
    'insight': 'https://science.nasa.gov/mission/insight/',
    'mars-2020-perseverance': 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    'mars-global-surveyor': 'https://science.nasa.gov/mission/mars-global-surveyor/',
    'mars-odyssey': 'https://science.nasa.gov/mission/odyssey/',
    'tianwen-1-zhurong': 'https://doi.org/10.1038/s41550-021-01519-5',
}


def _m(id, name, agency, mtype, launch, landing, end, status, site, instruments, results):
    src = MISSION_SOURCE[id]
    return dict(id=id, name=name, agency=agency, mission_type=mtype, launch_date=launch, landing_date=landing, end_date=end,
                status=status, landing_site_id=site, instruments=instruments,
                key_results=[dict(text=t, source_url=src) for t in results], source_url=src,
                dataset_id='cnsa_mission_records' if agency == 'CNSA' else 'mission_history')


MISSIONS = [
    _m('viking-1', 'Viking 1', 'NASA', 'lander', '1975-08-20', '1976-07-20', '1982-11-11', 'ended', 'ls-viking1',
       ['cameras', 'biology experiments', 'GCMS', 'meteorology', 'seismometer'],
       ['First US spacecraft to land successfully on Mars and return surface images.', 'Biology experiments returned results that remain debated; no organics were detected by the GCMS.']),
    _m('viking-2', 'Viking 2', 'NASA', 'lander', '1975-09-09', '1976-09-03', '1980-04-11', 'ended', 'ls-viking2',
       ['cameras', 'biology experiments', 'GCMS', 'meteorology', 'seismometer'],
       ['Landed in Utopia Planitia and recorded seasonal surface frost at the landing site.', 'Returned multi-year meteorological records of pressure and temperature.']),
    _m('mars-pathfinder', 'Mars Pathfinder / Sojourner', 'NASA', 'lander', '1996-12-04', '1997-07-04', '1997-09-27', 'ended', 'ls-pathfinder',
       ['IMP camera', 'APXS', 'ASI/MET', 'Sojourner rover'],
       ['Demonstrated airbag landing and deployed Sojourner, the first rover on Mars.', 'Returned surface weather and rock-composition data from Ares Vallis.']),
    _m('mer-spirit', 'Spirit (MER-A)', 'NASA', 'rover', '2003-06-10', '2004-01-04', '2010-03-22', 'ended', 'ls-spirit',
       ['Pancam', 'Mini-TES', 'APXS', 'Mossbauer', 'MI', 'RAT'],
       ['Found silica-rich deposits near Home Plate pointing to past hydrothermal activity.', 'Became embedded in soft soil in 2009; last communication in March 2010.']),
    _m('mer-opportunity', 'Opportunity (MER-B)', 'NASA', 'rover', '2003-07-07', '2004-01-25', '2018-06-10', 'ended', 'ls-opportunity',
       ['Pancam', 'Mini-TES', 'APXS', 'Mossbauer', 'MI', 'RAT'],
       ['Found hematite spherules and sulfate-rich rocks indicating past liquid water at Meridiani Planum.', 'Drove more than a marathon distance before a global dust storm ended the mission in 2018.']),
    _m('phoenix', 'Phoenix', 'NASA', 'lander', '2007-08-04', '2008-05-25', '2008-11-02', 'ended', 'ls-phoenix',
       ['robotic arm', 'TEGA', 'MECA', 'SSI camera', 'MET station'],
       ['Confirmed water ice just below the surface in the northern plains.', 'Detected perchlorate in the soil.']),
    _m('msl-curiosity', 'Curiosity (MSL)', 'NASA', 'rover', '2011-11-26', '2012-08-06', None, 'active', 'ls-msl',
       ['Mastcam', 'ChemCam', 'SAM', 'CheMin', 'APXS', 'MAHLI', 'REMS', 'RAD', 'DAN'],
       ['Showed that Gale crater once hosted a lake environment habitable for microbes.', 'Measured surface radiation (RAD) and long-term weather (REMS) relevant to crew safety.']),
    _m('insight', 'InSight', 'NASA', 'lander', '2018-05-05', '2018-11-26', '2022-12-21', 'ended', 'ls-insight',
       ['SEIS seismometer', 'HP3 heat probe', 'RISE', 'TWINS/APSS weather'],
       ['Recorded more than 1,300 marsquakes and constrained the size of the Martian core.', 'Mission ended in December 2022 as dust reduced solar power.']),
    _m('mars-2020-perseverance', 'Perseverance (Mars 2020)', 'NASA', 'rover', '2020-07-30', '2021-02-18', None, 'active', 'ls-mars2020',
       ['Mastcam-Z', 'SuperCam', 'PIXL', 'SHERLOC', 'MOXIE', 'MEDA', 'RIMFAX'],
       ['Collecting and caching rock cores from Jezero crater for possible return to Earth.', 'MOXIE produced oxygen from atmospheric CO2, an in-situ resource demonstration.']),
    _m('mars-global-surveyor', 'Mars Global Surveyor', 'NASA', 'orbiter', '1996-11-07', None, '2006-11-02', 'ended', None,
       ['MOLA', 'MOC', 'TES', 'MAG/ER'],
       ['MOLA mapped global topography used for slope and route analysis in ARES.', 'TES mapped global thermal inertia and mineralogy.']),
    _m('mars-odyssey', '2001 Mars Odyssey', 'NASA', 'orbiter', '2001-04-07', None, None, 'active', None,
       ['THEMIS', 'GRS/NS/HEND'],
       ['GRS detected abundant near-surface hydrogen (water ice) at high latitudes.', 'THEMIS produced global day and night infrared mosaics used in ARES.']),
    _m('tianwen-1-zhurong', 'Tianwen-1 / Zhurong', 'CNSA', 'rover', '2020-07-23', '2021-05-14', None, 'ended', 'ls-zhurong',
       ['NaTeCam', 'MarSCoDe', 'RoPeR radar', 'MCS'],
       ['First Chinese rover on Mars, operating in southern Utopia Planitia.', 'Entered hibernation in May 2022 and has not resumed operations.']),
]

PROVENANCE_HISTORY = dict(dataset_id='mission_history', title='NASA Mars mission history (curated)', mission='NASA Mars exploration', instrument='Mission records',
                          data_type='mission_history', source_url='https://science.nasa.gov/mars/', temporal_coverage='1975-present', spatial_coverage='Mars missions',
                          resolution='Per mission', units='dates (ISO 8601)', format='JSON', processing='Hand-curated from NASA mission pages; each key result links to its source.',
                          limitations=['Short summaries; not a complete mission record.', 'End dates are last contact or declared end as published.'],
                          license='NASA public domain', synthetic=False, used_for=['mission history panel', 'database'])
PROVENANCE_CNSA = dict(dataset_id='cnsa_mission_records', title='Tianwen-1 / Zhurong published landing-site and mission record', mission='Tianwen-1', instrument='Published literature',
                       data_type='landing_sites', source_url='https://doi.org/10.1038/s41550-021-01519-5', temporal_coverage='2021-2022', spatial_coverage='Utopia Planitia',
                       resolution='Point', units='degrees', format='GeoJSON / JSON', processing='Transcribed from peer-reviewed publication.',
                       limitations=['Non-NASA mission; included for context only.'], license='Citation only', synthetic=False, used_for=['map context', 'mission history'])
PROVENANCE_ICE = dict(dataset_id='ice_literature', title='Published Mars water-ice context (generalized)', mission='Mars Odyssey; MRO; Phoenix; MGS', instrument='GRS/NS; HiRISE/SHARAD; Phoenix lander',
                      data_type='water_ice', source_url='https://doi.org/10.1126/science.1073722', temporal_coverage='2002-2018 publications', spatial_coverage='Global latitude bands and points',
                      resolution='Generalized latitude bands', units='degrees', format='GeoJSON', processing='Latitude bands and points transcribed from cited publications; boundaries generalized.',
                      limitations=[ICE, 'Bands are generalized from publications and are not ice maps.'], license='Citation only', synthetic=False, used_for=['map context'])
