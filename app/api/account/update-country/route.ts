import { COUNTRY_CODES } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Utilisé par l'onboarding pays (Sprint 15, connexion Google sans
// country_code) — RLS "users can update own profile" permet déjà à un
// utilisateur de modifier sa propre ligne, pas besoin du client admin.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const countryCode = typeof body?.country_code === "string" ? body.country_code.toUpperCase() : null;

  if (!countryCode || !COUNTRY_CODES.includes(countryCode as (typeof COUNTRY_CODES)[number])) {
    return NextResponse.json({ error: "invalid_country_code" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ country_code: countryCode })
    .eq("id", user.id);

  if (error) {
    console.error("update-country: update failed", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
