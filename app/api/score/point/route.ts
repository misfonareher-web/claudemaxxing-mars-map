import { NextRequest } from "next/server";
import { BackendEngineError, scoreArbitraryPoint } from "@/lib/backend-engine";
import { ScoringProfileId } from "@/types/mars";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const lonRaw = sp.get("lon");
    const latRaw = sp.get("lat");
    const preset = sp.get("preset") ?? undefined;
    const profile = (sp.get("profile") ?? undefined) as
      | ScoringProfileId
      | undefined;

    if (
      lonRaw === null ||
      latRaw === null ||
      lonRaw.trim() === "" ||
      latRaw.trim() === ""
    ) {
      return Response.json(
        { error: { code: "bad_request", message: "Missing lon/lat parameters" } },
        { status: 400 }
      );
    }

    const lon = Number(lonRaw);
    const lat = Number(latRaw);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return Response.json(
        { error: { code: "bad_request", message: "Invalid lon/lat parameters" } },
        { status: 400 }
      );
    }

    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return Response.json(
        { error: { code: "bad_request", message: "Coordinates out of Mars range" } },
        { status: 400 }
      );
    }

    const result = await scoreArbitraryPoint({
      lon,
      lat,
      preset,
      profile,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof BackendEngineError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : "Scoring error";
    return Response.json(
      { error: { code: "internal", message } },
      { status: 500 }
    );
  }
}

