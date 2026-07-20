import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const GENDERS = ["homme", "femme", "autre"] as const;

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

// Champs physiologiques de /parametres, tous facultatifs (RLS "users can
// update own profile" permet déjà à un utilisateur de modifier sa propre
// ligne : pas besoin du client admin ici).
export async function PATCH(request: NextRequest) {
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

  const gender = toNullableString(body.gender);
  if (gender !== null && !GENDERS.includes(gender as (typeof GENDERS)[number])) {
    return NextResponse.json({ error: "invalid_gender" }, { status: 400 });
  }

  const hrMax = toNullableNumber(body.hr_max);
  const hrRest = toNullableNumber(body.hr_rest);

  // Reproduit côté app la contrainte SQL hr_rest_below_hr_max, pour un
  // message d'erreur clair avant l'aller-retour DB.
  if (hrMax != null && hrRest != null && hrRest >= hrMax) {
    return NextResponse.json({ error: "hr_rest_must_be_below_hr_max" }, { status: 400 });
  }

  const update = {
    birth_date: toNullableString(body.birth_date),
    gender,
    height_cm: toNullableNumber(body.height_cm),
    weight_kg: toNullableNumber(body.weight_kg),
    hr_max: hrMax,
    hr_rest: hrRest,
  };

  const { error } = await supabase.from("users").update(update).eq("id", user.id);

  if (error) {
    console.error("update-profile: update failed", user.id, error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
