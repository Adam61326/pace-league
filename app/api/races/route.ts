import { getRacesForUser } from "@/lib/race-plan";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const MAX_NAME_LENGTH = 120;

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Liste + création des courses "à préparer" (CLAUDE.md "UI — LISTE DE
// COURSES"). Écrit avec le client authentifié normal (RLS "users can
// insert/view own races", 20260802000000_add_multi_race_plans.sql) : comme
// race_plans, aucun effet de bord sur un autre utilisateur.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const races = await getRacesForUser(supabase, user.id);
  return NextResponse.json({ races });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = toNonEmptyString(body.name)?.slice(0, MAX_NAME_LENGTH) ?? null;
  const raceDate = toNullableString(body.race_date);
  const distanceKm = toPositiveNumber(body.distance_km);

  if (!name) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!distanceKm) {
    return NextResponse.json({ error: "invalid_distance" }, { status: 400 });
  }

  const { data: race, error } = await supabase
    .from("races")
    .insert({ user_id: user.id, name, race_date: raceDate, distance_km: distanceKm })
    .select("id")
    .single();

  if (error) {
    console.error("races: insert failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ id: race.id });
}
