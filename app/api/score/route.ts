import { NextRequest } from "next/server";
import { BackendEngineError, scorePreset } from "@/lib/backend-engine";
import { ScoringProfileId } from "@/types/mars";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const preset = sp.get("preset") ?? undefined;
    const profile = (sp.get("profile") ?? undefined) as
      | ScoringProfileId
      | undefined;
    const result = await scorePreset({ preset, profile });
    return Response.json(result);
  } catch (err) {
    if (err instanceof BackendEngineError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : "Score grid error";
    return Response.json(
      { error: { code: "internal", message } },
      { status: 500 }
    );
  }
}

