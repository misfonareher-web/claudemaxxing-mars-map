import fs from "node:fs";
import path from "node:path";
import MarsExplorer from "@/components/MarsExplorer";
import {
  CommsStatus,
  RelaySchedule,
  EnvironmentSummary,
  MarsGeoJSONCollection,
  MarsGeoJSONFeature,
  MissionPreset,
} from "@/types/mars";

function readJsonFile<T>(relativePath: string): T {
  const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath);
  const raw = fs.readFileSync(/*turbopackIgnore: true*/ fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

export default function HomePage() {
  const landingSites = readJsonFile<MarsGeoJSONCollection>(
    "data/landing_sites.geojson"
  );
  const ice = readJsonFile<MarsGeoJSONCollection>("data/ice.geojson");
  const hazards = readJsonFile<MarsGeoJSONCollection>("data/hazards.geojson");
  const scienceTargets = readJsonFile<MarsGeoJSONCollection>(
    "data/science_targets.geojson"
  );
  const presetsData = readJsonFile<{ presets: MissionPreset[] }>(
    "config/mission_presets.json"
  );
  const relaySchedule = readJsonFile<RelaySchedule>("data/relay_passes.json");
  const commsStatus = readJsonFile<CommsStatus>("data/comms_status.json");

  const jezeroEnv = readJsonFile<EnvironmentSummary>(
    "data/environment/jezero.json"
  );
  const galeEnv = readJsonFile<EnvironmentSummary>("data/environment/gale.json");

  const allFeatures: MarsGeoJSONFeature[] = [
    ...landingSites.features,
    ...ice.features,
    ...hazards.features,
    ...scienceTargets.features,
  ];

  return (
    <MarsExplorer
      features={allFeatures}
      presets={presetsData.presets}
      commsStatus={commsStatus}
      relaySchedule={relaySchedule}
      environments={{
        jezero: jezeroEnv,
        gale: galeEnv,
      }}
    />
  );
}
