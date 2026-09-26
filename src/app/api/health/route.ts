import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("plans").select("code").limit(1);

    if (error) {
      return NextResponse.json(
        { status: "error", app: "afuza-id", database: "unreachable" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      app: "afuza-id",
      database: "reachable",
    });
  } catch {
    return NextResponse.json(
      { status: "error", app: "afuza-id", database: "unreachable" },
      { status: 503 },
    );
  }
}