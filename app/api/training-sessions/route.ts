import { SESSION_TYPES, type SessionType, type TrainingSessionDetails } from "@/lib/training-sessions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

function toSessionType(value: unknown): SessionType | null {
  return typeof value === "string" && (SESSION_TYPES as readonly string[]).includes(value) ? (value as SessionType) : null;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// `details` est un blob jsonb dont la forme dépend de session_type (voir
// lib/training-sessions.ts) : on ne revalide pas champ par champ ici (ce
// serait dupliquer la logique de TrainingSessionModal pour un simple
// stockage clé-valeur), seulement que c'est un objet plat sérialisable.
function toDetails(value: unknown): TrainingSessionDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as TrainingSessionDetails;
}

// Une séance par jour et par utilisateur (contrainte unique(user_id,
// session_date), 20260806000000_add_training_sessions.sql) : upsert sur ce
// couple, comme race_plans upsert sur race_id — cliquer un jour déjà rempli
// édite la séance existante plutôt que d'en créer une nouvelle.
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
    console.warn("training sessions: invalid body (non-JSON or non-object request)");
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const sessionDate = isValidDateString(body.session_date) ? body.session_date : null;
  const sessionType = toSessionType(body.session_type);
  const details = toDetails(body.details);
  const notes = toNullableString(body.notes);

  // Loggé (contrairement au 500 ci-dessous, silencieux jusqu'ici) : un client
  // avec un bundle JS périmé (page ouverte avant un changement de forme du
  // payload, ex. l'ancien "type"/champs à plat -> "session_type"/"details")
  // finit ici sans que rien n'apparaisse côté serveur — invisible à
  // déboguer sans ce log.
  if (!sessionDate) {
    console.warn("training sessions: invalid session_date", body.session_date);
    return NextResponse.json({ error: "invalid_session_date" }, { status: 400 });
  }
  if (!sessionType) {
    console.warn("training sessions: invalid session_type", body.session_type);
    return NextResponse.json({ error: "invalid_session_type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("training_sessions")
    .upsert(
      {
        user_id: user.id,
        session_date: sessionDate,
        session_type: sessionType,
        details,
        notes: notes?.slice(0, 2000) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,session_date" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("training sessions: upsert failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
