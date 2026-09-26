import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  code: string,
  detail?: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      ...(detail ? { detail } : {}),
      ...(extra ?? {}),
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { ok: true, ...body },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
