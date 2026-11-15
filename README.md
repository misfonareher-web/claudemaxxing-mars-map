# AreoPath — Interplanetary Survival Guide: Martian Map

NASA Space Apps 2026 · Team **Claudemaxxing**

Interactive 2D Mars exploration & survival map built with **Next.js** and official **NASA PDS / Mars Trek** datasets.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `app/` — Next.js App Router frontend
- `types/mars.ts` — Shared TypeScript interfaces for Mars GeoJSON & presets
- `data/` — Official NASA Mars GeoJSON layers (`landing_sites.geojson`, `ice.geojson`, `hazards.geojson` with `steep_slope` & `sand_dunes`, `science_targets.geojson`), environment series (`environment/*.json`), and elevation/slope grids (`grids/`)
- `config/` — Mission presets (`mission_presets.json`) and survival scoring weights (`scoring_weights.json`)
- `docs/DATA_PROVENANCE.md` — Full NASA dataset sources, instruments, and scientific caveats
- `docs/classroom/score_by_hand.md` — Classroom worksheet: students recompute two real cell scores by hand from NASA-derived inputs and check them against the map (teacher key included)
