import { NextRequest } from "next/server";
import { BackendEngineError, runPythonScoringCli } from "@/lib/backend-engine";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const preset = sp.get("preset") ?? "jezero";
    const profile = sp.get("profile") ?? "balanced";
    const result = await runPythonScoringCli("score", { preset, profile });
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

