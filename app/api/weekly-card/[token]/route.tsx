import { formatDisplayName } from "@/lib/display-name";
import { getWeekBounds, toDateString } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImageResponse } from "next/og";

// share_token (uuid opaque, distinct du user_id brut) plutôt que l'id
// utilisateur directement dans l'URL : CLAUDE.md Sprint 14, pour éviter
// qu'on puisse deviner/scraper les cartes d'autres utilisateurs. Route
// volontairement publique (pas de vérification de session) : c'est le but
// même de la carte partageable.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("id, strava_firstname, strava_lastname, strava_profile_photo_url")
    .eq("share_token", token)
    .maybeSingle();

  if (!user) {
    return new Response("Carte introuvable", { status: 404 });
  }

  const { weekStart, weekEnd } = getWeekBounds();
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);

  const { data: activities } = await admin
    .from("activities")
    .select("distance_km, total_elevation_gain, name, activity_date")
    .eq("user_id", user.id)
    .gte("activity_date", weekStartStr)
    .lte("activity_date", weekEndStr);

  const rows = activities ?? [];
  const totalKm = rows.reduce((sum, a) => sum + Number(a.distance_km ?? 0), 0);
  const totalDplus = rows.reduce((sum, a) => sum + Number(a.total_elevation_gain ?? 0), 0);
  const outingsCount = rows.length;
  const bestActivity = rows.reduce<(typeof rows)[number] | null>((best, a) => {
    if (!best || Number(a.distance_km ?? 0) > Number(best.distance_km ?? 0)) return a;
    return best;
  }, null);

  // Variation de classement dans la cohorte vs la semaine précédente
  // (CLAUDE.md Sprint 14 : "variation de classement dans la cohorte").
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const previousWeekStartStr = toDateString(previousWeekStart);

  const [{ data: thisWeekMember }, { data: previousWeekMember }] = await Promise.all([
    admin
      .from("cohort_members")
      .select("rank, tier_cohorts!inner(week_start_date)")
      .eq("user_id", user.id)
      .eq("tier_cohorts.week_start_date", weekStartStr)
      .maybeSingle(),
    admin
      .from("cohort_members")
      .select("rank, tier_cohorts!inner(week_start_date)")
      .eq("user_id", user.id)
      .eq("tier_cohorts.week_start_date", previousWeekStartStr)
      .maybeSingle(),
  ]);

  const currentRank = thisWeekMember?.rank ?? null;
  const previousRank = previousWeekMember?.rank ?? null;
  const rankDelta =
    currentRank != null && previousRank != null ? previousRank - currentRank : null;

  const displayName = formatDisplayName(user.strava_firstname, user.strava_lastname);
  const weekLabel = `${weekStart.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "short" })} – ${weekEnd.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "short" })}`;

  const stats = [
    { label: "Distance", value: `${totalKm.toFixed(1)} km` },
    { label: "D+", value: `${Math.round(totalDplus)} m` },
    { label: "Sorties", value: String(outingsCount) },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#111111",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 22, color: "#39d353", fontWeight: 700, letterSpacing: 1 }}>
            PACELEAGUE
          </span>
          <span style={{ fontSize: 40, color: "#f7f7f7", fontWeight: 700, marginTop: 12 }}>
            {displayName}
          </span>
          <span style={{ fontSize: 20, color: "#9ca3af", marginTop: 4 }}>
            Semaine du {weekLabel}
          </span>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {stats.map((stat) => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 48, color: "#f7f7f7", fontWeight: 700 }}>{stat.value}</span>
              <span style={{ fontSize: 18, color: "#9ca3af" }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {rankDelta != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: rankDelta > 0 ? "#39d353" : rankDelta < 0 ? "#f87171" : "#9ca3af",
              }}
            >
              {rankDelta > 0 ? `▲ +${rankDelta}` : rankDelta < 0 ? `▼ ${rankDelta}` : "= stable"}
            </span>
            <span style={{ fontSize: 18, color: "#9ca3af" }}>
              dans la cohorte (rang {currentRank})
            </span>
          </div>
        )}

        {bestActivity && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingTop: 24,
            }}
          >
            <span style={{ fontSize: 16, color: "#9ca3af" }}>Meilleure sortie de la semaine</span>
            <span style={{ fontSize: 24, color: "#f7f7f7", fontWeight: 600, marginTop: 4 }}>
              {(bestActivity.name?.trim() || "Sortie course à pied") +
                ` · ${Number(bestActivity.distance_km).toFixed(2)} km`}
            </span>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
