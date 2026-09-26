import {
  NextResponse,
} from "next/server";

import {
  requireOpsApiPermission,
} from "@/lib/ops/api";

export async function GET() {
  const gate =
    await requireOpsApiPermission(
      "OPS_ACCESS",
    );

  if (gate.response) {
    return gate.response;
  }

  const access =
    gate.access;

  return NextResponse.json(
    {
      authorized: true,

      required_permission:
        "OPS_ACCESS",

      authorization_mode:
        access?.mode,

      user_id:
        access?.userId,

      email:
        access?.email,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
