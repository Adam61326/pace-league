import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeRecentWeeks } from "@/lib/recompute";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const recomputedWeeks = await recomputeRecentWeeks(admin);

  return NextResponse.json({ recomputedWeeks });
}
