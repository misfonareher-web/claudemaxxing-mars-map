import { NextRequest } from "next/server";
import { BackendEngineError, computeMarsRoute } from "@/lib/backend-engine";
import { ScoringProfileId } from "@/types/mars";

export async function POST(request: NextRequest) {
  let body: {
    from?: [number, number];
    to?: [number, number];
    preset?: string;
    profile?: ScoringProfileId;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "bad_request", message: "Invalid JSON request body" } },
      { status: 400 }
    );
  }

  try {
    const from = body?.from;
    const to = body?.to;

    if (
      !Array.isArray(from) ||
      from.length !== 2 ||
      !Array.isArray(to) ||
      to.length !== 2 ||
      typeof from[0] !== "number" ||
      typeof from[1] !== "number" ||
      typeof to[0] !== "number" ||
      typeof to[1] !== "number" ||
      !Number.isFinite(from[0]) ||
      !Number.isFinite(from[1]) ||
      !Number.isFinite(to[0]) ||
      !Number.isFinite(to[1])
    ) {
      return Response.json(
        {
          error: {
            code: "bad_request",
            message: "Expected finite from/to [lon, lat] pairs",
          },
        },
        { status: 400 }
      );
    }

    if (
      from[0] < -180 ||
      from[0] > 180 ||
      to[0] < -180 ||
      to[0] > 180 ||
      from[1] < -90 ||
      from[1] > 90 ||
      to[1] < -90 ||
      to[1] > 90
    ) {
      return Response.json(
        {
          error: {
            code: "bad_request",
            message: "Route coordinates out of Mars range",
          },
        },
        { status: 400 }
      );
    }

    const result = await computeMarsRoute({
      from: [from[0], from[1]],
      to: [to[0], to[1]],
      preset: body.preset,
      profile: body.profile,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof BackendEngineError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    const message =
      err instanceof Error ? err.message : "Route calculation error";
    return Response.json(
      { error: { code: "internal", message } },
      { status: 500 }
    );
  }
}

