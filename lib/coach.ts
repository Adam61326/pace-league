import type { SupabaseClient } from "@supabase/supabase-js";

export interface BasicProfile {
  id: string;
  displayName: string | null;
  firstname: string | null;
  lastname: string | null;
  photoUrl: string | null;
}

export interface PendingCoachInvitation {
  id: string;
  createdAt: string;
  coach: BasicProfile | null;
}

export interface SentCoachInvitation {
  id: string;
  createdAt: string;
  athlete: BasicProfile | null;
}

export interface CoachedAthlete {
  athleteId: string;
  startedAt: string;
  athlete: BasicProfile | null;
}

export interface MyCoach {
  coachId: string;
  startedAt: string;
  coach: BasicProfile | null;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  strava_firstname: string | null;
  strava_lastname: string | null;
  strava_profile_photo_url: string | null;
}

function toBasicProfile(row: ProfileRow | null): BasicProfile | null {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    firstname: row.strava_firstname,
    lastname: row.strava_lastname,
    photoUrl: row.strava_profile_photo_url,
  };
}

// Invitations coach en attente d'un athlète : reutilisé par
// app/api/coach/invitations/route.ts (cloche + page /coach) et directement
// par app/(authenticated)/coach/page.tsx. `admin` requis : l'athlète invité
// n'est pas encore en relation avec ce coach, donc le profil du coach (RLS
// users "users can view own profile" uniquement) ne serait pas lisible via
// le client authentifié normal — même contrainte que club_invitations.
export async function getPendingCoachInvitations(
  admin: SupabaseClient,
  athleteId: string
): Promise<PendingCoachInvitation[]> {
  interface Row {
    id: string;
    created_at: string;
    coach: ProfileRow | ProfileRow[] | null;
  }

  const { data: rows, error } = await admin
    .from("coach_invitations")
    .select(
      "id, created_at, coach:users!coach_id(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("invited_athlete_id", athleteId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  if (error) throw error;

  return (rows ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    coach: toBasicProfile(Array.isArray(row.coach) ? (row.coach[0] ?? null) : row.coach),
  }));
}

// Invitations envoyées par un coach, encore en attente : liste "invitations
// en cours" de /coach, pour éviter de réinviter le même athlète.
export async function getSentCoachInvitations(
  admin: SupabaseClient,
  coachId: string
): Promise<SentCoachInvitation[]> {
  interface Row {
    id: string;
    created_at: string;
    athlete: ProfileRow | ProfileRow[] | null;
  }

  const { data: rows, error } = await admin
    .from("coach_invitations")
    .select(
      "id, created_at, athlete:users!invited_athlete_id(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("coach_id", coachId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  if (error) throw error;

  return (rows ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    athlete: toBasicProfile(Array.isArray(row.athlete) ? (row.athlete[0] ?? null) : row.athlete),
  }));
}

// Athlètes coachés par cet utilisateur (switcher de /coach). Profils
// volontairement légers (pas de performance axes/badges ici) : la page ne
// charge les données complètes (getPublicProfileData) que pour l'athlète
// actuellement sélectionné dans le switcher, pas pour tous à la fois.
export async function getCoachedAthletes(admin: SupabaseClient, coachId: string): Promise<CoachedAthlete[]> {
  interface Row {
    athlete_id: string;
    started_at: string;
    athlete: ProfileRow | ProfileRow[] | null;
  }

  const { data: rows, error } = await admin
    .from("coach_relationships")
    .select(
      "athlete_id, started_at, athlete:users!athlete_id(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("coach_id", coachId)
    .order("started_at", { ascending: true })
    .returns<Row[]>();

  if (error) throw error;

  return (rows ?? []).map((row) => ({
    athleteId: row.athlete_id,
    startedAt: row.started_at,
    athlete: toBasicProfile(Array.isArray(row.athlete) ? (row.athlete[0] ?? null) : row.athlete),
  }));
}

// Coach actuel d'un athlète (section "Ma relation coach actuelle" de
// /coach), null si aucun.
export async function getMyCoach(admin: SupabaseClient, athleteId: string): Promise<MyCoach | null> {
  interface Row {
    coach_id: string;
    started_at: string;
    coach: ProfileRow | ProfileRow[] | null;
  }

  const { data: row, error } = await admin
    .from("coach_relationships")
    .select(
      "coach_id, started_at, coach:users!coach_id(id, display_name, strava_firstname, strava_lastname, strava_profile_photo_url)"
    )
    .eq("athlete_id", athleteId)
    .maybeSingle<Row>();

  if (error) throw error;
  if (!row) return null;

  return {
    coachId: row.coach_id,
    startedAt: row.started_at,
    coach: toBasicProfile(Array.isArray(row.coach) ? (row.coach[0] ?? null) : row.coach),
  };
}
