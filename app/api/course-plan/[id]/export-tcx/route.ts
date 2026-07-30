import { getRacePlanById } from "@/lib/race-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateRaceTcx } from "@/lib/tcx";
import { NextResponse, type NextRequest } from "next/server";

// Export .TCX (CLAUDE.md "SendToWatch") : propriétaire du plan, ou son coach
// en lecture seule. Client admin nécessaire pour la vérification coach — un
// coach pas encore en relation ne pourrait pas lire coach_relationships de
// quelqu'un d'autre via le client normal — mais aussi pour la lecture du
// plan lui-même, afin de couvrir les deux cas (propriétaire et coach) avec
// la même requête plutôt que de dupliquer la logique par rôle.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: racePlanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await getRacePlanById(admin, racePlanId);

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { plan, splits } = result;

  if (plan.userId !== user.id) {
    const { data: relationship } = await admin
      .from("coach_relationships")
      .select("athlete_id")
      .eq("athlete_id", plan.userId)
      .eq("coach_id", user.id)
      .maybeSingle();

    if (!relationship) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (splits.length === 0) {
    return NextResponse.json({ error: "no_splits" }, { status: 422 });
  }

  const tcx = generateRaceTcx(plan, splits);
  const filename = `plan-de-course-${plan.id.slice(0, 8)}.tcx`;

  return new NextResponse(tcx, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.garmin.tcx+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
