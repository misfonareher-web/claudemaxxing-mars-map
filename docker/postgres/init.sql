CREATE TABLE IF NOT EXISTS features (id text PRIMARY KEY, kind text, preset_ids text[], properties jsonb, geometry jsonb, min_lon double precision, min_lat double precision, max_lon double precision, max_lat double precision);
CREATE TABLE IF NOT EXISTS score_cache (cache_key text PRIMARY KEY, payload jsonb, created_at timestamptz DEFAULT now());
